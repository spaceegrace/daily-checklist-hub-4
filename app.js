/* ========================
   Constants & Helpers
   ========================= */

// Local storage key
const STORAGE_KEY = 'dailyChecklistData';

// Default structure to ensure safe operations
const DEFAULT_DATA = {
  tasks: [],
  settings: { darkMode: false },
  stats: { totalTasksEverCompleted: 0 },
  timers: { focusSessionsCompletedToday: 0 },
  meta: { lastResetDate: null }
};

// Utility: safe localStorage getter
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_DATA));
    const parsed = JSON.parse(raw);
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

function el(id) {
  if (!id) return null;
  return document.getElementById(id) || document.querySelector(id) || null;
}

function createEl(tag, options = {}) {
  const e = document.createElement(tag);
  if (options.text) e.textContent = options.text;
  if (options.html) e.innerHTML = options.html;
  if (options.className) e.className = options.className;
  if (options.attrs) Object.keys(options.attrs).forEach(k => e.setAttribute(k, options.attrs[k]));
  if (options.props) Object.assign(e, options.props);
  return e;
}

/* =========================
   Task System
   ========================= */

const CATEGORIES = [
  'Morning Routine',
  'Top 3 Priorities',
  'Focus Blocks',
  'Homework/Tasks',
  'Environment Reset'
];

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
}

function editTask(id, newText) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.text = (newText || '').trim();
  saveData();
  renderAll();
}

function deleteTask(id) {
  state.tasks = state.tasks.filter(x => x.id !== id);
  saveData();
  renderAll();
}

function toggleTaskCompletion(id) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  t.completed = !t.completed;
  t.completionDate = t.completed ? formatDateISO() : null;
  if (t.completed) state.stats.totalTasksEverCompleted = (state.stats.totalTasksEverCompleted || 0) + 1;
  saveData();
  renderAll();
}

function renderTasks() {
  const container = el('#tasksContainer');
  if (!container) return;
  container.innerHTML = '';

  const tasksByCategory = {};
  CATEGORIES.forEach(cat => tasksByCategory[cat] = []);
  state.tasks.forEach(task => {
    const cat = task.category || 'Misc';
    if (!tasksByCategory[cat]) tasksByCategory[cat] = [];
    tasksByCategory[cat].push(task);
  });

  Object.keys(tasksByCategory).forEach(category => {
    const tasks = tasksByCategory[category] || [];
    // Skip empty categories for a cleaner view
    if (tasks.length === 0) return;

    const section = createEl('section', { className: 'category-section', attrs: { 'aria-label': category } });
    const header = createEl('h3', { text: category });
    section.appendChild(header);

    // Add input for adding within category
    const addWrap = createEl('div', { className: 'add-task-row' });
    const input = createEl('input', { attrs: { type: 'text', placeholder: `Add new "${category}" task`, 'aria-label': `Add task in category ${category}` }, className: 'task-input' });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const v = input.value.trim();
        if (v) { addTask(category, v); input.value = ''; }
      }
    });
    const button = createEl('button', { text: 'Add', className: 'btn small' });
    button.addEventListener('click', () => { const v = input.value.trim(); if (v) { addTask(category, v); input.value = ''; } });
    addWrap.appendChild(input); addWrap.appendChild(button);
    section.appendChild(addWrap);

    const activeTasks = tasks.filter(t => !t.completed);
    const completedTasks = tasks.filter(t => t.completed);

    if (activeTasks.length === 0) {
      const empty = createEl('p', { text: 'No tasks yet. Add one above!', className: 'muted' });
      section.appendChild(empty);
    } else {
      const list = createEl('ul', { className: 'task-list', attrs: { role: 'list' } });
      activeTasks.forEach(task => list.appendChild(renderTaskListItem(task)));
      section.appendChild(list);
    }

    if (completedTasks.length > 0) {
      const details = createEl('details', { className: 'completed-section' });
      const summary = createEl('summary', { text: `Completed (${completedTasks.length})` });
      details.appendChild(summary);
      const completedList = createEl('ul', { className: 'task-list completed-list', attrs: { role: 'list' } });
      completedTasks.forEach(task => completedList.appendChild(renderTaskListItem(task, true)));
      details.appendChild(completedList);
      section.appendChild(details);
    }

    container.appendChild(section);
  });
}

function renderTaskListItem(task, isCompleted = false) {
  const li = createEl('li', { className: `task-item${isCompleted ? ' completed' : ''}`, attrs: { 'data-id': task.id } });
  const checkbox = createEl('input', { attrs: { type: 'checkbox', 'aria-label': `Complete ${task.text}` } });
  checkbox.checked = !!task.completed;
  checkbox.addEventListener('change', () => toggleTaskCompletion(task.id));
  li.appendChild(checkbox);

  const textEl = createEl('span', { text: task.text, className: 'task-text' });
  textEl.setAttribute('tabindex', '0');
  textEl.setAttribute('role', 'textbox');
  textEl.setAttribute('aria-label', `Task: ${task.text}`);
  textEl.addEventListener('dblclick', () => startInlineEdit(task, li));
  textEl.addEventListener('keydown', (e) => { if (e.key === 'Enter') startInlineEdit(task, li); });
  li.appendChild(textEl);

  const meta = createEl('div', { className: 'task-meta' });
  const created = createEl('small', { text: `Created: ${task.dateCreated}` });
  const completed = createEl('small', { text: task.completed ? `Completed: ${task.completionDate}` : '' });
  meta.appendChild(created); meta.appendChild(completed); li.appendChild(meta);

  const actions = createEl('div', { className: 'task-actions' });
  const editBtn = createEl('button', { text: 'Edit', className: 'btn tiny' });
  editBtn.addEventListener('click', () => startInlineEdit(task, li));
  const delBtn = createEl('button', { text: 'Delete', className: 'btn tiny danger' });
  delBtn.addEventListener('click', () => { if (confirm('Delete this task?')) deleteTask(task.id); });
  actions.appendChild(editBtn); actions.appendChild(delBtn); li.appendChild(actions);

  return li;
}

function startInlineEdit(task, taskListItem) {
  if (!task || !taskListItem) return;
  const textSpan = taskListItem.querySelector('.task-text');
  if (!textSpan) return;
  const input = createEl('input', { attrs: { type: 'text', value: task.text, 'aria-label': `Edit ${task.text}` }, className: 'task-edit-input' });
  textSpan.replaceWith(input);
  input.focus(); input.select();

  function finish(save) {
    if (save) {
      const newText = input.value.trim(); if (newText) editTask(task.id, newText);
    }
    renderAll();
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
  input.addEventListener('blur', () => finish(true));
}

/* =========================
   Evening Review & Actions
   ========================= */

function renderEveningReview() {
  const wrap = el('#eveningReview');
  if (!wrap) return;
  wrap.innerHTML = '';
  const today = formatDateISO();
  const completedToday = state.tasks.filter(t => t.completed && t.completionDate === today);

  if (completedToday.length === 0) {
    const p = createEl('p', { text: 'No tasks were completed today.', className: 'muted' });
    wrap.appendChild(p);
    return;
  }

  const list = createEl('ul', { className: 'task-list', attrs: { role: 'list' } });
  completedToday.forEach(task => {
    const li = createEl('li', { className: 'task-item completed', attrs: { 'data-id': task.id } });
    const text = createEl('span', { text: `${task.text} — ${task.category || 'Misc'}`, className: 'task-text' });
    li.appendChild(text);
    const meta = createEl('div', { className: 'task-meta' });
    meta.appendChild(createEl('small', { text: `Completed: ${task.completionDate}` }));
    li.appendChild(meta);

    const actions = createEl('div', { className: 'task-actions' });
    const delBtn = createEl('button', { text: 'Delete', className: 'btn tiny danger' });
    delBtn.addEventListener('click', () => { if (confirm('Delete this completed task?')) deleteTask(task.id); });
    actions.appendChild(delBtn);
    li.appendChild(actions);

    list.appendChild(li);
  });

  wrap.appendChild(list);
}

function deleteCompletedToday() {
  const today = formatDateISO();
  const completedToday = state.tasks.filter(t => t.completed && t.completionDate === today);
  if (completedToday.length === 0) { alert('There are no completed tasks for today.'); return; }
  if (!confirm(`Reset Day will DELETE ${completedToday.length} task(s) completed today. This cannot be undone. Proceed?`)) return;
  state.tasks = state.tasks.filter(t => !(t.completed && t.completionDate === today));
  saveData();
  renderAll();
}

function clearAllTasks() {
  if (state.tasks.length === 0) { alert('No tasks to clear.'); return; }
  if (!confirm(`Clear All will permanently DELETE ALL (${state.tasks.length}) tasks. This cannot be undone. Proceed?`)) return;
  state.tasks = [];
  saveData();
  renderAll();
}

/* =========================
   Daily Reset Logic
   (kept as-is — scheduled daily reset)
   ========================= */

function resetDailyIfNeeded() {
  const today = formatDateISO();
  if (state.meta.lastResetDate === today) return;
  let changed = false;
  state.tasks.forEach(task => {
    if (task.dateCreated !== today) {
      if (task.completed) changed = true;
      task.completed = false; task.completionDate = null; task.dateCreated = today; changed = true;
    }
  });
  state.timers.focusSessionsCompletedToday = 0;
  state.meta.lastResetDate = today;
  if (changed) saveData();
  renderAll();
  scheduleNextMidnightReset();
}

function scheduleNextMidnightReset() {
  const now = new Date(); const nextMidnight = new Date(now);
  nextMidnight.setHours(24, 0, 5, 0);
  const ms = nextMidnight - now;
  if (ms <= 0 || !isFinite(ms)) setTimeout(resetDailyIfNeeded, 60 * 1000);
  else setTimeout(resetDailyIfNeeded, ms);
}

/* =========================
   Progress Tracker
   ========================= */

function computeProgress() {
  const today = formatDateISO();
  const todaysTasks = state.tasks.filter(t => t.dateCreated === today);
  const total = todaysTasks.length;
  const completed = todaysTasks.filter(t => t.completed).length;
  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);
  return { total, completed, percent };
}

let progressAnimationFrame = null; let progressLastRendered = 0;
function animateProgress(toPercent) {
  const bar = el('#progressBarFill'); const label = el('#progressLabel'); if (!bar) return;
  cancelAnimationFrame(progressAnimationFrame);
  const from = progressLastRendered || 0; const start = performance.now(); const duration = 600;
  function tick(now) {
    const t = Math.min(1, (now - start) / duration); const eased = t * (2 - t); const current = Math.round(from + (toPercent - from) * eased);
    bar.style.width = current + '%'; if (label) label.textContent = `${current}%`;
    if (t < 1) progressAnimationFrame = requestAnimationFrame(tick); else progressLastRendered = toPercent;
  }
  progressAnimationFrame = requestAnimationFrame(tick);
}

function renderProgress() {
  const { total, completed, percent } = computeProgress();
  const countEl = el('#progressCount'); if (countEl) countEl.textContent = `${completed}/${total} tasks complete`;
  animateProgress(percent);
}

/* Lightweight no-ops for removed features */
function evaluateAchievements() { /* removed: tasks-only view */ }
function evaluateStreaks() { /* removed: tasks-only view */ }

function renderAll() { renderTasks(); renderProgress(); renderEveningReview(); }

function initEventBindings() {
  const addForm = el('#globalAddTaskForm');
  if (addForm) {
    const categorySelect = addForm.querySelector('#globalCategory');
    const textInput = addForm.querySelector('#globalTaskText');
    const submitBtn = addForm.querySelector('#globalAddBtn');
    if (submitBtn && textInput && categorySelect) {
      submitBtn.addEventListener('click', () => {
        const cat = categorySelect.value; const txt = textInput.value.trim(); if (txt) { addTask(cat, txt); textInput.value = ''; }
      });
    }
  }

  const resetBtn = el('#resetDayBtn'); if (resetBtn) resetBtn.addEventListener('click', deleteCompletedToday);
  const clearBtn = el('#clearAllBtn'); if (clearBtn) clearBtn.addEventListener('click', clearAllTasks);

  document.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const active = document.activeElement; if (active && active.tagName === 'BUTTON') active.click(); } });
}

function initDarkModeToggle() {
  try {
    const toggle = el('#darkModeToggle');
    if (!toggle) return;
    toggle.checked = !!(state.settings && state.settings.darkMode);
    document.body.classList.toggle('dark-mode', toggle.checked);
    toggle.addEventListener('change', (e) => {
      state.settings = state.settings || {};
      state.settings.darkMode = e.target.checked;
      document.body.classList.toggle('dark-mode', e.target.checked);
      saveData();
    });
  } catch (e) { /* ignore */ }
}

function safeInit() {
  resetDailyIfNeeded();
  renderAll();
  initEventBindings();
  initDarkModeToggle();
  setInterval(saveData, 30 * 1000);
  scheduleNextMidnightReset();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit); else safeInit();

window.DailyChecklistHub = { state, addTask, editTask, deleteTask, toggleTaskCompletion, computeProgress, renderAll, deleteCompletedToday, clearAllTasks };
