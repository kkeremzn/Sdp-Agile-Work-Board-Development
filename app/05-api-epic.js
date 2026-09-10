/* Epic custom module + Request/Epic relation API */
async function fetchEpics() {
  const raw = await fetchPagedSdpList(`/api/v3/${CONFIG.MODULE_EPICS}`, CONFIG.MODULE_EPICS);
  return raw.map(e => ({
    id: String(e.id),
    name: e.name || "İsimsiz Epic",
    description: e[CONFIG.EPIC_DESCRIPTION_FIELD_KEY] || "",
    status: e[CONFIG.EPIC_STATUS_FIELD_KEY]?.name || "Open",
    spaceId: e[CONFIG.EPIC_SPACE_ID_FIELD_KEY] || null,
    assigneeId: e[CONFIG.EPIC_ASSIGNEE_FIELD_KEY]?.id || null,
    assigneeName: e[CONFIG.EPIC_ASSIGNEE_FIELD_KEY]?.name || "Atanmamış",
    createdTime: e.created_time?.display_value || "",
    createdBy: e.created_by?.name || ""
  }));
}
// Yepyeni bir Story/Task/Bug oluşturur — bizim özel template'imizle, Space/Epic/İş Tipi otomatik bağlanır
async function createTicketOnServer({ subject, description, workItemType, priority, epicId, assigneeId }) {
  const payload = {
    request: {
      subject,
      description: description || "",
      template: { name: CONFIG.AGILE_TEMPLATE_NAME },
      priority: { name: priority },
      udf_fields: {
        [CONFIG.WORK_ITEM_TYPE_FIELD_KEY]: { name: workItemType },
        [CONFIG.SPACE_ID_FIELD_KEY]: currentSpace ? currentSpace.id : ""
      }
    }
  };
  if (currentUser?.id) payload.request.requester = { id: currentUser.id };
  if (epicId) payload.request.udf_fields[CONFIG.EPIC_ID_FIELD_KEY] = epicId;
  if (assigneeId) payload.request.technician = { id: assigneeId };
  return sdpApiFetch(`/api/v3/requests`, "POST", payload);
}

async function deleteEpicOnServer(epicId) {
  return deleteCustomModuleRecord(CONFIG.MODULE_EPICS, epicId);
}

async function updateEpicOnServer(epicId, { name, description, status, assigneeId }) {
  const payload = { [CONFIG.MODULE_EPICS_SINGULAR]: {} };
  if (name !== undefined) payload[CONFIG.MODULE_EPICS_SINGULAR].name = name;
  if (description !== undefined) payload[CONFIG.MODULE_EPICS_SINGULAR][CONFIG.EPIC_DESCRIPTION_FIELD_KEY] = description;
  if (status !== undefined) payload[CONFIG.MODULE_EPICS_SINGULAR][CONFIG.EPIC_STATUS_FIELD_KEY] = { name: status };
  if (assigneeId !== undefined) payload[CONFIG.MODULE_EPICS_SINGULAR][CONFIG.EPIC_ASSIGNEE_FIELD_KEY] = assigneeId ? { id: assigneeId } : null;
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_EPICS}/${epicId}`, "PUT", payload);
}

async function createEpicOnServer({ name, description, status, assigneeId }) {
  const payload = {
    [CONFIG.MODULE_EPICS_SINGULAR]: {
      name,
      [CONFIG.EPIC_DESCRIPTION_FIELD_KEY]: description || "",
      [CONFIG.EPIC_STATUS_FIELD_KEY]: { name: status || "Open" },
      [CONFIG.EPIC_SPACE_ID_FIELD_KEY]: currentSpace ? currentSpace.id : ""
    }
  };
  if (assigneeId) payload[CONFIG.MODULE_EPICS_SINGULAR][CONFIG.EPIC_ASSIGNEE_FIELD_KEY] = { id: assigneeId };
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_EPICS}`, "POST", payload);
}

async function updateEpicStatusOnServer(epicId, statusName) {
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_EPICS}/${epicId}`, "PUT", { [CONFIG.MODULE_EPICS_SINGULAR]: { [CONFIG.EPIC_STATUS_FIELD_KEY]: { name: statusName } } });
}

async function updateEpicOnTicketServer(ticketId, epicId) {
  const payload = { request: { udf_fields: { [CONFIG.EPIC_ID_FIELD_KEY]: epicId || "" } } };
  const result = await sdpApiFetch(`/api/v3/requests/${ticketId}`, "PUT", payload);
  ticketUdfCache.delete(String(ticketId));
  return result;
}

