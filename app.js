*** Begin Patch
*** Update File: app.js
@@
   // Export PDF button
   const exportBtn = el('#exportEveningBtn');
   if (exportBtn) exportBtn.addEventListener('click', () => exportEveningReviewPdf());
+
+  // Export Day Summary button (uses same placement as evening export if present)
+  const exportDayBtn = el('#exportDaySummaryBtn');
+  if (exportDayBtn) exportDayBtn.addEventListener('click', () => exportDaySummaryPdf());
*** End Patch
