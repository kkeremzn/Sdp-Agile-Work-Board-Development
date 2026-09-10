/* Hierarchical Epic > Work Item > Subtask list view */
let expandedNodes = new Set(); 
let ticketTasksCache = {}; 


function renderListView() {
  const container = document.getElementById("listViewContainer");
  if (!container) return;

  const createBtnHtml = isManager
    ? `<div style="display:flex; gap:10px; margin-bottom:20px;">
         <button id="newEpicBtn" class="secondary-btn sprint-new-btn" style="margin-bottom:0;">+ Yeni Epic</button>
         <button id="newIssueBtn" class="secondary-btn sprint-new-btn" style="margin-bottom:0;">+ Yeni İş</button>
       </div>`
    : "";

  const scoped = getFilteredTickets();
  const standaloneTickets = scoped.filter(t => !t.epicId);
  // Epic içindeki işler için: teknisyen sadece kendi işini değil, o epic'teki TÜM ekibi görmeli —
  // aksi halde "epic'i görüyorum ama içindeki işleri göremiyorum" saçmalığı oluşuyor.
  // Görünürlük kararı ayrı: teknisyen sadece KENDİ işi olan epic'leri görür, ama görünce hepsini görür.
  const allFilteredTickets = getFilteredTickets(tickets);

  const rows = [];

  epics.forEach(epic => {
    const isClosed = epic.status === "Closed" || epic.status === "Resolved";
    const epicTickets = allFilteredTickets.filter(t => String(t.epicId) === String(epic.id));
    const filtersActive = isAnyFilterActive();

    if (!isManager) {
      const hasOwnTicket = epicTickets.some(t => currentUser && String(t.assigneeId) === String(currentUser.id));
      const isEpicOwner = currentUser && String(epic.assigneeId) === String(currentUser.id);
      if (!hasOwnTicket && !isEpicOwner) return; // Ne kendi işi var ne Epic'in doğrudan sorumlusu — gösterme
    } else if (filtersActive && epicTickets.length === 0) {
      return; // Aktif filtreye uyan iş yoksa epic'i hiç gösterme — "boş" diye yanıltıcı mesaj göstermek yerine
    }

    const isOpen = expandedNodes.has(`epic-${epic.id}`);

    rows.push(`
      <div class="tree-row tree-row-epic ${isClosed ? "tree-row-closed" : ""}" data-node-type="epic" data-node-id="${epic.id}">
        <button class="tree-toggle" data-toggle="epic-${epic.id}">${treeToggleIcon(isOpen)}</button>
        <span class="tree-type-badge tree-type-epic">${epicIconSvg()} Epic</span>
        ${issueKey(epic)}
        <span class="tree-row-title" data-open-detail="epic-${epic.id}">${escapeHtml(epic.name)}</span>
        <span class="sprint-status-badge" style="background:${spaceStatusColor(epic.status)}22; color:${spaceStatusColor(epic.status)};">${epic.status}</span>
        <span class="tree-row-count">${epicTickets.length} iş</span>
        <span class="tree-row-assignee">${escapeHtml(epic.assigneeName || "Atanmamış")}</span>
        ${isManager ? `<button class="tree-add-btn" data-add-to-epic="${epic.id}" data-tip="Bu epic'e iş ekle">+</button>` : ""}
      </div>
    `);

    if (isOpen) {
      if (epicTickets.length === 0) {
        // Bu noktaya sadece filtre aktif değilken ve epic gerçekten boşken gelinir
        rows.push(`<div class="tree-row tree-empty" style="padding-left:52px;">Bu epic'e henüz iş bağlanmamış.</div>`);
      }
      epicTickets.forEach(t => rows.push(buildTicketTreeRow(t, 1)));
    }
  });

  if (standaloneTickets.length > 0) {
    rows.push(`<div class="tree-section-label">Bağımsız İşler</div>`);
    standaloneTickets.forEach(t => rows.push(buildTicketTreeRow(t, 0)));
  }

  if (epics.length === 0 && standaloneTickets.length === 0) {
    container.innerHTML = createBtnHtml + '<div class="empty-state"><h3>Henüz İş Yok</h3><p>İlk epic\'i oluşturarak başla.</p></div>';
  } else {
    container.innerHTML = createBtnHtml + `<div class="tree-list">${rows.join("")}</div>`;
  }

  bindListViewEvents();
}

function buildTicketTreeRow(t, depth) {
  const isMine = currentUser && String(t.assigneeId) === String(currentUser.id);
  const dim = (!isManager && !isMine) ? "tree-row-dim" : "";
  const mine = (!isManager && isMine) ? "tree-row-mine" : "";
  const typeIcon = workItemTypeIcon(t.workItemType);
  const typeColor = workItemTypeColor(t.workItemType);
  const isOpen = expandedNodes.has(`ticket-${t.id}`);
  const indent = 24 + depth * 28;

  const cachedTasks = ticketTasksCache[t.id];
  let childrenHtml = "";
  if (isOpen) {
    if (!cachedTasks) {
      childrenHtml = `<div class="tree-row tree-empty" style="padding-left:${indent + 28}px;">Yükleniyor...</div>`;
    } else if (cachedTasks.length === 0) {
      childrenHtml = `<div class="tree-row tree-empty" style="padding-left:${indent + 28}px;">Alt görev yok.</div>`;
    } else {
      childrenHtml = cachedTasks.map(task => `
        <div class="tree-row tree-row-subtask" style="padding-left:${indent + 28}px;" data-open-subtask="${task.id}" data-parent-ticket="${t.id}">
          <span class="tree-type-badge tree-type-subtask">${subtaskIconSvg()} Alt Görev</span>
          <span class="backlog-row-key">${issueKeyText(t)}-${task.id}</span>
          <span class="tree-row-title">${escapeHtml(task.title)}</span>
          <span class="sprint-status-badge" style="background:${spaceStatusColor(task.statusName)}22; color:${spaceStatusColor(task.statusName)};">${escapeHtml(task.statusName)}</span>
        </div>
      `).join("");
    }
  }

  const sprintObj = t.sprintId ? sprints.find(s => String(s.id) === String(t.sprintId)) : null;
  const sprintTagHtml = sprintObj ? `<span class="sprint-tag">${sprintIconSvg()} ${escapeHtml(sprintObj.name)}</span>` : "";
  const subtaskCountHtml = t.taskSummary
    ? `<span class="tree-row-count" data-tip="Alt görevler">${subtaskIconSvg()} ${t.taskSummary.done}/${t.taskSummary.total}</span>`
    : "";

  return `
    <div class="tree-row ${dim} ${mine}" style="padding-left:${indent}px;" data-node-type="ticket" data-node-id="${t.id}">
      <button class="tree-toggle" data-toggle="ticket-${t.id}">${treeToggleIcon(isOpen)}</button>
      <span class="tree-type-badge" style="color:${typeColor};" data-tip="${t.workItemType}">${typeIcon} ${t.workItemType}</span>
      ${issueKey(t)}
      <span class="tree-row-title" data-open-ticket="${t.id}">${escapeHtml(t.title)}</span>
      ${sprintTagHtml}
      ${subtaskCountHtml}
      <span class="priority-badge" style="background:${t.priorityColor}1a; color:${t.priorityColor};">${escapeHtml(t.priority)}</span>
      <span class="sprint-status-badge" style="color:${t.statusColor}; background:${t.statusColor}22;">${escapeHtml(t.statusName)}</span>
      <span class="tree-row-assignee">${escapeHtml(t.assigneeName || "Atanmamış")}</span>
    </div>
    ${childrenHtml}
  `;
}

function bindListViewEvents() {
  document.querySelectorAll(".tree-toggle").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const key = btn.dataset.toggle;
      if (expandedNodes.has(key)) {
        expandedNodes.delete(key);
        renderListView();
      } else {
        expandedNodes.add(key);
        if (key.startsWith("ticket-")) {
          const ticketId = key.replace("ticket-", "");
          if (!ticketTasksCache[ticketId] && usingRealData) {
            renderListView(); 
            try {
              ticketTasksCache[ticketId] = await fetchTicketTasks(ticketId);
            } catch (err) {
              ticketTasksCache[ticketId] = [];
            }
          }
        }
        renderListView();
      }
    });
  });

  document.querySelectorAll("[data-open-detail]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      const epicId = el.dataset.openDetail.replace("epic-", "");
      openEpicDetail(epicId);
    });
  });

  document.querySelectorAll("[data-open-ticket]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openDrawer(el.dataset.openTicket);
    });
  });

  document.querySelectorAll("[data-open-subtask]").forEach(el => {
    el.addEventListener("click", (e) => {
      e.stopPropagation();
      openTaskDetail(el.dataset.parentTicket, el.dataset.openSubtask);
    });
  });

  document.querySelectorAll("[data-add-to-epic]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openNewIssueModal(btn.dataset.addToEpic); 
    });
  });

  // Aynı sebepten (List görünümünde her render'da yeniden oluşturuluyor) event delegation kullanıyoruz.
  const listViewContainerForIssueBtn = document.getElementById("listViewContainer");
  if (listViewContainerForIssueBtn) {
    listViewContainerForIssueBtn.addEventListener("click", (e) => {
      if (e.target.closest("#newIssueBtn")) openNewIssueModal(null);
    });
  }

}

