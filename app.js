
/* =========================
   Constants & Helpers
   ========================= */

// Local storage key
const STORAGE_KEY = 'dailyChecklistData';

// Default structure to ensure safe operations
const DEFAULT_DATA = {
  tasks: [],            // array of task objects
  priorities: [null, null, null], // top 3 priorities {text, completed, id}
  mood: [],             // array of {date, mood}
  health: {             // simple health trackers
    water: 0,
    exercise: false,
    medication: false,
    meals: [],          // array of meal reminder notes
    bloodSugar: ''
  },
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

// Categories constant
const CATEGORIES = [
  'Morning Routine',
  'Top 3 Priorities',
  'Focus Blocks',
  'Homework/Tasks',
  'Environment Reset',
  'Health',
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

// Render tasks grouped by category into a container element with ID 'tasksContainer'
// It is defensive: if container isn't present, nothing breaks.
function renderTasks() {
  const container = el('#tasksContainer');
  if (!container) return;
  // Clear
  container.innerHTML = '';

  // Group tasks by category (only show tasks created today or persistent ones)
  const today = formatDateISO();
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

    // Task list
    const list = createEl('ul', { className: 'task-list', attrs: { role: 'list' } });
    const tasks = tasksByCategory[category];
    if (!tasks || tasks.length === 0) {
      const empty = createEl('p', { text: 'No tasks yet. Add one above!', className: 'muted' });
      section.appendChild(empty);
    } else {
      tasks.forEach(task => {
        // Render only today's tasks and persistent ones.
        // For simplicity: show all tasks but visually mark out-of-date tasks if needed.
        const li = createEl('li', { className: 'task-item', attrs: { 'data-id': task.id } });
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
        // Inline edit on double-click or Enter
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

        list.appendChild(li);
      });
      section.appendChild(list);
    }

    container.appendChild(section);
  });
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
// Approach: If the saved meta.lastResetDate is not today, we run reset logic.
// Reset logic: For tasks created before today, mark them not completed and set dateCreated to today
// (this makes checklist items function as daily items). We keep persistent tasks if you prefer differently later.
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

// Schedule a timeout to call resetDailyIfNeeded at next midnight
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

// Animate progress bar from oldPercent to newPercent
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

// Render progress UI (container with ids progressCount and progressBarFill expected)
function renderProgress() {
  const { total, completed, percent } = computeProgress();
  const countEl = el('#progressCount');
  if (countEl) countEl.textContent = `${completed}/${total} tasks complete`;
  animateProgress(percent);
}

/* =========================
   Top 3 Priorities
   ========================= */

// Save a priority in slot 0..2
function savePriority(index, text) {
  if (index < 0 || index > 2) return;
  state.priorities[index] = { id: state.priorities[index]?.id || makeId('prio-'), text: (text || '').trim(), completed: false };
  saveData();
  renderPriorities();
}

// Toggle priority complete
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

// Clear a priority
function clearPriority(index) {
  state.priorities[index] = null;
  saveData();
  renderPriorities();
}

// Render priorities in container #prioritiesContainer
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
   5-Minute Activation Timer
   ========================= */

class SimpleTimer {
  constructor(durationSeconds = 300, onTick = null, onFinish = null) {
    this.initial = durationSeconds;
    this.remaining = durationSeconds;
    this.intervalId = null;
    this.running = false;
    this.onTick = onTick;
    this.onFinish = onFinish;
  }
  start() {
    if (this.running) return;
    this.running = true;
    const tick = () => {
      if (!this.running) return;
      if (this.remaining <= 0) {
        this.stop();
        if (typeof this.onFinish === 'function') this.onFinish();
        return;
      }
      this.remaining -= 1;
      if (typeof this.onTick === 'function') this.onTick(this.remaining);
    };
    // First tick immediate for UI
    if (typeof this.onTick === 'function') this.onTick(this.remaining);
    this.intervalId = setInterval(tick, 1000);
  }
  pause() {
    this.running = false;
    if (this.intervalId) clearInterval(this.intervalId);
    this.intervalId = null;
  }
  stop() {
    this.pause();
    this.remaining = this.initial;
  }
  reset() {
    this.stop();
    this.remaining = this.initial;
    if (typeof this.onTick === 'function') this.onTick(this.remaining);
  }
  getFormatted() {
    const mm = String(Math.floor(this.remaining / 60)).padStart(2, '0');
    const ss = String(this.remaining % 60).padStart(2, '0');
    return `${mm}:${ss}`;
  }
}

// 5-minute activation instance
let activationTimer = null;

function initActivationTimer() {
  const display = el('#activationTimerDisplay');
  const startBtn = el('#activationStart');
  const pauseBtn = el('#activationPause');
  const resetBtn = el('#activationReset');
  const messageEl = el('#activationMessage');

  if (!display || !startBtn) return;

  activationTimer = new SimpleTimer(5 * 60, (remaining) => {
    if (display) display.textContent = activationTimer.getFormatted();
  }, () => {
    if (messageEl) messageEl.textContent = 'Great job starting. Decide whether to continue.';
    // Unlock achievement
    unlockAchievement('started-with-5-minutes');
  });

  // Wire controls defensively
  startBtn.addEventListener('click', () => activationTimer.start());
  if (pauseBtn) pauseBtn.addEventListener('click', () => activationTimer.pause());
  if (resetBtn) resetBtn.addEventListener('click', () => {
    activationTimer.reset();
    if (messageEl) messageEl.textContent = '';
    if (display) display.textContent = activationTimer.getFormatted();
  });
  // Initialize display
  if (display) display.textContent = activationTimer.getFormatted();
}

/* =========================
   Focus Timer (Pomodoro-like)
   ========================= */

let focusTimer = null;
let focusMode = 'focus'; // 'focus' or 'break'

function initFocusTimer() {
  // Default durations
  const FOCUS_DURATION = 45 * 60; // seconds
  const BREAK_DURATION = 15 * 60; // seconds

  const display = el('#focusTimerDisplay');
  const startBtn = el('#focusStart');
  const pauseBtn = el('#focusPause');
  const resetBtn = el('#focusReset');
  const modeLabel = el('#focusModeLabel');

  if (!display || !startBtn) return;

  function makeTimerForMode(mode) {
    return new SimpleTimer(mode === 'focus' ? FOCUS_DURATION : BREAK_DURATION, (remaining) => {
      display.textContent = focusTimer.getFormatted();
      if (modeLabel) modeLabel.textContent = mode === 'focus' ? 'Focus' : 'Break';
    }, () => {
      // on finish: toggle mode
      if (mode === 'focus') {
        // completed a focus session
        state.timers.focusSessionsCompletedToday = (state.timers.focusSessionsCompletedToday || 0) + 1;
        state.streaks.focusSessionsCompleted = (state.streaks.focusSessionsCompleted || 0) + 1;
        state.streaks.lastFocusDate = formatDateISO();
        saveData();
        evaluateAchievements();
        // Automatically switch to break
        focusMode = 'break';
      } else {
        // break finished -> back to focus
        focusMode = 'focus';
      }
      // recreate timer for new mode and start it (auto-start)
      focusTimer = makeTimerForMode(focusMode);
      focusTimer.start();
      renderAll();
    });
  }

  // Initialize
  focusMode = 'focus';
  focusTimer = makeTimerForMode(focusMode);

  startBtn.addEventListener('click', () => {
    focusTimer.start();
  });
  if (pauseBtn) pauseBtn.addEventListener('click', () => focusTimer.pause());
  if (resetBtn) resetBtn.addEventListener('click', () => {
    focusTimer.stop();
    focusMode = 'focus';
    focusTimer = makeTimerForMode(focusMode);
    if (display) display.textContent = focusTimer.getFormatted();
    if (modeLabel) modeLabel.textContent = 'Focus';
    renderAll();
  });

  if (display) display.textContent = focusTimer.getFormatted();
  if (modeLabel) modeLabel.textContent = 'Focus';
}

/* =========================
   Brain Dump (Notes)
   ========================= */

function saveBrainDump(text) {
  // We'll store as a single item in state.notes with id 'brainDump'
  const existingIndex = state.notes.findIndex(n => n.id === 'brainDump');
  const entry = { id: 'brainDump', content: text || '', dateSaved: new Date().toISOString() };
  if (existingIndex >= 0) state.notes[existingIndex] = entry;
  else state.notes.push(entry);
  saveData();
}

function loadBrainDump() {
  const entry = state.notes.find(n => n.id === 'brainDump');
  return entry ? entry.content : '';
}

function initBrainDump() {
  const ta = el('#brainDumpTextarea');
  const saveBtn = el('#brainDumpSave');
  const clearBtn = el('#brainDumpClear');
  if (!ta) return;
  ta.value = loadBrainDump();
  if (saveBtn) saveBtn.addEventListener('click', () => {
    saveBrainDump(ta.value);
    alert('Notes saved');
  });
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (confirm('Clear brain dump notes?')) {
      ta.value = '';
      saveBrainDump('');
    }
  });
}

/* =========================
   Mood Tracker
   ========================= */

function saveMood(moodLabel) {
  state.mood.push({ date: new Date().toISOString(), mood: moodLabel });
  saveData();
  renderMood();
}

function renderMood() {
  const container = el('#moodContainer');
  if (!container) return;
  container.innerHTML = '';
  const title = createEl('h3', { text: 'Mood Tracker' });
  container.appendChild(title);

  const options = ['Great', 'Good', 'Okay', 'Struggling', 'Difficult'];
  const btnRow = createEl('div', { className: 'mood-row' });
  options.forEach(opt => {
    const b = createEl('button', { text: opt, className: 'btn mood-btn', attrs: { 'aria-label': `Select mood ${opt}` } });
    b.addEventListener('click', () => {
      saveMood(opt);
      // quick confirmation
      b.classList.add('selected');
      setTimeout(() => renderMood(), 400);
    });
    btnRow.appendChild(b);
  });
  container.appendChild(btnRow);

  // show recent mood
  const recent = state.mood.slice(-5).reverse();
  if (recent.length) {
    const list = createEl('ul', { className: 'recent-mood' });
    recent.forEach(r => {
      const li = createEl('li', { text: `${formatDateISO(new Date(r.date))}: ${r.mood}` });
      list.appendChild(li);
    });
    container.appendChild(list);
  }
}

/* =========================
   Health Tracking
   ========================= */

function initHealthTracking() {
  const waterCount = el('#waterCount');
  const addWater = el('#waterAdd');
  const resetWater = el('#waterReset');
  const exerciseChk = el('#exerciseChk');
  const medsChk = el('#medsChk');
  const bloodSugarInput = el('#bloodSugarInput');
  const saveHealthBtn = el('#saveHealthBtn');

  if (waterCount) waterCount.textContent = state.health.water || 0;
  if (addWater) addWater.addEventListener('click', () => {
    state.health.water = (state.health.water || 0) + 1;
    if (waterCount) waterCount.textContent = state.health.water;
    saveData();
  });
  if (resetWater) resetWater.addEventListener('click', () => {
    state.health.water = 0;
    if (waterCount) waterCount.textContent = 0;
    saveData();
  });
  if (exerciseChk) {
    exerciseChk.checked = !!state.health.exercise;
    exerciseChk.addEventListener('change', () => {
      state.health.exercise = exerciseChk.checked;
      saveData();
    });
  }
  if (medsChk) {
    medsChk.checked = !!state.health.medication;
    medsChk.addEventListener('change', () => {
      state.health.medication = medsChk.checked;
      saveData();
    });
  }
  if (bloodSugarInput) bloodSugarInput.value = state.health.bloodSugar || '';
  if (saveHealthBtn) saveHealthBtn.addEventListener('click', () => {
    if (bloodSugarInput) state.health.bloodSugar = bloodSugarInput.value.trim();
    saveData();
    alert('Health data saved');
  });
}

/* =========================
   Evening Review
   ========================= */

function saveEveningWins(text) {
  state.eveningWins = text || '';
  saveData();
}

function saveTomorrowTop3(arr) {
  // arr expected array of 3 strings
  state.tomorrowPriorities = arr.slice(0, 3);
  saveData();
}

function renderEveningReview() {
  const container = el('#eveningReviewContainer');
  if (!container) return;
  container.innerHTML = '';
  const title = createEl('h3', { text: 'Evening Review' });
  container.appendChild(title);
  const today = formatDateISO();
  const completedToday = state.tasks.filter(t => t.completionDate === today).length;
  const completedSummary = createEl('p', { text: `You completed ${completedToday} task(s) today.` });
  container.appendChild(completedSummary);

  const winsLabel = createEl('label', { text: "Today's wins", attrs: { for: 'winsTextarea' } });
  const winsTa = createEl('textarea', { attrs: { id: 'winsTextarea', rows: 3, 'aria-label': "Today's wins" } });
  winsTa.value = state.eveningWins || '';
  const saveWinsBtn = createEl('button', { text: 'Save', className: 'btn' });
  saveWinsBtn.addEventListener('click', () => {
    saveEveningWins(winsTa.value);
    alert('Saved!');
  });
  container.appendChild(winsLabel);
  container.appendChild(winsTa);
  container.appendChild(saveWinsBtn);

  const tomorrowLabel = createEl('label', { text: "Tomorrow's Top 3", attrs: { for: 'tomorrowInputs' }});
  container.appendChild(tomorrowLabel);
  const tomorrowDiv = createEl('div', { id: 'tomorrowInputs' });
  const arr = state.tomorrowPriorities || ['', '', ''];
  const inputs = [];
  for (let i = 0; i < 3; i++) {
    const input = createEl('input', { attrs: { type: 'text', placeholder: `Tomorrow #${i + 1}`, 'aria-label': `Tomorrow priority ${i+1}` } });
    input.value = arr[i] || '';
    inputs.push(input);
    tomorrowDiv.appendChild(input);
  }
  const saveTomorrowBtn = createEl('button', { text: 'Save Tomorrow', className: 'btn' });
  saveTomorrowBtn.addEventListener('click', () => {
    const values = inputs.map(i => i.value.trim());
    saveTomorrowTop3(values);
    alert('Tomorrow planning saved');
  });
  container.appendChild(tomorrowDiv);
  container.appendChild(saveTomorrowBtn);
}

/* =========================
   Streaks & Achievements
   ========================= */

// Evaluate streaks: if today a sufficient number of tasks were completed, increment streak else reset.
// Simple rule: if user completed at least 1 task today, count as a day for streak. You can refine later.
function evaluateStreaks() {
  const today = formatDateISO();
  const completedToday = state.tasks.filter(t => t.completionDate === today).length;
  const lastDate = state.streaks.lastStreakDate;

  if (completedToday > 0) {
    if (lastDate === today) {
      // already counted today
      return;
    }
    // If yesterday was lastStreakDate -> increment else reset to 1
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = formatDateISO(yesterday);
    if (lastDate === yesterdayStr) {
      state.streaks.currentStreak = (state.streaks.currentStreak || 0) + 1;
    } else {
      state.streaks.currentStreak = 1;
    }
    state.streaks.lastStreakDate = today;
    if (state.streaks.currentStreak > (state.streaks.bestStreak || 0)) state.streaks.bestStreak = state.streaks.currentStreak;
    saveData();
  } else {
    // nothing to do until they complete something
  }
}

// Achievements definitions
const ACHIEVEMENT_DEFS = {
  'first-task-completed': {
    id: 'first-task-completed',
    title: 'First Task Completed',
    check: () => (state.stats.totalTasksEverCompleted || 0) >= 1
  },
  '7-day-streak': {
    id: '7-day-streak',
    title: '7 Day Streak',
    check: () => (state.streaks.currentStreak || 0) >= 7
  },
  'focus-champion': {
    id: 'focus-champion',
    title: 'Focus Champion',
    check: () => (state.streaks.focusSessionsCompleted || 0) >= 10
  },
  'started-with-5-minutes': {
    id: 'started-with-5-minutes',
    title: 'Started With 5 Minutes',
    check: () => state.achievements.includes('started-with-5-minutes') // we set this when timer finishes
  },
  'routine-builder': {
    id: 'routine-builder',
    title: 'Routine Builder',
    check: () => {
      // simple heuristic: completed at least one task in each of 3 distinct categories today
      const today = formatDateISO();
      const completed = state.tasks.filter(t => t.completionDate === today).map(t => t.category);
      const uniqueCats = new Set(completed);
      return uniqueCats.size >= 3;
    }
  }
};

// Unlock achievement by id
function unlockAchievement(id) {
  if (!id || state.achievements.includes(id)) return;
  state.achievements.push(id);
  saveData();
  renderAchievements();
}

// Evaluate all achievements and unlock those that pass
function evaluateAchievements() {
  Object.keys(ACHIEVEMENT_DEFS).forEach(k => {
    const def = ACHIEVEMENT_DEFS[k];
    try {
      if (def.check() && !state.achievements.includes(k)) {
        state.achievements.push(k);
      }
    } catch (e) {
      // don't let a check throw the app
      console.error('Error evaluating achievement', k, e);
    }
  });
  saveData();
  renderAchievements();
}

// Render achievements in #achievementsContainer
function renderAchievements() {
  const container = el('#achievementsContainer');
  if (!container) return;
  container.innerHTML = '';
  const title = createEl('h3', { text: 'Achievements' });
  container.appendChild(title);

  const list = createEl('div', { className: 'achievements-list' });
  Object.values(ACHIEVEMENT_DEFS).forEach(def => {
    const unlocked = state.achievements.includes(def.id);
    const badge = createEl('div', { className: `achievement ${unlocked ? 'unlocked' : 'locked'}` });
    badge.setAttribute('role', 'img');
    badge.setAttribute('aria-label', `${def.title} ${unlocked ? 'unlocked' : 'locked'}`);
    const name = createEl('div', { text: def.title });
    badge.appendChild(name);
    if (unlocked) {
      const note = createEl('small', { text: 'Unlocked' });
      badge.appendChild(note);
    } else {
      const note = createEl('small', { text: 'Locked' });
      badge.appendChild(note);
    }
    list.appendChild(badge);
  });
  container.appendChild(list);
}

/* =========================
   Dark Mode
   ========================= */

function applyDarkMode(enabled) {
  const body = document.body;
  if (!body) return;
  if (enabled) body.classList.add('dark-mode');
  else body.classList.remove('dark-mode');
  state.settings.darkMode = !!enabled;
  saveData();
}

function initDarkModeToggle() {
  const toggle = el('#darkModeToggle');
  if (!toggle) return;
  toggle.checked = !!state.settings.darkMode;
  applyDarkMode(toggle.checked);
  toggle.addEventListener('change', () => {
    applyDarkMode(toggle.checked);
  });
}

/* =========================
   Rendering & Initialization
   ========================= */

function renderAll() {
  renderTasks();
  renderPriorities();
  renderProgress();
  renderMood();
  renderEveningReview();
  renderAchievements();
  // Update health UI counts
  const wc = el('#waterCount');
  if (wc) wc.textContent = state.health.water || 0;
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

/* =========================
   Defensive Initialization
   ========================= */

function safeInit() {
  // Run daily reset logic first
  resetDailyIfNeeded();

  // Initialize components if the relevant DOM exists
  renderAll();
  initEventBindings();
  initActivationTimer();
  initFocusTimer();
  initBrainDump();
  initHealthTracking();
  initDarkModeToggle();
  evaluateAchievements(); // check achievements based on loaded state

  // Schedule periodic saves (in case timers or other parts want to persist often)
  setInterval(saveData, 30 * 1000); // every 30 seconds

  // Attempt to schedule midnight reset (if not already)
  scheduleNextMidnightReset();
}

/* =========================
   SAFETY: Ensure DOMContentLoaded
   ========================= */

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', safeInit);
} else {
  safeInit();
}

/* =========================
   Exports for Testing / Console
   ========================= */

// Expose some functions for console debugging and potential unit tests
window.DailyChecklistHub = {
  state,
  addTask,
  editTask,
  deleteTask,
  toggleTaskCompletion,
  savePriority,
  togglePriority,
  saveBrainDump,
  saveMood,
  saveEveningWins: saveEveningWins,
  unlockAchievement,
  applyDarkMode,
  computeProgress,
  renderAll
};

/* =========================
   Notes for Integrators (HTML expectations)
   =========================
   To use this JS, include it on your page and provide these (optional but recommended) elements with the IDs:
   - #tasksContainer : where category sections and tasks render
   - #progressCount : text "X/Y tasks complete"
   - #progressBarFill : element inside a progress bar to set width style
   - #prioritiesContainer : top 3 priorities UI
   - #activationTimerDisplay, #activationStart, #activationPause, #activationReset, #activationMessage
   - #focusTimerDisplay, #focusStart, #focusPause, #focusReset, #focusModeLabel
   - #brainDumpTextarea, #brainDumpSave, #brainDumpClear
   - #moodContainer
   - #health section: #waterCount, #waterAdd, #waterReset, #exerciseChk, #medsChk, #bloodSugarInput, #saveHealthBtn
   - #eveningReviewContainer
   - #achievementsContainer
   - #darkModeToggle (checkbox)
   Elements not present will be skipped gracefully.
   =========================
 */
