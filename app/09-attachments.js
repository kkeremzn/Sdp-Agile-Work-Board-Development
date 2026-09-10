/* Reusable attachment transport and UI component */
/* Attachment component + SDP attachment transport */
function subtaskAttachmentBaseUrl(compoundId) {
  const [ticketId, taskId] = String(compoundId).split("_");
  return `/api/v3/requests/${ticketId}/tasks/${taskId}`;
}

// XHR kullanıyoruz (fetch değil) çünkü upload ilerlemesini (progress) sadece XHR'ın
// kendi "upload.onprogress" olayı ile takip edebiliyoruz.
// Resmi ManageEngine dökümantasyonuna göre (help.servicedeskplus.com/v3-attachment-api-changes):
// Yöntem PUT (POST değil!), URL /api/v3/{modül}/{id}/upload, dosya alanı "input_file".
function uploadAttachment(entityType, recordId, file, onProgress) {
  return new Promise((resolve, reject) => {
    const uploadUrl = entityType === "subtask"
      ? `${subtaskAttachmentBaseUrl(recordId)}/upload`
      : (() => {
          const mapInfo = getAttachmentModuleInfo(entityType);
          if (!mapInfo) return null;
          return `/api/v3/${mapInfo.plural}/${recordId}/upload`;
        })();
    if (!uploadUrl) { reject(new Error("Bilinmeyen varlık tipi: " + entityType)); return; }

    const formData = new FormData();
    formData.append("input_file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Accept", "application/vnd.manageengine.sdp.v3+json");
    xhr.setRequestHeader("X-Requested-With", "XMLHttpRequest");
    xhr.setRequestHeader("X-ZCSRF-TOKEN", "sdpcsrfparam=" + getCsrfToken());

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.attachment) {
          resolve(data.attachment);
        } else {
          reject(new Error(data.response_status?.messages?.[0]?.message || `Yükleme başarısız (HTTP ${xhr.status})`));
        }
      } catch (e) {
        reject(new Error("Sunucu yanıtı okunamadı."));
      }
    };
    xhr.onerror = () => reject(new Error("Ağ hatası — yükleme başarısız."));
    xhr.send(formData);
  });
}

async function deleteAttachment(entityType, recordId, attachmentId) {
  if (entityType === "subtask") {
    return sdpApiFetch(`${subtaskAttachmentBaseUrl(recordId)}/attachments/${attachmentId}`, "DELETE");
  }
  const mapInfo = getAttachmentModuleInfo(entityType);
  if (!mapInfo) throw new Error("Bilinmeyen varlık tipi: " + entityType);
  // Resmi dökümantasyon: /api/v3/{modül}/{id}/attachments/{attachment_id} (DELETE)
  return sdpApiFetch(`/api/v3/${mapInfo.plural}/${recordId}/attachments/${attachmentId}`, "DELETE");
}

function formatFileSize(bytes) {
  if (!bytes) return "0 KB";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentIconSvg() {
  return `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>`;
}

function downloadIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
}

// Basit tarayıcı navigasyonu (window.open/anchor) API'nin gerektirdiği başlıkları
// (Accept, CSRF token) taşıyamıyor — bu yüzden dosyayı JS ile (doğru başlıklarla) çekip,
// tarayıcıya bir "blob" URL'i olarak sunuyoruz. Bu, korumalı dosya indirmede standart yöntem.
async function fetchAttachmentBlob(url) {
  const response = await fetch(url, {
    method: "GET",
    credentials: "same-origin",
    headers: {
      "Accept": "*/*",
      "X-Requested-With": "XMLHttpRequest",
      "X-ZCSRF-TOKEN": "sdpcsrfparam=" + getCsrfToken()
    }
  });
  if (!response.ok) throw new Error(`Dosya alınamadı (HTTP ${response.status})`);
  const blob = await response.blob();
  return blob;
}

// ---------- Ekler UI ----------
let activeUploadsCount = 0; // Herhangi bir yükleme sürerken kaydet butonlarını disable tutmak için

function attachmentSectionHtml(sectionId) {
  return `
    <div class="attachment-section">
      <div class="attachment-section-header">
        <h4>${attachmentIconSvg()} Ekler</h4>
        <label class="attachment-add-btn" id="${sectionId}-addBtn">
          + Dosya Seç
          <input type="file" id="${sectionId}-fileInput" style="display:none;" />
        </label>
      </div>
      <div class="attachment-list" id="${sectionId}-list"></div>
    </div>
  `;
}

function buildAttachmentRow(att, { uploading, progress, onDelete, entityType, recordId, canEdit = true } = {}) {
  const row = document.createElement("div");
  row.className = "attachment-row" + (uploading ? " uploading" : "");

  if (uploading) {
    const circumference = 2 * Math.PI * 10;
    const offset = circumference - (progress / 100) * circumference;
    row.innerHTML = `
      <div class="attachment-progress-ring">
        <svg width="26" height="26" viewBox="0 0 26 26">
          <circle class="track" cx="13" cy="13" r="10"></circle>
          <circle class="fill" cx="13" cy="13" r="10" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}"></circle>
        </svg>
        <span class="attachment-progress-label">${progress}</span>
      </div>
      <div class="attachment-row-info">
        <div class="attachment-row-name">${escapeHtml(att.name)}</div>
        <div class="attachment-row-meta">Yükleniyor...</div>
      </div>
    `;
  } else {
    // content_url farklı uç noktalarda tutarsız formatta gelebiliyor (bazen kayıt ID'si var,
    // bazen yok) — bu yüzden güvenilir olması için URL'yi bildiğimiz ID'lerle kendimiz kuruyoruz.
    let baseUrl = att.contentUrl;
    if (entityType === "subtask" && recordId) {
      baseUrl = `${subtaskAttachmentBaseUrl(recordId)}/attachments/${att.id}/_download`;
    } else if (recordId) {
      const mapInfo = getAttachmentModuleInfo(entityType);
      if (mapInfo) baseUrl = `/api/v3/${mapInfo.plural}/${recordId}/attachments/${att.id}/_download`;
    }

    row.innerHTML = `
      <span class="attachment-row-icon">${attachmentIconSvg()}</span>
      <div class="attachment-row-info">
        <div class="attachment-row-name" data-view-attachment>${escapeHtml(att.name)}</div>
        <div class="attachment-row-meta">${att.sizeDisplay || formatFileSize(att.sizeBytes)}</div>
      </div>
      <button class="attachment-row-download" data-tip="İndir">${downloadIconSvg()}</button>
      ${canEdit ? `<button class="attachment-row-delete" data-tip="Sil">${removeXIconSvg()}</button>` : ""}
    `;
    row.querySelector("[data-view-attachment]").addEventListener("click", async () => {
      const newTab = window.open("", "_blank"); // Pop-up engelleyiciye takılmasın diye ÖNCE, senkron açıyoruz — daha önce doğrulanan çalışan yöntem
      try {
        const rawBlob = await fetchAttachmentBlob(baseUrl + "?mode=view");
        const blob = new Blob([rawBlob], { type: att.contentType || rawBlob.type });
        const blobUrl = URL.createObjectURL(blob);
        if (newTab) newTab.location.href = blobUrl;
        setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
      } catch (err) {
        if (newTab) newTab.close();
        showToast(`Dosya açılamadı: ${err.message}`, "error");
      }
    });
    row.querySelector(".attachment-row-download").addEventListener("click", async () => {
      // Widget sandbox'lı bir iframe içinde çalışıyor — indirme linkini iframe'in kendi
      // belgesinde değil, en üst (sandbox dışı) pencerenin belgesinde oluşturup tıklatıyoruz.
      // Bu, sandbox'lı ortamlarda dosya indirme için kanıtlanmış, çalıştığı doğrulanan yöntem.
      const topWindow = (() => { try { return window.top.document ? window.top : window; } catch (e) { return window; } })();
      try {
        const rawBlob = await fetchAttachmentBlob(baseUrl);
        const blob = new Blob([rawBlob], { type: "application/octet-stream" });
        const blobUrl = URL.createObjectURL(blob);

        const a = topWindow.document.createElement("a");
        a.href = blobUrl;
        a.download = att.name;
        topWindow.document.body.appendChild(a);
        a.click();
        setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 2000);
      } catch (err) {
        showToast(`İndirme başarısız: ${err.message}`, "error");
      }
    });
    if (canEdit) {
      row.querySelector(".attachment-row-delete").addEventListener("click", async () => {
        const ok = await promptConfirm(`"${att.name}" silinsin mi?`);
        if (!ok) return;
        if (onDelete) onDelete();
      });
    }
  }
  return row;
}

// DETAY ekranları için: kayıt zaten var, dosya seçilir seçilmez anında yüklenir.
function bindAttachmentSectionLive(sectionId, entityType, recordId, initialAttachments, canEdit = true) {
  const listEl = document.getElementById(`${sectionId}-list`);
  const fileInput = document.getElementById(`${sectionId}-fileInput`);
  const addBtn = document.getElementById(`${sectionId}-addBtn`);
  if (!listEl || !fileInput) return;

  // Bu bölümdeki alanları kim düzenleyebiliyorsa (yönetici / işin kendi sahibi), attachment
  // ekleme/silme de aynı yetki seviyesinde olmalı — diğer alanlarda salt okunur olan biri
  // burada ekleyip silebiliyor olmasın diye. Sadece görüntüleme her zaman herkese açık.
  if (!canEdit && addBtn) addBtn.style.display = "none";

  let attachments = (initialAttachments || []).map(a => ({
    id: a.id, name: a.name, sizeDisplay: a.size?.display_value, contentUrl: a.content_url, contentType: a.content_type
  }));

  const renderList = () => {
    listEl.innerHTML = "";
    if (attachments.length === 0) {
      listEl.innerHTML = `<div class="muted" style="font-size:12px;">Henüz dosya eklenmemiş.</div>`;
      return;
    }
    attachments.forEach(att => {
      const row = buildAttachmentRow(att, {
        entityType, recordId, canEdit,
        onDelete: async () => {
          try {
            await deleteAttachment(entityType, recordId, att.id);
            attachments = attachments.filter(a => a.id !== att.id);
            renderList();
            showToast("Dosya silindi.", "success");
          } catch (err) {
            showToast(`Dosya silinemedi: ${err.message}`, "error");
          }
        }
      });
      listEl.appendChild(row);
    });
  };
  renderList();

  if (!canEdit) return; // Salt okunur — dosya seçme olayını hiç bağlama

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = "";

    activeUploadsCount++;
    const progressRow = buildAttachmentRow({ name: file.name }, { uploading: true, progress: 0 });
    listEl.appendChild(progressRow);

    try {
      const uploaded = await uploadAttachment(entityType, recordId, file, (pct) => {
        const label = progressRow.querySelector(".attachment-progress-label");
        const fillCircle = progressRow.querySelector(".fill");
        if (label) label.textContent = pct;
        if (fillCircle) {
          const circumference = 2 * Math.PI * 10;
          fillCircle.setAttribute("stroke-dashoffset", circumference - (pct / 100) * circumference);
        }
      });
      attachments.push({ id: uploaded.id, name: uploaded.name, sizeDisplay: uploaded.size?.display_value, contentUrl: uploaded.content_url, contentType: uploaded.content_type });
      showToast("Dosya yüklendi.", "success");
    } catch (err) {
      showToast(`Yükleme başarısız: ${err.message}`, "error");
    } finally {
      activeUploadsCount--;
      renderList();
    }
  });
}

// OLUŞTURMA formları için: kayıt henüz yok, dosyalar kuyruğa alınır, asıl Kaydet'e basılınca yüklenir.
function bindAttachmentSectionQueued(sectionId, queueArrayRef) {
  const listEl = document.getElementById(`${sectionId}-list`);
  const fileInput = document.getElementById(`${sectionId}-fileInput`);
  if (!listEl || !fileInput) return;

  const renderQueue = () => {
    listEl.innerHTML = "";
    if (queueArrayRef.length === 0) {
      listEl.innerHTML = `<div class="muted" style="font-size:12px;">Kaydedince yüklenecek dosya yok.</div>`;
      return;
    }
    queueArrayRef.forEach((file, idx) => {
      const row = document.createElement("div");
      row.className = "attachment-row";
      row.innerHTML = `
        <span class="attachment-row-icon">${attachmentIconSvg()}</span>
        <div class="attachment-row-info">
          <div class="attachment-row-name">${escapeHtml(file.name)}</div>
          <div class="attachment-row-meta">${formatFileSize(file.size)} — Kaydedince yüklenecek</div>
        </div>
        <button class="attachment-row-delete" data-tip="Kaldır">${removeXIconSvg()}</button>
      `;
      row.querySelector(".attachment-row-delete").addEventListener("click", () => {
        queueArrayRef.splice(idx, 1);
        renderQueue();
      });
      listEl.appendChild(row);
    });
  };
  renderQueue();

  fileInput.addEventListener("change", () => {
    const file = fileInput.files[0];
    if (!file) return;
    fileInput.value = "";
    queueArrayRef.push(file);
    renderQueue();
  });
}

// Kayıt oluşturulduktan sonra, kuyruktaki dosyaları sırayla yükler — çağıran taraf
// activeUploadsCount ve buton disable durumunu bu fonksiyonun süresince yönetmeli.
async function flushAttachmentQueue(entityType, recordId, queueArrayRef, onProgress) {
  for (const file of queueArrayRef) {
    await uploadAttachment(entityType, recordId, file, onProgress ? (pct) => onProgress(file.name, pct) : undefined);
  }
  queueArrayRef.length = 0;
}

