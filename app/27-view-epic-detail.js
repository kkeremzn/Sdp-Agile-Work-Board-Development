/* Epic detail view and attachment flow */
async function loadEpicDetailAttachments(epicId) {
  const section = document.getElementById("epicDetailAttachmentSection");
  if (!section) return;
  section.innerHTML = `<h4>${attachmentIconSvg()} Ekler</h4><div class="muted" style="font-size:12px;">Yükleniyor...</div>`;
  try {
    const data = await sdpApiFetch(`/api/v3/${CONFIG.MODULE_EPICS}/${epicId}/attachments`, "GET");
    const attachments = data?.attachments || [];
    section.innerHTML = attachmentSectionHtml("epicDetailAttach");
    bindAttachmentSectionLive("epicDetailAttach", "epic", epicId, attachments, isManager);
  } catch (err) {
    section.innerHTML = `<h4>${attachmentIconSvg()} Ekler</h4><div class="muted" style="font-size:12px;">Ekler alınamadı: ${err.message}</div>`;
  }
}

function openEpicDetail(epicId) {
  const epic = epics.find(e => String(e.id) === String(epicId));
  if (!epic) return;

  const epicTickets = tickets.filter(t => String(t.epicId) === String(epicId));
  const done = epicTickets.filter(t => isTicketClosed(t)).length;
  const total = epicTickets.length;
  const progressPct = total > 0 ? Math.round((done / total) * 100) : 0;

  const isClosed = epic.status === "Closed" || epic.status === "Resolved";

  const addTicketHtml = (isManager && !isClosed)
    ? `<button id="epicAddIssueBtn" class="secondary-btn" style="margin-bottom:16px;">+ Bu Epic'e İş Ekle</button>`
    : "";

  const ticketListHtml = epicTickets.length > 0
    ? epicTickets.map(t => {
        const isMine = currentUser && String(t.assigneeId) === String(currentUser.id);
        const rowClass = (!isManager && !isMine) ? "sprint-ticket-mini dim" : "sprint-ticket-mini";
        const typeIcon = workItemTypeIcon(t.workItemType);
        const removeBtnHtml = (isManager && !isClosed)
          ? `<button class="sprint-ticket-remove-btn" data-remove-id="${t.id}" data-tip="Epic'ten çıkar">${removeXIconSvg()}</button>`
          : `<span></span>`;
        return `
          <div class="${rowClass}" data-id="${t.id}">
            <span class="sprint-ticket-title"><span class="work-item-icon">${typeIcon}</span> ${issueKey(t)} <span class="sprint-ticket-title-text">${escapeHtml(t.title)}</span></span>
            <span class="priority-badge" style="background:${t.priorityColor}1a; color:${t.priorityColor};">${escapeHtml(t.priority)}</span>
            <span class="sprint-ticket-status" style="color:${t.statusColor};">${escapeHtml(t.statusName)}</span>
            <span class="sprint-ticket-assignee">${escapeHtml(t.assigneeName || "Atanmamış")}</span>
            ${removeBtnHtml}
          </div>
        `;
      }).join("")
    : '<div class="empty-state" style="padding:24px;"><p>Bu epic\'e henüz iş bağlanmamış.</p></div>';

  const closeBtnHtml = isManager
    ? (isClosed
        ? `<button class="secondary-btn" id="epicDetailReopenBtn" data-epic-id="${epic.id}">Yeniden Aç</button>`
        : `<button class="secondary-btn" id="epicDetailCloseBtn" data-epic-id="${epic.id}">Epic'i Kapat</button>`)
    : "";
  const deleteBtnHtml = isManager
    ? `<button class="secondary-btn" id="epicDetailDeleteBtn" style="color:var(--danger); border-color:var(--danger);">Sil</button>`
    : "";

  // "Düzenle" için ayrı bir pencereye artık gerek yok — Drawer'daki gibi, alanlar doğrudan
  // burada düzenlenebiliyor (attachment eklemenin zaten ayrı bir modal gerektirmediği gibi).
  // Yönetici değilse ya da Epic kapalıysa alanlar salt okunur.
  const fieldsEditable = isManager;
  const assigneeOptionsHtml = '<option value="">Atanmamış</option>' +
    assignees.map(a => `<option value="${a.id}" ${String(epic.assigneeId) === String(a.id) ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("");

  const modal = document.getElementById("epicDetailModal");
  if (!modal) return;

  modal.innerHTML = `
    <div class="modal-card sprint-detail-card">
      <div class="drawer-header" style="margin-bottom:16px;">
        <div style="flex:1; min-width:0;">
          <span class="sprint-status-badge" style="background:${spaceStatusColor(epic.status)}22; color:${spaceStatusColor(epic.status)};">${epic.status}</span>
          <div style="display:flex; align-items:center; gap:8px; margin-top:8px;">
            <span style="color:#8B5CF6; display:inline-flex; flex-shrink:0;">${epicIconSvg()}</span>
            <span class="backlog-row-key" style="flex-shrink:0;">${issueKeyText(epic)}</span>
            <input id="epicDetailName" type="text" value="${escapeAttr(epic.name)}" ${fieldsEditable ? "" : "disabled"}
              style="flex:1; min-width:0; font-size:18px; font-weight:700; border:none; background:transparent; color:var(--text); padding:2px 4px; border-radius:4px;" />
          </div>
        </div>
        <button id="closeEpicDetailBtn" class="icon-btn">×</button>
      </div>

      <div class="field-group">
        <label>Açıklama</label>
        <textarea id="epicDetailDescription" rows="3" placeholder="Bu epic ne için var, hedefi ne?" ${fieldsEditable ? "" : "disabled"}>${escapeHtml(epic.description || "")}</textarea>
      </div>
      <div class="drawer-meta" style="grid-template-columns:minmax(180px, 240px) minmax(220px, 280px); margin-bottom:14px;">
        <div class="field-group">
          <label>Durum</label>
          <select id="epicDetailStatus" ${fieldsEditable ? "" : "disabled"}>
            ${["Open","Assigned","In Progress","Onhold","Resolved","Closed"].map(s => `<option value="${s}" ${s === (epic.status || "Open") ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
        <div class="field-group">
          <label>${personIconSvg()} Teknisyen</label>
          <select id="epicDetailAssignee" ${fieldsEditable ? "" : "disabled"}>${assigneeOptionsHtml}</select>
        </div>
      </div>

      <div class="sprint-progress-bar-wrap"><div class="sprint-progress-bar" style="width:${progressPct}%;"></div></div>
      <div class="sprint-progress">${done}/${total} iş tamamlandı (%${progressPct})</div>
      ${!isClosed ? `<div class="epic-finalize-note ${getEpicUnfinishedTickets(epic.id).length ? "warn" : "ready"}">${getEpicUnfinishedTickets(epic.id).length ? `Epic'i Resolved/Closed yapabilmek için önce ${getEpicUnfinishedTickets(epic.id).length} bağlı iş tamamlanmalı. Bağlı işler otomatik kapatılmaz.` : "Tüm bağlı işler tamamlandı. Epic artık güvenle Resolved veya Closed yapılabilir."}</div>` : ""}

      ${addTicketHtml}
      <h3 class="sprint-detail-subheading">Epic'teki İşler (${total})</h3>
      <div class="sprint-ticket-list">${ticketListHtml}</div>
      <div id="epicDetailAttachmentSection"></div>
      <div class="drawer-section">
        <h3 class="sprint-detail-subheading">Geçmiş</h3>
        <ul id="epicDetailHistory"></ul>
      </div>
      <div class="modal-actions" style="margin-top:20px;">
        ${deleteBtnHtml}
        ${closeBtnHtml}
        <button class="secondary-btn" id="closeEpicDetailBtn2">Kapat</button>
        ${fieldsEditable ? '<button class="primary-btn" id="epicDetailSaveBtn">Kaydet</button>' : ""}
      </div>
    </div>
  `;
  modal.classList.add("open");
  loadEpicDetailAttachments(epic.id);

  // Önce custom module'ün gerçek _history endpoint'ini kullanmayı deniyoruz. SDP sürümü
  // custom module history desteklemiyorsa yalnızca tekil kaydın güvenilir oluşturulma / güncellenme
  // meta bilgisini "Sınırlı geçmiş" olarak gösteriyoruz; bunu tam history gibi sunmuyoruz.
  (async () => {
    const historyEl = document.getElementById("epicDetailHistory");
    if (!historyEl) return;
    try {
      const response = await fetch(`/api/v3/${CONFIG.MODULE_EPICS}/${epic.id}/_history`, {
        method: "GET", credentials: "same-origin",
        headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
      });
      if (response.ok) {
        const data = await response.json();
        const raw = data.history || [];
        const noise = new Set(["ISREAD", "From Host/IP Address", "Host/IP Address"]);
        const rows = raw.filter(h => h.operation !== "READ").map(h => {
          const diffs = (h.diff || []).filter(d => d.field && !noise.has(d.field)).map(d => {
            const prev = d.previous_value && d.previous_value !== "null" ? d.previous_value : "—";
            const curr = d.current_value && d.current_value !== "null" ? d.current_value : "—";
            return `${d.field}: ${prev} → ${curr}`;
          }).join(", ");
          const when = [h.client_time?.date, h.client_time?.time].filter(Boolean).join(" ");
          return `${h.operation_name || h.operation || "İşlem"}${diffs ? ` — ${diffs}` : ""}${h.by?.name ? ` — ${h.by.name}` : ""}${when ? `, ${when}` : ""}`;
        }).filter(Boolean);
        if (rows.length) {
          renderCollapsibleHistory(historyEl, rows, h => `<li>${escapeHtml(h)}</li>`);
          return;
        }
      }
      const fresh = await sdpApiFetch(`/api/v3/${CONFIG.MODULE_EPICS}/${epic.id}`, "GET");
      const freshEpic = fresh?.[CONFIG.MODULE_EPICS_SINGULAR];
      const fallback = [];
      if (freshEpic?.updated_time?.display_value) fallback.push(`Son güncelleme: ${freshEpic.updated_time.display_value}${freshEpic.updated_by?.name ? ` (${freshEpic.updated_by.name})` : ""}`);
      if (freshEpic?.created_time?.display_value) fallback.push(`Oluşturuldu: ${freshEpic.created_time.display_value}${freshEpic.created_by?.name ? ` (${freshEpic.created_by.name})` : ""}`);
      historyEl.innerHTML = `<li class="muted" style="margin-bottom:8px;">Bu SDP sürümünde Epic için ayrıntılı history endpoint'i kullanılamadı. Aşağıda kayıt meta bilgisi gösteriliyor.</li>${fallback.map(h => `<li>${escapeHtml(h)}</li>`).join("") || '<li>Geçmiş bilgisi bulunamadı.</li>'}`;
    } catch (err) {
      historyEl.innerHTML = `<li class="muted">Epic geçmişi alınamadı: ${escapeHtml(err.message)}</li>`;
      console.warn("Epic geçmişi alınamadı:", err);
    }
  })();

  const closeModal = () => modal.classList.remove("open");
  document.getElementById("closeEpicDetailBtn")?.addEventListener("click", closeModal);
  document.getElementById("closeEpicDetailBtn2")?.addEventListener("click", closeModal);

  document.getElementById("epicDetailSaveBtn")?.addEventListener("click", async () => {
    const name = document.getElementById("epicDetailName").value.trim();
    const description = document.getElementById("epicDetailDescription").value.trim();
    const status = document.getElementById("epicDetailStatus").value;
    const assigneeId = document.getElementById("epicDetailAssignee").value || null;

    if (["Resolved", "Closed"].includes(status)) {
      const unfinished = getEpicUnfinishedTickets(epic.id);
      if (unfinished.length) {
        showToast(`Epic ${status} yapılamaz. Önce ${unfinished.length} bağlı işi Resolved/Closed yapmalısın.`, "warning");
        document.getElementById("epicDetailStatus").value = epic.status || "Open";
        return;
      }
    }

    if (!name) {
      showToast("Epic adı boş olamaz.", "warning");
      return;
    }
    const hasChanges = name !== epic.name || description !== (epic.description || "") || status !== (epic.status || "Open") || String(assigneeId) !== String(epic.assigneeId || "");
    if (!hasChanges) {
      showToast("Değişiklik yapılmadı.", "warning");
      return;
    }

    const saveBtn = document.getElementById("epicDetailSaveBtn");
    saveBtn.disabled = true;
    try {
      await updateEpicOnServer(epic.id, { name, description, status, assigneeId });
      Object.assign(epic, {
        name, description, status, assigneeId,
        assigneeName: assignees.find(a => String(a.id) === String(assigneeId))?.name || "Atanmamış"
      });
      showToast("Epic güncellendi.", "success");
      closeModal();
      renderAll();
    } catch (err) {
      showToast(`Kaydedilemedi: ${err.message}`, "error");
    } finally {
      saveBtn.disabled = false;
    }
  });

  modal.querySelectorAll(".sprint-ticket-mini").forEach(el => {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".sprint-ticket-remove-btn")) return;
      drawerReturnTo = { type: "epic", id: epicId };
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
      const ok = await promptConfirm(`"${ticket.title}" epic'ten çıkarılsın mı? (İş silinmez, sadece epic bağlantısı kesilir.)`);
      if (!ok) return;

      const oldEpicId = ticket.epicId;
      ticket.epicId = null;
      try {
        if (usingRealData) await updateEpicOnTicketServer(ticket.id, null);
        showToast("İş epic'ten çıkarıldı.", "success");
        renderAll();
        openEpicDetail(epicId);
      } catch (err) {
        ticket.epicId = oldEpicId;
        showToast(err.message, "error");
      }
    });
  });

  document.getElementById("epicAddIssueBtn")?.addEventListener("click", () => {
    closeModal();
    epicDetailReturnAfterIssue = epic.id;
    openNewIssueModal(epic.id);
  });

  document.getElementById("epicDetailCloseBtn")?.addEventListener("click", async () => {
    const unfinished = getEpicUnfinishedTickets(epicId);
    if (unfinished.length) {
      showToast(`Epic kapatılamaz. Önce ${unfinished.length} bağlı işi Resolved/Closed yapmalısın. Bağlı işler otomatik kapatılmaz.`, "warning");
      return;
    }
    const ok = await promptConfirm("Bu Epic Closed yapılsın mı? Bağlı işler zaten tamamlandığı için bağlı işlerde değişiklik yapılmayacak.");
    if (!ok) return;
    closeModal();
    await closeEpic(epicId);
  });

  document.getElementById("epicDetailReopenBtn")?.addEventListener("click", async () => {
    const ok = await promptConfirm("Bu epic yeniden aktif hale getirilsin mi?");
    if (!ok) return;
    closeModal();
    await reopenEpic(epicId);
  });

  document.getElementById("epicDetailDeleteBtn")?.addEventListener("click", async () => {
    const linkedCount = tickets.filter(t => String(t.epicId) === String(epic.id)).length;
    const warningText = linkedCount > 0
      ? `"${epic.name}" silinsin mi? İçinde ${linkedCount} iş var, silince bu işlerin Epic bağlantısı kaybolur (işlerin kendisi silinmez). Bu işlem geri alınamaz.`
      : `"${epic.name}" kalıcı olarak silinsin mi? Bu işlem geri alınamaz.`;
    const ok = await promptConfirm(warningText);
    if (!ok) return;

    try {
      const linkedTickets = tickets.filter(t => String(t.epicId) === String(epic.id));
      // Önce her bağlı işin Epic bağlantısını SDP'de GERÇEKTEN temizliyoruz — daha önce bu adım
      // eksikti, sadece yerel görünüm güncelleniyordu, SDP'de kayıt olduğu gibi kalıyordu.
      for (const t of linkedTickets) {
        await updateEpicOnTicketServer(t.id, null);
      }
      await deleteEpicOnServer(epic.id);
      epics = epics.filter(e => String(e.id) !== String(epic.id));
      tickets.forEach(t => { if (String(t.epicId) === String(epic.id)) t.epicId = null; });
      closeModal();
      showToast("Epic silindi.", "success");
      renderAll();
    } catch (err) {
      showToast(`Epic silme işlemi tamamlanamadı: ${err.message}. Sunucudaki gerçek durum yeniden yükleniyor.`, "error");
      try { await loadData(); } catch (reloadErr) { console.warn("Sunucu durumu yeniden yüklenemedi:", reloadErr); }
    }
  });
}

