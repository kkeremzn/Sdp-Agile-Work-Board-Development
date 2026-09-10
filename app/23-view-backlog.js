/* Backlog, sprint sections and DateTime helpers */
/* Backlog, date helpers and hierarchical List view */
let collapsedSections = new Set(); 
let openedSections = new Set(); // Varsayılan olarak KAPALI başlayan bölümler için (örn. Kapanmış Sprint'ler) — tersine mantık

function buildBacklogTicketRow(t) {
  const typeIcon = workItemTypeIcon(t.workItemType);
  const parentEpic = t.epicId ? epics.find(e => String(e.id) === String(t.epicId)) : null;
  const parentTagHtml = parentEpic ? `<span class="epic-tag">${epicIconSvg()} ${escapeHtml(parentEpic.name)}</span>` : "";

  return `
    <div class="backlog-row" draggable="${isManager}" data-ticket-id="${t.id}">
      <span class="tree-type-badge" style="color:${workItemTypeColor(t.workItemType)};">${typeIcon} ${t.workItemType}</span>
      ${issueKey(t)}
      <span class="backlog-row-title" data-open-ticket="${t.id}">${escapeHtml(t.title)}</span>
      ${parentTagHtml}
      <span class="priority-badge" style="background:${t.priorityColor}1a; color:${t.priorityColor};">${escapeHtml(t.priority)}</span>
      <span class="sprint-status-badge" style="background:${t.statusColor}22; color:${t.statusColor};">${escapeHtml(t.statusName)}</span>
      <span class="backlog-row-assignee">${escapeHtml(t.assigneeName || "Atanmamış")}</span>
    </div>
  `;
}

function buildSprintSection(sprint) {
  const sprintTickets = getFilteredTickets().filter(t => String(t.sprintId) === String(sprint.id));
  const key = `sprint-${sprint.id}`;
  const isOpen = !collapsedSections.has(key);

  return `
    <div class="backlog-section backlog-section-sprint">
      <div class="backlog-section-header">
        <button class="tree-toggle" data-section-toggle="${key}">${treeToggleIcon(isOpen)}</button>
        <span class="backlog-category-label sprint-category">${sprintIconSvg()} SPRINT</span>
        ${issueKey(sprint)}
        <strong class="backlog-section-title" data-open-sprint="${sprint.id}">${escapeHtml(sprint.name)}</strong>
        <span class="backlog-section-dates">${formatDate(sprint.startDate)} – ${formatDate(sprint.endDate)}</span>
        <span class="backlog-section-count">(${sprintTickets.length} iş)</span>
        ${isManager ? (sprint.status === "Future"
          ? `<button class="secondary-btn" data-start-sprint="${sprint.id}">Sprint'i Başlat</button>`
          : `<button class="secondary-btn" data-complete-sprint="${sprint.id}">Sprint'i Tamamla</button>`) : ""}
      </div>
      ${isOpen ? `
        <div class="backlog-drop-zone" data-drop-sprint="${sprint.id}">
          ${sprintTickets.length > 0 ? sprintTickets.map(buildBacklogTicketRow).join("") : '<div class="tree-empty">Bu sprintte henüz iş yok — Backlog\'dan buraya sürükleyebilirsin.</div>'}
        </div>
      ` : ""}
    </div>
  `;
}

function buildBacklogSection() {
  const unsprinted = getFilteredTickets().filter(t => !t.sprintId && !isTicketClosed(t));
  const key = "backlog-main";
  const isOpen = !collapsedSections.has(key);

  return `
    <div class="backlog-section backlog-section-plain">
      <div class="backlog-section-header">
        <button class="tree-toggle" data-section-toggle="${key}">${treeToggleIcon(isOpen)}</button>
        <span class="backlog-category-label backlog-category">BACKLOG</span>
        <strong class="backlog-section-title">Sprint'e Alınmamış İşler</strong>
        <span class="backlog-section-count">(${unsprinted.length} iş)</span>
        ${isManager ? `<button class="secondary-btn" id="createSprintFromBacklogBtn">+ Sprint Oluştur</button>` : ""}
      </div>
      ${isOpen ? `
        <div class="backlog-drop-zone" data-drop-sprint="">
          ${unsprinted.length > 0 ? unsprinted.map(buildBacklogTicketRow).join("") : '<div class="tree-empty">Backlog boş.</div>'}
        </div>
      ` : ""}
    </div>
  `;
}

function buildClosedSprintsSection() {
  const closedSprints = sprints.filter(isSprintClosed).filter(s => !currentSpace || String(s.spaceId) === String(currentSpace.id));
  if (closedSprints.length === 0) return "";

  const key = "closed-sprints";
  // Diğer bölümlerin aksine bu, varsayılan olarak KAPALI başlar (kullanıcı bilinçli olarak açmadıkça) —
  // Jira'nın "kapanmış sprint'ler arşivde durur, dikkat çekmez ama her zaman erişilebilir" mantığıyla tutarlı.
  const isOpen = openedSections.has(key);

  return `
    <div class="backlog-section backlog-section-plain" style="opacity:0.85;">
      <div class="backlog-section-header">
        <button class="tree-toggle" data-section-toggle-closed="${key}">${treeToggleIcon(isOpen)}</button>
        <span class="backlog-category-label" style="background:var(--muted-soft); color:white;">KAPANMIŞ</span>
        <strong class="backlog-section-title">Kapanmış Sprint'ler</strong>
        <span class="backlog-section-count">(${closedSprints.length} sprint — silinmedi, sadece arşivlendi)</span>
      </div>
      ${isOpen ? `
        <div style="padding:8px 18px;">
          ${closedSprints.map(s => `
            <div class="chat-entity-row" data-open-sprint="${s.id}" style="cursor:pointer; padding:8px 4px;">
              ${issueKey(s)}
              <span style="flex:1;">${escapeHtml(s.name)}</span>
              <span class="muted" style="font-size:12px;">${formatDate(s.startDate)} – ${formatDate(s.endDate)}</span>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </div>
  `;
}

function renderBacklog() {
  const container = document.getElementById("backlogContainer");
  if (!container) return;

  const activeSprints = sprints.filter(isSprintActive);
  container.innerHTML = activeSprints.map(buildSprintSection).join("") + buildBacklogSection() + buildClosedSprintsSection();

  bindBacklogEvents();
}

function bindBacklogEvents() {
  document.querySelectorAll("[data-section-toggle]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sectionToggle;
      if (collapsedSections.has(key)) collapsedSections.delete(key);
      else collapsedSections.add(key);
      renderBacklog();
    });
  });

  document.querySelectorAll("[data-section-toggle-closed]").forEach(btn => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sectionToggleClosed;
      if (openedSections.has(key)) openedSections.delete(key);
      else openedSections.add(key);
      renderBacklog();
    });
  });

  document.querySelectorAll("[data-open-ticket]").forEach(el => {
    el.addEventListener("click", () => openDrawer(el.dataset.openTicket));
  });

  document.querySelectorAll("[data-open-sprint]").forEach(el => {
    el.addEventListener("click", () => openSprintDetail(el.dataset.openSprint));
  });

  document.querySelectorAll("[data-complete-sprint]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await promptAndCloseSprint(btn.dataset.completeSprint);
    });
  });

  document.querySelectorAll("[data-start-sprint]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const sprintId = btn.dataset.startSprint;
      const sprint = sprints.find(s => String(s.id) === String(sprintId));
      if (!sprint) return;
      const ok = await promptConfirm(`"${sprint.name}" başlatılsın mı? Başlatınca Board'da görünmeye başlayacak.`);
      if (!ok) return;

      const oldStatus = sprint.status;
      sprint.status = "Active";
      renderAll();
      try {
        const actualStartDate = Date.now();
        await startSprintOnServer(sprintId, actualStartDate);
        sprint.actualStartDate = actualStartDate;
        sprint.actualEndDate = null;
        sprint.closureSummary = "";
        showToast("Sprint başlatıldı. Gerçek başlangıç zamanı kaydedildi.", "success");
      } catch (err) {
        sprint.status = oldStatus;
        renderAll();
        showToast(`Sprint başlatılamadı: ${err.message}`, "error");
      }
    });
  });

  const createSprintBtn = document.getElementById("createSprintFromBacklogBtn");
  if (createSprintBtn) {
    createSprintBtn.addEventListener("click", () => {
      prepareNewSprintDateInputs();
      document.getElementById("newSprintModal")?.classList.add("open");
    });
  }


  const rows = document.querySelectorAll(".backlog-row");
  const zones = document.querySelectorAll(".backlog-drop-zone");

  rows.forEach(row => {
    row.addEventListener("dragstart", (e) => {
      isDragging = true;
      e.dataTransfer.setData("ticketId", row.dataset.ticketId);
      setTimeout(() => row.classList.add("dragging"), 0);
    });
    row.addEventListener("dragend", () => {
      isDragging = false;
      row.classList.remove("dragging");
      zones.forEach(z => z.classList.remove("drag-over"));
    });
  });

  zones.forEach(zone => {
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("drag-over");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("drag-over"));
    zone.addEventListener("drop", async (e) => {
      e.preventDefault();
      zone.classList.remove("drag-over");

      const ticketId = e.dataTransfer.getData("ticketId");
      const ticket = tickets.find(t => String(t.id) === String(ticketId));
      if (!ticket) return;

      const targetSprintId = zone.dataset.dropSprint || null;
      if (String(ticket.sprintId || "") === String(targetSprintId || "")) return;

      const oldSprintId = ticket.sprintId;
      ticket.sprintId = targetSprintId;
      renderAll();

      if (usingRealData) {
        try {
          await updateSprintOnTicketServer(ticket.id, targetSprintId);
          showToast(targetSprintId ? "İş sprint'e taşındı." : "İş Backlog'a taşındı.", "success");
        } catch (err) {
          ticket.sprintId = oldSprintId;
          renderAll();
          showToast(err.message, "error");
        }
      }
    });
  });
}

function formatDate(ms) {
  if (!ms) return "-";
  return new Date(ms).toLocaleDateString("tr-TR");
}

function formatDateTime(ms) {
  if (!ms) return "-";
  return new Date(ms).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" });
}

function toDateTimeLocalValue(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function startOfTodayMs() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function todayMinDateTimeLocalValue() {
  return toDateTimeLocalValue(startOfTodayMs());
}

function prepareNewSprintDateInputs() {
  const startEl = document.getElementById("newSprintStart");
  const endEl = document.getElementById("newSprintEnd");
  if (!startEl) return;
  const now = Date.now();
  startEl.min = todayMinDateTimeLocalValue();
  startEl.value = toDateTimeLocalValue(now);
  if (endEl) {
    endEl.min = startEl.value;
    endEl.value = "";
  }
  document.querySelectorAll("#sprintDurationChips [data-duration]").forEach(c => c.classList.remove("active"));
}


