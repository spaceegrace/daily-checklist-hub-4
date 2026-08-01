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
  meta: { lastResetDate: null },
  // persisted brain dump notes
  brainDump: ''
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
  // normalize attrs and ensure buttons are non-submit by default
  const attrs = Object.assign({}, options.attrs || {});
  if (tag === 'button' && !('type' in attrs)) attrs.type = 'button';
  Object.keys(attrs).forEach(k => e.setAttribute(k, attrs[k]));
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
  const allCompleted = state.tasks.filter(t => t.completed);

  // percent for today (rounded, same logic as computeProgress)
  const todaysTasks = state.tasks.filter(t => t.dateCreated === today);
  const total = todaysTasks.length;
  const completedCount = todaysTasks.filter(t => t.completed).length;
  const pct = total === 0 ? 0 : Math.round((completedCount / total) * 100);
  const pctTextEl = el('#eveningPercentText');
  const pctFill = el('#eveningProgressFill');
  if (pctTextEl) pctTextEl.textContent = pct + '%';
  if (pctFill) pctFill.style.width = pct + '%';

  if (completedToday.length === 0) {
    const p = createEl('p', { text: 'No tasks were completed today.', className: 'muted' });
    wrap.appendChild(p);
  } else {
    wrap.appendChild(createEl('h4', { text: `Completed Today (${completedToday.length})` }));
    const list = createEl('ul', { className: 'task-list', attrs: { role: 'list' } });
    completedToday.forEach(task => {
      const li = createEl('li', { className: 'task-item completed', attrs: { 'data-id': task.id } });
      li.appendChild(createEl('span', { text: `${task.text} — ${task.category || 'Misc'}`, className: 'task-text' }));
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

  // All completed (include other completed tasks)
  if (allCompleted.length > completedToday.length) {
    wrap.appendChild(createEl('h4', { text: `All Completed (${allCompleted.length})` }));
    const allList = createEl('ul', { className: 'task-list', attrs: { role: 'list' } });
    allCompleted.forEach(task => {
      const li = createEl('li', { className: 'task-item completed', attrs: { 'data-id': task.id } });
      li.appendChild(createEl('span', { text: `${task.text} — ${task.category || 'Misc'}`, className: 'task-text' }));
      const meta = createEl('div', { className: 'task-meta' });
      meta.appendChild(createEl('small', { text: `Completed: ${task.completionDate || '—'}` }));
      li.appendChild(meta);
      allList.appendChild(li);
    });
    wrap.appendChild(allList);
  }

  // Brain dump display included in evening review
  const brain = state.brainDump && state.brainDump.trim();
  const brainWrap = createEl('div', { className: 'evening-brain-dump' });
  brainWrap.appendChild(createEl('h4', { text: 'Brain Dump' }));
  brainWrap.appendChild(createEl('div', { html: brain ? `<p>${escapeHtml(brain).replace(/\n/g,'<br/>')}</p>` : '<em>No brain dump notes.</em>' }));
  wrap.appendChild(brainWrap);
}

// Brain dump helpers
function saveBrainDump(text) {
  state.brainDump = text || '';
  saveData();
  renderEveningReview();
}
function loadBrainDump() {
  return state.brainDump || '';
}

// simple html escaper used above
function escapeHtml(unsafe) {
  return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

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

  // small helper to prevent form submit jumps if the user presses Enter in the top input
  const globalFormText = el('#globalTaskText');
  if (globalFormText) {
    globalFormText.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const btn = el('#globalAddBtn');
        if (btn) btn.click();
      }
    });
  }

  const resetBtn = el('#resetDayBtn'); if (resetBtn) resetBtn.addEventListener('click', deleteCompletedToday);
  const clearBtn = el('#clearAllBtn'); if (clearBtn) clearBtn.addEventListener('click', clearAllTasks);

  // Brain dump save/clear wiring
  const saveBD = el('#saveBrainDumpBtn'), clearBD = el('#clearBrainDumpBtn'), brainInput = el('#brainDumpInput');
  if (brainInput) brainInput.value = loadBrainDump();
  if (saveBD && brainInput) saveBD.addEventListener('click', () => { saveBrainDump(brainInput.value); saveBD.textContent = 'Saved'; setTimeout(()=>saveBD.textContent='Save Brain Dump',900); });
  if (clearBD && brainInput) clearBD.addEventListener('click', () => { brainInput.value = ''; saveBrainDump(''); });

  // Export PDF button
  const exportBtn = el('#exportEveningBtn');
  if (exportBtn) exportBtn.addEventListener('click', () => exportEveningReviewPdf());

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

/* --- BEGIN: minimal missing helpers (added to enable button bindings) --- */

// Compute progress for today (used by UI or external callers)
function computeProgress() {
  const today = formatDateISO();
  const todaysTasks = state.tasks.filter(t => t.dateCreated === today);
  const total = todaysTasks.length;
  if (total === 0) return 0;
  const completedCount = todaysTasks.filter(t => t.completed).length;
  return Math.round((completedCount / total) * 100);
}

// Renders all UI pieces that exist in this file
function renderAll() {
  try {
    renderTasks();
  } catch (e) { console.warn('renderTasks failed', e); }
  try {
    renderEveningReview();
  } catch (e) { console.warn('renderEveningReview failed', e); }
}

// Remove completed tasks that were completed today
function deleteCompletedToday() {
  if (!confirm('Delete completed tasks from today?')) return;
  const today = formatDateISO();
  state.tasks = state.tasks.filter(t => !(t.completed && t.completionDate === today));
  saveData();
  renderAll();
}

// Clear all tasks (confirmed)
function clearAllTasks() {
  if (!confirm('Clear ALL tasks? This cannot be undone.')) return;
  state.tasks = [];
  saveData();
  renderAll();
}

// Reset daily counters if lastResetDate is before today.
// This is a minimal/no-op-preserving reset: updates meta.lastResetDate and resets daily timers.
function resetDailyIfNeeded() {
  const today = formatDateISO();
  state.meta = state.meta || {};
  if (state.meta.lastResetDate === today) return;
  // Example daily resets:
  state.timers = state.timers || {};
  state.timers.focusSessionsCompletedToday = 0;
  state.meta.lastResetDate = today;
  saveData();
}

// Schedule a timer to run resetDailyIfNeeded at next midnight
function scheduleNextMidnightReset() {
  try {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const ms = next.getTime() - now.getTime();
    setTimeout(() => {
      resetDailyIfNeeded();
      renderAll();
      // re-schedule for the following midnight
      scheduleNextMidnightReset();
    }, ms + 1000); // add 1s tolerance
  } catch (e) { console.warn('scheduleNextMidnightReset failed', e); }
}

/* --- END: minimal missing helpers --- */

function safeInit() {
  resetDailyIfNeeded();
  renderAll();
  initEventBindings();
  initDarkModeToggle();
  setInterval(saveData, 30 * 1000);
  scheduleNextMidnightReset();
}

// PDF export: exports brain dump + evening review (uses html2pdf if available, else falls back to print)
// PDF export: creates a text-based daily summary PDF
function exportEveningReviewPdf() {

  if (!window.jspdf) {
    alert("PDF library not loaded.");
    return;
  }

  const { jsPDF } = window.jspdf;
  // A4 portrait provides a bit more room than the default
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 18; // comfortable margin
  const maxWidth = pageWidth - margin * 2;
  const lineHeight = 7; // mm

  const today = formatDateISO();

  let y = margin;

  function ensureSpace(linesCount = 1) {
    if (y + linesCount * lineHeight > pageHeight - margin - 12) {
      doc.addPage();
      y = margin;
      renderHeaderFooterStub();
    }
  }

  function renderHeaderFooterStub() {
    // small header line to separate pages
    doc.setDrawColor(220);
    doc.setLineWidth(0.3);
    doc.line(margin, margin - 4, pageWidth - margin, margin - 4);
  }

  function addWrappedText(text, opts = {}) {
    const size = opts.size || 11;
    const style = opts.style || 'normal';
    const color = opts.color || [0, 0, 0];
    doc.setFont('helvetica', style === 'bold' ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(...color);
    const lines = doc.splitTextToSize(text, maxWidth);
    lines.forEach(line => {
      ensureSpace(1);
      doc.text(line, margin, y);
      y += lineHeight;
    });
  }

  // ======================
  // HEADER
  // ======================
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Daily Checklist Hub Summary', pageWidth / 2, y, { align: 'center' });
  y += 9;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Date: ${today}`, margin, y);
  y += 8;

  // thin rule
  doc.setDrawColor(200);
  doc.setLineWidth(0.4);
  doc.line(margin, y - 3, pageWidth - margin, y - 3);
  y += 2;

  // ======================
  // TASK SUMMARY
  // ======================
  const todaysTasks = state.tasks.filter(task => task.dateCreated === today);
  const completedToday = todaysTasks.filter(task => task.completed);
  const percent = todaysTasks.length === 0 ? 0 : Math.round((completedToday.length / todaysTasks.length) * 100);

  addWrappedText('Daily Progress', { size: 14, style: 'bold' });
  addWrappedText(`Tasks Completed: ${completedToday.length}/${todaysTasks.length}`);
  addWrappedText(`Completion Rate: ${percent}%`);
  addWrappedText(`Total Tasks Ever Completed: ${state.stats.totalTasksEverCompleted || 0}`);
  y += 3;

  // ======================
  // TASK BREAKDOWN
  // ======================
  addWrappedText('Task Breakdown', { size: 14, style: 'bold' });

  CATEGORIES.forEach(category => {
    const categoryTasks = todaysTasks.filter(task => task.category === category);
    if (categoryTasks.length === 0) return;

    addWrappedText(`${category} (${categoryTasks.length})`, { size: 12, style: 'bold' });

    categoryTasks.forEach(task => {
      const symbol = task.completed ? '✓' : '○';
      // color completed items green for emphasis
      const color = task.completed ? [16, 185, 129] : [34, 34, 34];
      addWrappedText(`${symbol} ${task.text}`, { size: 11, color });
    });

    y += 2;
  });

  // If there were no tasks today, include a helpful note
  if (todaysTasks.length === 0) {
    addWrappedText('No tasks were created today.', { color: [120, 120, 120] });
  }

  y += 3;

  // ======================
  // BRAIN DUMP
  // ======================
  addWrappedText('Brain Dump', { size: 14, style: 'bold' });

  if (state.brainDump && state.brainDump.trim()) {
    // respect original line breaks
    const safe = String(state.brainDump).trim();
    const paragraphs = safe.split(/\n\n+/);
    paragraphs.forEach(p => addWrappedText(p));
  } else {
    addWrappedText('No brain dump notes recorded.', { color: [120, 120, 120] });
  }

  y += 3;

  // ======================
  // FOCUS TIMER
  // ======================
  addWrappedText('Focus Sessions', { size: 14, style: 'bold' });
  addWrappedText(`Completed Today: ${state.timers.focusSessionsCompletedToday || 0}`);

  // ======================
  // FOOTER / PAGE NUMBERS
  // ======================
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    const pageStr = `Page ${i} of ${totalPages}`;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(pageStr, pageWidth - margin, pageHeight - 10, { align: 'right' });
  }

  // Save PDF with a clean filename
  doc.save(`Daily-Checklist-Summary-${today}.pdf`);
}

   if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', safeInit); else safeInit();
      window.DailyChecklistHub = { state, addTask, editTask, deleteTask, toggleTaskCompletion, computeProgress, renderAll };
