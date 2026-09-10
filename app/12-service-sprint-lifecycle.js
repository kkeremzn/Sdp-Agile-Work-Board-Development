/* Sprint planned/actual lifecycle, closure summary and rollback rules */
/* Sprint lifecycle business rules: planned/actual times, closure summary, rollback */
function buildSprintClosureSummary(unfinishedTickets, targetSprintId, movementMode = null) {
  return JSON.stringify({
    v: 1,
    d: targetSprintId ? (movementMode === "newsprint" ? "new_sprint" : "existing_sprint") : "backlog",
    t: targetSprintId ? String(targetSprintId) : null,
    i: unfinishedTickets.map(t => String(t.id))
  });
}

function parseSprintClosureSummary(text) {
  if (!text) return null;
  try {
    const data = JSON.parse(text);
    if (data?.v !== 1 || !Array.isArray(data.i)) return null;
    return data;
  } catch (_) {
    return null;
  }
}

function getSprintHistoricalTickets(sprint) {
  // v249+ kapanışları: tamamlanan işler sprint üzerinde kalır, taşınanların ID'leri
  // ClosureSummary'de tutulur. Eski sprintlerde Resolution snapshot'ını okumaya devam ederiz.
  const compact = parseSprintClosureSummary(sprint.closureSummary);
  if (compact) {
    const current = tickets.filter(t => String(t.sprintId) === String(sprint.id)).map(t => ({
      id: t.id, title: t.title, workItemType: t.workItemType, assigneeName: t.assigneeName,
      completed: true, movedTo: null
    }));
    const currentIds = new Set(current.map(t => String(t.id)));
    const target = compact.t ? sprints.find(s => String(s.id) === String(compact.t)) : null;
    const moved = compact.i.filter(id => !currentIds.has(String(id))).map(id => {
      const live = tickets.find(t => String(t.id) === String(id));
      return {
        id: String(id),
        title: live?.title || `İş #${id}`,
        workItemType: live?.workItemType || "—",
        assigneeName: live?.assigneeName || null,
        completed: false,
        movedTo: (compact.d === "existing_sprint" || compact.d === "new_sprint" || compact.d === "sprint")
          ? { sprintId: compact.t, sprintName: target?.name || `Sprint #${compact.t}`, createdDuringClose: compact.d === "new_sprint" }
          : { backlog: true }
      };
    });
    return { tickets: [...current, ...moved], isEstimated: false };
  }

  const legacy = parseSprintClosureSnapshot(sprint.resolution);
  if (legacy && Array.isArray(legacy.tickets)) return { tickets: legacy.tickets, isEstimated: false, legacy };

  const live = tickets.filter(t => String(t.sprintId) === String(sprint.id)).map(t => ({
    id: t.id, title: t.title, workItemType: t.workItemType, completed: isTicketClosed(t), assigneeName: t.assigneeName, movedTo: null
  }));
  return { tickets: live, isEstimated: true };
}

// ---------- Sprint Kapanış Anlık Görüntüsü (Snapshot) ----------
// SDP, bir sprint kapanırken bitmemiş işlerin sprintId'sini başka bir yere taşıdığımızda bu
// işlerin "bir zamanlar bu sprint'teydi" bilgisini kalıcı olarak kaybediyor. Bunu çözmek için,
// kapanış anındaki tam durumu (kim tamamlandı, kim nereye taşındı) Resolution alanının içine,
// insan tarafından yazılan notun ALTINA, ayrı bir JSON bloğu olarak gömüyoruz. SDP'nin kendi
// ekranında hâlâ sadece normal not görünür — biz bu bloğu ayıklayıp kullanıyoruz.
const SPRINT_SNAPSHOT_MARKER = "\n\n---AGILE_BOARD_SNAPSHOT_DUZENLEMEYIN---\n";

function buildSprintClosureResolution(humanNote, sprintTickets, targetSprintId, actualStartedAt) {
  const targetSprint = targetSprintId ? sprints.find(s => String(s.id) === String(targetSprintId)) : null;
  const snapshot = {
    closedAt: Date.now(),
    startedAt: actualStartedAt || null,
    tickets: sprintTickets.map(t => ({
      id: t.id,
      title: t.title,
      workItemType: t.workItemType,
      completed: isTicketClosed(t),
      assigneeName: t.assigneeName || null,
      movedTo: !isTicketClosed(t)
        ? (targetSprint ? { sprintId: targetSprint.id, sprintName: targetSprint.name } : { backlog: true })
        : null
    }))
  };
  try {
    return (humanNote || "") + SPRINT_SNAPSHOT_MARKER + JSON.stringify(snapshot);
  } catch (err) {
    console.warn("Sprint kapanış anlık görüntüsü oluşturulamadı, sadece not kaydediliyor:", err);
    return humanNote || "";
  }
}

// Her zaman try/catch içinde — veri bloğu bozuksa, eksikse, biri elle değiştirmişse bile
// asla hata fırlatmaz, sadece null döner ("bu sprint için geçmiş veri yok" anlamına gelir).
function parseSprintClosureSnapshot(resolutionText) {
  if (!resolutionText || !resolutionText.includes(SPRINT_SNAPSHOT_MARKER)) return null;
  try {
    const jsonPart = resolutionText.split(SPRINT_SNAPSHOT_MARKER)[1];
    return JSON.parse(jsonPart);
  } catch (err) {
    return null;
  }
}

function humanResolutionNote(resolutionText) {
  if (!resolutionText) return "";
  return resolutionText.split(SPRINT_SNAPSHOT_MARKER)[0];
}

const SPRINT_START_MARKER = "---AGILE_BOARD_START_MARKER:";

function buildSprintStartMarker() {
  return `${SPRINT_START_MARKER}${Date.now()}---`;
}

// Her zaman try/catch mantığıyla güvenli — işaret yoksa ya da bozuksa null döner, asla patlamaz.
function parseSprintStartMarker(resolutionText) {
  if (!resolutionText) return null;
  const match = resolutionText.match(/---AGILE_BOARD_START_MARKER:(\d+)---/);
  return match ? parseInt(match[1], 10) : null;
}

async function closeSprintStatusOnServer(sprintId, resolutionText, actualEndDate, closureSummary) {
  const record = {
    [CONFIG.SPRINT_STATUS_FIELD_KEY]: { name: "Closed" },
    [CONFIG.SPRINT_ACTUAL_END_FIELD_KEY]: { value: String(actualEndDate) },
    [CONFIG.SPRINT_CLOSURE_SUMMARY_FIELD_KEY]: closureSummary || ""
  };
  if (resolutionText !== undefined) record[CONFIG.SPRINT_RESOLUTION_FIELD_KEY] = resolutionText || "";
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPRINTS}/${sprintId}`, "PUT", { [CONFIG.MODULE_SPRINTS_SINGULAR]: record });
}

async function startSprintOnServer(sprintId, actualStartDate) {
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPRINTS}/${sprintId}`, "PUT", {
    [CONFIG.MODULE_SPRINTS_SINGULAR]: {
      [CONFIG.SPRINT_STATUS_FIELD_KEY]: { name: "Active" },
      [CONFIG.SPRINT_ACTUAL_START_FIELD_KEY]: { value: String(actualStartDate) },
      [CONFIG.SPRINT_ACTUAL_END_FIELD_KEY]: null,
      [CONFIG.SPRINT_CLOSURE_SUMMARY_FIELD_KEY]: ""
    }
  });
}

async function closeSprint(sprintId, resolutionText, targetSprintId = null, movementMode = null) {
  const sprint = sprints.find(s => String(s.id) === String(sprintId));
  if (!sprint) return;

  const allSprintTickets = tickets.filter(t => String(t.sprintId) === String(sprintId));
  const unfinished = allSprintTickets.filter(t => !isTicketClosed(t));
  const actualEndDate = Date.now();
  const closureSummary = buildSprintClosureSummary(unfinished, targetSprintId, movementMode);
  const fullResolution = (resolutionText || "").trim();
  const movedSuccessfully = [];

  try {
    // Önce bitmemiş işleri taşı. Son adımda Sprint'i Closed yapıyoruz. Kapanış kaydı başarısız
    // olursa taşınmış işleri eski Sprint'e geri döndürmeyi best-effort deneriz; yarım kapanmış
    // bir Sprint bırakmak yerine tutarlılığı koruruz.
    for (const t of unfinished) {
      await updateSprintOnTicketServer(t.id, targetSprintId);
      movedSuccessfully.push(t);
    }

    let resolutionPersisted = true;
    try {
      await closeSprintStatusOnServer(sprintId, fullResolution, actualEndDate, closureSummary);
    } catch (statusErr) {
      const msg = String(statusErr?.message || "").toLowerCase();
      if (msg.includes("too long") || msg.includes("value provided")) {
        await closeSprintStatusOnServer(sprintId, "", actualEndDate, closureSummary);
        resolutionPersisted = false;
      } else {
        throw statusErr;
      }
    }

    movedSuccessfully.forEach(t => { t.sprintId = targetSprintId; });
    sprint.status = "Closed";
    sprint.actualEndDate = actualEndDate;
    sprint.closureSummary = closureSummary;
    sprint.resolution = resolutionPersisted ? fullResolution : "";

    const targetSprint = targetSprintId ? sprints.find(s => String(s.id) === String(targetSprintId)) : null;
    const moveMessage = unfinished.length > 0
      ? (targetSprintId
          ? `${unfinished.length} bağlı iş ${targetSprint?.name || "seçilen sprint"} sprintine taşındı.`
          : `${unfinished.length} bağlı iş Backlog'a taşındı.`)
      : "";
    const resolutionMessage = !resolutionPersisted
      ? " Çözüm notu SDP Resolution alanının karakter limitini aştığı için kaydedilemedi."
      : "";
    showToast(`Sprint kapatıldı.${moveMessage ? ` ${moveMessage}` : ""}${resolutionMessage}`, resolutionPersisted ? "success" : "warning");
    populateFilters();
    renderAll();
  } catch (err) {
    // Kapanış tamamlanamadıysa taşınmış işleri mümkün olduğunca eski Sprint'e döndür.
    for (const t of movedSuccessfully.reverse()) {
      try { await updateSprintOnTicketServer(t.id, sprintId); } catch (_) {}
    }
    try { await loadData(false); } catch (_) {}
    showToast(`Sprint kapatılamadı: ${err.message}`, "error");
  }
}

