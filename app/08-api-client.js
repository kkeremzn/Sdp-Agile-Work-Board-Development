/* Central SDP API client, CSRF and request update operations */
/* Common SDP API client, CSRF, request status operations and error parsing */
function getCsrfToken() {
    let value = "; " + document.cookie;
    let parts = value.split("; sdpcsrfcookie=");
    if (parts.length === 2) return parts.pop().split(";").shift();
    return "";
}

function promptConfirm(message) {
  return new Promise((resolve) => {
    const modal = document.getElementById("confirmModal");
    const textEl = document.getElementById("confirmModalText");
    const cancelBtn = document.getElementById("confirmModalCancelBtn");
    const okBtn = document.getElementById("confirmModalOkBtn");

    textEl.textContent = message;
    modal.classList.add("open");

    const cleanup = () => {
      modal.classList.remove("open");
      cancelBtn.removeEventListener("click", onCancel);
      okBtn.removeEventListener("click", onOk);
    };
    const onCancel = () => { cleanup(); resolve(false); };
    const onOk = () => { cleanup(); resolve(true); };

    cancelBtn.addEventListener("click", onCancel);
    okBtn.addEventListener("click", onOk);
  });
}

function promptForResolution() {
  return new Promise((resolve, reject) => {
    const modal = document.getElementById("resolutionModal");
    const txt = document.getElementById("resolutionText");
    const btnCancel = document.getElementById("cancelResolutionBtn");
    const btnSubmit = document.getElementById("submitResolutionBtn");

    txt.value = "";
    modal.classList.add("open");

    const cleanup = () => {
      modal.classList.remove("open");
      btnCancel.removeEventListener("click", onCancel);
      btnSubmit.removeEventListener("click", onSubmit);
    };

    const onCancel = () => {
      cleanup();
      reject(new Error("İptal edildi"));
    };

    const onSubmit = () => {
      const val = txt.value.trim();
      if (!val) {
        showToast("Lütfen bir çözüm metni girin!", "warning");
        return;
      }
      cleanup();
      resolve(val);
    };

    btnCancel.addEventListener("click", onCancel);
    btnSubmit.addEventListener("click", onSubmit);
  });
}


async function updateStatusOnServer(ticketId, newStatusId, resolutionText = null) {
  const statusObj = STATUS_MAP[String(newStatusId)];
  if (!statusObj) throw new Error("Geçersiz statü ID'si");

  const bodyPayload = {
    request: {
      status: {
        id: statusObj.id
      }
    }
  };

  if (resolutionText && (statusObj.id === "4" || statusObj.id === "1")) {
      bodyPayload.request.resolution = {
          content: resolutionText
      };
  } else if (statusObj.id !== "4" && statusObj.id !== "1") {
      // İş yeniden açılıyor (Resolved/Closed dışına çıkıyor) — SDP'deki eski çözüm metnini de
      // gerçekten boşaltıyoruz, sadece bizim yerel önbelleğimizi değil.
      bodyPayload.request.resolution = {
          content: ""
      };
  }

  const csrfToken = getCsrfToken();
  const bodyString = "input_data=" + encodeURIComponent(JSON.stringify(bodyPayload));

  const headers = {
      "Accept": "application/vnd.manageengine.sdp.v3+json",
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "X-ZCSRF-TOKEN": "sdpcsrfparam=" + csrfToken
  };

  const response = await fetch(`/api/v3/requests/${ticketId}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: headers,
    body: bodyString
  });

  const textData = await response.text();
  let data = null;

  try {
      data = JSON.parse(textData);
  } catch (e) {
      let htmlError = "Sunucu HTML hatası döndürdü.";
      const match = textData.match(/<title[^>]*>(.*?)<\/title>/i) || 
                    textData.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
                    textData.match(/<b[^>]*>(.*?)<\/b>/i);
      
      if (match) htmlError = match[1].replace(/<[^>]+>/g, '');
      throw new Error(`[HTTP ${response.status}] ${htmlError}`);
  }

  if (!response.ok || (data && data.response_status && data.response_status.status === "failed")) {
    const sdpError = data?.response_status?.messages?.[0]?.message || `[HTTP ${response.status}] Bilinmeyen SDP Hatası.`;
    throw new Error(sdpError); 
  }

  return data;
}

function extractSdpError(data) {
  const rs = data?.response_status;
  if (!rs) return null;
  const statusObj = Array.isArray(rs) ? rs[0] : rs;
  if (statusObj?.status === "failed") {
    return statusObj.messages?.[0]?.message || "Bilinmeyen SDP hatası.";
  }
  return null;
}

// ---------- Ekler (Attachments) ----------
// Onaylanmış gerçek uç nokta: POST /api/v3/{module}/_upload (multipart/form-data)
// Modül-tekil eşleştirmesi input_data'da { attachment: { [singularKey]: { id } } } için gerekli.
// Attachment endpoint bilgileri CONFIG üzerinden dinamik çözülür; sihirbazdaki API adlarıyla her zaman aynı kalır.

// Subtask'lar (SDP'nin native Task'ı), Epic/Sprint/Ticket gibi düz bir modül değil — bir Request'in
// altına iç içe geçmiş. Resmi dökümantasyondaki "Module Task Attachment" deseni:
// /api/v3/{module}/{id}/tasks/{id}/upload — bizim yapımızda module=requests, ilk id=ticketId,
// ikinci id=taskId. Chat'teki subtask'lar için zaten kullandığımız "ticketId_taskId" bileşik
// ID desenini burada da kullanıyoruz, tutarlılık için.

async function sdpApiFetch(path, method, payload) {
  const csrfToken = getCsrfToken();

  const headers = {
    "Accept": "application/vnd.manageengine.sdp.v3+json",
    "X-Requested-With": "XMLHttpRequest",
    "X-ZCSRF-TOKEN": "sdpcsrfparam=" + csrfToken
  };

  const fetchOptions = {
    method,
    credentials: "same-origin",
    headers
  };

  // GET ve DELETE isteklerinde hiçbir parametre (input_data dahil) göndermiyoruz —
  // GET'te gövde HTTP semantiğine aykırı, DELETE'te SDP boş input_data'yı bile reddediyor.
  if (method !== "DELETE" && method !== "GET") {
    headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
    fetchOptions.body = "input_data=" + encodeURIComponent(JSON.stringify(payload));
  }

  const response = await fetch(path, fetchOptions);

  const textData = await response.text();

  // Bazı DELETE istekleri başarılı olduğunda boş gövde dönebiliyor — bunu hataya çevirmeyelim
  if (!textData.trim()) {
    if (!response.ok) throw new Error(`[HTTP ${response.status}] Sunucudan boş yanıt geldi.`);
    return { response_status: { status: "success" } };
  }

  let data = null;

  try {
    data = JSON.parse(textData);
  } catch (e) {
    let htmlError = "Sunucu HTML hatası döndürdü.";
    const match = textData.match(/<title[^>]*>(.*?)<\/title>/i) ||
                  textData.match(/<h1[^>]*>(.*?)<\/h1>/i) ||
                  textData.match(/<b[^>]*>(.*?)<\/b>/i);
    if (match) htmlError = match[1].replace(/<[^>]+>/g, '');
    throw new Error(`[HTTP ${response.status}] ${htmlError}`);
  }

  const sdpError = extractSdpError(data);
  if (!response.ok || sdpError) {
    const bodySnippet = JSON.stringify(data).slice(0, 200);
    throw new Error(sdpError || `[HTTP ${response.status}] Beklenmeyen yanıt: ${bodySnippet}`);
  }

  return data;
}

// fetchTicketHistory (yukarıda) görüntüleme için hazır metin üretiyor — İş Yükü Raporu gibi
// programatik analiz gerektiren yerler için, ham/yapılandırılmış diff verisine ihtiyacımız var.
