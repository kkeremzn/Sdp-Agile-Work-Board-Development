/* Space custom module API */
async function fetchSpaces() {
  const raw = await fetchPagedSdpList(`/api/v3/${CONFIG.MODULE_SPACES}`, CONFIG.MODULE_SPACES);
  return raw.map(s => ({
    id: String(s.id),
    name: s.name || "İsimsiz Space",
    key: s[CONFIG.SPACE_KEY_FIELD_KEY] || "",
    description: s[CONFIG.SPACE_DESCRIPTION_FIELD_KEY] || "",
    assigneeId: s[CONFIG.SPACE_ASSIGNEE_FIELD_KEY]?.id || null,
    assigneeName: s[CONFIG.SPACE_ASSIGNEE_FIELD_KEY]?.name || "Atanmamış"
  }));
}

async function createSpaceOnServer({ name, key, description, assigneeId }) {
  const payload = { [CONFIG.MODULE_SPACES_SINGULAR]: { name, [CONFIG.SPACE_KEY_FIELD_KEY]: key, [CONFIG.SPACE_DESCRIPTION_FIELD_KEY]: description || "" } };
  if (assigneeId) payload[CONFIG.MODULE_SPACES_SINGULAR][CONFIG.SPACE_ASSIGNEE_FIELD_KEY] = { id: assigneeId };
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPACES}`, "POST", payload);
}

// SDP'nin custom modülleri doğrudan DELETE'i kabul etmiyor — önce "çöp kutusuna" taşımak
// (is_trashed: true) gerekiyor, ancak ondan sonra kalıcı silme (DELETE) çalışıyor.
// SDP'nin resmi dokümantasyonuna göre doğrulanmış format:
// 1) PUT .../_move_to_trash?ids=<id>  → çöp kutusuna taşır
// 2) DELETE .../{modül}?ids=<id>      → kalıcı siler (path'te değil, query'de id)
// Doğrulandı: bu on-premise SDP sürümünde ayrı bir "çöpe taşı" adımına gerek yok,
// tek bir DELETE (?ids= query param ile) doğrudan işi görüyor.
async function deleteCustomModuleRecord(modulePlural, id) {
  return sdpApiFetch(`/api/v3/${modulePlural}?ids=${id}`, "DELETE", {});
}

// Request (ticket) modülünün kendi özel endpoint'i — custom modüllerdeki gibi
// query param değil, path'e eklenen /move_to_trash ile, DELETE metoduyla çalışıyor.
async function deleteTicketOnServer(ticketId) {
  return sdpApiFetch(`/api/v3/requests/${ticketId}/move_to_trash`, "DELETE", {});
}

async function deleteSpaceOnServer(spaceId) {
  return deleteCustomModuleRecord(CONFIG.MODULE_SPACES, spaceId);
}

async function updateSpaceOnServer(spaceId, { name, key, description, assigneeId }) {
  const payload = { [CONFIG.MODULE_SPACES_SINGULAR]: {} };
  if (name !== undefined) payload[CONFIG.MODULE_SPACES_SINGULAR].name = name;
  if (key !== undefined) payload[CONFIG.MODULE_SPACES_SINGULAR][CONFIG.SPACE_KEY_FIELD_KEY] = key;
  if (description !== undefined) payload[CONFIG.MODULE_SPACES_SINGULAR][CONFIG.SPACE_DESCRIPTION_FIELD_KEY] = description;
  if (assigneeId !== undefined) payload[CONFIG.MODULE_SPACES_SINGULAR][CONFIG.SPACE_ASSIGNEE_FIELD_KEY] = assigneeId ? { id: assigneeId } : null;
  return sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPACES}/${spaceId}`, "PUT", payload);
}

