/* Epic report data, rendering and export */
let epicReportStatusFilter = "all"; // all | active | closed
let epicReportAssigneeFilter = "all";
let epicReportExpanded = new Set();

function getEpicReportData() {
  const scoped = getScopedTickets();
  let visibleEpics = epics.filter(e => !currentSpace || String(e.spaceId) === String(currentSpace.id));
  if (!isManager) visibleEpics = visibleEpics.filter(e => scoped.some(t => String(t.epicId) === String(e.id)) || (currentUser && String(e.assigneeId) === String(currentUser.id)));
  const closedTicket = (t) => isTicketClosed(t);
  return visibleEpics.map(epic => {
    const epicTickets = scoped.filter(t => String(t.epicId) === String(epic.id));
    const open = epicTickets.filter(t => !closedTicket(t));
    const closed = epicTickets.filter(closedTicket);
    const pct = epicTickets.length ? Math.round((closed.length / epicTickets.length) * 100) : 0;
    const sprintIds = Array.from(new Set(epicTickets.map(t => t.sprintId).filter(Boolean)));
    return {
      epic, tickets: epicTickets, open, closed, pct, sprintIds,
      story: epicTickets.filter(t => t.workItemType === "Story").length,
      task: epicTickets.filter(t => t.workItemType === "Task").length,
      bug: epicTickets.filter(t => t.workItemType === "Bug").length,
      breached: open.filter(t => t.slaStatus === "Breached").length,
      unassigned: open.filter(t => !t.assigneeId || !t.assigneeName || t.assigneeName === "Atanmamış").length
    };
  }).sort((a,b) => b.tickets.length - a.tickets.length || a.epic.name.localeCompare(b.epic.name, "tr"));
}

function renderEpicReport() {
  const contentEl = document.getElementById("epicReportContent");
  if (!contentEl) return;
  const allData = getEpicReportData();
  const technicianOptions = [...assignees].sort((a,b)=>a.name.localeCompare(b.name,"tr"));
  const filtered = allData.filter(d => {
    const statusClosed = isStatusClosed(d.epic);
    const statusOk = epicReportStatusFilter === "all" || (epicReportStatusFilter === "closed" ? statusClosed : !statusClosed);
    const assigneeOk = epicReportAssigneeFilter === "all" || (epicReportAssigneeFilter === "__unassigned__" ? !d.epic.assigneeId : String(d.epic.assigneeId || "") === String(epicReportAssigneeFilter));
    return statusOk && assigneeOk;
  });
  const totalTickets = allData.reduce((s,d)=>s+d.tickets.length,0);
  const totalClosedTickets = allData.reduce((s,d)=>s+d.closed.length,0);
  const activeCount = allData.filter(d=>!isStatusClosed(d.epic)).length;
  const overallPct = totalTickets ? Math.round(totalClosedTickets*100/totalTickets) : 0;
  const updated = lastDataRefreshAt ? new Date(lastDataRefreshAt).toLocaleString("tr-TR") : "Henüz yüklenmedi";

  const controls = `<div class="workload-report-controls epic-report-toolbar">
    <div class="filter-chip-group">
      <button class="filter-chip ${epicReportStatusFilter === "all" ? "active" : ""}" data-epic-report-status="all">Tümü</button>
      <button class="filter-chip ${epicReportStatusFilter === "active" ? "active" : ""}" data-epic-report-status="active">Aktif</button>
      <button class="filter-chip ${epicReportStatusFilter === "closed" ? "active" : ""}" data-epic-report-status="closed">Kapalı</button>
    </div>
    ${isManager ? `<div class="workload-tech-group"><span class="technician-filter-label">Teknisyen</span><select id="epicReportAssigneeSelect" class="report-assignee-filter"><option value="all">Tüm Teknisyenler</option><option value="__unassigned__" ${epicReportAssigneeFilter==="__unassigned__"?"selected":""}>Atanmamış</option>${technicianOptions.map(a=>`<option value="${escapeHtml(String(a.id))}" ${String(epicReportAssigneeFilter)===String(a.id)?"selected":""}>${escapeHtml(a.name)}</option>`).join("")}</select></div>` : ""}
  </div>`;

  const summary = `<div class="epic-report-summary-grid">
    <div class="report-stat-box"><strong>${allData.length}</strong><span>Toplam Epic</span></div>
    <div class="report-stat-box"><strong>${activeCount}</strong><span>Aktif Epic</span></div>
    <div class="report-stat-box"><strong>${totalTickets}</strong><span>Epic'e Bağlı İş</span></div>
    <div class="report-stat-box"><strong>%${overallPct}</strong><span>Genel Tamamlanma</span></div>
  </div>`;

  const cards = filtered.map(d => {
    const expanded = epicReportExpanded.has(d.epic.id);
    const statusName = d.epic.status || "Open";
    const ticketRows = d.tickets.length ? d.tickets.slice().sort((a,b)=>Number(isTicketClosed(a))-Number(isTicketClosed(b))).map(t => {
      const sprint = t.sprintId ? sprints.find(s=>String(s.id)===String(t.sprintId)) : null;
      return `<div class="epic-report-ticket-row">
        <span class="work-item-icon">${workItemTypeIcon(t.workItemType)}</span>${issueKey(t)}
        <span class="epic-report-ticket-title">${escapeHtml(t.title)}</span>
        <span class="sprint-status-badge" style="color:${t.statusColor}; background:${t.statusColor}22;">${escapeHtml(t.statusName)}</span>
        <span class="muted">${escapeHtml(t.assigneeName || "Atanmamış")}</span>
        <span class="muted">${escapeHtml(sprint?.name || "Backlog")}</span>
      </div>`;
    }).join("") : '<div class="muted" style="padding:8px 0;">Bu Epic\'e bağlı iş yok.</div>';
    return `<div class="epic-report-card">
      <div class="epic-report-card-main" data-epic-report-toggle="${d.epic.id}">
        <div class="epic-report-title-block"><div class="epic-report-title">${epicIconSvg()} <strong>${escapeHtml(d.epic.name)}</strong><span class="sprint-status-badge" style="background:${spaceStatusColor(statusName)}22; color:${spaceStatusColor(statusName)};">${escapeHtml(statusName)}</span></div><div class="muted">Teknisyen: ${escapeHtml(d.epic.assigneeName || "Atanmamış")} · ${d.sprintIds.length} sprint · ${d.tickets.length} iş</div></div>
        <div class="epic-report-progress"><div class="epic-report-progress-top"><span>${d.closed.length}/${d.tickets.length} tamamlandı</span><strong>%${d.pct}</strong></div><div class="sprint-progress-bar-wrap"><div class="sprint-progress-bar" style="width:${d.pct}%;"></div></div></div>
        <div class="epic-report-counters"><span style="color:${WORK_ITEM_TYPE_COLORS.Story}">${d.story} Story</span><span style="color:${WORK_ITEM_TYPE_COLORS.Task}">${d.task} Task</span><span style="color:${WORK_ITEM_TYPE_COLORS.Bug}">${d.bug} Bug</span>${d.unassigned ? `<span class="report-overtime-tag">${d.unassigned} atanmamış</span>`:""}</div>
        <span class="report-expand-chevron ${expanded?"open":""}">▾</span>
      </div>
      ${expanded ? `<div class="epic-report-ticket-list">${ticketRows}</div>` : ""}
    </div>`;
  }).join("");

  contentEl.innerHTML = `<div class="report-data-note">Son Güncelleme: ${updated} · Veriler mevcut Space'in SDP kayıtlarından hesaplanır.</div>${summary}${controls}${cards || '<div class="empty-state" style="padding:18px;"><p>Bu filtreye uyan Epic yok.</p></div>'}`;
  contentEl.querySelectorAll("[data-epic-report-status]").forEach(btn => btn.addEventListener("click",()=>{ epicReportStatusFilter=btn.dataset.epicReportStatus; renderEpicReport(); }));
  const assigneeSelect=document.getElementById("epicReportAssigneeSelect");
  if (assigneeSelect) assigneeSelect.addEventListener("change",()=>{ epicReportAssigneeFilter=assigneeSelect.value; renderEpicReport(); });
  contentEl.querySelectorAll("[data-epic-report-toggle]").forEach(el=>el.addEventListener("click",()=>{ const id=el.dataset.epicReportToggle; epicReportExpanded.has(id)?epicReportExpanded.delete(id):epicReportExpanded.add(id); renderEpicReport(); }));
}

function exportEpicReportXlsx() {
  const data = getEpicReportData();
  if (!data.length) { showToast("Dışa aktarılacak Epic yok.", "warning"); return; }
  const now = new Date();
  const COLS = 15;
  const header = buildReportHeaderRows(now, COLS);
  const rows = [...header.rows];
  if (lastDataRefreshAt) {
    rows.push({ isTicketRow:true, cells:[`Veri Son Güncelleme`, new Date(lastDataRefreshAt).toLocaleString("tr-TR"), ...Array(COLS-2).fill("")] });
    rows.push({ cells:Array(COLS).fill("") });
  }
  const allTickets = data.flatMap(d=>d.tickets);
  const closedCount = allTickets.filter(t=>isTicketClosed(t)).length;
  const overallPct = allTickets.length ? Math.round(closedCount*100/allTickets.length) : 0;

  rows.push({ header:true, cells:["Genel Özet","Değer",...Array(COLS-2).fill("")] });
  [["Toplam Epic",data.length],["Aktif Epic",data.filter(d=>!isStatusClosed(d.epic)).length],["Kapalı Epic",data.filter(d=>isStatusClosed(d.epic)).length],["Epic'e Bağlı Toplam İş",allTickets.length],["Tamamlanan İş",closedCount],["Açık İş",allTickets.length-closedCount],["Genel Tamamlanma",`%${overallPct}`]].forEach(([k,v])=>rows.push({isTicketRow:true,cells:[String(k),String(v),...Array(COLS-2).fill("")]}));
  rows.push({cells:Array(COLS).fill("")});
  rows.push({header:true,cells:["Epic","Epic Durumu","Teknisyen","Tamamlanma","Toplam İş","Açık","Kapalı","Story","Task","Bug","Sprint Sayısı","İş Key","İş Başlığı","İş Durumu","İş Teknisyeni"]});

  data.forEach((d,idx)=>{
    rows.push({isSprintRow:true,cells:[d.epic.name,d.epic.status,d.epic.assigneeName||"Atanmamış",`%${d.pct}`,String(d.tickets.length),String(d.open.length),String(d.closed.length),String(d.story),String(d.task),String(d.bug),String(d.sprintIds.length),"","","",""]});
    if (!d.tickets.length) rows.push({cells:["","","","","","","","","","","","(İş yok)","","",""]});
    else d.tickets.slice().sort((a,b)=>Number(isTicketClosed(a))-Number(isTicketClosed(b))).forEach(t=>rows.push({
      isTicketRow:true,
      cells:["","","","","","","","","","","",issueKeyText(t),t.title||"—",t.statusName||"—",t.assigneeName||"Atanmamış"],
      cellStyles:[null,null,null,null,null,null,null,null,null,null,null,null,null,xlsxColorStyleIndex(t.statusName),null]
    }));
    if (idx<data.length-1) rows.push({cells:Array(COLS).fill("")});
  });
  downloadXlsx(`epic-raporu-${now.toISOString().slice(0,10)}.xlsx`, "Epic Raporu", rows, [28,16,22,14,12,10,10,9,9,9,13,13,38,18,22], header.merges);
}

