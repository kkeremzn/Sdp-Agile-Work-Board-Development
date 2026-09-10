/* Entity comments/chat, polling and message UI */
/* Entity comments/chat, technician identity resolution and chat polling */
// Genel amaçlı: herhangi bir varlık için (ticket, epic, sprint — hepsinin "id"si var)
// Space Key + o varlığın kendi ham ID'si. Ticket'a özel bir mantık değil.
// ===========================================================
// SOHBET (Comments subentity — Epic/Sprint, Notes — Story/Task/Bug)
// ===========================================================
let chatActiveEntity = null; // { type: "epic"|"sprint"|"ticket", id }

function chatEndpointFor(type, id) {
  if (type === "epic") return `/api/v3/${CONFIG.MODULE_EPICS}/${id}/comments`;
  if (type === "sprint") return `/api/v3/${CONFIG.MODULE_SPRINTS}/${id}/comments`;
  if (type === "subtask") {
    const [ticketId, taskId] = String(id).split("_");
    return `/api/v3/requests/${ticketId}/tasks/${taskId}/comments`;
  }
  return `/api/v3/requests/${id}/notes`;
}

async function fetchEntityComments(type, id) {
  // Ticket Notes endpoint'i, diğer bazı SDP GET'leri gibi, parametresiz istekte boş dönüyor —
  // explicit list_info göndermek gerekiyor (canlı testle doğrulandı).
  const url = type === "ticket"
    ? `${chatEndpointFor(type, id)}?input_data=${encodeURIComponent(JSON.stringify({ list_info: { row_count: 100, start_index: 1 } }))}`
    : chatEndpointFor(type, id);

  const response = await fetch(url, {
    method: "GET", credentials: "same-origin",
    headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
  });
  if (!response.ok) throw new Error(`Mesajlar alınamadı: ${response.status}`);
  const data = await response.json();
  let raw = (type === "ticket" ? data.notes : data.comments) || [];

  if (type === "ticket" && raw.length > 0) {
    // Liste endpoint'i içerik döndürmüyor (canlı testle doğrulandı) — Request'lerin udf_fields'ında
    // olduğu gibi, her notun tam içeriğini tekil kayıttan ayrı ayrı çekmemiz gerekiyor.
    raw = await Promise.all(raw.map(async (n) => {
      try {
        const detailResp = await fetch(`/api/v3/requests/${id}/notes/${n.id}`, {
          method: "GET", credentials: "same-origin",
          headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
        });
        if (!detailResp.ok) return n;
        const detailData = await detailResp.json();
        const full = detailData.note || detailData.request_note || {};
        return { ...n, description: full.description };
      } catch (e) {
        return n;
      }
    }));
  }

  return raw.map(c => {
    const timeObj = c.added_time || c.created_time;
    const authorObj = c.added_by || c.created_by || c.technician;
    return {
      id: c.id,
      authorId: authorObj?.id || null,
      author: authorObj?.name || "Bilinmeyen",
      time: timeObj?.display_value || "",
      timeMs: timeObj?.value ? parseInt(timeObj.value, 10) : 0,
      content: stripHtmlToText(c.content ?? c.description ?? c.note ?? c.text ?? "")
    };
  }).sort((a, b) => a.timeMs - b.timeMs); // WhatsApp gibi: en eski üstte, en yeni altta — gerçek zaman damgasına göre, dizi sırasına güvenmeden
}

async function postEntityComment(type, id, text) {
  const safeText = `<div>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>`;
  let result;
  if (type === "ticket") {
    result = await sdpApiFetch(`/api/v3/requests/${id}/notes`, "POST", { note: { description: safeText, show_to_requester: false, mark_first_response: false } });
  } else {
    result = await sdpApiFetch(chatEndpointFor(type, id), "POST", { comment: { content: safeText } });
  }
  // Yorumun SDP tarafından damgalanan yazarı UI'da kullanılabilir; ancak authorization kimliğini
  // comment cevabından değiştirmiyoruz. currentUser yalnız salt-okuma oturum doğrulamasından gelir.
  return result;
}

// NOT: Bu iki fonksiyonun URL/gövde formatı, GET'te doğrulanan tekil-kayıt deseninden (
// /notes/{id}, /comments/{id}) mantıksal çıkarım — henüz canlı test edilmedi.
async function updateEntityComment(type, entityId, commentId, text) {
  const safeText = `<div>${text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>")}</div>`;
  if (type === "ticket") {
    return sdpApiFetch(`/api/v3/requests/${entityId}/notes/${commentId}`, "PUT", { note: { description: safeText } });
  }
  return sdpApiFetch(`${chatEndpointFor(type, entityId)}/${commentId}`, "PUT", { comment: { content: safeText } });
}

async function deleteEntityComment(type, entityId, commentId) {
  if (type === "ticket") {
    return sdpApiFetch(`/api/v3/requests/${entityId}/notes/${commentId}`, "DELETE", {});
  }
  return sdpApiFetch(`${chatEndpointFor(type, entityId)}/${commentId}`, "DELETE", {});
}

function subtaskIssueKeyText(ticket, task) {
  return `${issueKeyText(ticket)}-${task.id}`;
}

function buildSubtaskChatRows(ticket) {
  const cachedTasks = ticketTasksCache[ticket.id];
  if (!cachedTasks || cachedTasks.length === 0) return "";
  return cachedTasks.map(task => {
    const key = subtaskIssueKeyText(ticket, task);
    const label = `Alt Görev ${key} ${task.title}`;
    const compoundId = `${ticket.id}_${task.id}`;
    return `<div class="chat-entity-row chat-entity-row-child" style="padding-left:44px;" data-chat-type="subtask" data-chat-subtype="subtask" data-chat-id="${compoundId}" data-chat-label="${escapeAttr(label)}" data-tip="${escapeAttr(label)}">${subtaskIconSvg()}<span class="backlog-row-key">${key}</span><span class="chat-entity-row-label">${escapeHtml(task.title)}</span></div>`;
  }).join("");
}

function buildTicketChatRow(t, extraClass) {
  const hasCached = !!ticketTasksCache[t.id];
  const label = `${t.workItemType} ${issueKeyText(t)} ${t.title}`;
  return `
    <div class="chat-entity-row ${extraClass || ""}" data-chat-type="ticket" data-chat-subtype="${t.workItemType}" data-chat-id="${t.id}" data-chat-label="${escapeAttr(label)}" data-tip="${escapeAttr(label)}">
      <button class="chat-subtask-expand-btn" data-expand-subtasks="${t.id}" data-tip="Alt görevleri göster">${chevronRightSvg()}</button>
      ${workItemTypeIcon(t.workItemType)}<span class="chat-entity-row-label">${escapeHtml(t.title)}</span>
    </div>
    <div class="chat-subtask-container" data-subtask-container="${t.id}">${hasCached ? buildSubtaskChatRows(t) : ""}</div>
  `;
}

function renderChatEntityTree() {
  const treeEl = document.getElementById("chatEntityTree");
  if (!treeEl) return;

  const relevantTickets = getScopedTickets();
  const rows = [];

  epics.filter(e => (!currentSpace || String(e.spaceId) === String(currentSpace.id))).forEach(epic => {
    const epicTickets = relevantTickets.filter(t => String(t.epicId) === String(epic.id));
    const isEpicOwner = currentUser && String(epic.assigneeId) === String(currentUser.id);
    if (!isManager && epicTickets.length === 0 && !isEpicOwner) return;
    rows.push(`<div class="chat-entity-row" data-chat-type="epic" data-chat-subtype="epic" data-chat-id="${epic.id}" data-chat-label="${escapeAttr(`Epic ${issueKeyText(epic)} ${epic.name}`)}" data-tip="${escapeAttr(`Epic ${issueKeyText(epic)} ${epic.name}`)}">${epicIconSvg()}<span class="chat-entity-row-label">${escapeHtml(epic.name)}</span></div>`);
    epicTickets.forEach(t => {
      rows.push(buildTicketChatRow(t, "chat-entity-row-child"));
    });
  });

  const standalone = relevantTickets.filter(t => !t.epicId);
  if (standalone.length > 0) {
    rows.push(`<div class="chat-entity-section-label" data-chat-section="tickets">Bağımsız İşler</div>`);
    standalone.forEach(t => {
      rows.push(buildTicketChatRow(t));
    });
  }

  let spaceSprints = sprints.filter(s => !currentSpace || String(s.spaceId) === String(currentSpace.id));
  if (!isManager) {
    spaceSprints = spaceSprints.filter(s => relevantTickets.some(t => String(t.sprintId) === String(s.id)));
  }
  if (spaceSprints.length > 0) {
    rows.push(`<div class="chat-entity-section-label" data-chat-section="sprints">Sprintler</div>`);
    spaceSprints.forEach(s => {
      rows.push(`<div class="chat-entity-row" data-chat-type="sprint" data-chat-subtype="sprint" data-chat-id="${s.id}" data-chat-label="${escapeAttr(`Sprint ${issueKeyText(s)} ${s.name}`)}" data-tip="${escapeAttr(`Sprint ${issueKeyText(s)} ${s.name}`)}">${sprintIconSvg()}<span class="chat-entity-row-label">${escapeHtml(s.name)}</span></div>`);
    });
  }

  treeEl.innerHTML = rows.join("") || '<div class="muted" style="padding:12px; font-size:12px;">Henüz konuşulacak bir şey yok.</div>';

  treeEl.querySelectorAll("[data-chat-type]").forEach(row => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("[data-expand-subtasks]")) return;
      treeEl.querySelectorAll(".chat-entity-row").forEach(r => r.classList.remove("active"));
      row.classList.add("active");
      openChatThread(row.dataset.chatType, row.dataset.chatId, row.dataset.chatLabel);
    });
  });

  treeEl.querySelectorAll("[data-expand-subtasks]").forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const ticketId = btn.dataset.expandSubtasks;
      const container = treeEl.querySelector(`[data-subtask-container="${ticketId}"]`);
      if (!container) return;

      const isOpen = btn.classList.contains("expanded");
      if (isOpen) {
        btn.classList.remove("expanded");
        btn.innerHTML = chevronRightSvg();
        container.innerHTML = "";
        return;
      }

      btn.classList.add("expanded");
      btn.innerHTML = chevronDownSvg();
      if (!ticketTasksCache[ticketId]) {
        container.innerHTML = '<div class="muted" style="padding:6px 8px; font-size:11px;">Yükleniyor...</div>';
        try {
          ticketTasksCache[ticketId] = await fetchTicketTasks(ticketId);
        } catch (err) {
          container.innerHTML = '<div class="muted" style="padding:6px 8px; font-size:11px;">Alt görevler alınamadı.</div>';
          return;
        }
      }
      const ticket = tickets.find(x => String(x.id) === String(ticketId));
      container.innerHTML = buildSubtaskChatRows(ticket) || '<div class="muted" style="padding:6px 8px; font-size:11px;">Alt görev yok.</div>';
      container.querySelectorAll("[data-chat-type]").forEach(subRow => {
        subRow.addEventListener("click", () => {
          treeEl.querySelectorAll(".chat-entity-row").forEach(r => r.classList.remove("active"));
          subRow.classList.add("active");
          openChatThread(subRow.dataset.chatType, subRow.dataset.chatId, subRow.dataset.chatLabel);
        });
      });
      applyChatFilters();
    });
  });

  applyChatFilters();
}

function applyChatFilters() {
  const treeEl = document.getElementById("chatEntityTree");
  if (!treeEl) return;
  const searchTerm = (document.getElementById("chatEntitySearch")?.value || "").toLowerCase();
  const activeFilter = document.querySelector(".chat-filter-chip.active")?.dataset.chatFilter || "all";

  treeEl.querySelectorAll(".chat-entity-row").forEach(row => {
    const matchesFilter = activeFilter === "all" || row.dataset.chatSubtype === activeFilter;
    const matchesSearch = !searchTerm || row.dataset.chatLabel.toLowerCase().includes(searchTerm);
    row.style.display = (matchesFilter && matchesSearch) ? "" : "none";
  });
  // Bölüm etiketlerini, altında görünen satır yoksa gizle
  treeEl.querySelectorAll(".chat-entity-section-label").forEach(label => {
    let sibling = label.nextElementSibling;
    let anyVisible = false;
    while (sibling && !sibling.classList.contains("chat-entity-section-label")) {
      if (sibling.style.display !== "none") anyVisible = true;
      sibling = sibling.nextElementSibling;
    }
    label.style.display = anyVisible ? "" : "none";
  });
}

async function openChatThread(type, id, label) {
  chatActiveEntity = { type, id };
  document.getElementById("chatThreadHeader").textContent = label;
  document.getElementById("chatInputRow").style.display = "flex";
  const messagesEl = document.getElementById("chatMessages");
  messagesEl.innerHTML = '<div class="muted" style="padding:12px; font-size:12px;">Yükleniyor...</div>';

  try {
    const comments = await fetchEntityComments(type, id);
    chatLastMessageCount = comments.length;
    renderChatMessages(comments);
  } catch (err) {
    messagesEl.innerHTML = `<div class="muted" style="padding:12px; font-size:12px;">Mesajlar alınamadı: ${err.message}</div>`;
  }
}

function bindChatEvents() {
  const fab = document.getElementById("chatFabBtn");
  const overlay = document.getElementById("chatOverlay");
  const panel = document.getElementById("chatPanel");
  const closeBtn = document.getElementById("closeChatBtn");
  const sendBtn = document.getElementById("chatSendBtn");
  const input = document.getElementById("chatInput");
  if (!fab || !panel) return;

  const open = async () => {
    panel.classList.add("open");
    overlay.classList.add("open");
    fab.style.display = "none";
    renderChatEntityTree();
    startChatPolling();
    await resolveIdentityFromWidgetContext();
  };
  const close = () => {
    panel.classList.remove("open");
    overlay.classList.remove("open");
    fab.style.display = "";
    stopChatPolling();
    closeFloatingKebabMenu();
  };

  fab.addEventListener("click", open);
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", close);

  document.querySelectorAll(".chat-filter-chip").forEach(chip => {
    chip.addEventListener("click", () => {
      document.querySelectorAll(".chat-filter-chip").forEach(c => c.classList.remove("active"));
      chip.classList.add("active");
      applyChatFilters();
    });
  });
  const searchInput = document.getElementById("chatEntitySearch");
  if (searchInput) searchInput.addEventListener("input", applyChatFilters);

  const send = async () => {
    const text = input.value.trim();
    if (!text || !chatActiveEntity) return;
    input.disabled = true;
    try {
      await postEntityComment(chatActiveEntity.type, chatActiveEntity.id, text);
      input.value = "";
      const activeRow = document.querySelector(".chat-entity-row.active");
      await openChatThread(chatActiveEntity.type, chatActiveEntity.id, activeRow ? activeRow.dataset.chatLabel : "");
    } catch (err) {
      showToast(`Mesaj gönderilemedi: ${err.message}`, "error");
    } finally {
      input.disabled = false;
      input.focus();
    }
  };

  sendBtn.addEventListener("click", send);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  });
}

// Sohbet açıkken, aktif konuşmayı belirli aralıklarla arka planda tazeler —
// başka birinin yazdığı mesaj kendiliğinden görünsün diye.
let chatPollTimer = null;
let chatLastMessageCount = 0;

function startChatPolling() {
  stopChatPolling();
  chatPollTimer = setInterval(async () => {
    if (!chatActiveEntity) return;
    const panel = document.getElementById("chatPanel");
    if (!panel || !panel.classList.contains("open")) return;
    try {
      const comments = await fetchEntityComments(chatActiveEntity.type, chatActiveEntity.id);
      if (comments.length !== chatLastMessageCount) {
        chatLastMessageCount = comments.length;
        renderChatMessages(comments);
      }
    } catch (e) {
      // Sessizce geç — geçici bir ağ hatası sohbeti kesmesin
    }
  }, 6000);
}

function stopChatPolling() {
  if (chatPollTimer) {
    clearInterval(chatPollTimer);
    chatPollTimer = null;
  }
}

function renderChatMessages(comments) {
  const messagesEl = document.getElementById("chatMessages");
  if (!messagesEl) return;
  messagesEl.innerHTML = comments.length > 0
    ? comments.map(c => {
        const idMatch = currentUser?.id && c.authorId && String(c.authorId) === String(currentUser.id);
        const nameMatch = currentUser?.name && c.author && c.author.trim().toLowerCase() === currentUser.name.trim().toLowerCase();
        const isMine = !!(idMatch || nameMatch);
        const actionsHtml = isMine
          ? `<span class="chat-message-actions">
               <button class="chat-msg-kebab-btn" data-chat-kebab="${c.id}" data-tip="Seçenekler">${kebabIconSvg()}</button>
             </span>`
          : "";
        return `
        <div class="chat-message" data-message-id="${c.id}">
          <span class="avatar">${initials(c.author)}</span>
          <div class="chat-message-body">
            <div class="chat-message-top"><span class="chat-message-author">${escapeHtml(c.author)}</span><span class="chat-message-time">${escapeHtml(c.time)}</span>${actionsHtml}</div>
            <div class="chat-message-content" data-content-raw="${escapeAttr(encodeURIComponent(c.content))}">${escapeHtml(c.content).replace(/\n/g, "<br>")}</div>
          </div>
        </div>
      `;
      }).join("")
    : '<div class="muted" style="padding:12px; font-size:12px;">Henüz mesaj yok — ilk mesajı sen yaz.</div>';
  messagesEl.scrollTop = messagesEl.scrollHeight;

  messagesEl.querySelectorAll("[data-chat-kebab]").forEach(btn => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      openFloatingKebabMenu(btn, btn.dataset.chatKebab, comments);
    });
  });
}
// Menü, herhangi bir kapsayıcının içine gömülü değil — body'nin doğrudan altında, gerçek ekran
// koordinatlarına göre konumlanan TEK, paylaşılan bir eleman. Bu yüzden hiçbir üst kapsayıcının
// (panel, mesaj listesi vb.) taşma/kesme sınırından etkilenmiyor — profesyonel arayüz
// kütüphanelerinin (Radix, Floating UI) kullandığı "portal" yaklaşımı.
function getFloatingKebabMenuEl() {
  let el = document.getElementById("floatingKebabMenu");
  if (!el) {
    el = document.createElement("div");
    el.id = "floatingKebabMenu";
    el.className = "floating-kebab-menu";
    document.body.appendChild(el);
  }
  return el;
}

function closeFloatingKebabMenu() {
  const el = document.getElementById("floatingKebabMenu");
  if (el) el.classList.remove("open");
}

function openFloatingKebabMenu(triggerBtn, commentId, comments) {
  const menu = getFloatingKebabMenuEl();
  const isReopeningSame = menu.dataset.forComment === String(commentId) && menu.classList.contains("open");
  closeFloatingKebabMenu();
  if (isReopeningSame) return; // Aynı butona tekrar basılırsa kapat (toggle davranışı)

  menu.dataset.forComment = commentId;
  menu.innerHTML = `
    <button data-chat-edit="${commentId}">Düzenle</button>
    <button data-chat-delete="${commentId}">Sil</button>
  `;

  // Önce görünür yap ki gerçek boyutunu ölçebilelim, sonra doğru konuma taşı
  menu.style.visibility = "hidden";
  menu.classList.add("open");
  const menuRect = menu.getBoundingClientRect();
  const btnRect = triggerBtn.getBoundingClientRect();

  let top = btnRect.bottom + 4;
  if (top + menuRect.height > window.innerHeight - 8) {
    top = btnRect.top - menuRect.height - 4; // Altta yer yoksa yukarı aç
  }
  let left = btnRect.right - menuRect.width;
  if (left < 8) left = 8;
  if (left + menuRect.width > window.innerWidth - 8) left = window.innerWidth - menuRect.width - 8;

  menu.style.top = `${Math.max(8, top)}px`;
  menu.style.left = `${left}px`;
  menu.style.visibility = "visible";

  menu.querySelector("[data-chat-delete]").addEventListener("click", async () => {
    closeFloatingKebabMenu();
    const ok = await promptConfirm("Bu mesajı silmek istediğine emin misin?");
    if (!ok || !chatActiveEntity) return;
    try {
      await deleteEntityComment(chatActiveEntity.type, chatActiveEntity.id, commentId);
      showToast("Mesaj silindi.", "success");
      const comments2 = await fetchEntityComments(chatActiveEntity.type, chatActiveEntity.id);
      chatLastMessageCount = comments2.length;
      renderChatMessages(comments2);
    } catch (err) {
      showToast(`Mesaj silinemedi: ${err.message}`, "error");
    }
  });

  menu.querySelector("[data-chat-edit]").addEventListener("click", () => {
    closeFloatingKebabMenu();
    const row = document.querySelector(`[data-message-id="${commentId}"] .chat-message-content`);
    if (!row) return;
    const originalText = decodeURIComponent(row.dataset.contentRaw);
    row.innerHTML = `
      <textarea class="chat-edit-textarea">${escapeHtml(originalText)}</textarea>
      <div class="chat-edit-actions">
        <button class="secondary-btn chat-edit-cancel">İptal</button>
        <button class="primary-btn chat-edit-save">Kaydet</button>
      </div>
    `;
    const textarea = row.querySelector("textarea");
    textarea.focus();
    textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    row.querySelector(".chat-edit-cancel").addEventListener("click", () => renderChatMessages(comments));
    row.querySelector(".chat-edit-save").addEventListener("click", async () => {
      const newText = textarea.value.trim();
      if (!newText) { showToast("Mesaj boş olamaz.", "warning"); return; }
      if (newText === originalText.trim()) { showToast("Değişiklik yok.", "warning"); return; }
      if (!chatActiveEntity) return;
      try {
        await updateEntityComment(chatActiveEntity.type, chatActiveEntity.id, commentId, newText);
        showToast("Mesaj güncellendi.", "success");
        const comments2 = await fetchEntityComments(chatActiveEntity.type, chatActiveEntity.id);
        chatLastMessageCount = comments2.length;
        renderChatMessages(comments2);
      } catch (err) {
        showToast(`Mesaj güncellenemedi: ${err.message}`, "error");
      }
    });
  });
}

document.addEventListener("click", (e) => {
  if (!e.target.closest("#floatingKebabMenu") && !e.target.closest("[data-chat-kebab]")) {
    closeFloatingKebabMenu();
  }
});
document.addEventListener("scroll", closeFloatingKebabMenu, true);

