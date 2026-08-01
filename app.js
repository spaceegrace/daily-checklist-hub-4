*** Begin Patch
*** Update File: app.js

 function exportEveningReviewPdf() {

 }
+
+// Build a simple day summary HTML element for export
+function buildDaySummaryElement() {
+  const today = formatDateISO();
+  const container = document.createElement('div');
+  container.style.fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial';
+  container.style.padding = '18px';
+
+  const header = document.createElement('div');
+  header.style.textAlign = 'center';
+  header.innerHTML = `<h1>Day Summary — ${today}</h1>`;
+  container.appendChild(header);
+
+  const todaysTasks = state.tasks.filter(t => t.dateCreated === today);
+  const totalToday = todaysTasks.length;
+  const completedToday = todaysTasks.filter(t => t.completed);
+  const pct = totalToday === 0 ? 0 : Math.round((completedToday.length / totalToday) * 100);
+
+  const counts = document.createElement('p');
+  counts.innerHTML = `<strong>Tasks created today:</strong> ${totalToday} &nbsp;|&nbsp; <strong>Completed today:</strong> ${completedToday.length} &nbsp;|&nbsp; <strong>Progress:</strong> ${pct}%`;
+  container.appendChild(counts);
+
+  // Top 3 Priorities (today)
+  const top3 = state.tasks.filter(t => t.category === 'Top 3 Priorities' && t.dateCreated === today);
+  const topSection = document.createElement('div');
+  topSection.innerHTML = `<h3>Top 3 Priorities</h3>`;
+  if (top3.length === 0) topSection.appendChild(createEl('p', { text: 'No top priorities for today.' }));
+  else {
+    const ul = createEl('ul');
+    top3.forEach(t => ul.appendChild(createEl('li', { text: `${t.text}${t.completed ? ' (done)' : ''}` })));
+    topSection.appendChild(ul);
+  }
+  container.appendChild(topSection);
+
+  // Completed today
+  const completedSection = document.createElement('div');
+  completedSection.innerHTML = `<h3>Completed Today (${completedToday.length})</h3>`;
+  if (completedToday.length === 0) completedSection.appendChild(createEl('p', { text: 'No completed tasks today.' }));
+  else {
+    const ul = createEl('ul');
+    completedToday.forEach(t => ul.appendChild(createEl('li', { text: `${t.text} — ${t.category || 'Misc'}` })));
+    completedSection.appendChild(ul);
+  }
+  container.appendChild(completedSection);
+
+  // Pending top priorities (not completed)
+  const pendingTop = top3.filter(t => !t.completed);
+  if (pendingTop.length > 0) {
+    const pending = createEl('div');
+    pending.innerHTML = `<h3>Pending Top Priorities</h3>`;
+    const ul = createEl('ul');
+    pendingTop.forEach(t => ul.appendChild(createEl('li', { text: t.text })));
+    pending.appendChild(ul);
+    container.appendChild(pending);
+  }
+
+  // Brain dump
+  const brain = state.brainDump && state.brainDump.trim();
+  const brainWrap = createEl('div', { className: 'day-brain-dump' });
+  brainWrap.appendChild(createEl('h3', { text: 'Brain Dump' }));
+  brainWrap.appendChild(createEl('div', { html: brain ? `<p>${escapeHtml(brain).replace(/\n/g,'<br/>')}</p>` : '<em>No brain dump notes.</em>' }));
+  container.appendChild(brainWrap);
+
+  // Summary stats
+  const stats = createEl('p', { html: `<strong>Total tasks ever completed:</strong> ${state.stats.totalTasksEverCompleted || 0} &nbsp;|&nbsp; <strong>Focus sessions today:</strong> ${state.timers.focusSessionsCompletedToday || 0}` });
+  container.appendChild(stats);
+
+  return container;
+}
+
+// Export a day summary using html2pdf if available, else print fallback
+function exportDaySummaryPdf() {
+  const elem = buildDaySummaryElement();
+  if (!elem) { alert('Nothing to export'); return; }
+
+  if (typeof html2pdf !== 'undefined') {
+    const opt = {
+      margin: 0.4,
+      filename: `Day-Summary-${formatDateISO()}.pdf`,
+      image: { type: 'jpeg', quality: 0.98 },
+      html2canvas: { scale: 2, useCORS: true },
+      jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
+    };
+    html2pdf().set(opt).from(elem).save().catch(e => { console.error(e); alert('PDF export failed'); });
+  } else {
+    const w = window.open('', '_blank');
+    w.document.write('<html><head><title>Day Summary</title></head><body>');
+    w.document.body.appendChild(elem);
+    w.document.write('</body></html>');
+    w.document.close();
+    w.print();
+  }
+}
*** End Patch
