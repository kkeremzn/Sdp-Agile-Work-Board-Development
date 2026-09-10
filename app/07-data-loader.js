/* Space data orchestration, mapping, polling and task-summary enrichment */
async function loadData(isSilentRefresh = false) {
  try {
    const [sdpRequests, sprintList, epicList] = await Promise.all([fetchAllRequests(), fetchSprints(), fetchEpics()]);
    if (!isSilentRefresh || assignees.length === 0) await refreshAssignees();
    usingRealData = true;

    const oldTaskSummaries = new Map(tickets.map(t => [String(t.id), t.taskSummary]));

    boardColumns = DEFAULT_COLUMNS;
    sprints = sprintList.filter(s => !currentSpace || String(s.spaceId) === String(currentSpace.id));
    epics = epicList.filter(e => !currentSpace || String(e.spaceId) === String(currentSpace.id));
    tickets = mapSdpRequestsToTickets(sdpRequests);
    tickets.forEach(t => {
      const known = oldTaskSummaries.get(String(t.id));
      if (known) t.taskSummary = known;
    });

    const extraFields = await fetchSprintAssignments(tickets);
    tickets.forEach(t => {
      if (t.id in extraFields) {
        t.sprintId = extraFields[t.id].sprintId;
        t.epicId = extraFields[t.id].epicId;
        t.spaceId = extraFields[t.id].spaceId;
        t.workItemType = extraFields[t.id].workItemType;
      }
    });

    if (currentSpace) {
      tickets = tickets.filter(t => String(t.spaceId) === String(currentSpace.id));
    }

    extractMetadata(tickets);
    lastDataRefreshAt = Date.now();

    if (!isSilentRefresh) {
        showToast("Veriler SDP'den başarıyla yüklendi", "success");
        populateFilters();
        startPolling(); 
    }
    
    renderAll();

    if (!isSilentRefresh) {
      backfillTaskSummaries(tickets.map(t => t.id));
    }
  } catch (err) {
    console.error("Veri çekilemedi:", err);
    const hadSuccessfulData = usingRealData && lastDataRefreshAt != null;
    if (!hadSuccessfulData) {
      usingRealData = false;
      lastDataRefreshAt = null;
      boardColumns = [...DEFAULT_COLUMNS];
      tickets = [];
      sprints = [];
      epics = [];
      if (!isSilentRefresh) {
        showToast(`SDP verileri yüklenemedi: ${err.message}`, "error");
        populateFilters();
        renderAll();
      }
    } else if (!isSilentRefresh) {
      // Kısa süreli ağ/API hatasında son başarılı gerçek veriyi koru. "Lokal mod" diye
      // sunucuya yazmadan çalışan sahte bir duruma geçmek veri tutarlılığı açısından tehlikeliydi.
      showToast(`Yenileme başarısız. Son başarılı veriler ekranda korunuyor: ${err.message}`, "warning");
      renderAll();
    }
  }
}

function isAnyOverlayOpen() {
  const ids = ["detailDrawer", "sprintDetailModal", "taskDetailModal", "newSprintModal", "resolutionModal", "confirmModal", "spaceSelectorScreen", "newSpaceModal", "newEpicModal", "epicDetailModal", "newIssueModal", "closeSprintOptionsModal", "settingsWizardModal", "deleteSpaceModal", "chatPanel"];
  return isDragging || ids.some(id => document.getElementById(id)?.classList.contains("open"));
}

function startPolling() {
  if (isPollingStarted) return;
  isPollingStarted = true;

  setInterval(() => {
    if (!usingRealData || isAnyOverlayOpen()) return;
    loadData(true); 
  }, 45000); 
}

function extractMetadata(ticketList) {
  const prioritySet = new Map(KNOWN_PRIORITIES.map(p => [p, p])); 
  ticketList.forEach(t => {
    if (t.priority && !prioritySet.has(t.priority)) {
      prioritySet.set(t.priority, t.priority); 
    }
  });
  priorities = Array.from(prioritySet.values());
}


function normalizeUdfReferenceValue(value) {
  if (value == null || value === "") return null;
  if (typeof value === "object") {
    const candidate = value.id ?? value.value ?? value.name ?? null;
    return candidate == null || candidate === "" ? null : String(candidate);
  }
  return String(value);
}

function mapSdpRequestsToTickets(sdpRequests) {
  return sdpRequests.map(r => {
    const priorityName = r.priority?.name || "Medium";
    const sdpStatusObj = r.status || {};
    const sdpStatusId = sdpStatusObj.id || "2"; 
    const sdpStatusName = sdpStatusObj.name || "Open";
    const statusColor = safeCssColor(sdpStatusObj.color);
    const priorityColor = safeCssColor(r.priority?.color);

    // SDP'nin kendi hesapladığı gerçek son teslim tarihini (due_by_time) tek kaynak olarak kullanıyoruz —
    // önceliğe göre tahmin yürütmek yanıltıcıydı (Critical olmak "süresi geçti" demek değil), kaldırıldı.
    const isDone = ["1", "4"].includes(String(sdpStatusId)); // Closed veya Resolved
    let slaStatus = "None"; // Varsayılan: tarih hiç girilmemiş

    if (isDone) {
      // İş zaten bitmiş — artık "süre riski" diye bir şey kalmadı, kırmızı/turuncu göstermek yanlış olur
      slaStatus = "Healthy";
    } else if (r.due_by_time && r.due_by_time.value && r.due_by_time.value !== "-1" && r.due_by_time.value !== "0") {
        const dueDateMs = parseInt(r.due_by_time.value, 10);
        const nowMs = Date.now();
        const timeLeftMs = dueDateMs - nowMs;

        if (timeLeftMs < 0) {
            slaStatus = "Breached";
        } else {
            // Sabit "24 saatten az kaldı" eşiği, kısa SLA pencerelerinde (örn. Medium önceliğe sadece
            // 2 saat tanınan bir kurulumda) işi oluşturulduğu andan itibaren hep "At Risk" gösteriyordu.
            // Bunun yerine, TOPLAM SLA penceresinin YÜZDE KAÇININ kaldığına bakıyoruz — kısa ya da uzun
            // pencerede orantılı ve anlamlı kalıyor.
            const createdMs = r.created_time?.value ? parseInt(r.created_time.value, 10) : null;
            const totalWindowMs = createdMs ? (dueDateMs - createdMs) : null;

            if (totalWindowMs && totalWindowMs > 0) {
                const percentRemaining = timeLeftMs / totalWindowMs;
                slaStatus = percentRemaining < 0.2 ? "At Risk" : "Healthy"; // Son %20'lik dilimde riskli say
            } else {
                // Oluşturulma tarihi okunamazsa eski (sabit 24 saat) mantığa güvenli şekilde düş
                slaStatus = timeLeftMs < (24 * 60 * 60 * 1000) ? "At Risk" : "Healthy";
            }
        }
    }


    const udfRaw = r.udf_fields || null;
    const rawType = udfRaw?.[CONFIG.WORK_ITEM_TYPE_FIELD_KEY];
    const workItemTypeValue = (rawType && typeof rawType === "object" ? rawType.name : rawType) || "Task";

    return {
      id: r.id,
      title: r.subject || "Başlıksız Kayıt",
      description: r.description || "Açıklama bulunmuyor.",
      type: r.template?.name || "Incident",
      priority: priorityName,
      status: String(sdpStatusId), 
      statusName: sdpStatusName,
      statusColor: statusColor,
      priorityColor: priorityColor,
      assigneeId: r.technician?.id || null,
      assigneeName: r.technician?.name || "Atanmamış",
      sprintId: normalizeUdfReferenceValue(udfRaw?.[CONFIG.SPRINT_ID_FIELD_KEY]),
      epicId: normalizeUdfReferenceValue(udfRaw?.[CONFIG.EPIC_ID_FIELD_KEY]),
      spaceId: normalizeUdfReferenceValue(udfRaw?.[CONFIG.SPACE_ID_FIELD_KEY]),
      taskSummary: null, 
      workItemType: workItemTypeValue,
      createdTimeMs: r.created_time?.value ? parseInt(r.created_time.value, 10) : null,
      createdBy: r.created_by?.name || "Bilinmiyor",
      resolutionText: r.resolution?.content || "",
      lastUpdatedTimeMs: r.last_updated_time?.value ? parseInt(r.last_updated_time.value, 10) : null,
      category: r.group?.name || "Genel",
      slaStatus: slaStatus
    };
  });
}


async function backfillTaskSummaries(ticketIds) {
  const chunkSize = 10;
  for (let i = 0; i < ticketIds.length; i += chunkSize) {
    const chunk = ticketIds.slice(i, i + chunkSize);
    await Promise.all(chunk.map(async (id) => {
      try {
        const resp = await fetch(`/api/v3/requests/${id}/tasks`, {
          credentials: "same-origin",
          headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
        });
        if (!resp.ok) return;
        const data = await resp.json();
        const taskList = data.tasks || [];
        const ticket = tickets.find(t => String(t.id) === String(id));
        if (ticket) {
          const done = taskList.filter(t => ["Resolved", "Closed"].includes(t.status?.name)).length;
          ticket.taskSummary = taskList.length > 0 ? { done, total: taskList.length } : null;
        }
      } catch (e) {
        // Alt görev özeti yalnız görsel zenginleştirmedir; tek bir request'in task endpoint'i
        // erişilemezse ana iş listesini başarısız sayma. Bir sonraki yenilemede tekrar denenir.
      }
    }));
    if (!isAnyOverlayOpen()) renderAll(); 
  }
}
