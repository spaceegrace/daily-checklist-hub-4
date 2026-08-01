/* ========================
   Constants & Helpers
   ========================= */

// Local storage key
const STORAGE_KEY = 'dailyChecklistData';

// Default structure to ensure safe operations
const DEFAULT_DATA = {
  tasks: [],            // array of task objects
  priorities: [null, null, null], // top 3 priorities {text, completed, id}
  notes: [],            // brain dump entries; we'll store one entry with id 'brainDump'
  achievements: [],     // unlocked achievement ids
  settings: {           // general settings
    darkMode: false
  },
  streaks: {            // track daily streaks and focus sessions
    currentStreak: 0,
    bestStreak: 0,
    lastStreakDate: null,
    focusSessionsCompleted: 0
  },
  stats: {              // aggregated counts if needed
    totalTasksEverCompleted: 0
  },
  timers: {             // persisted timer state if desired
    focusSessionsCompletedToday: 0
  },
  meta: {
    lastResetDate: null // track last daily reset date
  }
};

// Utility: safe localStorage getter
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_DATA));
    const parsed = JSON.parse(raw);
    // Ensure all top-level keys exist
    return Object.assign(JSON.parse(JSON.stringify(DEFAULT_DATA)), parsed);
  } catch (e) {
    console.error('Failed to load data from localStorage, using default data.', e);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}

// Utility: save to localStorage
function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('Failed to save data to localStorage.', e);
  }
}

// Utility: format date as YYYY-MM-DD for daily comparisons
function formatDateISO(date = new Date()) {
  return date.toISOString().split('T')[0];
}

// Utility: generate a simple unique ID
function makeId(prefix = '') {
  return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* =========================
   Application State
   ========================= */

let state = loadData();

/* =========================
   DOM Helpers (defensive)
   ========================= */

// Safe query selectors that return null if not present
function el(id) {
  if (!id) return null;
  return document.getElementById(id) || document.querySelector(id) || null;
}

// Create element with attributes and classes
function createEl(tag, options = {}) {
  const e = document.createElement(tag);
  if (options.text) e.textContent = options.text;
  if (options.html) e.innerHTML = options.html;
  if (options.className) e.className = options.className;
  if (options.attrs) {
    Object.keys(options.attrs).forEach(k => e.setAttribute(k, options.attrs[k]));
  }
  if (options.props) {
    Object.assign(e, options.props);
  }
  return e;
}

/* =========================
   Task System
   ========================= */

/*
 Task schema:
 {
   id: string,
   category: string,
   text: string,
   completed: boolean,
   dateCreated: 'YYYY-MM-DD', (ISO date)
   completionDate: 'YYYY-MM-DD' | null
 }
*/

// Categories constant (removed Health)
const CATEGORIES = [
  'Morning Routine',
  'Top 3 Priorities',
  'Focus Blocks',
  'Homework/Tasks',
  'Environment Reset',
  'Evening Review'
];

// Add a new task
function addTask(category, text) {
  if (!text || !category) return;
  const task = {
    id: makeId('task-'),
    category,
    text: text.trim(),
    completed: false,
    dateCreated: formatDateISO(),
    completionDate: null
  };
  state.tasks.push(task);
  saveData();
  renderAll();
  evaluateAchievements();
}

// Edit an existing task
function editTask(id, newText) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.text = (newText || '').trim();
  saveData();
  renderAll();
}

// Delete a task
function deleteTask(id) {
  state.tasks = state.tasks.filter(x => x.id !== id);
  saveData();
  renderAll();
  evaluateAchievements();
}

// Toggle completion
function toggleTaskCompletion(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.completed = !t.completed;
  t.completionDate = t.completed ? formatDateISO() : null;
  if (t.completed) {
    state.stats.totalTasksEverCompleted = (state.stats.totalTasksEverCompleted || 0) + 1;
  }
  saveData();
  renderAll();
  evaluateStreaks();
  evaluateAchievements();
}

/*
  Updated renderTasks:
  - groups tasks by category as before
  - within each category renders active tasks first
  - completed tasks are rendered inside a collapsible/completed section (details>summary)
*/
function renderTasks() {
  const container = el('#tasksContainer');
  if (!container) return;
  // Clear
  container.innerHTML = '';

  // Group tasks by category
  const tasksByCategory = {};
  CATEGORIES.forEach(cat => tasksByCategory[cat] = []);
  // Also include tasks that may have custom categories
  state.tasks.forEach(task => {
    const cat = task.category || 'Misc';
    if (!tasksByCategory[cat]) tasksByCategory[cat] = [];
    tasksByCategory[cat].push(task);
  });

  Object.keys(tasksByCategory).forEach(category => {
    const section = createEl('section', { className: 'category-section', attrs: { 'aria-label': category } });
    const header = createEl('h3', { text: category });
    section.appendChild(header);

    // Add new task input for this category
    const addWrap = createEl('div', { className: 'add-task-row' });
    const input = createEl('input', {
      attrs: {
        type: 'text',
        placeholder: `Add new "${category}" task`,
        'aria-label': `Add task in category ${category}`
      },
      className: 'task-input'
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = input.value.trim();
        if (v) {
          addTask(category, v);
          input.value = '';
        }
      }
    });
    const button = createEl('button', { text: 'Add', className: 'btn small' });
    button.setAttribute('aria-label', `Add ${category} task`);
    button.addEventListener('click', () => {
      const v = input.value.trim();
      if (v) {
        addTask(category, v);
        input.value = '';
      }
    });
    addWrap.appendChild(input);
    addWrap.appendChild(button);
    section.appendChild(addWrap);

    const tasks = tasksByCategory[category] || [];
    const activeTasks = tasks.filter(t => !t.completed);
    const completedTasks = tasks.filter(t => t.completed);

    // Active tasks list
    if (activeTasks.length === 0) {
      const empty = createEl('p', { text: 'No tasks yet. Add one above!', className: 'muted' });
      section.appendChild(empty);
    } else {
      const list = createEl('ul', { className: 'task-list', attrs: { role: 'list' } });
      activeTasks.forEach(task => {
        const li = renderTaskListItem(task);
        list.appendChild(li);
      });
      section.appendChild(list);
    }

    // Completed tasks: collapsible details so they're out of the way
    if (completedTasks.length > 0) {
      const details = createEl('details', { className: 'completed-section' });
      const summary = createEl('summary', { text: `Completed (${completedTasks.length})` });
      details.appendChild(summary);
      const completedList = createEl('ul', { className: 'task-list completed-list', attrs: { role: 'list' } });
      completedTasks.forEach(task => {
        const li = renderTaskListItem(task, true);
        completedList.appendChild(li);
      });
      details.appendChild(completedList);
      section.appendChild(details);
    }

    container.appendChild(section);
  });
}

// Helper to render a single task item; if isCompleted is true, add completed class to li
function renderTaskListItem(task, isCompleted = false) {
  const li = createEl('li', { className: `task-item${isCompleted ? ' completed' : ''}`, attrs: { 'data-id': task.id } });
  // Checkbox
  const checkbox = createEl('input', { attrs: { type: 'checkbox', 'aria-label': `Complete ${task.text}` } });
  checkbox.checked = !!task.completed;
  checkbox.addEventListener('change', () => toggleTaskCompletion(task.id));
  li.appendChild(checkbox);

  // Text (editable)
  const textEl = createEl('span', { text: task.text, className: 'task-text' });
  textEl.setAttribute('tabindex', '0');
  textEl.setAttribute('role', 'textbox');
  textEl.setAttribute('aria-label', `Task: ${task.text}`);
  textEl.addEventListener('dblclick', () => startInlineEdit(task, li));
  textEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') startInlineEdit(task, li);
  });
  li.appendChild(textEl);

  // Dates small
  const meta = createEl('div', { className: 'task-meta' });
  const created = createEl('small', { text: `Created: ${task.dateCreated}` });
  const completed = createEl('small', { text: task.completed ? `Completed: ${task.completionDate}` : '' });
  meta.appendChild(created);
  meta.appendChild(completed);
  li.appendChild(meta);

  // Actions: edit, delete
  const actions = createEl('div', { className: 'task-actions' });
  const editBtn = createEl('button', { text: 'Edit', className: 'btn tiny', attrs: { 'aria-label': `Edit ${task.text}` } });
  editBtn.addEventListener('click', () => startInlineEdit(task, li));
  const delBtn = createEl('button', { text: 'Delete', className: 'btn tiny danger', attrs: { 'aria-label': `Delete ${task.text}` } });
  delBtn.addEventListener('click', () => {
    if (confirm('Delete this task?')) deleteTask(task.id);
  });
  actions.appendChild(editBtn);
  actions.appendChild(delBtn);
  li.appendChild(actions);

  return li;
}

// Start inline edit for a task
function startInlineEdit(task, taskListItem) {
  if (!task || !taskListItem) return;
  // Replace text span with input
  const textSpan = taskListItem.querySelector('.task-text');
  if (!textSpan) return;
  const input = createEl('input', { attrs: { type: 'text', value: task.text, 'aria-label': `Edit ${task.text}` }, className: 'task-edit-input' });
  textSpan.replaceWith(input);
  input.focus();
  input.select();

  function finish(save) {
    if (save) {
      const newText = input.value.trim();
      if (newText) editTask(task.id, newText);
    }
    // re-render tasks (simple approach)
    renderAll();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

/* =========================
   Daily Reset Logic
   ========================= */

// Reset daily tasks at midnight.
function resetDailyIfNeeded() {
  const today = formatDateISO();
  if (state.meta.lastResetDate === today) return;
  // Reset tasks not created today
  let changed = false;
  state.tasks.forEach(task => {
    if (task.dateCreated !== today) {
      // mark as uncompleted for the new day
      if (task.completed) changed = true;
      task.completed = false;
      task.completionDate = null;
      task.dateCreated = today;
      changed = true;
    }
  });
  // Reset focus sessions count for the day
  state.timers.focusSessionsCompletedToday = 0;
  // Update meta
  state.meta.lastResetDate = today;
  if (changed) saveData();
  renderAll();
  // Schedule next reset at midnight
  scheduleNextMidnightReset();
}

function scheduleNextMidnightReset() {
  const now = new Date();
  const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 5, 0); // slightly after midnight to avoid race conditions
  const ms = nextMidnight - now;
  if (ms <= 0 || !isFinite(ms)) {
    // fallback: check again in one minute
    setTimeout(resetDailyIfNeeded, 60 * 1000);
  } else {
    setTimeout(resetDailyIfNeeded, ms);
  }
}

/* =========================
   Progress Tracker
   ========================= */

// Compute totals and update progress display. Shows counts for today's tasks.
function computeProgress() {
  const today = formatDateISO();
  const todaysTasks = state.tasks.filter(t => t.dateCreated === today);
  const total = todaysTasks.length;
  const completed = todaysTasks.filter(t => t.completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percent };
}

let progressAnimationFrame = null;
let progressLastRendered = 0;
function animateProgress(toPercent) {
  const bar = el('#progressBarFill');
  const label = el('#progressLabel');
  if (!bar) return;
  cancelAnimationFrame(progressAnimationFrame);
  const from = progressLastRendered || 0;
  const start = performance.now();
  const duration = 600; // ms
  function tick(now) {
    const t = Math.min(1, (now - start) / duration);
    const eased = t * (2 - t); // ease-out
    const current = Math.round(from + (toPercent - from) * eased);
    bar.style.width = current + '%';
    if (label) label.textContent = `${current}%`;
    if (t < 1) {
      progressAnimationFrame = requestAnimationFrame(tick);
    } else {
      progressLastRendered = toPercent;
    }
  }
  progressAnimationFrame = requestAnimationFrame(tick);
}

function renderProgress() {
  const { total, completed, percent } = computeProgress();
  const countEl = el('#progressCount');
  if (countEl) countEl.textContent = `${completed}/${total} tasks complete`;
  animateProgress(percent);
}

/* =========================
   Top 3 Priorities
   (unchanged)
   ========================= */

function savePriority(index, text) {
  if (index < 0 || index > 2) return;
  state.priorities[index] = { id: state.priorities[index]?.id || makeId('prio-'), text: (text || '').trim(), completed: false };
  saveData();
  renderPriorities();
}

function togglePriority(index) {
  if (!state.priorities[index]) return;
  state.priorities[index].completed = !state.priorities[index].completed;
  if (state.priorities[index].completed) {
    state.stats.totalTasksEverCompleted = (state.stats.totalTasksEverCompleted || 0) + 1;
  }
  saveData();
  renderPriorities();
  evaluateAchievements();
}

function clearPriority(index) {
  state.priorities[index] = null;
  saveData();
  renderPriorities();
}

function renderPriorities() {
  const container = el('#prioritiesContainer');
  if (!container) return;
  container.innerHTML = '';
  const title = createEl('h2', { text: 'Top 3 Priorities' });
  container.appendChild(title);

  const list = createEl('ol', { attrs: { 'aria-label': 'Top 3 priorities' } });

  for (let i = 0; i < 3; i++) {
    const p = state.priorities[i];
    const li = createEl('li');
    const wrapper = createEl('div', { className: 'priority-row' });
    const checkbox = createEl('input', { attrs: { type: 'checkbox', 'aria-label': `Mark priority ${i + 1} complete` } });
    checkbox.checked = !!(p && p.completed);
    checkbox.addEventListener('change', () => togglePriority(i));
    wrapper.appendChild(checkbox);

    const input = createEl('input', { attrs: { type: 'text', placeholder: `Priority ${i + 1}`, 'aria-label': `Priority ${i + 1}` } });
    input.value = p ? p.text : '';
    input.addEventListener('blur', () => savePriority(i, input.value));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        savePriority(i, input.value);
        (e.target).blur();
      }
    });
    wrapper.appendChild(input);

    const clearBtn = createEl('button', { text: 'Clear', className: 'btn tiny', attrs: { 'aria-label': `Clear priority ${i + 1}` } });
    clearBtn.addEventListener('click', () => clearPriority(i));
    wrapper.appendChild(clearBtn);

    li.appendChild(wrapper);
    list.appendChild(li);
  }
  container.appendChild(list);
}

/* =========================
   Timers, Brain Dump, Mood, Achievements, Dark Mode, etc.
   (unchanged, except health init removed)
   ========================= */

/* ... The rest of your existing app.js remains unchanged ... */

/* NOTE: below safeInit no longer calls initHealthTracking() because the health UI was removed. */

function renderAll() {
  renderTasks();
  renderPriorities();
  renderProgress();
  renderEveningReview();
  renderAchievements();
  // Health UI no longer present; don't attempt to update it.
}

function initEventBindings() {
  // Bind global add task form if exists
  const addForm = el('#globalAddTaskForm');
  if (addForm) {
    const categorySelect = addForm.querySelector('#globalCategory');
    const textInput = addForm.querySelector('#globalTaskText');
    const submitBtn = addForm.querySelector('#globalAddBtn');
    if (submitBtn && textInput && categorySelect) {
      submitBtn.addEventListener('click', () => {
        const cat = categorySelect.value;
        const txt = textInput.value.trim();
        if (txt) {
          addTask(cat, txt);
          textInput.value = '';
        }
      });
    }
  }

  // Keyboard accessibility: allow pressing Enter on any button-like element when focused
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const active = document.activeElement;
      if (active && active.tagName === 'BUTTON') {
        active.click();
      }
    }
  });
}

/* Defensive Initialization */
function safeInit() {
  resetDailyIfNeeded();

  renderAll();
  initEventBindings();
  initActivationTimer();
  initFocusTimer();
  initBrainDump();
  // initHealthTracking(); // removed: no health UI present
  initDarkModeToggle();
  evaluateAchievements();

  setInterval(saveData, 30 * 1000); // every 30 seconds
  scheduleNextMidnightReset();
}

/* Ensure DOMContentLoaded */
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInit);
} else {
  safeInit();
}

/* Expose some functions for debugging */
window.DailyChecklistHub = {
  state,
  addTask,
  editTask,
  deleteTask,
  toggleTaskCompletion,
  savePriority,
  togglePriority,
  saveBrainDump,
  saveEveningWins: saveEveningWins,
  unlockAchievement,
  applyDarkMode,
  computeProgress,
  renderAll
};
