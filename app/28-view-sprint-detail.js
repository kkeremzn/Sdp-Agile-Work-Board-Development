/* Sprint detail view, reopen/delete and linked work management */
async function loadSprintDetailAttachments(sprintId) {
  const section = document.getElementById("sprintDetailAttachmentSection");
  if (!section) return;
  section.innerHTML = `<h4>${attachmentIconSvg()} Ekler</h4><div class="muted" style="font-size:12px;">Yükleniyor...</div>`;
  try {
    const data = await sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPRINTS}/${sprintId}/attachments`, "GET");
    const attachments = data?.attachments || [];
    section.innerHTML = attachmentSectionHtml("sprintDetailAttach");
    bindAttachmentSectionLive("sprintDetailAttach", "sprint", sprintId, attachments, isManager);
  } catch (err) {
    section.innerHTML = `<h4>${attachmentIconSvg()} Ekler</h4><div class="muted" style="font-size:12px;">Ekler alınamadı: ${err.message}</div>`;
  }
}

function openSprintDetail(sprintId) {
  const sprint = sprints.find(s => String(s.id) === String(sprintId));
  if (!sprint) return;

  const sprintTickets = tickets.filter(t => String(t.sprintId) === String(sprintId));
  const done = sprintTickets.filter(t => isTicketClosed(t)).length;
  const total = sprintTickets.length;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const candidateTickets = tickets.filter(t => !t.sprintId && !isTicketClosed(t));

  const addTicketHtml = (isManager && isStatusActive(sprint)) ? `
    <div class="sprint-add-ticket">
      <select id="sprintAddTicketSelect">
        <option value="">+ Backlog'dan iş ekle...</option>
        ${candidateTickets.map(t => `<option value="${t.id}">#${t.id} — ${escapeHtml(t.title)}</option>`).join("")}
      </select>
      <button id="sprintAddTicketBtn" class="secondary-btn">Ekle</button>
    </div>
  ` : "";

  const ticketListHtml = sprintTickets.length > 0
    ? sprintTickets.map(t => {
        const isMine = currentUser && String(t.assigneeId) === String(currentUser.id);
        const rowClass = (!isManager && !isMine) ? "sprint-ticket-mini dim" : "sprint-ticket-mini";
        const removeBtnHtml = (isManager && isStatusActive(sprint))
          ? `<button class="sprint-ticket-remove-btn" data-remove-id="${t.id}" data-tip="Sprintten çıkar">${removeXIconSvg()}</button>`
          : `<span></span>`;
        return `
          <div class="${rowClass}" data-id="${t.id}">
            <span class="sprint-ticket-title"><span class="work-item-icon">${workItemTypeIcon(t.workItemType)}</span> ${issueKey(t)} <span class="sprint-ticket-title-text">${escapeHtml(t.title)}</span></span>
            <span class="priority-badge" style="background:${t.priorityColor}1a; color:${t.priorityColor};">${escapeHtml(t.priority)}</span>
            <span class="sprint-ticket-status" style="color:${t.statusColor};">${escapeHtml(t.statusName)}</span>
            <span class="sprint-ticket-assignee">${escapeHtml(t.assigneeName || "Atanmamış")}</span>
            ${removeBtnHtml}
          </div>
        `;
      }).join("")
    : '<div class="empty-state" style="padding:24px;"><p>Bu sprint\'te henüz ticket yok.</p></div>';

  const closeBtnHtml = (isManager && isStatusActive(sprint))
    ? `<button class="secondary-btn" id="sprintDetailCloseSprintBtn" data-sprint-id="${sprint.id}">Sprint'i Kapat</button>`
    : "";
  const reopenBtnHtml = (isManager && isStatusClosed(sprint))
    ? `<button class="secondary-btn" id="sprintDetailReopenBtn" data-sprint-id="${sprint.id}">Yeniden Aç</button>`
    : "";
  const editBtnHtml = isManager
    ? `<button class="secondary-btn" id="sprintDetailEditBtn">Düzenle</button>`
    : "";
  const deleteBtnHtml = isManager
    ? `<button class="secondary-btn" id="sprintDetailDeleteBtn" style="color:var(--danger); border-color:var(--danger);">Sil</button>`
    : "";

  const modal = document.getElementById("sprintDetailModal");
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-card sprint-detail-card">
      <div class="drawer-header" style="margin-bottom:16px;">
        <div>
          <span class="sprint-status-badge" style="background:${spaceStatusColor(sprint.status)}22; color:${spaceStatusColor(sprint.status)};">${sprint.status}</span>
          <h2 style="margin-top:8px; display:flex; align-items:center; gap:8px;">${issueKey(sprint)} <span style="color:var(--primary); display:inline-flex;">${sprintIconSvg()}</span> ${escapeHtml(sprint.name)}</h2>
        </div>
        <button id="closeSprintDetailBtn" class="icon-btn">×</button>
      </div>
      <p class="sprint-goal">${escapeHtml(sprint.goal || "Hedef belirtilmemiş.")}</p>
      <div class="sprint-dates">
        <span><strong>Planlanan başlangıç:</strong> ${formatDateTime(sprint.startDate)}</span>
        <span><strong>Planlanan bitiş:</strong> ${formatDateTime(sprint.endDate)}</span>
        <span><strong>Gerçek başlangıç:</strong> ${formatDateTime(sprint.actualStartDate || parseSprintStartMarker(sprint.resolution))}</span>
        <span><strong>Gerçek kapanış:</strong> ${formatDateTime(sprint.actualEndDate)}</span>
      </div>
      <div class="sprint-progress-bar-wrap"><div class="sprint-progress-bar" style="width:${progressPct}%;"></div></div>
      <div class="sprint-progress">${done}/${total} tamamlandı (%${progressPct})</div>
      ${(() => {
        const note = sprint.status === "Closed" ? humanResolutionNote(sprint.resolution).trim() : "";
        return note ? `<div class="field-group"><label>${checkCircleIconSvg()} Kapanış Notu</label><div class="drawer-resolution-text">${escapeHtml(note)}</div></div>` : "";
      })()}
      ${addTicketHtml}
      <h3 class="sprint-detail-subheading">Sprint'teki İşler</h3>
      <div class="sprint-ticket-list">${ticketListHtml}</div>
      <div id="sprintDetailAttachmentSection"></div>
      <div class="drawer-section">
        <h3 class="sprint-detail-subheading">Geçmiş</h3>
        <ul id="sprintDetailHistory"></ul>
      </div>
      <div class="modal-actions" style="margin-top:20px;">
        ${deleteBtnHtml}
        ${editBtnHtml}
        ${closeBtnHtml}
        ${reopenBtnHtml}
        <button class="secondary-btn" id="closeSprintDetailBtn2">Kapat</button>
      </div>
    </div>
  `;
  modal.classList.add("open");
  loadSprintDetailAttachments(sprint.id);
  (async () => {
    try {
      const fresh = await sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPRINTS}/${sprint.id}`, "GET");
      const freshSprint = fresh?.[CONFIG.MODULE_SPRINTS_SINGULAR];
      const sprintHistory = [];
      if (sprint.status === "Closed" && sprint.resolution) {
        const cleanNote = humanResolutionNote(sprint.resolution).trim();
        if (cleanNote) sprintHistory.push(`Kapatıldı — Açıklama: "${cleanNote}"`);
      }
      if (sprint.actualEndDate) sprintHistory.push(`Gerçek kapanış: ${formatDateTime(sprint.actualEndDate)}`);
      if (sprint.actualStartDate || parseSprintStartMarker(sprint.resolution)) sprintHistory.push(`Gerçek başlangıç: ${formatDateTime(sprint.actualStartDate || parseSprintStartMarker(sprint.resolution))}`);
      if (sprint.endDate) sprintHistory.push(`Planlanan bitiş: ${formatDateTime(sprint.endDate)}`);
      if (sprint.startDate) sprintHistory.push(`Planlanan başlangıç: ${formatDateTime(sprint.startDate)}`);
      if (freshSprint?.updated_time?.display_value && freshSprint?.updated_by?.name) {
        sprintHistory.push(`Son güncelleme: ${freshSprint.updated_time.display_value} (${freshSprint.updated_by.name})`);
      }
      if (freshSprint?.created_time?.display_value) {
        sprintHistory.push(`Oluşturuldu: ${freshSprint.created_time.display_value}${freshSprint.created_by?.name ? ` (${freshSprint.created_by.name})` : ""}`);
      }
      const historyEl = document.getElementById("sprintDetailHistory");
      if (historyEl) renderCollapsibleHistory(historyEl, sprintHistory.reverse(), (h) => `<li>${escapeHtml(h)}</li>`);
    } catch (err) {
      console.warn("Sprint geçmişi alınamadı:", err);
    }
  })();

  const closeModal = () => modal.classList.remove("open");
  document.getElementById("closeSprintDetailBtn")?.addEventListener("click", closeModal);
  document.getElementById("closeSprintDetailBtn2")?.addEventListener("click", closeModal);

  modal.querySelectorAll(".sprint-ticket-mini").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".sprint-ticket-remove-btn")) return; 
      drawerReturnTo = { type: "sprint", id: sprintId };
      closeModal();
      openDrawer(el.dataset.id);
    });
  });

  modal.querySelectorAll(".sprint-ticket-remove-btn").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ticketId = btn.dataset.removeId;
      const ticket = tickets.find(t => String(t.id) === String(ticketId));
      if (!ticket) return;
      const ok = await promptConfirm(`"${ticket.title}" sprintten çıkarılsın mı? (İş silinmez, sadece sprintle bağlantısı kesilir.)`);
      if (!ok) return;

      const oldSprintId = ticket.sprintId;
      ticket.sprintId = null;
      try {
        if (usingRealData) await updateSprintOnTicketServer(ticket.id, null);
        showToast("İş sprintten çıkarıldı.", "success");
        renderAll();
        openSprintDetail(sprintId); 
      } catch (err) {
        ticket.sprintId = oldSprintId;
        showToast(err.message, "error");
      }
    });
  });

  const addBtn = document.getElementById("sprintAddTicketBtn");
  if (addBtn) {
    addBtn.addEventListener("click", async () => {
      const select = document.getElementById("sprintAddTicketSelect");
      const ticketId = select.value;
      if (!ticketId) return;
      const ticket = tickets.find(t => String(t.id) === String(ticketId));
      if (!ticket) return;

      const oldSprintId = ticket.sprintId;
      ticket.sprintId = sprint.id;

      try {
        if (usingRealData) await updateSprintOnTicketServer(ticket.id, sprint.id);
        showToast("İş sprint'e eklendi.", "success");
        renderAll();
        openSprintDetail(sprintId); 
      } catch (err) {
        ticket.sprintId = oldSprintId;
        showToast(err.message, "error");
      }
    });
  }

  document.getElementById("sprintDetailCloseSprintBtn")?.addEventListener("click", async () => {
    closeModal();
    await promptAndCloseSprint(sprintId);
  });

  document.getElementById("sprintDetailReopenBtn")?.addEventListener("click", async () => {
    const ok = await promptConfirm("Bu sprint yeniden aktif hale getirilsin mi (Active durumuna alınacak)?");
    if (!ok) return;
    const oldStatus = sprint.status;
    const oldActualStart = sprint.actualStartDate;
    const oldActualEnd = sprint.actualEndDate;
    const reopenedAt = Date.now();
    sprint.status = "Active";
    try {
      await startSprintOnServer(sprintId, reopenedAt);
      sprint.actualStartDate = reopenedAt;
      sprint.actualEndDate = null;
      sprint.closureSummary = "";
      showToast("Sprint yeniden açıldı. Yeni gerçek başlangıç zamanı kaydedildi.", "success");
      closeModal();
      renderAll();
    } catch (err) {
      sprint.status = oldStatus;
      sprint.actualStartDate = oldActualStart;
      sprint.actualEndDate = oldActualEnd;
      showToast(`Sprint yeniden açılamadı: ${err.message}`, "error");
    }
  });

  document.getElementById("sprintDetailEditBtn")?.addEventListener("click", () => {
    closeModal();
    openEditSprintModal(sprint);
  });

  document.getElementById("sprintDetailDeleteBtn")?.addEventListener("click", async () => {
    const linkedCount = tickets.filter(t => String(t.sprintId) === String(sprint.id)).length;
    const warningText = linkedCount > 0
      ? `"${sprint.name}" silinsin mi? İçinde ${linkedCount} iş var, silince bu işler Backlog'a döner (işlerin kendisi silinmez). Bu işlem geri alınamaz.`
      : `"${sprint.name}" kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`;
    const ok = await promptConfirm(warningText);
    if (!ok) return;

    try {
      const linkedTickets = tickets.filter(t => String(t.sprintId) === String(sprint.id));
      for (const t of linkedTickets) {
        await updateSprintOnTicketServer(t.id, null);
      }
      await deleteSprintOnServer(sprint.id);
      sprints = sprints.filter(s => String(s.id) !== String(sprint.id));
      tickets.forEach(t => { if (String(t.sprintId) === String(sprint.id)) t.sprintId = null; });
      closeModal();
      showToast("Sprint silindi.", "success");
      populateFilters();
      renderAll();
    } catch (err) {
      showToast(`Sprint silme işlemi tamamlanamadı: ${err.message}. Sunucudaki gerçek durum yeniden yükleniyor.`, "error");
      try { await loadData(); } catch (reloadErr) { console.warn("Sunucu durumu yeniden yüklenemedi:", reloadErr); }
    }
  });
}
