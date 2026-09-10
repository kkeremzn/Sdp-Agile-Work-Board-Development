/* Report filter, collapse and export event binding */
function bindReportsFilterEvents() {
  const exportActiveBtn = document.getElementById("exportActiveSprintsBtn");
  if (exportActiveBtn) exportActiveBtn.addEventListener("click", exportActiveSprintsCsv);
  const exportHistoryBtn = document.getElementById("exportSprintHistoryBtn");
  if (exportHistoryBtn) exportHistoryBtn.addEventListener("click", exportSprintHistoryCsv);

  const monthEl = document.getElementById("reportVelocityMonth");
  const yearEl = document.getElementById("reportVelocityYear");
  if (monthEl) monthEl.addEventListener("change", () => {
    reportVelocityMonth = monthEl.value;
    reportVelocityRange = { start: null, end: null }; // Ay/Yıl seçilince özel aralık geçersiz kalsın
    renderSprintVelocityTrend();
  });
  if (yearEl) yearEl.addEventListener("change", () => {
    reportVelocityYear = yearEl.value;
    reportVelocityRange = { start: null, end: null };
    renderSprintVelocityTrend();
  });

  const customRangeBtn = document.getElementById("reportCustomRangeBtn");
  const customRangeRow = document.getElementById("reportCustomRangeRow");
  if (customRangeBtn && customRangeRow) {
    customRangeBtn.addEventListener("click", () => {
      customRangeRow.style.display = customRangeRow.style.display === "none" ? "flex" : "none";
    });
  }
  const rangeApplyBtn = document.getElementById("reportRangeApplyBtn");
  if (rangeApplyBtn) {
    rangeApplyBtn.addEventListener("click", () => {
      const startVal = document.getElementById("reportRangeStart").value;
      const endVal = document.getElementById("reportRangeEnd").value;
      if (!startVal || !endVal) { showToast("Başlangıç ve bitiş tarihi seç.", "warning"); return; }
      reportVelocityRange = { start: new Date(startVal).getTime(), end: new Date(endVal).getTime() };
      if (monthEl) monthEl.value = ""; // Özel aralık seçilince Ay/Yıl görsel olarak da sıfırlansın
      if (yearEl) yearEl.value = "";
      reportVelocityMonth = ""; reportVelocityYear = "";
      renderSprintVelocityTrend();
    });
  }

  const allTimeBtn = document.getElementById("reportAllTimeBtn");
  if (allTimeBtn) {
    allTimeBtn.addEventListener("click", () => {
      reportVelocityMonth = ""; reportVelocityYear = "";
      reportVelocityRange = { start: null, end: null };
      if (monthEl) monthEl.value = "";
      if (yearEl) yearEl.value = "";
      if (customRangeRow) customRangeRow.style.display = "none";
      renderSprintVelocityTrend();
    });
  }

  const sectionToggle = document.getElementById("sprintReportToggle");
  const sectionBody = document.getElementById("sprintReportBody");
  const collapseIcon = document.getElementById("sprintReportCollapseIcon");
  if (sectionToggle && sectionBody) {
    sectionToggle.addEventListener("click", () => {
      const collapsed = sectionBody.style.display === "none";
      sectionBody.style.display = collapsed ? "" : "none";
      if (collapseIcon) collapseIcon.classList.toggle("collapsed", !collapsed);
    });
  }

  const epicToggle = document.getElementById("epicReportToggle");
  const epicBody = document.getElementById("epicReportBody");
  const epicCollapseIcon = document.getElementById("epicReportCollapseIcon");
  if (epicToggle && epicBody) {
    epicToggle.addEventListener("click", () => {
      const collapsed = epicBody.style.display === "none";
      epicBody.style.display = collapsed ? "" : "none";
      if (epicCollapseIcon) epicCollapseIcon.classList.toggle("collapsed", !collapsed);
    });
  }
  const exportEpicBtn = document.getElementById("exportEpicReportBtn");
  if (exportEpicBtn) exportEpicBtn.addEventListener("click", exportEpicReportXlsx);

  const workloadToggle = document.getElementById("workloadReportToggle");
  const workloadBody = document.getElementById("workloadReportBody");
  const workloadCollapseIcon = document.getElementById("workloadReportCollapseIcon");
  if (workloadToggle && workloadBody) {
    workloadToggle.addEventListener("click", () => {
      const collapsed = workloadBody.style.display === "none";
      workloadBody.style.display = collapsed ? "" : "none";
      if (workloadCollapseIcon) workloadCollapseIcon.classList.toggle("collapsed", !collapsed);
    });
  }
  const loadWorkloadBtn = document.getElementById("loadWorkloadReportBtn");
  if (loadWorkloadBtn) loadWorkloadBtn.addEventListener("click", loadWorkloadReport);
  const exportWorkloadBtn = document.getElementById("exportWorkloadReportBtn");
  if (exportWorkloadBtn) exportWorkloadBtn.addEventListener("click", exportWorkloadReportXlsx);
}
