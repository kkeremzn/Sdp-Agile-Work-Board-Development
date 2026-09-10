/* Theme, global event binding, tab switching and render orchestration */
/* Shared UI lifecycle, theme, filters and role-scoped ticket selection */
function loadTheme() {
  if (localStorage.getItem(THEME_KEY) === "dark") {
    document.body.classList.add("dark");
  }
}

function toggleDarkMode() {
  document.body.classList.toggle("dark");
  localStorage.setItem(THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
}


function bindEvents() {
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.addEventListener("click", () => switchTab(btn.dataset.tab));
  });

  ["searchInput", "epicFilter", "priorityFilter", "slaFilter"]
    .forEach(id => {
      const el = document.getElementById(id);
      if(el) el.addEventListener("input", renderAll);
    });

  document.querySelectorAll("[data-type-filter]").forEach(btn => {
    btn.addEventListener("click", () => {
      const type = btn.dataset.typeFilter;
      if (activeTypeFilters.has(type)) {
        activeTypeFilters.delete(type);
        btn.classList.remove("active");
      } else {
        activeTypeFilters.add(type);
        btn.classList.add("active");
      }
      renderAll();
    });
  });

  document.addEventListener("click", (e) => {
    const checkboxRow = e.target.closest("[data-assignee-filter]");
    if (checkboxRow) {
      const id = checkboxRow.dataset.assigneeFilter;
      if (activeAssigneeFilters.has(id)) {
        activeAssigneeFilters.delete(id);
      } else {
        activeAssigneeFilters.add(id);
      }
      renderAssigneeFilterList(document.getElementById("assigneeFilterSearch")?.value || "");
      updateAssigneeFilterCount();
      renderAll();
      return;
    }

    // Panelin dışına tıklanınca kapansın
    const panel = document.getElementById("assigneeFilterPanel");
    const toggleBtn = document.getElementById("assigneeFilterToggleBtn");
    if (panel && panel.classList.contains("open") && !panel.contains(e.target) && e.target !== toggleBtn) {
      panel.classList.remove("open");
    }
  });

  const assigneeToggleBtn = document.getElementById("assigneeFilterToggleBtn");
  if (assigneeToggleBtn) {
    assigneeToggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      document.getElementById("assigneeFilterPanel")?.classList.toggle("open");
    });
  }

  const assigneeSearchInput = document.getElementById("assigneeFilterSearch");
  if (assigneeSearchInput) {
    assigneeSearchInput.addEventListener("click", (e) => e.stopPropagation());
    assigneeSearchInput.addEventListener("input", (e) => renderAssigneeFilterList(e.target.value));
  }

  const clearAllBtn = document.getElementById("clearAllFiltersBtn");
  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => {
      document.getElementById("searchInput").value = "";
      document.getElementById("epicFilter").value = "";
      document.getElementById("priorityFilter").value = "";
      document.getElementById("slaFilter").value = "";
      activeTypeFilters.clear();
      activeAssigneeFilters.clear();
      document.querySelectorAll("[data-type-filter]").forEach(btn => btn.classList.remove("active"));
      renderAssigneeFilterList("");
      updateAssigneeFilterCount();
      showToast("Tüm filtreler temizlendi.", "success");
      renderAll();
    });
  }

  const boardIssuesBtn = document.getElementById("boardViewIssuesBtn");
  const boardSprintsBtn = document.getElementById("boardViewSprintsBtn");
  if (boardIssuesBtn && boardSprintsBtn) {
    boardIssuesBtn.addEventListener("click", () => {
      boardShowingSprints = false;
      boardIssuesBtn.classList.add("active");
      boardSprintsBtn.classList.remove("active");
      renderBoard();
    });
    boardSprintsBtn.addEventListener("click", () => {
      boardShowingSprints = true;
      boardSprintsBtn.classList.add("active");
      boardIssuesBtn.classList.remove("active");
      renderBoard();
    });
  }

  document.getElementById("darkModeBtn").addEventListener("click", toggleDarkMode);
  document.getElementById("closeDrawerBtn").addEventListener("click", closeDrawer);
  document.getElementById("drawerOverlay").addEventListener("click", closeDrawer);

  const drawerStatusEl = document.getElementById("drawerStatus");
  if (drawerStatusEl) {
    drawerStatusEl.addEventListener("change", (e) => {
      drawerDraft.status = e.target.value; 
    });
  }

  const drawerWorkItemTypeEl = document.getElementById("drawerWorkItemType");
  if (drawerWorkItemTypeEl) {
    drawerWorkItemTypeEl.addEventListener("change", (e) => {
      drawerDraft.workItemType = e.target.value;
    });
  }

  const drawerAssigneeEl = document.getElementById("drawerAssignee");
  if (drawerAssigneeEl) {
    drawerAssigneeEl.addEventListener("change", (e) => {
      drawerDraft.assigneeId = e.target.value || null;
    });
  }

  const drawerPriorityEl = document.getElementById("drawerPriority");
  if (drawerPriorityEl) {
    drawerPriorityEl.addEventListener("change", (e) => {
      drawerDraft.priority = e.target.value;
    });
  }

  const drawerSprintEl = document.getElementById("drawerSprint");
  if (drawerSprintEl) {
    drawerSprintEl.addEventListener("change", (e) => {
      drawerDraft.sprintId = e.target.value || null;
    });
  }

  const drawerEpicEl = document.getElementById("drawerEpic");
  if (drawerEpicEl) {
    drawerEpicEl.addEventListener("change", (e) => {
      drawerDraft.epicId = e.target.value || null;
    });
  }

  const saveDrawerBtn = document.getElementById("saveDrawerBtn");
  if (saveDrawerBtn) {
    saveDrawerBtn.addEventListener("click", saveDrawerChanges);
  }

  const boardWrapper = document.querySelector(".board-wrapper");
  if (boardWrapper) {
    boardWrapper.addEventListener("dragover", (e) => {
      e.preventDefault();
      const rect = boardWrapper.getBoundingClientRect();
      const edgeSize = 90;
      const scrollSpeed = 24;
      if (e.clientX > rect.right - edgeSize) {
        boardWrapper.scrollLeft += scrollSpeed;
      } else if (e.clientX < rect.left + edgeSize) {
        boardWrapper.scrollLeft -= scrollSpeed;
      }
    });
  }

  const switchSpaceBtn = document.getElementById("switchSpaceBtn");
  if (switchSpaceBtn) {
    switchSpaceBtn.addEventListener("click", () => showSpaceSelector());
  }
}

function switchTab(tab) {
  activeTab = tab;
  document.querySelectorAll(".tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tab);
  });
  document.querySelectorAll(".tab-content").forEach(content => {
    content.classList.remove("active");
  });
  document.getElementById(`${tab}Tab`).classList.add("active");

  const filterBar = document.getElementById("filterBar");
  if (filterBar) {
    filterBar.style.display = (tab === "board" || tab === "backlog" || tab === "list") ? "" : "none";
  }
}

function populateFilters() {
  const isDrawerOpen = document.getElementById("detailDrawer")?.classList.contains("open");

  const newSpaceAssignee = document.getElementById("newSpaceAssignee");
  if (newSpaceAssignee) {
    newSpaceAssignee.innerHTML = '<option value="">Sorumlu seç...</option>' +
      assignees.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  }

  const newEpicAssignee = document.getElementById("newEpicAssignee");
  if (newEpicAssignee) {
    newEpicAssignee.innerHTML = '<option value="">Atanmamış</option>' +
      assignees.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  }

  const epicFilter = document.getElementById("epicFilter");
  if(epicFilter) {
    epicFilter.innerHTML = '<option value="">Tüm Epic\'ler</option>';
    // Teknisyen için: List görünümündeki mantığın aynısı — sadece kendi işi olan epic'ler görünsün.
    const visibleEpics = isManager
      ? epics
      : epics.filter(e => tickets.some(t => String(t.epicId) === String(e.id) && currentUser && String(t.assigneeId) === String(currentUser.id)) || (currentUser && String(e.assigneeId) === String(currentUser.id)));
    visibleEpics.forEach(e => {
      epicFilter.innerHTML += `<option value="${e.id}">${escapeHtml(e.name)}</option>`;
    });
  }

  const priorityFilter = document.getElementById("priorityFilter");
  if(priorityFilter) {
    priorityFilter.innerHTML = '<option value="">Tüm Öncelikler</option>';
    priorities.forEach(p => {
      priorityFilter.innerHTML += `<option value="${p}">${escapeHtml(p)}</option>`;
    });
  }

  const assigneeList = document.getElementById("assigneeFilterList");
  if(assigneeList) {
    renderAssigneeFilterList(""); // Boş arama ile tüm listeyi çiz
  }
  updateAssigneeFilterCount();

  const drawerStatus = document.getElementById("drawerStatus");
  if(drawerStatus) {
    const preserved = (isDrawerOpen && drawerDraft.status !== undefined) ? drawerDraft.status : drawerStatus.value;
    drawerStatus.innerHTML = '';
    boardColumns.forEach(c => {
      drawerStatus.innerHTML += `<option value="${c.id}">${escapeHtml(c.title)}</option>`;
    });
    if (preserved) drawerStatus.value = preserved;
  }

  const drawerAssignee = document.getElementById("drawerAssignee");
  if(drawerAssignee) {
    const preserved = (isDrawerOpen && drawerDraft.assigneeId !== undefined) ? drawerDraft.assigneeId : drawerAssignee.value;
    drawerAssignee.innerHTML = '<option value="">Atanmamış</option>';
    assignees.forEach(a => {
      drawerAssignee.innerHTML += `<option value="${a.id}">${escapeHtml(a.name)}</option>`;
    });
    if (preserved) drawerAssignee.value = preserved;
  }

  const drawerPriority = document.getElementById("drawerPriority");
  if(drawerPriority) {
    const preserved = (isDrawerOpen && drawerDraft.priority !== undefined) ? drawerDraft.priority : drawerPriority.value;
    drawerPriority.innerHTML = priorities.length > 0
      ? priorities.map(p => `<option value="${p}">${escapeHtml(p)}</option>`).join("")
      : '<option value="Medium">Medium</option>'; 
    if (preserved) drawerPriority.value = preserved;
  }

  const drawerSprint = document.getElementById("drawerSprint");
  if(drawerSprint) {
    const preserved = (isDrawerOpen && drawerDraft.sprintId !== undefined) ? drawerDraft.sprintId : drawerSprint.value;
    drawerSprint.innerHTML = '<option value="">Backlog (Sprint Yok)</option>';
    sprints.filter(isSprintActive).forEach(s => {
      drawerSprint.innerHTML += `<option value="${s.id}">${escapeHtml(s.name)}</option>`;
    });
    if (preserved) drawerSprint.value = preserved;
  }

  const drawerEpic = document.getElementById("drawerEpic");
  if(drawerEpic) {
    const preserved = (isDrawerOpen && drawerDraft.epicId !== undefined) ? drawerDraft.epicId : drawerEpic.value;
    drawerEpic.innerHTML = '<option value="">Epic Yok</option>';
    epics.filter(isStatusActive).forEach(e => {
      drawerEpic.innerHTML += `<option value="${e.id}">${escapeHtml(e.name)}</option>`;
    });
    if (preserved) drawerEpic.value = preserved;
  }
}

function renderAll() {
  renderKpis();
  renderDashboard();
  renderBoard();
  renderBacklog();
  renderListView();
  renderReports();
}

function getScopedTickets() {
  if (isManager) return tickets;
  if (!currentUser) return []; // Kimlik çözülemediyse hiçbir şey gösterme — "herkesi göster"e asla düşme (gizlilik ihlali olurdu)
  return tickets.filter(t => String(t.assigneeId) === String(currentUser.id));
}

