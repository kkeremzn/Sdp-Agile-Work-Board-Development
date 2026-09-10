/* Kanban/Sprint Board rendering and drag-drop behavior */
/* Kanban/Sprint Board, ticket drawer and native task detail UI */
async function updateSprintStatusOnServer(sprintId, statusName) {
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPRINTS}/${sprintId}`, "PUT", { [CONFIG.MODULE_SPRINTS_SINGULAR]: { [CONFIG.SPRINT_STATUS_FIELD_KEY]: { name: statusName } } });
}

function buildSprintBoardMiniCard(s) {
  const sprintTickets = tickets.filter(t => String(t.sprintId) === String(s.id) && (!currentSpace || String(t.spaceId) === String(currentSpace.id)));
  const done = sprintTickets.filter(t => isTicketClosed(t)).length;
  const total = sprintTickets.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const typeCounts = { Story: 0, Task: 0, Bug: 0 };
  sprintTickets.forEach(t => { if (typeCounts[t.workItemType] !== undefined) typeCounts[t.workItemType]++; });
  const uniqueAssignees = new Set(sprintTickets.filter(t => t.assigneeId).map(t => t.assigneeId)).size;
  const daysLeft = s.endDate ? Math.ceil((s.endDate - Date.now()) / (1000 * 60 * 60 * 24)) : null;
  const dateLabel = daysLeft === null ? "" :
    daysLeft < 0 ? `<span style="color:var(--danger); font-weight:600;">${Math.abs(daysLeft)}g gecikti</span>`
                 : `<span>${daysLeft}g kaldı</span>`;

  return `
    <div class="sprint-board-card" draggable="${isManager}" data-sprint-id="${s.id}" data-sprint-status="${s.status}">
      <div class="sprint-board-card-header">
        <div>${issueKey(s)} <span style="color:var(--primary); display:inline-flex; vertical-align:middle;">${sprintIconSvg()}</span> <strong>${escapeHtml(s.name)}</strong></div>
        ${dateLabel}
      </div>
      <p class="sprint-board-card-goal">${escapeHtml(s.goal || "Hedef girilmemiş.")}</p>
      <div class="sprint-progress-bar-wrap"><div class="sprint-progress-bar" style="width:${pct}%;"></div></div>
      <div class="sprint-board-card-footer">
        <span>${done}/${total} iş tamamlandı (%${pct})</span>
        <div class="sprint-board-card-badges">
          ${typeCounts.Story > 0 ? `<span data-tip="Story sayısı" style="display:inline-flex; align-items:center; gap:3px;">${workItemTypeIcon("Story")}${typeCounts.Story}</span>` : ""}
          ${typeCounts.Task > 0 ? `<span data-tip="Task sayısı" style="display:inline-flex; align-items:center; gap:3px;">${workItemTypeIcon("Task")}${typeCounts.Task}</span>` : ""}
          ${typeCounts.Bug > 0 ? `<span data-tip="Bug sayısı" style="display:inline-flex; align-items:center; gap:3px;">${workItemTypeIcon("Bug")}${typeCounts.Bug}</span>` : ""}
          <span data-tip="Görev alan kişi sayısı">${personIconSvg()} ${uniqueAssignees}</span>
        </div>
      </div>
    </div>
  `;
}

function bindSprintBoardDragAndDrop() {
  const cards = document.querySelectorAll(".sprint-board-card");
  const columns = document.querySelectorAll(".column-body[data-sprint-status-name]");

  cards.forEach(card => {
    card.addEventListener("click", () => {
      if (!card.classList.contains("dragging")) openSprintDetail(card.dataset.sprintId);
    });
    if (!isManager) return;
    card.addEventListener("dragstart", (e) => {
      isDragging = true;
      e.dataTransfer.setData("sprintId", card.dataset.sprintId);
      e.dataTransfer.setData("sprintStatus", card.dataset.sprintStatus);
      setTimeout(() => card.classList.add("dragging"), 0);
    });
    card.addEventListener("dragend", () => {
      isDragging = false;
      card.classList.remove("dragging");
      columns.forEach(c => c.classList.remove("drag-over"));
    });
  });

  if (!isManager) return;

  columns.forEach(column => {
    column.addEventListener("dragover", (e) => { e.preventDefault(); column.classList.add("drag-over"); });
    column.addEventListener("dragleave", () => column.classList.remove("drag-over"));
    column.addEventListener("drop", async (e) => {
      e.preventDefault();
      column.classList.remove("drag-over");

      const sprintId = e.dataTransfer.getData("sprintId");
      const oldStatus = e.dataTransfer.getData("sprintStatus");
      const targetStatusName = column.dataset.sprintStatusName;
      const sprint = sprints.find(s => String(s.id) === String(sprintId));
      if (!sprint || !targetStatusName || oldStatus === targetStatusName) return;

      if (targetStatusName === "Closed") {
        // Mevcut, test edilmiş kapanış seremonisi: bitmemiş iş uyarısı + zorunlu Resolution
        await promptAndCloseSprint(sprintId);
        return;
      }

      const oldStatusValue = sprint.status;
      sprint.status = targetStatusName;
      renderAll();
      try {
        await updateSprintStatusOnServer(sprintId, targetStatusName);
        showToast(`Sprint durumu güncellendi: ${targetStatusName}`, "success");
      } catch (err) {
        sprint.status = oldStatusValue;
        renderAll();
        showToast(err.message, "error");
      }
    });
  });
}

function renderBoard() {
  const board = document.getElementById("kanbanBoard");

  if(boardColumns.length === 0) {
    board.innerHTML = '<div class="empty-state"><h3>Sütun Bulunamadı</h3><p>Gösterilecek bir veri yok.</p></div>';
    return;
  }

  if (boardShowingSprints) {
    // "Future" = oluşturulmuş ama henüz başlatılmamış sprint — Board'da hiç görünmesin,
    // sadece Backlog'dan "Sprint'i Başlat" ile bilinçli olarak başlatılınca buraya düşsün.
    let spaceSprints = sprints.filter(s => (!currentSpace || String(s.spaceId) === String(currentSpace.id)) && s.status !== "Future");
    if (!isManager) {
      // Teknisyen, sadece kendi işi olan sprint'leri görsün — Epic'te uyguladığımız aynı mantık.
      spaceSprints = spaceSprints.filter(s => tickets.some(t => String(t.sprintId) === String(s.id) && currentUser && String(t.assigneeId) === String(currentUser.id)));
    }
    // Sprint artık kendi 3 durumlu (Future/Active/Closed) sözlüğünü kullanıyor — ticket'ların
    // 6'lı statü kolonlarını (Open/Assigned/...) yeniden kullanmak yanlıştı, "Active" hiçbirine uymuyordu.
    const sprintColumns = [
      { title: "Active", color: "#00b8a3" },
      { title: "Closed", color: "#64748b" }
    ];
    board.innerHTML = sprintColumns.map(col => {
      const items = spaceSprints.filter(s => s.status === col.title);
      return `
        <div class="kanban-column" style="border-top: 4px solid ${col.color};">
          <div class="column-header">
            <span class="column-title">${col.title}</span>
            <span class="column-count">${items.length}</span>
          </div>
          <div class="column-body" data-sprint-status-name="${col.title}">
            ${items.map(buildSprintBoardMiniCard).join("")}
          </div>
        </div>
      `;
    }).join("");
    bindSprintBoardDragAndDrop();
    return;
  }

  const filtered = getFilteredTickets();
  board.innerHTML = boardColumns.map(col => {
    const items = filtered.filter(t => String(t.status) === String(col.id));
    return `
      <div class="kanban-column" style="border-top: 4px solid ${col.color || 'var(--primary)'};">
        <div class="column-header">
          <span class="column-title">${col.title}</span>
          <span class="column-count">${items.length}</span>
        </div>
        <div class="column-body" data-status-id="${col.id}">
          ${items.map(renderTicketCard).join("")}
        </div>
      </div>
    `;
  }).join("");

  bindDragAndDrop();
  bindCardClicks();
}

function slaClass(slaStatus) {
  return "sla-" + slaStatus.toLowerCase().replace(/\s+/g, "-");
}

function workItemTypeIcon(type) {
  const icons = {
    Story: `<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#4FAE4D" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 2.5h7v11l-3.5-2.4L4.5 13.5z"/></svg>`,
    Task: `<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#3B82F6" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="2.5" width="11" height="11" rx="3"/><path d="M5.3 8.2l1.9 1.9L10.7 6"/></svg>`,
    Bug: `<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="#E0455F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="8" cy="9.3" rx="3.3" ry="3.8"/><path d="M8 5.5V4M5.7 6.5L4.2 5M10.3 6.5l1.5-1.5M4.6 9.3H2.4M13.6 9.3h-2.2M5 12.2l-1.4 1.6M11 12.2l1.4 1.6M5.5 6.8h5"/></svg>`
  };
  return icons[type] || icons.Task;
}

// Epic/Sprint/Kişi/Alt Görev için — Story/Task/Bug'ın zaten kullandığı renkli-rozet SVG stiliyle tutarlı,
// uygulamanın HER yerinde AYNI ikon kullanılsın diye tek kaynaktan üretiliyor.
function epicIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round"><path d="M8.8 1.8L3.8 8.8h3.4l-1 5.4L12.2 7H8.6z"/></svg>`;
}
function checkCircleIconSvg() {
  return `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:-2px;"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`;
}

function sprintIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 14V2"/><path d="M4 3h7l-2 3 2 3H4"/></svg>`;
}
function personIconSvg() {
  return `<svg width="13" height="13" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="5.3" r="2.4"/><path d="M3 13.2c.5-2.7 2.4-4 5-4s4.5 1.3 5 4"/></svg>`;
}
function subtaskIconSvg() {
  return `<svg width="12" height="12" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 3v6a2 2 0 0 0 2 2h6M9.5 8.5 12.5 11 9.5 13.5"/></svg>`;
}
function folderIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2 4.2a1 1 0 0 1 1-1h3.3l1.2 1.6H13a1 1 0 0 1 1 1v7.2a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"/></svg>`;
}
function settingsIconSvg() {
  return `<svg width="15" height="15" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><line x1="2" y1="4" x2="14" y2="4"/><circle cx="10" cy="4" r="1.6" fill="var(--card)"/><line x1="2" y1="8" x2="14" y2="8"/><circle cx="6" cy="8" r="1.6" fill="var(--card)"/><line x1="2" y1="12" x2="14" y2="12"/><circle cx="11" cy="12" r="1.6" fill="var(--card)"/></svg>`;
}
function listViewIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4.5h10M3 8h10M3 11.5h10"/></svg>`;
}

function workItemTypeColor(type) {
  const colors = { Story: "#65BA43", Task: "#4BADE8", Bug: "#E5493A" };
  return colors[type] || colors.Task;
}

function renderTicketCard(ticket) {
  const sprint = ticket.sprintId ? sprints.find(s => String(s.id) === String(ticket.sprintId)) : null;
  const sprintTagHtml = sprint ? `<span class="sprint-tag">${sprintIconSvg()} ${escapeHtml(sprint.name)}</span>` : "";
  const epic = ticket.epicId ? epics.find(e => String(e.id) === String(ticket.epicId)) : null;
  const epicTagHtml = epic ? `<span class="epic-tag">${epicIconSvg()} ${escapeHtml(epic.name)}</span>` : "";
  const assigneeLabel = ticket.assigneeName || "Atanmamış";
  const typeIconSvg = workItemTypeIcon(ticket.workItemType);

  const taskBadgeHtml = ticket.taskSummary
    ? `<span class="task-count-badge ${ticket.taskSummary.done === ticket.taskSummary.total ? "all-done" : ""}">${subtaskIconSvg()} ${ticket.taskSummary.done}/${ticket.taskSummary.total} Görev</span>`
    : "";

  const footerLeftHtml = isManager
    ? `<div class="assignee"><span class="avatar">${initials(assigneeLabel)}</span><span>${escapeHtml(assigneeLabel)}</span></div>`
    : `<div class="assignee"><span class="status-dot" style="background:${ticket.statusColor};"></span><span style="color:${ticket.statusColor};">${escapeHtml(ticket.statusName)}</span></div>`;

  return `
    <div class="ticket-card" draggable="true" data-id="${ticket.id}">
      <div class="ticket-top">
        ${issueKey(ticket)}
        <span class="priority-badge" style="background:${ticket.priorityColor}1a; color:${ticket.priorityColor};">${escapeHtml(ticket.priority)}</span>
        <span class="sla-badge ${slaClass(ticket.slaStatus)}">${ticket.slaStatus}</span>
      </div>
      <div class="ticket-title"><span class="work-item-icon" data-tip="${ticket.workItemType}">${typeIconSvg}</span><span>${escapeHtml(ticket.title)}</span></div>
      <div class="ticket-tags">
        ${epicTagHtml}
        ${sprintTagHtml}
        ${taskBadgeHtml}
      </div>
      <div class="ticket-footer">
        ${footerLeftHtml}
      </div>
    </div>
  `;
}

function bindDragAndDrop() {
  const cards = document.querySelectorAll(".ticket-card");
  const columns = document.querySelectorAll(".column-body");

  cards.forEach(card => {
    card.addEventListener("dragstart", e => {
      isDragging = true; 
      e.dataTransfer.setData("ticketId", card.dataset.id);
      setTimeout(() => card.classList.add("dragging"), 0);
    });
    
    card.addEventListener("dragend", () => {
      isDragging = false; 
      card.classList.remove("dragging");
      columns.forEach(c => c.classList.remove("drag-over"));
    });
  });

  columns.forEach(column => {
    column.addEventListener("dragover", e => {
      e.preventDefault();
      column.classList.add("drag-over");
    });

    column.addEventListener("dragleave", e => {
      column.classList.remove("drag-over");
    });

    column.addEventListener("drop", async e => {
      e.preventDefault();
      column.classList.remove("drag-over");
      
      const ticketId = e.dataTransfer.getData("ticketId");
      const newStatusId = column.dataset.statusId;
      const newStatusObj = STATUS_MAP[newStatusId];
      
      const ticket = tickets.find(t => String(t.id) === String(ticketId)); 
      if (!ticket || !newStatusObj || ticket.status === newStatusId) return;

      if (!(await verifyStillAuthorizedForTicket(ticket.id))) return;

      const previousStatus = ticket.status;
      const previousStatusName = ticket.statusName;

      let resolutionText = null;
      const wasAlreadyDone = isTicketClosed(ticket);
      const movingBetweenDoneStates = wasAlreadyDone && (newStatusObj.id === "4" || newStatusObj.id === "1");
      if ((newStatusObj.id === "4" || newStatusObj.id === "1") && !movingBetweenDoneStates) {
          try {
              resolutionText = await promptForResolution();
          } catch(cancelErr) {
              return; 
          }
      }

      // KRİTİK: yukarıdaki "await"lar sırasında arka plan yenilemesi (45 saniyede bir) devreye
      // girip `tickets` dizisini TAMAMEN YENİ nesnelerle değiştirmiş olabilir — bu durumda az önce
      // yakaladığımız `ticket` referansı artık hiçbir yere bağlı olmayan "yetim" bir nesne olur ve
      // ona yaptığımız değişiklik hiçbir yere yansımaz (iş sanki "kaybolmuş" gibi görünür). Bu
      // yüzden asıl değişikliği yapmadan hemen önce, referansı canlı diziden TAZELİYORUZ.
      const liveTicket = tickets.find(t => String(t.id) === String(ticketId)) || ticket;

      liveTicket.status = newStatusId;
      liveTicket.statusName = newStatusObj.name;
      liveTicket.lastUpdatedTimeMs = Date.now(); // Genel veri tazeliği için güncel tutuyoruz
      if (!["4", "1"].includes(newStatusId)) liveTicket.resolutionText = ""; // Yeniden açıldı — eski çözüm artık geçersiz
      if (resolutionText) liveTicket.resolutionText = resolutionText;
      renderAll();

      if (usingRealData) {
        try {
          await updateStatusOnServer(ticketId, newStatusId, resolutionText);
          showToast(`Kayıt başarıyla taşındı: ${newStatusObj.name}`, "success");
        } catch (err) {
          liveTicket.status = previousStatus;
          liveTicket.statusName = previousStatusName;
          renderAll();
          showToast(`${err.message}`, "error");
        }
      } else {
        liveTicket.status = previousStatus;
        liveTicket.statusName = previousStatusName;
        renderAll();
        showToast("SDP bağlantısı olmadan iş durumu değiştirilemez.", "warning");
      }
    });
  });
}

function bindCardClicks() {
  document.querySelectorAll(".ticket-card").forEach(card => {
    card.addEventListener("click", () => openDrawer(card.dataset.id));
  });
}

