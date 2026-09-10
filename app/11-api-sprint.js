/* Sprint relation and Sprint custom module API */
async function updateSprintOnTicketServer(ticketId, sprintId) {
  const payload = {
    request: {
      udf_fields: {
        [CONFIG.SPRINT_ID_FIELD_KEY]: sprintId || ""
      }
    }
  };
  const result = await sdpApiFetch(`/api/v3/requests/${ticketId}`, "PUT", payload);
  ticketUdfCache.delete(String(ticketId));
  return result;
}

async function deleteSprintOnServer(sprintId) {
  return deleteCustomModuleRecord(CONFIG.MODULE_SPRINTS, sprintId);
}

async function updateSprintOnServer(sprintId, { name, goal, startDate, endDate }) {
  const payload = { [CONFIG.MODULE_SPRINTS_SINGULAR]: {} };
  if (name !== undefined) payload[CONFIG.MODULE_SPRINTS_SINGULAR].name = name;
  if (goal !== undefined) payload[CONFIG.MODULE_SPRINTS_SINGULAR][CONFIG.SPRINT_GOAL_FIELD_KEY] = goal;
  if (startDate !== undefined) payload[CONFIG.MODULE_SPRINTS_SINGULAR][CONFIG.SPRINT_START_DATE_FIELD_KEY] = { value: String(startDate) };
  if (endDate !== undefined) payload[CONFIG.MODULE_SPRINTS_SINGULAR][CONFIG.SPRINT_END_DATE_FIELD_KEY] = { value: String(endDate) };
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPRINTS}/${sprintId}`, "PUT", payload);
}

async function createSprintOnServer({ name, goal, startDate, endDate }) {
  const payload = {
    [CONFIG.MODULE_SPRINTS_SINGULAR]: {
      name,
      [CONFIG.SPRINT_GOAL_FIELD_KEY]: goal || "",
      [CONFIG.SPRINT_STATUS_FIELD_KEY]: { name: "Future" },
      [CONFIG.SPRINT_START_DATE_FIELD_KEY]: { value: String(startDate) },
      [CONFIG.SPRINT_END_DATE_FIELD_KEY]: { value: String(endDate) },
      [CONFIG.SPRINT_SPACE_ID_FIELD_KEY]: currentSpace ? currentSpace.id : ""
    }
  };
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPRINTS}`, "POST", payload);
}

// ---------- Sprint Yaşam Döngüsü ----------
// StartDate / EndDate yalnızca PLANLANAN DateTime değerleridir.
// ActualStartDate, kullanıcı "Sprint'i Başlat" dediği gerçek an; ActualEndDate ise
// başarılı kapanışın gerçek anıdır. ClosureSummary yalnız taşınan işlerin ID/destinasyonunu
// kompakt biçimde saklar; Resolution alanına operasyonel JSON gömülmez.
