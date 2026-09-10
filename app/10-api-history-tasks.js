/* Request history and native SDP Task API */
/* Request history, native SDP Tasks, Sprint relation and Sprint CRUD API */
async function fetchTicketRawHistory(ticketId) {
  const response = await fetch(`/api/v3/requests/${ticketId}/_history`, {
    method: "GET",
    credentials: "same-origin",
    headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
  });
  if (!response.ok) throw new Error(`Geçmiş alınamadı: ${response.status}`);
  const data = await response.json();
  const raw = data.history || [];
  // SDP, geçmişi EN YENİDEN EN ESKİYE doğru döndürüyor (Drawer'daki daraltılmış görünümün
  // history[0]'ı tek başına göstermesinden bunu doğruladık — en son olay budur). Kendi
  // ayrıştırdığımız (saat dilimi kaymasına açık, güvenilmez) tarihlere göre yeniden sıralamak
  // yerine, SDP'nin doğal, garantili doğru sırasına güveniyoruz — sadece ESKİDEN YENİYE çevirmek
  // için diziyi ters çeviriyoruz, bir daha hiç sıralama yapmıyoruz.
  return raw
    .filter(h => h.operation !== "READ")
    .reverse()
    .map(h => {
      let timestamp = h.client_time?.value ? parseInt(h.client_time.value, 10) : null;
      // Bazı SDP sürümlerinde client_time'ın ham epoch değeri olmayabilir — o zaman
      // "date" + "time" görüntü metinlerinden geriye doğru bir tarih inşa etmeyi deniyoruz.
      if (!timestamp && h.client_time?.date) {
        const parsed = new Date(`${h.client_time.date} ${h.client_time.time || ""}`).getTime();
        if (!isNaN(parsed)) timestamp = parsed;
      }
      return {
        timestamp,
        byName: h.by?.name || "Bilinmiyor",
        diffs: (h.diff || []).filter(d => d.field)
      };
    });
}

async function fetchTicketHistory(ticketId) {
  const response = await fetch(`/api/v3/requests/${ticketId}/_history`, {
    method: "GET",
    credentials: "same-origin",
    headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
  });
  if (!response.ok) throw new Error(`Geçmiş alınamadı: ${response.status}`);
  const data = await response.json();
  const raw = data.history || [];

  // SDP'nin _history'si, "biri açtı/gördü" (READ) gibi anlamsız gürültü kayıtları da döndürüyor —
  // bunlar "kim ne zaman ne yaptı" açısından bilgi taşımıyor, filtreliyoruz.
  const NOISE_FIELDS = ["ISREAD", "From Host/IP Address", "Host/IP Address"];

  return raw
    .filter(h => h.operation !== "READ")
    .map(h => {
      const diffText = (h.diff || [])
        .filter(d => d.field && !NOISE_FIELDS.includes(d.field))
        .map(d => {
          const prev = (d.previous_value && d.previous_value !== "null") ? d.previous_value : "—";
          return `${d.field}: ${prev} → ${d.current_value}`;
        })
        .join(", ");
      return {
        operationName: h.operation_name || h.operation || "İşlem",
        byName: h.by?.name || "Sistem",
        date: h.client_time?.date || "",
        time: h.client_time?.time || "",
        diffText
      };
    })
    .filter(h => h.diffText || h.operationName !== "Updated"); // İçeriği tamamen gürültüden ibaret olan "Updated" kayıtlarını da at
}

async function fetchTicketTasks(ticketId) {
  const response = await fetch(`/api/v3/requests/${ticketId}/tasks`, {
    method: "GET",
    credentials: "same-origin",
    headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
  });
  if (!response.ok) throw new Error(`Alt görevler alınamadı: ${response.status}`);
  const data = await response.json();
  const raw = data.tasks || [];
  return raw.map(t => ({
    id: t.id,
    title: t.title,
    description: t.description || "",
    ownerId: t.owner?.id || null,
    ownerName: t.owner?.name || "Atanmamış",
    statusName: t.status?.name || "Open"
  }));
}

async function createTicketTaskOnServer(ticketId, { title, description, ownerId, scheduledStart, scheduledEnd, priority }) {
  const payload = {
    task: {
      title,
      status: { name: "Open" }
    }
  };
  if (description) payload.task.description = description;
  if (ownerId) payload.task.owner = { id: ownerId };
  if (priority) payload.task.priority = { name: priority };
  if (scheduledStart) payload.task.scheduled_start_time = { value: String(scheduledStart) };
  if (scheduledEnd) payload.task.scheduled_end_time = { value: String(scheduledEnd) };
  return sdpApiFetch(`/api/v3/requests/${ticketId}/tasks`, "POST", payload);
}

async function fetchTaskDetail(ticketId, taskId) {
  const response = await fetch(`/api/v3/requests/${ticketId}/tasks/${taskId}`, {
    method: "GET",
    credentials: "same-origin",
    headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
  });
  if (!response.ok) throw new Error(`Alt görev detayı alınamadı: ${response.status}`);
  const data = await response.json();
  return data.task || {};
}

async function updateTaskDetailOnServer(ticketId, taskId, fields) {
  const payload = { task: {} };
  if (fields.description !== undefined) payload.task.description = fields.description || "";
  if (fields.scheduledEnd) payload.task.scheduled_end_time = { value: String(fields.scheduledEnd) };
  if (fields.priority !== undefined) payload.task.priority = fields.priority ? { name: fields.priority } : null;
  if (fields.ownerId !== undefined) payload.task.owner = fields.ownerId ? { id: fields.ownerId } : null;
  if (fields.status !== undefined) {
    payload.task.status = { name: fields.status };
  }
  return sdpApiFetch(`/api/v3/requests/${ticketId}/tasks/${taskId}`, "PUT", payload);
}

