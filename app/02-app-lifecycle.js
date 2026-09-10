/* Application lifecycle, Space selector and role UI */
/* Application lifecycle, Space entry, role UI */
async function initApp() {
  const versionEl = document.getElementById("appVersionBadge");
  if (versionEl) versionEl.textContent = APP_VERSION;

  applyStaticIcons();
  initSmartTooltips();
  determineMode();
  loadTheme();
  bindEvents();
  bindNewSprintModalEvents();
  bindNewSpaceModalEvents();
  bindNewEpicModalEvents();
  bindNewIssueModalEvents();
  bindReportsFilterEvents();
  bindChatEvents();
  switchTab("dashboard");

  try {
    spaces = await fetchSpaces();
    spacesFetchError = null;
  } catch (err) {
    console.error("Space listesi alınamadı:", err);
    spaces = [];
    spacesFetchError = err.message;
  }

  await refreshAssignees();
  populateFilters();

  const savedSpaceId = localStorage.getItem("sdp_agile_current_space_id");
  const matched = spaces.find(s => String(s.id) === String(savedSpaceId));

  if (matched) await enterSpace(matched);
  else showSpaceSelector();
}

function showSpaceSelector() {
  document.querySelector(".app-shell").style.display = "none";
  const screen = document.getElementById("spaceSelectorScreen");
  if (!screen) return;
  screen.classList.add("open");
  renderSpaceCards();
}

// Epic, Story/Task/Bug ile aynı iş durumlarını kullanır. Sprint ise Future/Active/Closed kullanır.
// Ortak kapanış kontrolü yalnızca kapanmış kayıtları belirlemek için kullanılır.
// Epic için "aktif" = Closed/Resolved olmayan; Sprint'in gerçekten çalışıyor olması için isSprintCurrentlyRunning kullanılır.
function isStatusClosed(entity) {
  return entity.status === "Closed" || entity.status === "Resolved";
}
function isStatusActive(entity) {
  return !isStatusClosed(entity);
}
function isTicketClosed(ticket) {
  if (!ticket) return false;
  const statusId = String(ticket.statusId ?? ticket.status?.id ?? "");
  const statusName = String(ticket.statusName ?? ticket.status?.name ?? "").trim().toLowerCase();
  return statusId === "1" || statusId === "4" || statusName === "closed" || statusName === "resolved";
}
// Geriye dönük isimler (mevcut çağrılar bunları kullanıyor)
const isSprintClosed = isStatusClosed;
const isSprintActive = isStatusActive; // DİKKAT: Bu "kapalı değil" demek — "Future" durumu da bu tanıma girer.
// Backlog/Drawer gibi PLANLAMA bağlamlarında bu doğru (henüz başlamamış sprint'e de iş atanabilmeli).
// Ama "gerçekten şu an çalışıyor mu" sorusuna cevap gereken yerlerde (Dashboard sayaçları gibi)
// bunun yerine AŞAĞIDAKİ fonksiyonu kullan — "Future" yanlışlıkla Aktif sayılmasın diye.
function isSprintCurrentlyRunning(sprint) {
  return sprint.status === "Active";
}

function spaceStatusColor(status) {
  const colors = {
    "Open": "#3b82f6",
    "Future": "#8b8da3",
    "Active": "#00b8a3",
    "Assigned": "#006699",
    "In Progress": "#00b8a3",
    "Onhold": "#f59e0b",
    "Resolved": "#22c55e",
    "Completed": "#22c55e",
    "Closed": "#64748b"
  };
  return colors[status] || "#64748b";
}

function renderSpaceCards() {
  const listEl = document.getElementById("spaceCardsList");
  if (!listEl) return;

  if (spacesFetchError) {
    listEl.innerHTML = `<div class="empty-state"><h3>⚠️ Space'ler Yüklenemedi</h3><p>Hata: ${escapeHtml(spacesFetchError)}</p><p style="margin-top:8px;">Bu genelde <strong>${escapeHtml(CONFIG.MODULE_SPACES)}</strong> modülünün SDP'deki Permissions ayarında bu kullanıcı rolüne (Technician) izin verilmemiş olmasından kaynaklanır. Yöneticiden Admin → Developer Space → Custom Modules → Space → Permissions ekranını kontrol etmesini iste.</p></div>`;
  } else if (spaces.length === 0) {
    listEl.innerHTML = '<div class="empty-state"><h3>Henüz Space Yok</h3><p>Başlamak için ilk Space\'i oluştur.</p></div>';
  } else {
    listEl.innerHTML = spaces.map(s => `
      <div class="space-card" data-space-id="${s.id}">
        <div class="space-card-header">
          <span class="space-key-badge">${escapeHtml(s.key || "—")}</span>
          <div style="display:flex; align-items:center; gap:6px;">
            ${isManager ? `<button class="secondary-btn edit-space-btn" data-space-id="${s.id}" style="padding:4px 12px; font-size:12px;">Düzenle</button>` : ""}
            ${isManager ? `<button class="secondary-btn delete-space-btn" data-space-id="${s.id}" style="padding:4px 12px; font-size:12px; color:var(--danger); border-color:var(--danger);">Sil</button>` : ""}
          </div>
        </div>
        <h3>${escapeHtml(s.name)}</h3>
        <p class="space-description">${escapeHtml(s.description || "Açıklama yok.")}</p>
        <div class="space-card-footer">
          <span class="avatar">${initials(s.assigneeName)}</span>
          <span>${escapeHtml(s.assigneeName)}</span>
        </div>
      </div>
    `).join("");

    listEl.querySelectorAll(".space-card").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".edit-space-btn") || e.target.closest(".delete-space-btn")) return;
        const space = spaces.find(s => String(s.id) === card.dataset.spaceId);
        if (space) enterSpace(space);
      });
    });

    listEl.querySelectorAll(".edit-space-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const space = spaces.find(s => String(s.id) === btn.dataset.spaceId);
        if (space) openEditSpaceModal(space);
      });
    });

    listEl.querySelectorAll(".delete-space-btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const space = spaces.find(s => String(s.id) === btn.dataset.spaceId);
        if (space) openDeleteSpaceModal(space);
      });
    });
  }

  const newBtn = document.getElementById("newSpaceBtn");
  if (newBtn) newBtn.style.display = isManager ? "" : "none";
}

async function enterSpace(space) {
  const isDifferentSpace = !currentSpace || String(currentSpace.id) !== String(space.id);
  currentSpace = space;
  localStorage.setItem("sdp_agile_current_space_id", space.id);

  // İş Yükü Raporu önbelleği önceki Space'e ait olabilir — GERÇEKTEN farklı bir Space'e
  // geçiliyorsa temizle (aynı Space'e tekrar girilmesi rapor değerini bozmasın).
  if (isDifferentSpace) {
    workloadReportCache = null;
    workloadReportLoadedAt = null;
    workloadExpandedTickets.clear();
    const workloadContentEl = document.getElementById("workloadReportContent");
    if (workloadContentEl) workloadContentEl.innerHTML = "";
  }

  const screen = document.getElementById("spaceSelectorScreen");
  if (screen) screen.classList.remove("open");
  document.querySelector(".app-shell").style.display = "";

  const nameEl = document.getElementById("currentSpaceName");
  if (nameEl) nameEl.textContent = `${space.key ? space.key + " — " : ""}${space.name}`;

  showToast(`"${space.name}" Space'ine girildi.`, "success");
  await resolveIdentityFromWidgetContext();
  await loadData();
}

function determineMode() {
  isManager = window.APP_MODE !== "technician";
  applyRoleUI();
}

// Rol rozetinin yanında, o an algılanan kullanıcı ismini gösterir — "hangi kimlikle
// çalıştığımı görebiliyorum" güvencesi için.
function updateDetectedUserNameBadge() {
  const nameSpan = document.getElementById("detectedUserName");
  if (nameSpan) nameSpan.textContent = currentUser?.name ? `(${currentUser.name})` : "";
}

function applyRoleUI() {
  const badge = document.getElementById("roleBadge");
  if (badge) {
    const nameSpan = document.getElementById("detectedUserName");
    badge.innerHTML = `${isManager ? "Yönetici" : "Teknisyen"} <span id="detectedUserName" style="font-weight:400; opacity:0.85;">${nameSpan ? nameSpan.textContent : ""}</span>`;
  }
  updateDetectedUserNameBadge();

  if (!isManager) {
    document.querySelectorAll('.tab-btn[data-tab="backlog"]').forEach(btn => btn.style.display = "none");
    const drawerAssignee = document.getElementById("drawerAssignee");
    if (drawerAssignee) drawerAssignee.disabled = true;
    const drawerSprint = document.getElementById("drawerSprint");
    if (drawerSprint) drawerSprint.disabled = true;
    const drawerEpic = document.getElementById("drawerEpic");
    if (drawerEpic) drawerEpic.disabled = true;
    const drawerPriority = document.getElementById("drawerPriority");
    if (drawerPriority) drawerPriority.disabled = true;
    const avatarGroup = document.getElementById("assigneeFilterToggleBtn")?.closest(".assignee-filter-dropdown");
    if (avatarGroup) avatarGroup.style.display = "none";
  }
}

