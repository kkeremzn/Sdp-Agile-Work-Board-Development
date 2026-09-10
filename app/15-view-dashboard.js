/* Dashboard KPIs, status/type distribution and workload summary */
/* Dashboard rendering and KPI logic */
function renderKpis() {
  const scoped = getScopedTickets();
  document.getElementById("kpiTotal").innerText = scoped.length;
  document.getElementById("kpiActiveSprint").innerText = sprints.filter(s => {
    if (!isSprintCurrentlyRunning(s) || (currentSpace && String(s.spaceId) !== String(currentSpace.id))) return false;
    if (isManager) return true;
    return tickets.some(t => String(t.sprintId) === String(s.id) && currentUser && String(t.assigneeId) === String(currentUser.id));
  }).length;

  // Yönetici: Space'teki tüm açık Epic'ler. Teknisyen: sadece kendi işi olan açık Epic'ler.
  const relevantEpics = epics.filter(e => (!currentSpace || String(e.spaceId) === String(currentSpace.id)) && isStatusActive(e));
  const visibleEpicCount = isManager
    ? relevantEpics.length
    : relevantEpics.filter(e => scoped.some(t => String(t.epicId) === String(e.id))).length;
  document.getElementById("kpiActiveEpic").innerText = visibleEpicCount;

  document.getElementById("kpiInProgress").innerText = scoped.filter(t => !["2", "4", "1"].includes(String(t.status))).length;
  document.getElementById("kpiCompleted").innerText = scoped.filter(t => isTicketClosed(t)).length;
}

let boardShowingSprints = false; // Board ekranı İşler mi Sprintler mi gösteriyor


let dashboardStatusScope = "issues"; // issues | epics | sprints
let dashboardExpandedTechnician = null;
let dashboardExpandedWorkItemType = null;
let dashboardExpandedStatusKey = null;

function dashboardTicketIsClosed(t) {
  return isTicketClosed(t) || ["Closed", "Resolved"].includes(t.statusName);
}
function dashboardTicketIsOpen(t) {
  return String(t.status) === "2" || t.statusName === "Open";
}
function dashboardTicketIsProcessing(t) {
  return !dashboardTicketIsOpen(t) && !dashboardTicketIsClosed(t);
}
function dashboardIssueDetailRows(list, { showTechnician = true } = {}) {
  if (!list.length) return '<div class="dashboard-detail-empty">Bu kapsamda iş yok.</div>';
  return `<div class="dashboard-detail-list">${list.map(t => {
    const epic = t.epicId ? epics.find(e => String(e.id) === String(t.epicId)) : null;
    const metaParts = [`Epic: ${epic?.name || "Epic Yok"}`];
    if (showTechnician) metaParts.push(`Teknisyen: ${t.assigneeName || "Atanmamış"}`);
    return `<button type="button" class="dashboard-detail-row dashboard-detail-row-compact" data-dashboard-ticket-id="${escapeHtml(String(t.id))}">
      <span class="dashboard-detail-type" style="color:${workItemTypeColor(t.workItemType)};">${workItemTypeIcon(t.workItemType)} ${escapeHtml(t.workItemType)}</span>
      <span class="dashboard-detail-key">${escapeHtml(issueKeyText(t))}</span>
      <span class="dashboard-detail-main"><span class="dashboard-detail-title">${escapeHtml(t.title)}</span><span class="dashboard-detail-submeta">${metaParts.map(escapeHtml).join(" · ")}</span></span>
      <span class="sprint-status-badge dashboard-detail-status" style="color:${t.statusColor}; background:${t.statusColor}22;">${escapeHtml(t.statusName)}</span>
    </button>`;
  }).join("")}</div>`;
}
function dashboardEpicDetailRows(list) {
  if (!list.length) return '<div class="dashboard-detail-empty">Bu durumda Epic yok.</div>';
  return `<div class="dashboard-entity-detail-list">${list.map(e => {
    const epicTickets = tickets.filter(t => String(t.epicId) === String(e.id));
    const done = epicTickets.filter(dashboardTicketIsClosed).length;
    return `<button type="button" class="dashboard-entity-detail-row" data-dashboard-epic-id="${escapeHtml(String(e.id))}"><span class="dashboard-entity-title">${epicIconSvg()} ${escapeHtml(e.name)}</span><span>${escapeHtml(e.assigneeName || "Atanmamış")}</span><span>${done}/${epicTickets.length} iş tamamlandı</span><span class="sprint-status-badge" style="background:${spaceStatusColor(e.status || "Open")}22;color:${spaceStatusColor(e.status || "Open")};">${escapeHtml(e.status || "Open")}</span></button>`;
  }).join("")}</div>`;
}
function dashboardSprintDetailRows(list) {
  if (!list.length) return '<div class="dashboard-detail-empty">Bu durumda Sprint yok.</div>';
  return `<div class="dashboard-entity-detail-list">${list.map(s => {
    const sprintTickets = tickets.filter(t => String(t.sprintId) === String(s.id));
    const done = sprintTickets.filter(dashboardTicketIsClosed).length;
    return `<button type="button" class="dashboard-entity-detail-row" data-dashboard-sprint-id="${escapeHtml(String(s.id))}"><span class="dashboard-entity-title">${sprintIconSvg()} ${escapeHtml(s.name)}</span><span>${done}/${sprintTickets.length} iş tamamlandı</span><span>${s.startDate ? new Date(s.startDate).toLocaleDateString("tr-TR") : "—"} → ${s.endDate ? new Date(s.endDate).toLocaleDateString("tr-TR") : "—"}</span><span class="sprint-status-badge" style="background:${spaceStatusColor(s.status)}22;color:${spaceStatusColor(s.status)};">${escapeHtml(s.status)}</span></button>`;
  }).join("")}</div>`;
}
function bindDashboardTicketRows(root) {
  root?.querySelectorAll("[data-dashboard-ticket-id]").forEach(row => row.addEventListener("click", () => openDrawer(row.dataset.dashboardTicketId)));
}

function renderDashboard() {
  const scoped = getScopedTickets();
  const openTickets = scoped.filter(dashboardTicketIsOpen);
  const processingTickets = scoped.filter(dashboardTicketIsProcessing);
  const closedTickets = scoped.filter(dashboardTicketIsClosed);
  const activeTickets = scoped.filter(t => !dashboardTicketIsClosed(t));
  const unassignedTickets = activeTickets.filter(t => !t.assigneeId || !t.assigneeName || t.assigneeName === "Atanmamış");

  const snapshotEl = document.getElementById("dashboardSnapshot");
  if (snapshotEl) {
    const refreshText = lastDataRefreshAt
      ? new Date(lastDataRefreshAt).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })
      : "Henüz yüklenmedi";
    snapshotEl.innerHTML = `
      <div class="dashboard-snapshot-head">
        <div><strong>Canlı Operasyon Özeti</strong><span>Yalnızca SDP'den yüklenen mevcut Space kayıtları</span></div>
        <span class="dashboard-refresh-time">Son Güncelleme: ${refreshText}</span>
      </div>
      <div class="dashboard-metric-grid">
        <div class="dashboard-metric"><span>Açık İş</span><strong>${openTickets.length}</strong><small>yalnızca Open durumundaki işler</small></div>
        <div class="dashboard-metric"><span>İşlemde</span><strong>${processingTickets.length}</strong><small>Open / Resolved / Closed dışındaki durumlar</small></div>
        <div class="dashboard-metric success"><span>Kapalı İş</span><strong>${closedTickets.length}</strong><small>Resolved + Closed</small></div>
        <div class="dashboard-metric ${unassignedTickets.length ? "warn" : ""}"><span>Atanmamış</span><strong>${unassignedTickets.length}</strong><small>tamamlanmamış ve teknisyensiz</small></div>
      </div>`;
  }

  const statusEl = document.getElementById("statusSummary");
  if (statusEl) {
    const tabs = `<div class="dashboard-segmented">
      <button class="dashboard-segment ${dashboardStatusScope === "issues" ? "active" : ""}" data-dashboard-status-scope="issues">İşler</button>
      <button class="dashboard-segment ${dashboardStatusScope === "epics" ? "active" : ""}" data-dashboard-status-scope="epics">Epic</button>
      <button class="dashboard-segment ${dashboardStatusScope === "sprints" ? "active" : ""}" data-dashboard-status-scope="sprints">Sprint</button>
    </div>`;
    let items = [];
    let note = "";
    if (dashboardStatusScope === "issues") {
      items = boardColumns.map(c => ({ label:c.title, value:scoped.filter(t => String(t.status) === String(c.id)).length, color:c.color }));
      note = "Story + Task + Bug";
    } else if (dashboardStatusScope === "epics") {
      const visibleEpics = epics.filter(e => !currentSpace || String(e.spaceId) === String(currentSpace.id)).filter(e => isManager || scoped.some(t => String(t.epicId) === String(e.id)) || (currentUser && String(e.assigneeId) === String(currentUser.id)));
      items = ["Open","Assigned","In Progress","Onhold","Resolved","Closed"].map(s => ({ label:s, value:visibleEpics.filter(e => (e.status || "Open") === s).length, color:spaceStatusColor(s) }));
      note = "Epic kayıtları";
    } else {
      const visibleSprints = sprints.filter(s => !currentSpace || String(s.spaceId) === String(currentSpace.id)).filter(s => isManager || scoped.some(t => String(t.sprintId) === String(s.id)));
      items = ["Future","Active","Closed"].map(s => ({ label:s, value:visibleSprints.filter(x => x.status === s).length, color:spaceStatusColor(s) }));
      note = "Sprint kayıtları";
    }
    const max = Math.max(...items.map(i=>i.value), 1);
    const expandedItem = items.find(i => `${dashboardStatusScope}:${i.label}` === dashboardExpandedStatusKey);
    let statusDetailHtml = "";
    if (expandedItem) {
      if (dashboardStatusScope === "issues") statusDetailHtml = dashboardIssueDetailRows(scoped.filter(t => t.statusName === expandedItem.label || String(t.status) === String(boardColumns.find(c => c.title === expandedItem.label)?.id)));
      else if (dashboardStatusScope === "epics") {
        const visibleEpics = epics.filter(e => !currentSpace || String(e.spaceId) === String(currentSpace.id)).filter(e => isManager || scoped.some(t => String(t.epicId) === String(e.id)) || (currentUser && String(e.assigneeId) === String(currentUser.id)));
        statusDetailHtml = dashboardEpicDetailRows(visibleEpics.filter(e => (e.status || "Open") === expandedItem.label));
      } else {
        const visibleSprints = sprints.filter(s => !currentSpace || String(s.spaceId) === String(currentSpace.id)).filter(s => isManager || scoped.some(t => String(t.sprintId) === String(s.id)));
        statusDetailHtml = dashboardSprintDetailRows(visibleSprints.filter(s => s.status === expandedItem.label));
      }
    }
    statusEl.innerHTML = `${tabs}<div class="dashboard-status-note">${note} · Duruma tıklayarak kayıtları hemen altında açabilirsin.</div><div class="dashboard-status-grid">${items.map(i => { const key=`${dashboardStatusScope}:${i.label}`; const expanded=dashboardExpandedStatusKey===key; const inlineDetail = expanded ? `<div class="dashboard-panel-detail dashboard-status-inline-detail">${statusDetailHtml}</div>` : ""; return `<div class="dashboard-status-block"><button type="button" class="dashboard-status-row ${expanded ? "expanded" : ""}" data-dashboard-status-key="${escapeHtml(key)}"><div class="dashboard-status-row-top"><span><i style="background:${i.color};"></i>${escapeHtml(i.label)}</span><strong>${i.value}</strong></div><div class="summary-bar-track"><div class="summary-bar-fill" style="width:${i.value/max*100}%; background:${i.color};"></div></div><span class="dashboard-status-chevron ${expanded ? "open" : ""}">▾</span></button>${inlineDetail}</div>`; }).join("")}</div>`;
    statusEl.querySelectorAll("[data-dashboard-status-scope]").forEach(btn => btn.addEventListener("click", () => { dashboardStatusScope = btn.dataset.dashboardStatusScope; dashboardExpandedStatusKey = null; renderDashboard(); }));
    statusEl.querySelectorAll("[data-dashboard-status-key]").forEach(btn => btn.addEventListener("click", () => { const key=btn.dataset.dashboardStatusKey; dashboardExpandedStatusKey = dashboardExpandedStatusKey === key ? null : key; renderDashboard(); }));
    bindDashboardTicketRows(statusEl);
    statusEl.querySelectorAll("[data-dashboard-epic-id]").forEach(btn => btn.addEventListener("click", () => openEpicDetail(btn.dataset.dashboardEpicId)));
    statusEl.querySelectorAll("[data-dashboard-sprint-id]").forEach(btn => btn.addEventListener("click", () => openSprintDetail(btn.dataset.dashboardSprintId)));
  }

  const dashboardGrid = document.querySelector(".dashboard-grid-focused");
  if (dashboardGrid) dashboardGrid.classList.toggle("dashboard-technician-layout", !isManager);

  const assigneePanel = document.getElementById("assigneeSummary")?.closest(".panel");
  if (!isManager) {
    if (assigneePanel) assigneePanel.style.display = "none";
  } else {
    if (assigneePanel) assigneePanel.style.display = "";
    const assigneeEl = document.getElementById("assigneeSummary");
    if (assigneeEl) {
      const techRows = [...assignees].sort((a,b)=>a.name.localeCompare(b.name,"tr")).map(a => {
        const owned = activeTickets.filter(t => String(t.assigneeId) === String(a.id));
        return { id:String(a.id), name:a.name, tickets:owned };
      });
      const unassigned = activeTickets.filter(t => !t.assigneeId || !t.assigneeName || t.assigneeName === "Atanmamış");
      const allRows = [...techRows, { id:"__unassigned__", name:"Atanmamış", tickets:unassigned }];
      const max = Math.max(...allRows.map(r=>r.tickets.length), 1);
      assigneeEl.innerHTML = `<div class="dashboard-workload-list">${allRows.map(r => {
        const expanded = dashboardExpandedTechnician === r.id;
        return `<div class="dashboard-workload-item ${expanded ? "expanded" : ""}">
          <button type="button" class="dashboard-workload-main" data-dashboard-tech="${escapeHtml(r.id)}">
            <span class="dashboard-workload-avatar">${escapeHtml((r.name || "?").trim().charAt(0).toUpperCase() || "?")}</span>
            <span class="dashboard-workload-name">${escapeHtml(r.name)}</span>
            <span class="dashboard-workload-bar"><i style="width:${r.tickets.length/max*100}%;"></i></span>
            <strong>${r.tickets.length}</strong><span class="report-expand-chevron ${expanded ? "open" : ""}">▾</span>
          </button>
          ${expanded ? dashboardIssueDetailRows(r.tickets, { showTechnician:false }) : ""}
        </div>`;
      }).join("")}</div>`;
      assigneeEl.querySelectorAll("[data-dashboard-tech]").forEach(btn => btn.addEventListener("click", () => {
        const id = btn.dataset.dashboardTech;
        dashboardExpandedTechnician = dashboardExpandedTechnician === id ? null : id;
        renderDashboard();
      }));
      bindDashboardTicketRows(assigneeEl);
    }
  }

  const typeDistEl = document.getElementById("typeDistribution");
  if (typeDistEl) {
    const max = Math.max(...WORK_ITEM_TYPES.map(type => scoped.filter(t => t.workItemType === type).length), 1);
    const expandedTypeRows = dashboardExpandedWorkItemType ? scoped.filter(t => t.workItemType === dashboardExpandedWorkItemType) : [];
    typeDistEl.innerHTML = `<div class="dashboard-type-grid">${WORK_ITEM_TYPES.map(type => {
      const rows = scoped.filter(t => t.workItemType === type);
      const expanded = dashboardExpandedWorkItemType === type;
      return `<div class="dashboard-type-card ${expanded ? "expanded" : ""}">
        <button type="button" class="dashboard-type-main" data-dashboard-type="${type}">
          <span class="dashboard-type-icon" style="color:${workItemTypeColor(type)};">${workItemTypeIcon(type)}</span>
          <span><strong>${type}</strong><small>${rows.length} iş</small></span>
          <span class="dashboard-type-bar"><i style="width:${rows.length/max*100}%; background:${workItemTypeColor(type)};"></i></span>
          <span class="report-expand-chevron ${expanded ? "open" : ""}">▾</span>
        </button>
      </div>`;
    }).join("")}</div>${dashboardExpandedWorkItemType ? `<div class="dashboard-panel-detail dashboard-type-detail"><div class="dashboard-detail-heading">${escapeHtml(dashboardExpandedWorkItemType)} İşleri</div>${dashboardIssueDetailRows(expandedTypeRows)}</div>` : ""}`;
    typeDistEl.querySelectorAll("[data-dashboard-type]").forEach(btn => btn.addEventListener("click", () => {
      const type = btn.dataset.dashboardType;
      dashboardExpandedWorkItemType = dashboardExpandedWorkItemType === type ? null : type;
      renderDashboard();
    }));
    bindDashboardTicketRows(typeDistEl);
  }
}
