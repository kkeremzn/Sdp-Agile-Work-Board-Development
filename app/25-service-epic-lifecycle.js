/* Epic close/reopen business rules */
/* Epic lifecycle, create/edit modals, Sprint details and entity details */
function getEpicUnfinishedTickets(epicId) {
  return tickets.filter(t => String(t.epicId) === String(epicId) && !dashboardTicketIsClosed(t));
}

async function closeEpic(epicId) {
  const epic = epics.find(e => String(e.id) === String(epicId));
  if (!epic) return;
  const unfinished = getEpicUnfinishedTickets(epicId);
  if (unfinished.length) {
    showToast(`Epic kapatılamaz. Önce ${unfinished.length} bağlı işi Resolved/Closed yapmalısın.`, "warning");
    return;
  }
  try {
    await updateEpicStatusOnServer(epicId, "Closed");
    epic.status = "Closed";
    showToast("Epic kapatıldı.", "success");
    renderAll();
  } catch (err) {
    showToast(`Epic kapatılamadı: ${err.message}`, "error");
  }
}

async function reopenEpic(epicId) {
  const epic = epics.find(e => String(e.id) === String(epicId));
  if (!epic) return;
  try {
    await updateEpicStatusOnServer(epicId, "Open");
    epic.status = "Open";
    showToast("Epic yeniden aktif edildi.", "success");
    renderAll();
  } catch (err) {
    showToast(`Epic yeniden açılamadı: ${err.message}`, "error");
  }
}

