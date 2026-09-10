/* Sprint loading, technician directory and assignment enrichment */
async function fetchSprints() {
  const raw = await fetchPagedSdpList(`/api/v3/${CONFIG.MODULE_SPRINTS}`, CONFIG.MODULE_SPRINTS);
  return raw.map(s => ({
    id: String(s.id),
    name: s.name || "İsimsiz Sprint",
    goal: s[CONFIG.SPRINT_GOAL_FIELD_KEY] || "",
    startDate: s[CONFIG.SPRINT_START_DATE_FIELD_KEY]?.value ? parseInt(s[CONFIG.SPRINT_START_DATE_FIELD_KEY].value, 10) : null,
    endDate: s[CONFIG.SPRINT_END_DATE_FIELD_KEY]?.value ? parseInt(s[CONFIG.SPRINT_END_DATE_FIELD_KEY].value, 10) : null,
    actualStartDate: s[CONFIG.SPRINT_ACTUAL_START_FIELD_KEY]?.value ? parseInt(s[CONFIG.SPRINT_ACTUAL_START_FIELD_KEY].value, 10) : null,
    actualEndDate: s[CONFIG.SPRINT_ACTUAL_END_FIELD_KEY]?.value ? parseInt(s[CONFIG.SPRINT_ACTUAL_END_FIELD_KEY].value, 10) : null,
    closureSummary: s[CONFIG.SPRINT_CLOSURE_SUMMARY_FIELD_KEY] || "",
    resolution: s[CONFIG.SPRINT_RESOLUTION_FIELD_KEY] || "",
    createdTime: s.created_time?.display_value || "",
    createdBy: s.created_by?.name || "",
    updatedTime: s.updated_time?.display_value || "",
    status: s[CONFIG.SPRINT_STATUS_FIELD_KEY]?.name || "Future",
    spaceId: s[CONFIG.SPRINT_SPACE_ID_FIELD_KEY] || null
  }));
}

// SDP'nin kendi native, alan-bazlı uç noktası — Reference Entity alanına kurduğun kriteri
// (örn. Support Group) zaten kendisi uyguluyor. Modül ve alan adı, o modülün URL'inde ve
// yanıt anahtarında BİREBİR aynı isimle geçiyor (canlı testle doğrulandı).
async function fetchSdpFilteredAssignees(modulePlural, fieldKey) {
  const raw = await fetchPagedSdpList(`/api/v3/${modulePlural}/${fieldKey}`, fieldKey);
  return raw
    .filter(u => u?.id != null && u?.name)
    .map(u => ({ id: String(u.id), name: String(u.name) }));
}

async function refreshAssignees() {
  // SDP'nin kendi native, alan-bazlı uç noktasını deneyelim — Reference Entity'ye kurduğun
  // kriteri (Support Group vs.) zaten kendisi uyguluyor, bizim ayrıca filtrelememize gerek yok.
  try {
    assignees = await fetchSdpFilteredAssignees(CONFIG.MODULE_EPICS, CONFIG.EPIC_ASSIGNEE_FIELD_KEY);
  } catch (sdpFilterErr) {
    console.warn("SDP'nin native filtrelenmiş listesi alınamadı, teknisyen listesine düşülüyor:", sdpFilterErr);
    try {
      const techs = await fetchPagedSdpList(`/api/v3/technicians`, "technicians");
      assignees = techs
        .filter(u => {
          const status = typeof u.status === "object" ? u.status?.name : u.status;
          return !status || String(status).toUpperCase() === "ACTIVE";
        })
        .map(u => ({ id: String(u.id), name: String(u.name || u.display_name || "İsimsiz Teknisyen") }));
    } catch (techErr) {
      console.warn("Teknisyen endpoint'i alınamadı, users listesine son yedek olarak düşülüyor:", techErr);
      try {
        const users = await fetchPagedSdpList(`/api/v3/users`, "users");
        assignees = users
          .filter(u => {
            const status = typeof u.status === "object" ? u.status?.name : u.status;
            return u.is_technician && (!status || String(status).toUpperCase() === "ACTIVE");
          })
          .map(u => ({ id: String(u.id), name: String(u.name || u.display_name || "İsimsiz Teknisyen") }));
      } catch (usersErr) {
        console.warn("Yedek kullanıcı listesi de alınamadı; son bilinen teknisyen listesi korunuyor:", usersErr);
      }
    }
  }

  // Aynı teknisyenin birden fazla endpoint'ten gelmesi ihtimaline karşı ID bazında tekilleştir.
  assignees = Array.from(new Map(assignees.filter(a => a?.id).map(a => [String(a.id), a])).values());

  // Bu fonksiyon yalnız teknisyen listesini yeniler; oturum kimliği resolveIdentityFromWidgetContext() ile salt-okuma çözülür.
  // Space'e her girişte (ve chat açılınca yedek olarak) otomatik çalışıyor.
}

async function fetchSprintAssignments(ticketList) {
  const results = {};
  const toFetch = [];

  for (const ticket of ticketList) {
    const id = String(ticket.id);
    const cached = ticketUdfCache.get(id);
    if (cached && cached.lastUpdatedTimeMs === ticket.lastUpdatedTimeMs) {
      results[id] = { sprintId: cached.sprintId, epicId: cached.epicId, spaceId: cached.spaceId, workItemType: cached.workItemType };
    } else {
      toFetch.push(ticket);
    }
  }

  const chunkSize = 10;
  for (let i = 0; i < toFetch.length; i += chunkSize) {
    const chunk = toFetch.slice(i, i + chunkSize);
    const chunkResults = await Promise.all(chunk.map(async (ticket) => {
      try {
        const resp = await fetch(`/api/v3/requests/${ticket.id}`, {
          method: "GET",
          credentials: "same-origin",
          headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
        });
        if (!resp.ok) return null;
        const data = await resp.json();
        const udf = data.request?.udf_fields || {};
        const rawType = udf[CONFIG.WORK_ITEM_TYPE_FIELD_KEY];
        const result = {
          id: String(ticket.id),
          sprintId: normalizeUdfReferenceValue(udf[CONFIG.SPRINT_ID_FIELD_KEY]),
          epicId: normalizeUdfReferenceValue(udf[CONFIG.EPIC_ID_FIELD_KEY]),
          spaceId: normalizeUdfReferenceValue(udf[CONFIG.SPACE_ID_FIELD_KEY]),
          workItemType: (rawType && typeof rawType === "object" ? rawType.name : rawType) || ticket.workItemType || "Task"
        };
        ticketUdfCache.set(result.id, { lastUpdatedTimeMs: ticket.lastUpdatedTimeMs, ...result });
        return result;
      } catch (e) {
        return null;
      }
    }));
    chunkResults.forEach(r => { if (r) results[r.id] = { sprintId: r.sprintId, epicId: r.epicId, spaceId: r.spaceId, workItemType: r.workItemType }; });
  }

  // Artık sistemde bulunmayan ticket'ların cache'ini zamanla temizle.
  const liveIds = new Set(ticketList.map(t => String(t.id)));
  for (const id of ticketUdfCache.keys()) if (!liveIds.has(id)) ticketUdfCache.delete(id);
  return results;
}

