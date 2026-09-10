/* Board/List filter state and scoped filtering */
let activeTypeFilters = new Set();
let activeAssigneeFilters = new Set();

// Herhangi bir filtre aktif mi? — List görünümünde boş kalan Epic'leri
// gizlemek için gerekiyor (filtre yokken "gerçekten boş" ile filtre varken
// "bu filtreye uyan yok" durumunu ayırt edebilelim).
// Atanan kişi filtresini arama kutusuna göre çizer — 100+ teknisyende bile kullanışlı kalsın diye
function renderAssigneeFilterList(searchTerm) {
  const listEl = document.getElementById("assigneeFilterList");
  if (!listEl) return;
  const term = searchTerm.toLowerCase();
  const filtered = assignees.filter(a => a.name.toLowerCase().includes(term));

  listEl.innerHTML = filtered.length > 0
    ? filtered.map(a => `
        <label class="assignee-filter-row" data-assignee-filter="${a.id}">
          <span class="assignee-filter-checkbox ${activeAssigneeFilters.has(String(a.id)) ? "checked" : ""}"></span>
          <span class="assignee-filter-name">${escapeHtml(a.name)}</span>
        </label>
      `).join("")
    : '<div class="muted" style="padding:8px; font-size:12px;">Eşleşen teknisyen yok.</div>';
}

function updateAssigneeFilterCount() {
  const countEl = document.getElementById("assigneeFilterCount");
  if (countEl) countEl.textContent = activeAssigneeFilters.size > 0 ? `(${activeAssigneeFilters.size})` : "";
}

function isAnyFilterActive() {
  const searchEl = document.getElementById("searchInput");
  const epicEl = document.getElementById("epicFilter");
  const priorityEl = document.getElementById("priorityFilter");
  const slaEl = document.getElementById("slaFilter");
  return !!(searchEl?.value) || !!(epicEl?.value) || !!(priorityEl?.value) || !!(slaEl?.value) ||
    activeTypeFilters.size > 0 || activeAssigneeFilters.size > 0;
}

function getFilteredTickets(baseList) {
  const searchEl = document.getElementById("searchInput");
  const epicEl = document.getElementById("epicFilter");
  const priorityEl = document.getElementById("priorityFilter");
  const slaEl = document.getElementById("slaFilter");

  const search = searchEl ? searchEl.value.toLowerCase() : "";
  const epicId = epicEl ? epicEl.value : "";
  const priority = priorityEl ? priorityEl.value : "";
  const sla = slaEl ? slaEl.value : "";

  return (baseList || getScopedTickets()).filter(t => {
    const searchMatch =
      String(t.id).toLowerCase().includes(search) ||
      issueKeyText(t).toLowerCase().includes(search) ||
      t.title.toLowerCase().includes(search) ||
      t.category.toLowerCase().includes(search);

    const typeMatch = activeTypeFilters.size === 0 || activeTypeFilters.has(t.workItemType);
    const assigneeMatch = activeAssigneeFilters.size === 0 || activeAssigneeFilters.has(String(t.assigneeId));

    return searchMatch &&
      typeMatch &&
      assigneeMatch &&
      (!epicId || String(t.epicId) === epicId) &&
      (!priority || t.priority === priority) &&
      (!sla || t.slaStatus === sla);
  });
}

