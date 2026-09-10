/* Work item drawer, activity, native tasks and save flow */
function openDrawer(ticketId) {
  selectedTicketId = ticketId;
  const ticket = tickets.find(t => String(t.id) === String(ticketId));
  if (!ticket) return;

  const canEdit = isManager || (currentUser && String(ticket.assigneeId) === String(currentUser.id));

  drawerDraft = {
    status: ticket.status,
    assigneeId: ticket.assigneeId,
    sprintId: ticket.sprintId,
    epicId: ticket.epicId,
    priority: ticket.priority,
    workItemType: ticket.workItemType
  };

  document.getElementById("drawerTicketId").innerText = issueKeyText(ticket);
  document.getElementById("drawerTitle").innerText = ticket.title;

  const parentEl = document.getElementById("drawerParentEpic");
  if (parentEl) {
    const parentEpic = ticket.epicId ? epics.find(e => String(e.id) === String(ticket.epicId)) : null;
    if (parentEpic) {
      parentEl.innerHTML = `${epicIconSvg()} Parent: ${escapeHtml(parentEpic.name)}`;
      parentEl.style.display = "";
    } else {
      parentEl.style.display = "none";
    }
  }
  document.getElementById("drawerDescription").innerText = ticket.description;

  const workItemTypeEl = document.getElementById("drawerWorkItemType");
  if(workItemTypeEl) {
    workItemTypeEl.value = ticket.workItemType;
    workItemTypeEl.disabled = true; 
  }

  const statusEl = document.getElementById("drawerStatus");
  if(statusEl) {
    statusEl.value = ticket.status;
    statusEl.disabled = !canEdit; 
  }

  const resolutionBox = document.getElementById("drawerResolutionBox");
  if (resolutionBox) {
    const isDone = isTicketClosed(ticket);
    if (isDone && ticket.resolutionText) {
      resolutionBox.style.display = "";
      resolutionBox.innerHTML = `
        <div class="field-group">
          <label>${checkCircleIconSvg()} Çözüm</label>
          <div class="drawer-resolution-text">${escapeHtml(ticket.resolutionText)}</div>
        </div>
      `;
    } else {
      resolutionBox.style.display = "none";
      resolutionBox.innerHTML = "";
    }
  }
  
  const assigneeEl = document.getElementById("drawerAssignee");
  if(assigneeEl) assigneeEl.value = ticket.assigneeId || "";

  const sprintEl = document.getElementById("drawerSprint");
  if(sprintEl) sprintEl.value = ticket.sprintId || "";

  const epicEl = document.getElementById("drawerEpic");
  if(epicEl) epicEl.value = ticket.epicId || "";
  
  const prioEl = document.getElementById("drawerPriority");
  if(prioEl) {
    prioEl.value = ticket.priority;
    prioEl.disabled = !canEdit;
  }

  const slaEl = document.getElementById("drawerSla");
  if(slaEl) slaEl.value = ticket.slaStatus;

  loadDrawerActivity(ticket.id);

  const saveBtn = document.getElementById("saveDrawerBtn");
  if (saveBtn) saveBtn.style.display = canEdit ? "" : "none"; 

  const addTaskBtn = document.getElementById("addTaskBtn");
  if (addTaskBtn) addTaskBtn.style.display = isManager ? "" : "none"; 

  loadDrawerTasks(ticket.id, canEdit);
  loadDrawerAttachments(ticket.id, canEdit);

  document.getElementById("detailDrawer").classList.add("open");
  document.getElementById("drawerOverlay").classList.add("open");
}

async function loadDrawerAttachments(ticketId, canEdit) {
  const section = document.getElementById("drawerAttachmentSection");
  if (!section) return;
  section.innerHTML = `<h4>${attachmentIconSvg()} Ekler</h4><div class="muted" style="font-size:12px;">Yükleniyor...</div>`;
  try {
    const data = await sdpApiFetch(`/api/v3/requests/${ticketId}/attachments`, "GET");
    const attachments = data?.attachments || [];
    section.innerHTML = attachmentSectionHtml("drawerAttach");
    bindAttachmentSectionLive("drawerAttach", "ticket", ticketId, attachments, canEdit);
  } catch (err) {
    section.innerHTML = `<h4>${attachmentIconSvg()} Ekler</h4><div class="muted" style="font-size:12px;">Ekler alınamadı: ${err.message}</div>`;
  }
}

function renderCollapsibleHistory(listEl, history, renderEntryFn) {
  if (!listEl) return;
  if (history.length === 0) {
    listEl.innerHTML = '<li class="muted">Henüz aktivite kaydı yok.</li>';
    return;
  }

  let expanded = false;
  function paint() {
    if (expanded) {
      listEl.innerHTML = history.map(renderEntryFn).join("") +
        `<li><button class="link-btn history-toggle-btn">Daralt</button></li>`;
    } else {
      listEl.innerHTML = renderEntryFn(history[0]) +
        (history.length > 1 ? `<li><button class="link-btn history-toggle-btn">Tümünü Göster (${history.length})</button></li>` : "");
    }
    const btn = listEl.querySelector(".history-toggle-btn");
    if (btn) btn.addEventListener("click", () => { expanded = !expanded; paint(); });
  }
  paint();
}

async function loadDrawerActivity(ticketId) {
  const listEl = document.getElementById("drawerActivity");
  if (!listEl) return;
  listEl.innerHTML = '<li class="muted">Yükleniyor...</li>';

  if (!usingRealData) {
    listEl.innerHTML = '<li class="muted">SDP bağlantısı yokken geçmiş yüklenemez.</li>';
    return;
  }

  try {
    const history = await fetchTicketHistory(ticketId);
    const renderEntry = (h) => `
      <li>
        <strong>${escapeHtml(h.operationName)}</strong> — ${escapeHtml(h.byName)}, ${escapeHtml(h.date)} ${escapeHtml(h.time)}
        ${h.diffText ? `<div class="history-diff">${escapeHtml(h.diffText)}</div>` : ""}
      </li>
    `;
    renderCollapsibleHistory(listEl, history, renderEntry);
  } catch (err) {
    listEl.innerHTML = `<li class="muted">Geçmiş yüklenemedi: ${err.message}</li>`;
  }
}

async function loadDrawerTasks(ticketId, canEdit) {
  const listEl = document.getElementById("drawerTaskList");
  if (!listEl) return;
  listEl.innerHTML = '<div class="muted" style="font-size:13px;">Yükleniyor...</div>';

  if (!usingRealData) {
    listEl.innerHTML = '<div class="muted" style="font-size:13px;">SDP bağlantısı yokken alt görevler yüklenemez.</div>';
    currentTicketTasks = [];
    return;
  }

  try {
    currentTicketTasks = await fetchTicketTasks(ticketId);
    renderDrawerTasks(ticketId, canEdit);
  } catch (err) {
    listEl.innerHTML = `<div class="muted" style="font-size:13px;">Alt görevler yüklenemedi: ${err.message}</div>`;
  }

  bindTaskAddForm(ticketId);
}

function renderDrawerTasks(ticketId, canEdit) {
  const listEl = document.getElementById("drawerTaskList");
  if (!listEl) return;

  if (currentTicketTasks.length === 0) {
    listEl.innerHTML = '<div class="muted" style="font-size:13px;">Henüz alt görev eklenmemiş.</div>';
    return;
  }

  listEl.innerHTML = currentTicketTasks.map(t => {
    const isTaskMine = currentUser && String(t.ownerId) === String(currentUser.id);
    const canEditTask = isManager || isTaskMine;
    const descHtml = t.description ? `<div class="task-description">${escapeHtml(t.description)}</div>` : "";
    return `
      <div class="task-row" data-task-id="${t.id}">
        <div class="task-row-top">
          <span class="task-title">${subtaskIconSvg()} <span class="backlog-row-key">${issueKeyText({id: ticketId})}-${t.id}</span> ${escapeHtml(t.title)}</span>
          <span class="task-owner">${t.ownerName}</span>
        </div>
        ${descHtml}
        <div class="task-row-bottom">
          <span class="sprint-status-badge" style="background:${spaceStatusColor(t.statusName)}22; color:${spaceStatusColor(t.statusName)};">${escapeHtml(t.statusName)}</span>
          <select class="task-status-select" data-task-id="${t.id}" ${canEditTask ? "" : "disabled"}>
            ${["Open", "Assigned", "In Progress", "Onhold", "Resolved", "Closed"].map(s => `<option value="${s}" ${s === t.statusName ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>
    `;
  }).join("");

  listEl.querySelectorAll(".task-row").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest(".task-status-select")) return; 
      openTaskDetail(ticketId, row.dataset.taskId);
    });
  });

  listEl.querySelectorAll(".task-status-select").forEach(sel => {
    sel.addEventListener("click", (e) => e.stopPropagation());
    sel.addEventListener("change", async (e) => {
      const taskId = e.target.dataset.taskId;
      const newStatus = e.target.value;
      const task = currentTicketTasks.find(t => String(t.id) === String(taskId));
      if (!task) return;
      const oldStatus = task.statusName;
      task.statusName = newStatus;
      try {
        await updateTaskDetailOnServer(ticketId, taskId, { status: newStatus });
        logTaskChange(taskId, `Durum "${newStatus}" olarak güncellendi`);
        showToast("Alt görev durumu güncellendi.", "success");
        renderAll();
      } catch (err) {
        task.statusName = oldStatus;
        renderDrawerTasks(ticketId, canEdit);
        showToast(err.message, "error");
      }
    });
  });
}

function bindTaskAddForm(ticketId) {
  const addBtn = document.getElementById("addTaskBtn");
  const form = document.getElementById("drawerTaskAddForm");
  const cancelBtn = document.getElementById("cancelTaskAddBtn");
  const submitBtn = document.getElementById("submitTaskAddBtn");
  const ownerSelect = document.getElementById("newTaskOwner");
  const prioritySelect = document.getElementById("newTaskPriority");

  if (ownerSelect) {
    ownerSelect.innerHTML = '<option value="">Sahipsiz</option>' +
      assignees.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  }
  if (prioritySelect) {
    prioritySelect.innerHTML = '<option value="">Belirtilmedi</option>' +
      priorities.map(p => `<option value="${p}">${escapeHtml(p)}</option>`).join("");
  }

  let newTaskAttachmentQueue = [];
  const attachSection = document.getElementById("newTaskAttachmentSection");
  const rebuildAttachSection = () => {
    if (attachSection) {
      attachSection.innerHTML = attachmentSectionHtml("newTaskAttach");
      bindAttachmentSectionQueued("newTaskAttach", newTaskAttachmentQueue);
    }
  };
  newTaskAttachmentQueue.length = 0;
  rebuildAttachSection();

  if (addBtn && form) {
    addBtn.onclick = () => { form.style.display = form.style.display === "none" ? "block" : "none"; };
  }
  if (cancelBtn && form) {
    cancelBtn.onclick = () => {
      form.style.display = "none";
      newTaskAttachmentQueue.length = 0;
      rebuildAttachSection();
    };
  }
  if (submitBtn) {
    submitBtn.onclick = async () => {
      const titleEl = document.getElementById("newTaskTitle");
      const descEl = document.getElementById("newTaskDescription");
      const startEl = document.getElementById("newTaskStart");
      const endEl = document.getElementById("newTaskEnd");
      const title = titleEl.value.trim();
      const description = descEl.value.trim();

      if (!title) {
        showToast("Alt görev başlığı zorunlu.", "warning");
        return;
      }

      let startMs = null;
      let endMs = null;
      if (startEl.value) startMs = new Date(startEl.value).getTime();
      if (endEl.value) endMs = new Date(endEl.value).getTime();
      if (startMs && endMs && endMs < startMs) {
        showToast("Bitiş tarihi başlangıçtan önce olamaz.", "warning");
        return;
      }

      const ownerId = ownerSelect.value || null;
      const priority = prioritySelect.value || null;

      submitBtn.disabled = true;
      const originalBtnText = submitBtn.textContent;
      try {
        const created = await createTicketTaskOnServer(ticketId, { title, description, ownerId, scheduledStart: startMs, scheduledEnd: endMs, priority });
        const newTaskId = created?.task?.id;

        let attachmentError = null;
        if (newTaskId && newTaskAttachmentQueue.length > 0) {
          submitBtn.textContent = "Dosyalar yükleniyor...";
          try {
            await flushAttachmentQueue("subtask", `${ticketId}_${newTaskId}`, newTaskAttachmentQueue, (fname, pct) => {
              submitBtn.textContent = `${fname}: %${pct}`;
            });
          } catch (attErr) {
            attachmentError = attErr;
          }
        }

        showToast(attachmentError ? `Alt görev eklendi ama dosya yüklenemedi: ${attachmentError.message}` : "Alt görev eklendi.", attachmentError ? "warning" : "success");
        titleEl.value = "";
        descEl.value = "";
        startEl.value = "";
        endEl.value = "";
        newTaskAttachmentQueue.length = 0;
        rebuildAttachSection();
        form.style.display = "none";
        currentTicketTasks = await fetchTicketTasks(ticketId);
        renderDrawerTasks(ticketId, true);
        renderAll();
      } catch (err) {
        showToast(`Alt görev eklenemedi: ${err.message}`, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText === "Dosyalar yükleniyor..." ? "Ekle" : originalBtnText;
      }
    };
  }
}

async function loadTaskDetailAttachments(ticketId, taskId, canEdit) {
  const section = document.getElementById("taskDetailAttachmentSection");
  if (!section) return;
  section.innerHTML = `<h4>${attachmentIconSvg()} Ekler</h4><div class="muted" style="font-size:12px;">Yükleniyor...</div>`;
  const compoundId = `${ticketId}_${taskId}`;
  try {
    const data = await sdpApiFetch(`${subtaskAttachmentBaseUrl(compoundId)}/attachments`, "GET");
    const attachments = data?.attachments || [];
    section.innerHTML = attachmentSectionHtml("taskDetailAttach");
    bindAttachmentSectionLive("taskDetailAttach", "subtask", compoundId, attachments, canEdit);
  } catch (err) {
    section.innerHTML = `<h4>${attachmentIconSvg()} Ekler</h4><div class="muted" style="font-size:12px;">Ekler alınamadı: ${err.message}</div>`;
  }
}

async function openTaskDetail(ticketId, taskId) {
  const modal = document.getElementById("taskDetailModal");
  if (!modal) return;

  modal.innerHTML = `<div class="modal-card sprint-detail-card"><div class="muted" style="padding:24px;">Yükleniyor...</div></div>`;
  modal.classList.add("open");

  let task;
  try {
    task = await fetchTaskDetail(ticketId, taskId);
  } catch (err) {
    modal.innerHTML = `<div class="modal-card sprint-detail-card"><div class="muted" style="padding:24px;">Yüklenemedi: ${err.message}</div></div>`;
    return;
  }

  const isTaskMine = currentUser && String(task.owner?.id) === String(currentUser.id);
  const canEditTask = isManager || isTaskMine;

  const toDateInputValue = (field) => {
    if (!field?.value) return "";
    return new Date(parseInt(field.value, 10)).toISOString().slice(0, 10);
  };

  const history = [];
  if (task.created_time?.display_value) history.push(`Oluşturuldu: ${task.created_time.display_value}`);
  if (task.owner?.name) history.push(`Sahip: ${task.owner.name}`);
  if (task.actual_start_time?.display_value) history.push(`Gerçek başlangıç: ${task.actual_start_time.display_value}`);
  if (task.actual_end_time?.display_value) history.push(`Gerçek bitiş: ${task.actual_end_time.display_value}`);
  if (task.last_updated_time?.display_value) history.push(`Son güncelleme: ${task.last_updated_time.display_value}`);
  history.reverse();

  const localHistory = taskLocalHistory[taskId] || [];
  const fullHistory = [...localHistory, ...history];

  const infoLines = [];
  if (task.created_time?.display_value) infoLines.push(`Oluşturulma Tarihi: ${task.created_time.display_value}`);
  infoLines.push(`Planlanan Başlangıç: ${task.scheduled_start_time?.display_value || "Belirtilmemiş"}`);

  modal.innerHTML = `
    <div class="modal-card sprint-detail-card">
      <div class="drawer-header" style="margin-bottom:16px;">
        <h2 style="display:flex; align-items:center; gap:8px;">${subtaskIconSvg()} <span class="backlog-row-key">${issueKeyText({id: ticketId})}-${taskId}</span> ${escapeHtml(task.title || "Alt Görev")}</h2>
        <button id="closeTaskDetailBtn" class="icon-btn">×</button>
      </div>
      <div class="task-info-line">${infoLines.join(" &nbsp;•&nbsp; ")}</div>
      <div class="drawer-meta" style="margin-bottom:24px; margin-top:16px;">
        <div class="field-group">
          <label>Sahip</label>
          <select id="taskDetailOwner" ${isManager ? "" : "disabled"}>
            <option value="">Sahipsiz</option>
            ${assignees.map(a => `<option value="${a.id}" ${String(task.owner?.id) === String(a.id) ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field-group">
          <label>Planlanan Bitiş</label>
          <input id="taskDetailEnd" type="date" value="${toDateInputValue(task.scheduled_end_time)}" ${canEditTask ? "" : "disabled"} />
        </div>
        <div class="field-group">
          <label>Öncelik (opsiyonel)</label>
          <select id="taskDetailPriority" ${canEditTask ? "" : "disabled"}>
            <option value="">Belirtilmedi</option>
            ${priorities.map(p => `<option value="${p}" ${task.priority?.name === p ? "selected" : ""}>${escapeHtml(p)}</option>`).join("")}
          </select>
        </div>
        <div class="field-group">
          <label>Durum</label>
          <select id="taskDetailStatus" ${canEditTask ? "" : "disabled"}>
            ${["Open", "Assigned", "In Progress", "Onhold", "Resolved", "Closed"].map(s => `<option value="${s}" ${s === (task.status?.name || "Open") ? "selected" : ""}>${s}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="drawer-section">
        <h3>Açıklama</h3>
        <textarea id="taskDetailDescription" rows="3" placeholder="Açıklama (opsiyonel)..." ${canEditTask ? "" : "disabled"}>${escapeHtml(task.description || "")}</textarea>
      </div>
      <div id="taskDetailAttachmentSection"></div>
      <div class="drawer-section">
        <h3>Geçmiş</h3>
        <ul id="taskDetailHistory"></ul>
      </div>
      <div class="modal-actions" style="margin-top:20px;">
        ${canEditTask ? '<button id="saveTaskDetailBtn" class="primary-btn">Kaydet</button>' : ""}
        <button id="closeTaskDetailBtn2" class="secondary-btn">Kapat</button>
      </div>
    </div>
  `;

  renderCollapsibleHistory(document.getElementById("taskDetailHistory"), fullHistory, (h) => `<li>${h}</li>`);
  loadTaskDetailAttachments(ticketId, taskId, canEditTask);

  const closeModal = () => modal.classList.remove("open");
  document.getElementById("closeTaskDetailBtn")?.addEventListener("click", closeModal);
  document.getElementById("closeTaskDetailBtn2")?.addEventListener("click", closeModal);

  document.getElementById("saveTaskDetailBtn")?.addEventListener("click", async () => {
    // GÜVENLİK: Drawer'daki aynı zafiyet burada da var — kaydetmeden hemen önce taze veriyle
    // sahipliği tekrar doğruluyoruz, sadece pencere açılırkenki (bayat) veriye güvenmiyoruz.
    if (!isManager) {
      try {
        const freshTask = await fetchTaskDetail(ticketId, taskId);
        const stillMine = currentUser && String(freshTask.owner?.id) === String(currentUser.id);
        if (!stillMine) {
          showToast("Bu alt görev artık sana atanmamış — değişiklik kaydedilmedi.", "error");
          closeModal();
          currentTicketTasks = await fetchTicketTasks(ticketId);
          renderDrawerTasks(ticketId, true);
          return;
        }
      } catch (err) {
        showToast("Yetki doğrulanamadı, değişiklik kaydedilmedi.", "error");
        return;
      }
    }

    const endVal = document.getElementById("taskDetailEnd").value;
    const endMs = endVal ? new Date(endVal).getTime() : null;
    const priority = document.getElementById("taskDetailPriority").value || null;
    const ownerId = document.getElementById("taskDetailOwner").value || null;
    const description = document.getElementById("taskDetailDescription").value.trim();
    const status = document.getElementById("taskDetailStatus").value;

    try {
      await updateTaskDetailOnServer(ticketId, taskId, { scheduledEnd: endMs, priority, ownerId, description, status });
      logTaskChange(taskId, `Alt görev güncellendi (Durum: ${status})`);
      showToast("Alt görev güncellendi.", "success");
      closeModal();
      currentTicketTasks = await fetchTicketTasks(ticketId);
      renderDrawerTasks(ticketId, true);
      renderAll();
    } catch (err) {
      showToast(`Kaydedilemedi: ${err.message}`, "error");
    }
  });
}

// GÜVENLİK: Teknisyenin düzenleme izni, drawer AÇILDIĞI andaki (bayat) yerel veriye göre
// hesaplanıyordu — eğer yönetici, drawer açıkken işi başka birine/atanmamışa çekerse, eski
// teknisyen hâlâ "yetkiliymiş gibi" değişiklik kaydedebiliyordu. Bu fonksiyon, KAYDETMEDEN
// hemen önce SDP'den taze veri çekip gerçek atamayı doğruluyor — sadece yerel state'e güvenmiyor.
async function verifyStillAuthorizedForTicket(ticketId) {
  if (isManager) return true; // Yönetici zaten her zaman yetkili
  try {
    const data = await sdpApiFetch(`/api/v3/requests/${ticketId}`, "GET");
    const freshAssigneeId = data?.request?.technician?.id || null;
    const stillAuthorized = currentUser && String(freshAssigneeId) === String(currentUser.id);
    if (!stillAuthorized) {
      showToast("Bu iş artık sana atanmamış — değişiklik kaydedilmedi.", "error");
      await loadData(); // Ekranı güncel duruma göre tazele, eski/bayat görünüm kalmasın
    }
    return stillAuthorized;
  } catch (err) {
    console.warn("Yetki doğrulaması başarısız, güvenli tarafta kalıp reddediyoruz:", err);
    showToast("Yetki doğrulanamadı, değişiklik kaydedilmedi. Tekrar dener misin?", "error");
    return false;
  }
}

async function saveDrawerChanges() {
  const ticket = tickets.find(t => t.id === selectedTicketId);
  if (!ticket) return;

  if (!(await verifyStillAuthorizedForTicket(ticket.id))) return;

  const payload = { request: {} };
  let hasChanges = false;
  const isStatusChanging = drawerDraft.status !== ticket.status;

  if (isStatusChanging) {
    const statusObj = STATUS_MAP[drawerDraft.status];
    if (statusObj) { payload.request.status = { id: statusObj.id }; hasChanges = true; }
  }
  const udfChanges = {};
  if (drawerDraft.assigneeId !== ticket.assigneeId) {
    payload.request.technician = drawerDraft.assigneeId ? { id: drawerDraft.assigneeId } : null;
    hasChanges = true;
  }
  if (drawerDraft.priority !== ticket.priority) {
    payload.request.priority = { name: drawerDraft.priority };
    hasChanges = true;
  }
  if (drawerDraft.sprintId !== ticket.sprintId) {
    // Jira'da bu teknik olarak mümkün ama kesinlikle önerilmiyor (burndown/velocity bozulur) —
    // biz de engellemiyoruz, sadece başlamış bir sprintten çıkarılıyorsa uyarıyoruz.
    const oldSprint = ticket.sprintId ? sprints.find(s => String(s.id) === String(ticket.sprintId)) : null;
    if (oldSprint && isStatusActive(oldSprint) && oldSprint.status !== "Future") {
      const ok = await promptConfirm(`Bu iş, başlamış olan "${oldSprint.name}" sprintinden çıkarılacak. Bu, sprint raporlarını (velocity, burndown) etkileyebilir. Devam edilsin mi?`);
      if (!ok) return;
    }
    udfChanges[CONFIG.SPRINT_ID_FIELD_KEY] = drawerDraft.sprintId || "";
    hasChanges = true;
  }
  if (drawerDraft.epicId !== ticket.epicId) {
    udfChanges[CONFIG.EPIC_ID_FIELD_KEY] = drawerDraft.epicId || "";
    hasChanges = true;
  }
  if (drawerDraft.workItemType !== ticket.workItemType) {
    udfChanges[CONFIG.WORK_ITEM_TYPE_FIELD_KEY] = { name: drawerDraft.workItemType };
    hasChanges = true;
  }
  if (Object.keys(udfChanges).length > 0) {
    payload.request.udf_fields = udfChanges;
  }

  if (!hasChanges) {
    showToast("Değişiklik yapılmadı.", "warning");
    return;
  }

  const wasAlreadyDone = isTicketClosed(ticket);
  const movingBetweenDoneStates = wasAlreadyDone && (drawerDraft.status === "4" || drawerDraft.status === "1");
  if (isStatusChanging && (drawerDraft.status === "4" || drawerDraft.status === "1") && !movingBetweenDoneStates) {
    try {
      const resolutionText = await promptForResolution();
      payload.request.resolution = { content: resolutionText };
    } catch (cancelErr) {
      return; 
    }
  } else if (isStatusChanging && drawerDraft.status !== "4" && drawerDraft.status !== "1") {
    // İş yeniden açılıyor — SDP'deki eski çözüm metnini de gerçekten boşaltıyoruz.
    payload.request.resolution = { content: "" };
  }

  // KRİTİK: yukarıdaki awaitler (yetki kontrolü, onay pencereleri, resolution penceresi)
  // sırasında arka plan yenilemesi devreye girip `tickets` dizisini değiştirmiş olabilir —
  // referansımız yetim kalmış olabilir. Asıl kaydetme işleminden hemen önce tazeliyoruz.
  const liveTicket = tickets.find(t => t.id === selectedTicketId) || ticket;

  if (!usingRealData) {
    showToast("SDP bağlantısı olmadan değişiklik kaydedilemez. Veri bütünlüğü için işlem yapılmadı.", "warning");
    return;
  }

  try {
    await sdpApiFetch(`/api/v3/requests/${liveTicket.id}`, "PUT", payload);

    try {
      const freshResponse = await fetch(`/api/v3/requests/${liveTicket.id}`, {
        method: "GET",
        credentials: "same-origin",
        headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
      });
      const freshData = await freshResponse.json();
      const freshTicket = mapSdpRequestsToTickets([freshData.request])[0];
      const preservedTaskSummary = liveTicket.taskSummary; 
      Object.assign(liveTicket, freshTicket, { taskSummary: preservedTaskSummary });
    } catch (refreshErr) {
      liveTicket.status = drawerDraft.status;
      liveTicket.statusName = STATUS_MAP[drawerDraft.status]?.name || liveTicket.statusName;
      liveTicket.assigneeId = drawerDraft.assigneeId;
      liveTicket.assigneeName = assignees.find(a => String(a.id) === String(drawerDraft.assigneeId))?.name || "Atanmamış";
      liveTicket.priority = drawerDraft.priority;
      liveTicket.sprintId = drawerDraft.sprintId;
      liveTicket.epicId = drawerDraft.epicId;
    }

    renderAll();
    closeDrawer();
    showToast("Değişiklikler kaydedildi.", "success");
  } catch (err) {
    showToast(`Kaydedilemedi: ${err.message}`, "error");
  }
}

function closeDrawer() {
  document.getElementById("detailDrawer").classList.remove("open");
  document.getElementById("drawerOverlay").classList.remove("open");
  selectedTicketId = null;

  if (drawerReturnTo) {
    const returnTo = drawerReturnTo;
    drawerReturnTo = null;
    if (returnTo.type === "epic") {
      const epic = epics.find(e => String(e.id) === String(returnTo.id));
      if (epic) openEpicDetail(returnTo.id);
    } else if (returnTo.type === "sprint") {
      const sprint = sprints.find(s => String(s.id) === String(returnTo.id));
      if (sprint) openSprintDetail(returnTo.id);
    }
  }
}

