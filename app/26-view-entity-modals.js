/* Issue/Epic/Space/Sprint create-edit-close modal flows */
function openNewIssueModal(prefillEpicId) {
  const modal = document.getElementById("newIssueModal");
  if (!modal) return;

  if (!prefillEpicId) epicDetailReturnAfterIssue = null; // Genel butondan açıldıysa, eski bir bağlam kalmasın

  document.getElementById("newIssueTitle").value = "";
  document.getElementById("newIssueDescription").value = "";
  document.getElementById("newIssueType").value = "Story";

  const prioritySelect = document.getElementById("newIssuePriority");
  if (prioritySelect) {
    prioritySelect.innerHTML = priorities.map(p => `<option value="${p}">${escapeHtml(p)}</option>`).join("");
  }

  const epicSelect = document.getElementById("newIssueEpic");
  if (epicSelect) {
    epicSelect.innerHTML = '<option value="">Epic Yok</option>' +
      epics.filter(e => e.status !== "Closed" && e.status !== "Resolved").map(e => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join("");
    epicSelect.value = prefillEpicId || "";
  }

  const assigneeSelect = document.getElementById("newIssueAssignee");
  if (assigneeSelect) {
    assigneeSelect.innerHTML = '<option value="">Atanmamış</option>' +
      assignees.map(a => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join("");
  }

  // Kuyrukta önceki bir açılıştan kalmış (İptal edilmiş) dosyalar varsa temizle — kökten çözüm,
  // sadece Cancel butonuna değil, her açılışa bağlı.
  newIssueAttachmentQueue.length = 0;
  const attachSection = document.getElementById("newIssueAttachmentSection");
  if (attachSection) {
    attachSection.innerHTML = attachmentSectionHtml("newIssueAttach");
    bindAttachmentSectionQueued("newIssueAttach", newIssueAttachmentQueue);
  }

  modal.classList.add("open");
}

let newIssueAttachmentQueue = [];

function bindNewIssueModalEvents() {
  const modal = document.getElementById("newIssueModal");
  const cancelBtn = document.getElementById("cancelNewIssueBtn");
  const submitBtn = document.getElementById("submitNewIssueBtn");
  if (!modal) return; 

  const attachSection = document.getElementById("newIssueAttachmentSection");
  if (attachSection) {
    attachSection.innerHTML = attachmentSectionHtml("newIssueAttach");
    bindAttachmentSectionQueued("newIssueAttach", newIssueAttachmentQueue);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.classList.remove("open");
      newIssueAttachmentQueue.length = 0;
      epicDetailReturnAfterIssue = null;
    });
  }
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const subject = document.getElementById("newIssueTitle").value.trim();
      const description = document.getElementById("newIssueDescription").value.trim();
      const workItemType = document.getElementById("newIssueType").value;
      const priority = document.getElementById("newIssuePriority").value;
      const epicId = document.getElementById("newIssueEpic").value || null;
      const assigneeId = document.getElementById("newIssueAssignee").value || null;

      if (!subject) {
        showToast("Başlık zorunlu.", "warning");
        return;
      }
      if (!usingRealData) {
        showToast("İş oluşturma sadece SDP bağlantısı varken çalışır.", "warning");
        return;
      }
      if (!(await verifyCurrentSpaceStillExists())) return;

      submitBtn.disabled = true;
      submitBtn.textContent = "Oluşturuluyor...";
      try {
        const created = await createTicketOnServer({ subject, description, workItemType, priority, epicId, assigneeId });
        const newTicketId = created?.request?.id;

        let attachmentError = null;
        if (newTicketId && newIssueAttachmentQueue.length > 0) {
          submitBtn.textContent = "Dosyalar yükleniyor...";
          try {
            await flushAttachmentQueue("ticket", newTicketId, newIssueAttachmentQueue, (name, pct) => {
              submitBtn.textContent = `${name}: %${pct}`;
            });
          } catch (attErr) {
            attachmentError = attErr;
          }
        }

        modal.classList.remove("open");
        if (attachmentError) {
          showToast(`İş oluşturuldu ama dosya yüklenemedi: ${attachmentError.message}. İşi açıp tekrar deneyebilirsin.`, "warning");
        } else {
          showToast("İş oluşturuldu.", "success");
        }
        await loadData();
        if (epicDetailReturnAfterIssue) {
          const returnEpicId = epicDetailReturnAfterIssue;
          epicDetailReturnAfterIssue = null;
          openEpicDetail(returnEpicId);
        }
      } catch (err) {
        showToast(`İş oluşturulamadı: ${err.message}`, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "Oluştur";
      }
    });
  }
}

function bindNewEpicModalEvents() {
  const modal = document.getElementById("newEpicModal");
  const cancelBtn = document.getElementById("cancelNewEpicBtn");
  const submitBtn = document.getElementById("submitNewEpicBtn");
  if (!modal) return;

  let epicAttachmentQueue = [];
  const attachSection = document.getElementById("newEpicAttachmentSection");
  if (attachSection) {
    attachSection.innerHTML = attachmentSectionHtml("newEpicAttach");
    bindAttachmentSectionQueued("newEpicAttach", epicAttachmentQueue);
  }

  const resetModal = () => {
    document.getElementById("newEpicModalTitle").textContent = "Yeni Epic";
    submitBtn.textContent = "Oluştur";
    document.getElementById("newEpicName").value = "";
    document.getElementById("newEpicDescription").value = "";
    document.getElementById("newEpicStatus").value = "Open";
    document.getElementById("newEpicAssignee").value = "";
    epicAttachmentQueue.length = 0;
    if (attachSection) attachSection.innerHTML = attachmentSectionHtml("newEpicAttach");
    bindAttachmentSectionQueued("newEpicAttach", epicAttachmentQueue);
  };

  // "+ Yeni Epic" butonu List görünümünde her render'da yeniden oluşturuluyor (innerHTML ile) —
  // butona doğrudan bağlanmak yerine, hep var olan sabit kapsayıcıya (listViewContainer) event
  // delegation ile bağlanıyoruz. Böylece kaç kere yeniden çizilirse çizilsin çalışmaya devam eder.
  const listViewContainer = document.getElementById("listViewContainer");
  if (listViewContainer) {
    listViewContainer.addEventListener("click", (e) => {
      if (e.target.closest("#newEpicBtn")) {
        resetModal();
        modal.classList.add("open");
      }
    });
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.classList.remove("open");
      resetModal();
    });
  }
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const name = document.getElementById("newEpicName").value.trim();
      const description = document.getElementById("newEpicDescription").value.trim();
      const status = document.getElementById("newEpicStatus").value || "Open";
      const assigneeId = document.getElementById("newEpicAssignee").value || null;

      if (!name) {
        showToast("Epic adı zorunlu.", "warning");
        return;
      }
      if (!usingRealData) {
        showToast("Bu işlem sadece SDP bağlantısı varken çalışır.", "warning");
        return;
      }
      if (!(await verifyCurrentSpaceStillExists())) return;

      submitBtn.disabled = true;
      const originalBtnText = submitBtn.textContent;
      try {
        const result = await createEpicOnServer({ name, description, status, assigneeId });
        const created = result[CONFIG.MODULE_EPICS_SINGULAR];
        const targetEpicId = String(created.id);
        epics.push({
          id: targetEpicId,
          name: created.name,
          description: created[CONFIG.EPIC_DESCRIPTION_FIELD_KEY] || "",
          status: created[CONFIG.EPIC_STATUS_FIELD_KEY]?.name || "Open",
          spaceId: created[CONFIG.EPIC_SPACE_ID_FIELD_KEY] || (currentSpace ? currentSpace.id : null),
          assigneeId: created[CONFIG.EPIC_ASSIGNEE_FIELD_KEY]?.id || assigneeId,
          assigneeName: created[CONFIG.EPIC_ASSIGNEE_FIELD_KEY]?.name || (assignees.find(a => String(a.id) === String(assigneeId))?.name) || "Atanmamış"
        });

        let attachmentError = null;
        if (targetEpicId && epicAttachmentQueue.length > 0) {
          submitBtn.textContent = "Dosyalar yükleniyor...";
          try {
            await flushAttachmentQueue("epic", targetEpicId, epicAttachmentQueue, (fname, pct) => {
              submitBtn.textContent = `${fname}: %${pct}`;
            });
          } catch (attErr) {
            attachmentError = attErr;
          }
        }

        modal.classList.remove("open");
        if (attachmentError) {
          // Kayıt başarıyla oluştu ama dosya(lar) yüklenemedi — bunu açıkça ayırt ediyoruz,
          // "her şey başarısız oldu" gibi yanıltıcı bir mesaj vermiyoruz. Kullanıcı kaydını
          // kaybetmiyor, sadece Epic Detay'dan dosyayı tekrar deneyebilir.
          showToast(`Epic oluşturuldu ama dosya yüklenemedi: ${attachmentError.message}. Epic Detay'dan tekrar deneyebilirsin.`, "warning");
        } else {
          showToast("Epic oluşturuldu.", "success");
        }
        resetModal();
        populateFilters();
        renderAll();
      } catch (err) {
        showToast(`İşlem başarısız: ${err.message}`, "error");
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText === "Dosyalar yükleniyor..." ? "Oluştur" : originalBtnText;
      }
    });
  }
}


let editingSpaceId = null; 

function openDeleteSpaceModal(space) {
  const affectedEpics = epics.filter(e => String(e.spaceId) === String(space.id));
  const affectedSprints = sprints.filter(s => String(s.spaceId) === String(space.id));
  const affectedTickets = tickets.filter(t => String(t.spaceId) === String(space.id));

  document.getElementById("deleteSpaceWarningText").innerHTML =
    `"${escapeHtml(space.name)}" (${escapeHtml(space.key)}) silinsin mi? Bu Space'e bağlı <b>${affectedEpics.length} Epic</b>, <b>${affectedSprints.length} Sprint</b> ve <b>${affectedTickets.length} iş (Story/Task/Bug)</b> var — Epic/Sprint/Space kalıcı olarak silinecek, işler (Story/Task/Bug) SDP'nin çöp kutusuna taşınacak (SDP'nin kendi ayarındaki süre sonunda otomatik kalıcı silinir). Bu işlem geri alınamaz.`;
  document.getElementById("deleteSpaceNameHint").textContent = space.name;
  document.getElementById("deleteSpaceConfirmInput").value = "";
  document.getElementById("deleteSpaceModal").classList.add("open");

  const confirmBtn = document.getElementById("confirmDeleteSpaceBtn");
  const cancelBtn = document.getElementById("cancelDeleteSpaceBtn");
  const modal = document.getElementById("deleteSpaceModal");

  const cleanup = () => {
    modal.classList.remove("open");
    confirmBtn.removeEventListener("click", onConfirm);
    cancelBtn.removeEventListener("click", onCancel);
  };
  const onCancel = () => cleanup();
  const onConfirm = async () => {
    const typed = document.getElementById("deleteSpaceConfirmInput").value.trim();
    if (typed !== space.name) {
      showToast("Yazdığın isim eşleşmiyor, tam olarak aynı yazmalısın.", "warning");
      return;
    }
    confirmBtn.disabled = true;
    confirmBtn.textContent = "Siliniyor...";

    try {
      // Kaskad silme: önce en alttaki (ticket'lar), sonra Epic/Sprint'ler, en son Space'in kendisi.
      for (const t of affectedTickets) {
        await deleteTicketOnServer(t.id);
      }
      for (const e of affectedEpics) {
        await deleteEpicOnServer(e.id);
      }
      for (const s of affectedSprints) {
        await deleteSprintOnServer(s.id);
      }
      await deleteSpaceOnServer(space.id);

      // Local state'i de aynı şekilde temizle
      tickets = tickets.filter(t => String(t.spaceId) !== String(space.id));
      epics = epics.filter(e => String(e.spaceId) !== String(space.id));
      sprints = sprints.filter(s => String(s.spaceId) !== String(space.id));
      spaces = spaces.filter(s => String(s.id) !== String(space.id));

      cleanup();
      showToast("Space ve içindeki her şey silindi.", "success");
      if (currentSpace && String(currentSpace.id) === String(space.id)) {
        localStorage.removeItem("sdp_agile_current_space_id");
        currentSpace = null;
        showSpaceSelector();
      } else {
        renderSpaceCards();
      }
    } catch (err) {
      showToast(`Silme işlemi tamamlanamadı: ${err.message}. Sunucudaki gerçek durum yeniden yükleniyor.`, "error");
      try { await loadData(); } catch (_) { /* loadData kendi hatasını yönetir */ }
    } finally {
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Kalıcı Olarak Sil";
    }
  };
  confirmBtn.addEventListener("click", onConfirm);
  cancelBtn.addEventListener("click", onCancel);
}

function openEditSpaceModal(space) {
  editingSpaceId = space.id;
  document.getElementById("newSpaceModalTitle").textContent = "Space Düzenle";
  document.getElementById("submitNewSpaceBtn").textContent = "Kaydet";
  document.getElementById("newSpaceName").value = space.name;
  document.getElementById("newSpaceKey").value = space.key;
  document.getElementById("newSpaceDescription").value = space.description;
  document.getElementById("newSpaceAssignee").value = space.assigneeId || "";
  document.getElementById("newSpaceModal").classList.add("open");
}

function bindNewSpaceModalEvents() {
  const newBtn = document.getElementById("newSpaceBtn");
  const modal = document.getElementById("newSpaceModal");
  const cancelBtn = document.getElementById("cancelNewSpaceBtn");
  const submitBtn = document.getElementById("submitNewSpaceBtn");
  if (!modal) return; 

  const resetModal = () => {
    editingSpaceId = null;
    document.getElementById("newSpaceModalTitle").textContent = "Yeni Space";
    submitBtn.textContent = "Oluştur";
    document.getElementById("newSpaceName").value = "";
    document.getElementById("newSpaceKey").value = "";
    document.getElementById("newSpaceDescription").value = "";
    document.getElementById("newSpaceAssignee").value = "";
  };

  if (newBtn) {
    newBtn.addEventListener("click", () => {
      resetModal();
      modal.classList.add("open");
    });
  }
  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.classList.remove("open");
      resetModal();
    });
  }
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const name = document.getElementById("newSpaceName").value.trim();
      const key = document.getElementById("newSpaceKey").value.trim().toUpperCase();
      const description = document.getElementById("newSpaceDescription").value.trim();
      const assigneeId = document.getElementById("newSpaceAssignee").value || null;

      if (!name || !key) {
        showToast("Ad ve Key zorunlu.", "warning");
        return;
      }

      try {
        if (editingSpaceId) {
          await updateSpaceOnServer(editingSpaceId, { name, key, description, assigneeId });
          const space = spaces.find(s => String(s.id) === String(editingSpaceId));
          if (space) {
            Object.assign(space, {
              name, key, description,
              assigneeId,
              assigneeName: assignees.find(a => String(a.id) === String(assigneeId))?.name || "Atanmamış"
            });
            if (currentSpace && String(currentSpace.id) === String(space.id)) {
              currentSpace = space;
              const nameEl = document.getElementById("currentSpaceName");
              if (nameEl) nameEl.textContent = `${space.key ? space.key + " — " : ""}${space.name}`;
            }
          }
          modal.classList.remove("open");
          resetModal();
          showToast("Space güncellendi.", "success");
          renderSpaceCards();
        } else {
          const result = await createSpaceOnServer({ name, key, description, assigneeId });
          const created = result[CONFIG.MODULE_SPACES_SINGULAR];
          const newSpace = {
            id: String(created.id),
            name: created.name,
            key: created[CONFIG.SPACE_KEY_FIELD_KEY] || key,
            description: created[CONFIG.SPACE_DESCRIPTION_FIELD_KEY] || "",
            assigneeId: created[CONFIG.SPACE_ASSIGNEE_FIELD_KEY]?.id || assigneeId,
            assigneeName: created[CONFIG.SPACE_ASSIGNEE_FIELD_KEY]?.name || (assignees.find(a => String(a.id) === String(assigneeId))?.name) || "Atanmamış"
          };
          spaces.push(newSpace);
          modal.classList.remove("open");
          resetModal();
          showToast("Space oluşturuldu.", "success");
          await enterSpace(newSpace);
        }
      } catch (err) {
        showToast(`İşlem başarısız: ${err.message}`, "error");
      }
    });
  }
}

let editingSprintId = null;

function openEditSprintModal(sprint) {
  editingSprintId = sprint.id;
  document.getElementById("newSprintName").value = sprint.name;
  document.getElementById("newSprintGoal").value = sprint.goal;
  document.getElementById("newSprintStart").value = toDateTimeLocalValue(sprint.startDate);
  document.getElementById("newSprintEnd").value = toDateTimeLocalValue(sprint.endDate);
  document.getElementById("submitNewSprintBtn").textContent = "Kaydet";
  document.getElementById("newSprintModal").classList.add("open");
}

function bindNewSprintModalEvents() {
  const modal = document.getElementById("newSprintModal");
  const cancelBtn = document.getElementById("cancelNewSprintBtn");
  const submitBtn = document.getElementById("submitNewSprintBtn");
  if (!modal) return; 

  const endDateInput = document.getElementById("newSprintEnd");
  const startDateInput = document.getElementById("newSprintStart");
  if (startDateInput) {
    startDateInput.min = todayMinDateTimeLocalValue();
    startDateInput.addEventListener("change", () => {
      if (endDateInput) {
        endDateInput.min = startDateInput.value || todayMinDateTimeLocalValue();
        if (endDateInput.value && new Date(endDateInput.value).getTime() < new Date(startDateInput.value).getTime()) {
          endDateInput.value = "";
          document.querySelectorAll("#sprintDurationChips [data-duration]").forEach(c => c.classList.remove("active"));
        }
      }
    });
  }
  document.querySelectorAll("#sprintDurationChips [data-duration]").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#sprintDurationChips [data-duration]").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      const val = chip.dataset.duration;
      if (val === "custom") {
        endDateInput.style.display = "";
        endDateInput.focus();
        return;
      }
      endDateInput.style.display = "";
      const days = parseInt(val, 10);
      const startMs = startDateInput.value ? new Date(startDateInput.value).getTime() : Date.now();
      const endMs = startMs + days * 24 * 60 * 60 * 1000;
      endDateInput.value = toDateTimeLocalValue(endMs);
    });
  });
  // Kullanıcı bitiş tarihini elle değiştirirse, artık hiçbir hazır seçenek "seçili" görünmesin
  if (endDateInput) {
    endDateInput.addEventListener("input", () => {
      document.querySelectorAll("#sprintDurationChips [data-duration]").forEach(c => c.classList.remove("active"));
    });
  }

  const resetModal = () => {
    editingSprintId = null;
    submitBtn.textContent = "Oluştur";
    document.getElementById("newSprintName").value = "";
    document.getElementById("newSprintGoal").value = "";
    const startEl = document.getElementById("newSprintStart");
    const endEl = document.getElementById("newSprintEnd");
    if (startEl) {
      startEl.min = todayMinDateTimeLocalValue();
      startEl.value = toDateTimeLocalValue(Date.now());
    }
    if (endEl) {
      endEl.min = startEl?.value || todayMinDateTimeLocalValue();
      endEl.value = "";
    }
    document.querySelectorAll("#sprintDurationChips [data-duration]").forEach(c => c.classList.remove("active"));
    sprintAttachmentQueue.length = 0;
    if (attachSection) attachSection.innerHTML = attachmentSectionHtml("newSprintAttach");
    bindAttachmentSectionQueued("newSprintAttach", sprintAttachmentQueue);
  };

  let sprintAttachmentQueue = [];
  const attachSection = document.getElementById("newSprintAttachmentSection");
  if (attachSection) {
    attachSection.innerHTML = attachmentSectionHtml("newSprintAttach");
    bindAttachmentSectionQueued("newSprintAttach", sprintAttachmentQueue);
  }

  if (cancelBtn) {
    cancelBtn.addEventListener("click", () => {
      modal.classList.remove("open");
      resetModal();
    });
  }
  if (submitBtn) {
    submitBtn.addEventListener("click", async () => {
      const name = document.getElementById("newSprintName").value.trim();
      const goal = document.getElementById("newSprintGoal").value.trim();
      const startVal = document.getElementById("newSprintStart").value;
      const endVal = document.getElementById("newSprintEnd").value;

      if (!name || !startVal || !endVal || !goal) {
        showToast("Ad, hedef, başlangıç ve bitiş tarihi zorunlu.", "warning");
        return;
      }

      const startMs = new Date(startVal).getTime();
      const endMs = new Date(endVal).getTime();

      if (!editingSprintId && startMs < startOfTodayMs()) {
        showToast("Yeni sprintin başlangıç tarihi bugünden önce olamaz.", "warning");
        return;
      }

      if (endMs < startMs) {
        showToast("Bitiş tarihi başlangıçtan önce olamaz.", "warning");
        return;
      }

      if (!usingRealData) {
        showToast("Bu işlem sadece SDP bağlantısı varken çalışır.", "warning");
        return;
      }
      if (!(await verifyCurrentSpaceStillExists())) return;

      try {
        submitBtn.disabled = true;
        const originalBtnText = submitBtn.textContent;
        let targetSprintId = editingSprintId;
        if (editingSprintId) {
          await updateSprintOnServer(editingSprintId, { name, goal, startDate: startMs, endDate: endMs });
          const sprint = sprints.find(s => String(s.id) === String(editingSprintId));
          if (sprint) Object.assign(sprint, { name, goal, startDate: startMs, endDate: endMs });
        } else {
          const result = await createSprintOnServer({ name, goal, startDate: startMs, endDate: endMs });
          const created = result[CONFIG.MODULE_SPRINTS_SINGULAR];
          targetSprintId = String(created.id);
          sprints.push({
            id: targetSprintId,
            name: created.name,
            goal: created[CONFIG.SPRINT_GOAL_FIELD_KEY] || "",
            status: created[CONFIG.SPRINT_STATUS_FIELD_KEY]?.name || "Future",
            startDate: created[CONFIG.SPRINT_START_DATE_FIELD_KEY]?.value ? parseInt(created[CONFIG.SPRINT_START_DATE_FIELD_KEY].value, 10) : startMs,
            endDate: created[CONFIG.SPRINT_END_DATE_FIELD_KEY]?.value ? parseInt(created[CONFIG.SPRINT_END_DATE_FIELD_KEY].value, 10) : endMs,
            actualStartDate: null, actualEndDate: null, closureSummary: "",
            resolution: created[CONFIG.SPRINT_RESOLUTION_FIELD_KEY] || "",
            createdTime: created.created_time?.display_value || "",
            createdBy: created.created_by?.name || currentUser?.name || "",
            updatedTime: created.updated_time?.display_value || "",
            spaceId: created[CONFIG.SPRINT_SPACE_ID_FIELD_KEY] || (currentSpace ? currentSpace.id : null)
          });
        }

        let attachmentError = null;
        if (targetSprintId && sprintAttachmentQueue.length > 0) {
          submitBtn.textContent = "Dosyalar yükleniyor...";
          try {
            await flushAttachmentQueue("sprint", targetSprintId, sprintAttachmentQueue, (fname, pct) => {
              submitBtn.textContent = `${fname}: %${pct}`;
            });
          } catch (attErr) {
            attachmentError = attErr;
          }
        }

        modal.classList.remove("open");
        if (attachmentError) {
          showToast(`Sprint ${editingSprintId ? "güncellendi" : "oluşturuldu"} ama dosya yüklenemedi: ${attachmentError.message}. Sprint Detay'dan tekrar deneyebilirsin.`, "warning");
        } else {
          showToast(editingSprintId ? "Sprint güncellendi." : "Sprint oluşturuldu.", "success");
        }
        resetModal();
        populateFilters();
        renderAll();
        submitBtn.disabled = false;
        submitBtn.textContent = originalBtnText === "Dosyalar yükleniyor..." ? "Oluştur" : originalBtnText;
      } catch (err) {
        showToast(`İşlem başarısız: ${err.message}`, "error");
        submitBtn.disabled = false;
      }
    });
  }
}

function promptCloseSprintOptions(count, closingSprintId) {
  return new Promise((resolve) => {
    const modal = document.getElementById("closeSprintOptionsModal");
    const textEl = document.getElementById("closeSprintOptionsText");
    const choiceSelect = document.getElementById("closeSprintChoice");
    const newFieldsDiv = document.getElementById("closeSprintNewSprintFields");
    const existingFieldsDiv = document.getElementById("closeSprintExistingFields");
    const existingSelect = document.getElementById("closeSprintExistingSelect");
    const nameInput = document.getElementById("closeSprintNewName");
    const goalInput = document.getElementById("closeSprintNewGoal");
    const startInput = document.getElementById("closeSprintNewStart");
    const endInput = document.getElementById("closeSprintNewEnd");
    const cancelBtn = document.getElementById("cancelCloseSprintOptionsBtn");
    const confirmBtn = document.getElementById("confirmCloseSprintOptionsBtn");

    // Kapatılan sprint hariç, hâlâ iş kabul edebilecek (Future/Active) diğer sprint'leri listele —
    // "var olan bir sprint'e taşı" seçeneği için.
    const availableSprints = sprints.filter(s =>
      String(s.id) !== String(closingSprintId) && (s.status === "Future" || s.status === "Active") &&
      (!currentSpace || String(s.spaceId) === String(currentSpace.id))
    );
    existingSelect.innerHTML = availableSprints.length > 0
      ? availableSprints.map(s => `<option value="${escapeAttr(String(s.id))}">${escapeHtml(s.name)} (${escapeHtml(s.status)})</option>`).join("")
      : '<option value="">Uygun sprint yok</option>';

    // Süre hazır seçenekleri (1/2/3/4 Hafta) — gerçek "Yeni Sprint" formundaki AYNI davranış,
    // önceden burada sadece elle tarih giriliyordu, iki ekran tutarsızdı.
    document.querySelectorAll("#closeSprintDurationChips [data-duration]").forEach(chip => {
      chip.onclick = () => {
        document.querySelectorAll("#closeSprintDurationChips [data-duration]").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        const val = chip.dataset.duration;
        if (val === "custom") { endInput.focus(); return; }
        const days = parseInt(val, 10);
        const startMs = startInput.value ? new Date(startInput.value).getTime() : Date.now();
        endInput.value = toDateTimeLocalValue(startMs + days * 24 * 60 * 60 * 1000);
      };
    });
    endInput.oninput = () => {
      document.querySelectorAll("#closeSprintDurationChips [data-duration]").forEach(c => c.classList.remove("active"));
    };
    startInput.onchange = () => {
      endInput.min = startInput.value || todayMinDateTimeLocalValue();
      if (endInput.value && new Date(endInput.value).getTime() < new Date(startInput.value).getTime()) {
        endInput.value = "";
        document.querySelectorAll("#closeSprintDurationChips [data-duration]").forEach(c => c.classList.remove("active"));
      }
    };

    textEl.textContent = `Bu sprintte ${count} bitmemiş iş var. Ne yapılsın?`;
    choiceSelect.value = "backlog";
    newFieldsDiv.style.display = "none";
    existingFieldsDiv.style.display = "none";
    nameInput.value = "";
    goalInput.value = "";
    startInput.min = todayMinDateTimeLocalValue();
    startInput.value = toDateTimeLocalValue(Date.now());
    endInput.min = startInput.value;
    endInput.value = "";
    document.querySelectorAll("#closeSprintDurationChips [data-duration]").forEach(c => c.classList.remove("active"));

    modal.classList.add("open");

    const onChoiceChange = () => {
      newFieldsDiv.style.display = choiceSelect.value === "newsprint" ? "block" : "none";
      existingFieldsDiv.style.display = choiceSelect.value === "existingsprint" ? "block" : "none";
    };
    choiceSelect.addEventListener("change", onChoiceChange);

    const cleanup = () => {
      modal.classList.remove("open");
      choiceSelect.removeEventListener("change", onChoiceChange);
      cancelBtn.removeEventListener("click", onCancel);
      confirmBtn.removeEventListener("click", onConfirm);
    };
    const onCancel = () => { cleanup(); resolve(null); };
    const onConfirm = () => {
      if (choiceSelect.value === "existingsprint") {
        const existingId = existingSelect.value;
        if (!existingId) {
          showToast("Taşınacak bir sprint seç.", "warning");
          return;
        }
        cleanup();
        resolve({ mode: "existingsprint", sprintId: existingId });
      } else if (choiceSelect.value === "newsprint") {
        const name = nameInput.value.trim();
        const goal = goalInput.value.trim();
        const startVal = startInput.value;
        const endVal = endInput.value;
        if (!name || !goal || !startVal || !endVal) {
          showToast("Yeni sprint için ad, hedef, başlangıç ve bitiş tarihi zorunlu.", "warning");
          return;
        }
        const startMs = new Date(startVal).getTime();
        const endMs = new Date(endVal).getTime();
        if (startMs < startOfTodayMs()) {
          showToast("Yeni sprintin başlangıç tarihi bugünden önce olamaz.", "warning");
          return;
        }
        if (endMs < startMs) {
          showToast("Bitiş tarihi başlangıçtan önce olamaz.", "warning");
          return;
        }
        cleanup();
        resolve({ mode: "newsprint", name, goal, startMs, endMs });
      } else {
        cleanup();
        resolve({ mode: "backlog" });
      }
    };
    cancelBtn.addEventListener("click", onCancel);
    confirmBtn.addEventListener("click", onConfirm);
  });
}

async function promptAndCloseSprint(sprintId) {
  const unfinishedCount = tickets.filter(t =>
    String(t.sprintId) === String(sprintId) && !isTicketClosed(t)
  ).length;

  let targetSprintId = null;
  let movementMode = unfinishedCount > 0 ? "backlog" : null;

  if (unfinishedCount > 0) {
    const choice = await promptCloseSprintOptions(unfinishedCount, sprintId);
    if (!choice) return; 

    if (choice.mode === "newsprint") {
      try {
        const result = await createSprintOnServer({ name: choice.name, goal: choice.goal, startDate: choice.startMs, endDate: choice.endMs });
        const created = result[CONFIG.MODULE_SPRINTS_SINGULAR];
        const newSprint = {
          id: String(created.id),
          name: created.name,
          goal: created[CONFIG.SPRINT_GOAL_FIELD_KEY] || choice.goal,
          status: created[CONFIG.SPRINT_STATUS_FIELD_KEY]?.name || "Future",
          startDate: created[CONFIG.SPRINT_START_DATE_FIELD_KEY]?.value ? parseInt(created[CONFIG.SPRINT_START_DATE_FIELD_KEY].value, 10) : choice.startMs,
          endDate: created[CONFIG.SPRINT_END_DATE_FIELD_KEY]?.value ? parseInt(created[CONFIG.SPRINT_END_DATE_FIELD_KEY].value, 10) : choice.endMs,
          actualStartDate: null, actualEndDate: null, closureSummary: "",
          resolution: created[CONFIG.SPRINT_RESOLUTION_FIELD_KEY] || "",
          createdTime: created.created_time?.display_value || "",
          createdBy: created.created_by?.name || currentUser?.name || "",
          updatedTime: created.updated_time?.display_value || "",
          spaceId: created[CONFIG.SPRINT_SPACE_ID_FIELD_KEY] || (currentSpace ? currentSpace.id : null)
        };
        sprints.push(newSprint);
        targetSprintId = newSprint.id;
        movementMode = "newsprint";
      } catch (err) {
        showToast(`Yeni sprint oluşturulamadı: ${err.message}`, "error");
        return;
      }
    } else if (choice.mode === "existingsprint") {
      targetSprintId = choice.sprintId;
      movementMode = "existingsprint";
    } else {
      movementMode = "backlog";
    }
  }

  let resolutionText;
  try {
    resolutionText = await promptForResolution();
  } catch (cancelErr) {
    return; 
  }

  await closeSprint(sprintId, resolutionText, targetSprintId, movementMode);
}

