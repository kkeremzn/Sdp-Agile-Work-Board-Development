/* Setup Wizard, startup guards and configuration bootstrap */
/* Setup Wizard, startup guards, shared tooltips/icons */
const WIDGET_CONFIG_RECORD_PREFIX = "Agile Board Configuration";
const WIDGET_CONFIG_CHUNK_SIZE = 180;

function serializeWidgetConfig(config) {
  return JSON.stringify(config);
}

function getWidgetConfigRecords(records) {
  const exact = records.find(r => r.name === WIDGET_CONFIG_RECORD_PREFIX);
  if (exact) return [exact]; // v254 ve önceki tek-kayıt formatı

  return records
    .filter(r => typeof r.name === "string" && r.name.startsWith(`${WIDGET_CONFIG_RECORD_PREFIX} [`))
    .sort((a, b) => {
      const ai = Number((a.name.match(/\[(\d+)\//) || [])[1] || 0);
      const bi = Number((b.name.match(/\[(\d+)\//) || [])[1] || 0);
      return ai - bi;
    });
}

function readWidgetConfigJson(records) {
  const configRecords = getWidgetConfigRecords(records);
  if (!configRecords.length) return null;
  if (configRecords.length === 1 && configRecords[0].name === WIDGET_CONFIG_RECORD_PREFIX) {
    return configRecords[0].description || Object.values(configRecords[0]).find(v => typeof v === "string" && v.trim().startsWith("{") && v.includes("MODULE_SPACES")) || null;
  }
  return configRecords.map(r => r.description || "").join("");
}

function buildWidgetConfigChunks(config) {
  const json = serializeWidgetConfig(config);
  const chunks = [];
  for (let i = 0; i < json.length; i += WIDGET_CONFIG_CHUNK_SIZE) chunks.push(json.slice(i, i + WIDGET_CONFIG_CHUNK_SIZE));
  return chunks;
}

async function saveWidgetConfigRecords(config) {
  const plural = config.SETTINGS_MODULE_PLURAL;
  const singular = plural.slice(0, -1);
  const descriptionKey = config.SETTINGS_DESCRIPTION_FIELD_KEY;
  const chunks = buildWidgetConfigChunks(config);

  const listResp = await fetch(`/api/v3/${plural}`, {
    method: "GET", credentials: "same-origin",
    headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
  });
  if (!listResp.ok) throw new Error(`Widget Setting kayıtları okunamadı (HTTP ${listResp.status}).`);
  const listData = await listResp.json();
  const existing = getWidgetConfigRecords(listData[plural] || []);

  // Önce yeni parçaları oluştur/güncelle. Böylece yarım kalan bir yazma işleminde eski config mümkün olduğunca korunur.
  for (let i = 0; i < chunks.length; i++) {
    const name = `${WIDGET_CONFIG_RECORD_PREFIX} [${i + 1}/${chunks.length}]`;
    const payload = { [singular]: { name, [descriptionKey]: chunks[i] } };
    const current = existing.find(r => r.name === name);
    if (current?.id) await sdpApiFetch(`/api/v3/${plural}/${current.id}`, "PUT", payload);
    else await sdpApiFetch(`/api/v3/${plural}`, "POST", payload);
  }

  // Yeni format eksiksiz yazıldıktan sonra eski tek-kayıt veya fazla chunk kayıtlarını temizle.
  for (const record of existing) {
    const keep = chunks.some((_, i) => record.name === `${WIDGET_CONFIG_RECORD_PREFIX} [${i + 1}/${chunks.length}]`);
    if (!keep && record.id) await sdpApiFetch(`/api/v3/${plural}?ids=${record.id}`, "DELETE");
  }
}

async function checkConfigAndInit() {
  determineMode();
  let settingsState = "unknown"; // configured | missing | error
  let startupError = null;

  try {
    const response = await fetch(`/api/v3/${CONFIG.SETTINGS_MODULE_PLURAL}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
    });

    if (response.ok) {
      settingsState = "missing";
      const data = await response.json();
      const records = data[CONFIG.SETTINGS_MODULE_PLURAL] || [];
      const configJson = readWidgetConfigJson(records);

      if (configJson) {
        const savedConfig = JSON.parse(configJson);
        CONFIG = { ...CONFIG, ...savedConfig };
        // v243 ve öncesinde Singular API adları config'te yoktu. O sürümlerde yalnız geriye dönük
        // uyumluluk için eski çoğul->tekil kuralını kullan; yeni kurulumlarda sihirbaz gerçek değeri kaydeder.
        CONFIG.MODULE_SPACES_SINGULAR = savedConfig.MODULE_SPACES_SINGULAR || deriveLegacySingularApiName(CONFIG.MODULE_SPACES);
        CONFIG.MODULE_SPRINTS_SINGULAR = savedConfig.MODULE_SPRINTS_SINGULAR || deriveLegacySingularApiName(CONFIG.MODULE_SPRINTS);
        CONFIG.MODULE_EPICS_SINGULAR = savedConfig.MODULE_EPICS_SINGULAR || deriveLegacySingularApiName(CONFIG.MODULE_EPICS);
        settingsState = "configured";
        initApp();
        return;
      }
    } else if (response.status === 404) {
      settingsState = "missing";
    } else {
      settingsState = "error";
      startupError = `Widget ayarları okunamadı (HTTP ${response.status}).`;
    }
  } catch (err) {
    settingsState = "error";
    startupError = err.message || "Widget ayarları okunamadı.";
    console.error("Başlangıç yapılandırması okunamadı:", err);
  }

  if (settingsState === "missing") {
    if (isManager) {
      showSetupWizardModal();
    } else {
      showStartupBlockingMessage("⚠️ Sistem Yapılandırılmadı", "Bu Agile Board eklentisi henüz bir SDP yöneticisi tarafından yapılandırılmamış. Lütfen yöneticinizden kurulumu tamamlamasını isteyin.");
    }
    return;
  }

  showStartupBlockingMessage(
    "⚠️ Yapılandırma Okunamadı",
    `${startupError || "SDP bağlantısı veya yetkiler kontrol edilemedi."} Mevcut kurulumun üzerine yazılmadı. Bağlantıyı ve Widget Setting View iznini kontrol edip sayfayı yenileyin.`
  );
}

function showStartupBlockingMessage(title, message) {
  const shell = document.querySelector(".app-shell");
  if (!shell) return;
  shell.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;text-align:center;padding:20px;";
  const h = document.createElement("h2");
  h.style.cssText = "color:var(--danger);margin-bottom:10px;";
  h.textContent = title;
  const p = document.createElement("p");
  p.style.cssText = "color:var(--muted);max-width:560px;line-height:1.5;";
  p.textContent = message;
  wrap.append(h, p);
  shell.appendChild(wrap);
}
function showSetupWizardModal(isDismissable = false) {
  const modal = document.getElementById("settingsWizardModal");
  if (!modal) return;

  const cancelBtn = document.getElementById("cancelWizardBtn");
  const closeXBtn = document.getElementById("closeWizardXBtn");
  if (cancelBtn) {
    cancelBtn.style.display = isDismissable ? "" : "none";
    cancelBtn.onclick = () => modal.classList.remove("open");
  }
  if (closeXBtn) {
    closeXBtn.style.display = isDismissable ? "" : "none";
    closeXBtn.onclick = () => modal.classList.remove("open");
  }

  // NOT: Alanları önceden bir değerle doldurmuyoruz (sadece placeholder/örnek metin gösteriyoruz) —
  // her SDP kurulumu farklı API adları üretebilir, bizim varsayılan tahminlerimizi pre-fill olarak
  // göstermek, kullanıcının kendi gerçek değerini yazmayı unutup yanlışlıkla bizim tahminimizi
  // kabul etmesine yol açabilir. Formu her açtığında bilinçli olarak kendi değerlerini gireceksin.
  modal.classList.add("open");

  // İlk kurulumda alanlar bilinçli olarak boş kalır. Mevcut kurulum düzenleniyorsa ise
  // sunucudan okunmuş, gerçekten çalışan CONFIG değerlerini göster; kullanıcı tekrar yazıp hata yapmasın.
  if (isDismissable) {
    const values = {
      confModuleSpaces: CONFIG.MODULE_SPACES, confModuleSpacesSingular: CONFIG.MODULE_SPACES_SINGULAR,
      confModuleSprints: CONFIG.MODULE_SPRINTS, confModuleSprintsSingular: CONFIG.MODULE_SPRINTS_SINGULAR,
      confModuleEpics: CONFIG.MODULE_EPICS, confModuleEpicsSingular: CONFIG.MODULE_EPICS_SINGULAR,
      confTemplateName: CONFIG.AGILE_TEMPLATE_NAME, confFieldSprint: CONFIG.SPRINT_ID_FIELD_KEY,
      confFieldEpic: CONFIG.EPIC_ID_FIELD_KEY, confFieldSpace: CONFIG.SPACE_ID_FIELD_KEY,
      confFieldWorkItem: CONFIG.WORK_ITEM_TYPE_FIELD_KEY, confFieldSpaceKey: CONFIG.SPACE_KEY_FIELD_KEY,
      confFieldSpaceDescription: CONFIG.SPACE_DESCRIPTION_FIELD_KEY, confFieldSpaceOwner: CONFIG.SPACE_OWNER_FIELD_KEY || "sahip", confFieldSpaceAssignee: CONFIG.SPACE_ASSIGNEE_FIELD_KEY,
      confFieldEpicDescription: CONFIG.EPIC_DESCRIPTION_FIELD_KEY, confFieldEpicStatus: CONFIG.EPIC_STATUS_FIELD_KEY,
      confFieldEpicSpaceId: CONFIG.EPIC_SPACE_ID_FIELD_KEY, confFieldEpicAssignee: CONFIG.EPIC_ASSIGNEE_FIELD_KEY,
      confFieldSprintGoal: CONFIG.SPRINT_GOAL_FIELD_KEY, confFieldSprintStart: CONFIG.SPRINT_START_DATE_FIELD_KEY,
      confFieldSprintEnd: CONFIG.SPRINT_END_DATE_FIELD_KEY, confFieldSprintActualStart: CONFIG.SPRINT_ACTUAL_START_FIELD_KEY,
      confFieldSprintActualEnd: CONFIG.SPRINT_ACTUAL_END_FIELD_KEY, confFieldSprintClosureSummary: CONFIG.SPRINT_CLOSURE_SUMMARY_FIELD_KEY, confFieldSprintStatus: CONFIG.SPRINT_STATUS_FIELD_KEY,
      confFieldSprintResolution: CONFIG.SPRINT_RESOLUTION_FIELD_KEY, confFieldSprintSpaceId: CONFIG.SPRINT_SPACE_ID_FIELD_KEY
    };
    Object.entries(values).forEach(([id, value]) => {
      const el = document.getElementById(id);
      if (el) el.value = value || "";
    });
  }

document.getElementById("saveWizardBtn").onclick = async () => {
    const newConfig = {
      SETTINGS_MODULE_PLURAL: "cm_widget_settings",
      SETTINGS_DESCRIPTION_FIELD_KEY: "description",
      MODULE_SPACES: document.getElementById("confModuleSpaces").value.trim(),
      MODULE_SPACES_SINGULAR: document.getElementById("confModuleSpacesSingular").value.trim(),
      MODULE_SPRINTS: document.getElementById("confModuleSprints").value.trim(),
      MODULE_SPRINTS_SINGULAR: document.getElementById("confModuleSprintsSingular").value.trim(),
      MODULE_EPICS: document.getElementById("confModuleEpics").value.trim(),
      MODULE_EPICS_SINGULAR: document.getElementById("confModuleEpicsSingular").value.trim(),
      AGILE_TEMPLATE_NAME: document.getElementById("confTemplateName").value.trim(),
      SPRINT_ID_FIELD_KEY: document.getElementById("confFieldSprint").value.trim(),
      SPRINT_START_DATE_FIELD_KEY: document.getElementById("confFieldSprintStart").value.trim(),
      SPRINT_END_DATE_FIELD_KEY: document.getElementById("confFieldSprintEnd").value.trim(),
      SPRINT_ACTUAL_START_FIELD_KEY: document.getElementById("confFieldSprintActualStart").value.trim(),
      SPRINT_ACTUAL_END_FIELD_KEY: document.getElementById("confFieldSprintActualEnd").value.trim(),
      SPRINT_CLOSURE_SUMMARY_FIELD_KEY: document.getElementById("confFieldSprintClosureSummary").value.trim(),
      SPRINT_GOAL_FIELD_KEY: document.getElementById("confFieldSprintGoal").value.trim(),
      SPRINT_STATUS_FIELD_KEY: document.getElementById("confFieldSprintStatus").value.trim(),
      SPRINT_RESOLUTION_FIELD_KEY: document.getElementById("confFieldSprintResolution").value.trim(),
      SPRINT_SPACE_ID_FIELD_KEY: document.getElementById("confFieldSprintSpaceId").value.trim(),
      EPIC_ID_FIELD_KEY: document.getElementById("confFieldEpic").value.trim(),
      EPIC_DESCRIPTION_FIELD_KEY: document.getElementById("confFieldEpicDescription").value.trim(),
      EPIC_STATUS_FIELD_KEY: document.getElementById("confFieldEpicStatus").value.trim(),
      EPIC_SPACE_ID_FIELD_KEY: document.getElementById("confFieldEpicSpaceId").value.trim(),
      SPACE_ID_FIELD_KEY: document.getElementById("confFieldSpace").value.trim(),
      WORK_ITEM_TYPE_FIELD_KEY: document.getElementById("confFieldWorkItem").value.trim(),
      SPACE_KEY_FIELD_KEY: document.getElementById("confFieldSpaceKey").value.trim(),
      SPACE_DESCRIPTION_FIELD_KEY: document.getElementById("confFieldSpaceDescription").value.trim(),
      SPACE_OWNER_FIELD_KEY: document.getElementById("confFieldSpaceOwner").value.trim(),
      SPACE_ASSIGNEE_FIELD_KEY: document.getElementById("confFieldSpaceAssignee").value.trim(),
      EPIC_ASSIGNEE_FIELD_KEY: document.getElementById("confFieldEpicAssignee").value.trim()
    };

    const requiredConfigEntries = [
      ["Widget Setting modülü", newConfig.SETTINGS_MODULE_PLURAL], ["Space modülü (çoğul)", newConfig.MODULE_SPACES], ["Space modülü (tekil)", newConfig.MODULE_SPACES_SINGULAR],
      ["Sprint modülü (çoğul)", newConfig.MODULE_SPRINTS], ["Sprint modülü (tekil)", newConfig.MODULE_SPRINTS_SINGULAR],
      ["Epic modülü (çoğul)", newConfig.MODULE_EPICS], ["Epic modülü (tekil)", newConfig.MODULE_EPICS_SINGULAR], ["Ticket template", newConfig.AGILE_TEMPLATE_NAME],
      ["Widget Setting Description", newConfig.SETTINGS_DESCRIPTION_FIELD_KEY], ["Space Key", newConfig.SPACE_KEY_FIELD_KEY],
      ["Space Description", newConfig.SPACE_DESCRIPTION_FIELD_KEY], ["Space Sahip", newConfig.SPACE_OWNER_FIELD_KEY], ["Space Assignee", newConfig.SPACE_ASSIGNEE_FIELD_KEY],
      ["Epic Description", newConfig.EPIC_DESCRIPTION_FIELD_KEY], ["Epic Status", newConfig.EPIC_STATUS_FIELD_KEY], ["Epic Space ID", newConfig.EPIC_SPACE_ID_FIELD_KEY], ["Epic Assignee", newConfig.EPIC_ASSIGNEE_FIELD_KEY],
      ["Sprint Goal", newConfig.SPRINT_GOAL_FIELD_KEY], ["Sprint StartDate", newConfig.SPRINT_START_DATE_FIELD_KEY], ["Sprint EndDate", newConfig.SPRINT_END_DATE_FIELD_KEY],
      ["Sprint ActualStartDate", newConfig.SPRINT_ACTUAL_START_FIELD_KEY], ["Sprint ActualEndDate", newConfig.SPRINT_ACTUAL_END_FIELD_KEY], ["Sprint ClosureSummary", newConfig.SPRINT_CLOSURE_SUMMARY_FIELD_KEY],
      ["Sprint Status", newConfig.SPRINT_STATUS_FIELD_KEY], ["Sprint Resolution", newConfig.SPRINT_RESOLUTION_FIELD_KEY], ["Sprint Space ID", newConfig.SPRINT_SPACE_ID_FIELD_KEY],
      ["Template Sprint ID", newConfig.SPRINT_ID_FIELD_KEY], ["Template Epic ID", newConfig.EPIC_ID_FIELD_KEY], ["Template Space ID", newConfig.SPACE_ID_FIELD_KEY], ["Template Work Item Type", newConfig.WORK_ITEM_TYPE_FIELD_KEY]
    ];
    const missingConfig = requiredConfigEntries.filter(([,v]) => !v).map(([k]) => k);
    if (missingConfig.length) {
      showToast(`Kurulum tamamlanamaz. Eksik API alanları: ${missingConfig.join(", ")}`, "error");
      return;
    }
    const invalidApiNames = requiredConfigEntries.filter(([k,v]) => k !== "Ticket template" && /\s/.test(v)).map(([k]) => k);
    if (invalidApiNames.length) {
      showToast(`API isimlerinde boşluk olamaz: ${invalidApiNames.join(", ")}`, "error");
      return;
    }

    try {
      showToast("Kurulum bağlantıları doğrulanıyor...", "success");

      // Destructive olmayan kurulum ön kontrolü: dört custom module gerçekten okunabiliyor mu,
      // Epic Assignee gerçekten Reference Entity endpoint'i olarak cevap veriyor mu?
      for (const [label, moduleName] of [["Widget Setting", newConfig.SETTINGS_MODULE_PLURAL], ["Space", newConfig.MODULE_SPACES], ["Sprint", newConfig.MODULE_SPRINTS], ["Epic", newConfig.MODULE_EPICS]]) {
        const resp = await fetch(`/api/v3/${moduleName}`, { method:"GET", credentials:"same-origin", headers:{ "Accept":"application/vnd.manageengine.sdp.v3+json" } });
        if (!resp.ok) throw new Error(`${label} modülü okunamadı (HTTP ${resp.status}). API Plural Name veya SDAdmin iznini kontrol et.`);
      }
      const assigneeProbeInput = encodeURIComponent(JSON.stringify({ list_info:{ row_count:1, start_index:1 } }));
      const assigneeProbe = await fetch(`/api/v3/${newConfig.MODULE_EPICS}/${newConfig.EPIC_ASSIGNEE_FIELD_KEY}?input_data=${assigneeProbeInput}`, { method:"GET", credentials:"same-origin", headers:{ "Accept":"application/vnd.manageengine.sdp.v3+json" } });
      if (!assigneeProbe.ok) throw new Error(`Epic Assignee alanı doğrulanamadı (HTTP ${assigneeProbe.status}). Reference Entity → Technician tipini ve API Field Name'i kontrol et.`);

      showToast("Ayarlar sunucuya kaydediliyor...", "success");

      // Configuration tek bir uzun Description alanına yazılmaz. SDP kurulumlarındaki
      // alan uzunluğu limitlerine takılmamak için güvenli boyutlu parçalara bölünür.
      // Okuyucu v254 ve önceki tek-kayıt formatını da desteklemeye devam eder.
      await saveWidgetConfigRecords(newConfig);

      showToast("Kurulum başarıyla tamamlandı!", "success");
      modal.classList.remove("open");
      window.location.reload();
    } catch (err) {
      console.error("Kayıt hatası detayı:", err);
      showToast(`Kaydedilemedi: ${err.message}`, "error");
    }
  };
}
document.getElementById("openSettingsBtn")?.addEventListener("click", () => {
  showSetupWizardModal(true);
});
document.getElementById("openSettingsBtnFromSelector")?.addEventListener("click", () => {
  showSetupWizardModal(true);
});

let spacesFetchError = null;

// HTML'deki statik butonların (JS'in tekrar çizmediği) emoji ikonlarını tek kaynaktan
// gelen SVG'lerle değiştirir — böylece "bir yerde farklı, başka yerde farklı ikon" sorunu
// bir daha oluşamaz, hepsi aynı fonksiyonlardan besleniyor.
// Genel akıllı tooltip sistemi — her data-tip elemanı, üstünde yeterli yer yoksa
// (panelin/ekranın en üstüne yakınsa) otomatik olarak aşağı açılır. Delegasyonla bağlanıyor,
// dinamik olarak sonradan eklenen elemanlar için de (chat mesajları gibi) çalışır.
// Eski CSS ::after/::before tabanlı tooltip sistemi, overflow:hidden olan HERHANGİ bir üst kapsayıcı
// (List'teki .tree-list gibi) içinde kalan elemanlarda kesiliyordu — position:absolute, ne kadar akıllı
// yön hesabı yapılırsa yapılsın o kapsayıcının dışına asla çıkamıyor. Chat menüsünde çözdüğümüz "portal"
// tekniğini (body'nin doğrudan altında, gerçek ekran koordinatlarına göre konumlanan tek eleman) artık
// TÜM tooltip'lere uyguluyoruz — bu sorunu uygulama genelinde kalıcı olarak çözer.
function getFloatingTooltipEl() {
  let el = document.getElementById("floatingTooltip");
  if (!el) {
    el = document.createElement("div");
    el.id = "floatingTooltip";
    el.className = "floating-tooltip";
    document.body.appendChild(el);
  }
  return el;
}

function initSmartTooltips() {
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return;
    const text = el.getAttribute("data-tip");
    if (!text) return;

    const tip = getFloatingTooltipEl();
    tip.textContent = text;
    tip.style.visibility = "hidden";
    tip.classList.add("open");
    const tipRect = tip.getBoundingClientRect();
    const btnRect = el.getBoundingClientRect();

    let top = btnRect.top - tipRect.height - 8;
    let arrowBelow = false;
    if (top < 8) {
      top = btnRect.bottom + 8; // Üstte yer yoksa aşağı aç
      arrowBelow = true;
    }
    let left = btnRect.left + (btnRect.width / 2) - (tipRect.width / 2);
    if (left < 8) left = 8;
    if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8;

    tip.style.top = `${top}px`;
    tip.style.left = `${left}px`;
    tip.classList.toggle("arrow-below", arrowBelow);
    tip.style.visibility = "visible";
  }, true);

  document.addEventListener("mouseout", (e) => {
    const el = e.target.closest("[data-tip]");
    if (!el) return;
    if (e.relatedTarget && el.contains(e.relatedTarget)) return;
    const tip = document.getElementById("floatingTooltip");
    if (tip) tip.classList.remove("open");
  }, true);

  document.addEventListener("scroll", () => {
    const tip = document.getElementById("floatingTooltip");
    if (tip) tip.classList.remove("open");
  }, true);
}

function applyStaticIcons() {
  const setIcon = (id, iconHtml, labelText) => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = iconHtml + (labelText ? ` ${labelText}` : "");
  };

  const switchSpaceBtn = document.getElementById("switchSpaceBtn");
  if (switchSpaceBtn) {
    const nameSpan = document.getElementById("currentSpaceName");
    const nameText = nameSpan ? nameSpan.outerHTML : "";
    switchSpaceBtn.innerHTML = `${folderIconSvg()} ${nameText} ${chevronDownSvg()}`;
  }

  const settingsBtn = document.getElementById("openSettingsBtn");
  if (settingsBtn) settingsBtn.innerHTML = settingsIconSvg();

  const settingsBtnFromSelector = document.getElementById("openSettingsBtnFromSelector");
  if (settingsBtnFromSelector) settingsBtnFromSelector.innerHTML = `${settingsIconSvg()} Ayarlar`;

  document.querySelectorAll(".report-export-btn").forEach(btn => {
    btn.innerHTML = `${downloadIconSvg()} ${btn.textContent}`;
  });

  const typeStory = document.querySelector('[data-type-filter="Story"]');
  if (typeStory) typeStory.innerHTML = `${workItemTypeIcon("Story")} Story`;
  const typeTask = document.querySelector('[data-type-filter="Task"]');
  if (typeTask) typeTask.innerHTML = `${workItemTypeIcon("Task")} Task`;
  const typeBug = document.querySelector('[data-type-filter="Bug"]');
  if (typeBug) typeBug.innerHTML = `${workItemTypeIcon("Bug")} Bug`;

  const assigneeToggle = document.getElementById("assigneeFilterToggleBtn");
  if (assigneeToggle) {
    const countSpan = document.getElementById("assigneeFilterCount");
    assigneeToggle.innerHTML = `${personIconSvg()} Atanan ${countSpan ? countSpan.outerHTML : '<span id="assigneeFilterCount"></span>'} ${chevronDownSvg()}`;
  }

  const boardIssuesBtnEl = document.getElementById("boardViewIssuesBtn");
  if (boardIssuesBtnEl) boardIssuesBtnEl.innerHTML = `${listViewIconSvg()} İşler`;
  const boardSprintsBtnEl = document.getElementById("boardViewSprintsBtn");
  if (boardSprintsBtnEl) boardSprintsBtnEl.innerHTML = `${sprintIconSvg()} Sprintler`;

  const chatFab = document.getElementById("chatFabBtn");
  if (chatFab) chatFab.innerHTML = chatBubbleIconSvg();
  const chatSend = document.getElementById("chatSendBtn");
  if (chatSend) chatSend.innerHTML = sendIconSvg();

  const subtasksHeader = document.getElementById("subtasksHeaderTitle");
  if (subtasksHeader) subtasksHeader.innerHTML = `${subtaskIconSvg()} Alt Görevler`;

  // Yeni İş / Alt Görev formlarındaki <option> etiketleri SVG barındıramaz (native select kısıtı) —
  // orada emoji karışıklığını (📗/🐛/🐞 farklı yerlerde farklıydı) çözüp sade, tutarlı metne indirgiyoruz.
  document.querySelectorAll('option[value="Story"]').forEach(o => { if (/^\W/.test(o.textContent)) o.textContent = "Story"; });
  document.querySelectorAll('option[value="Task"]').forEach(o => { if (/^\W/.test(o.textContent)) o.textContent = "Task"; });
  document.querySelectorAll('option[value="Bug"]').forEach(o => { if (/^\W/.test(o.textContent)) o.textContent = "Bug"; });
}

function chatBubbleIconSvg() {
  return `<svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5h16v11H9l-4 3.5v-3.5H4z"/></svg>`;
}
function sendIconSvg() {
  return `<svg width="16" height="16" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4z"/></svg>`;
}
function removeXIconSvg() {
  return `<svg width="11" height="11" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 4l8 8M12 4l-8 8"/></svg>`;
}
function chevronDownSvg() {
  return `<svg width="10" height="10" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M3.5 6l4.5 4.5L12.5 6"/></svg>`;
}
function chevronRightSvg() {
  return `<svg width="10" height="10" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;"><path d="M6 3.5l4.5 4.5L6 12.5"/></svg>`;
}
function treeToggleIcon(isOpen) {
  return isOpen ? chevronDownSvg() : chevronRightSvg();
}

