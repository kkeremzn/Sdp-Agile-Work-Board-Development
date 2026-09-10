/* Shared HTML/text/presentation helpers */
/* Shared presentation helpers */
function kebabIconSvg() {
  return `<svg width="14" height="14" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="currentColor"><circle cx="8" cy="3" r="1.3"/><circle cx="8" cy="8" r="1.3"/><circle cx="8" cy="13" r="1.3"/></svg>`;
}

// Regex ile HTML temizlemek kırılgan (iç içe/karmaşık etiketlerde bozuk DOM'a yol açabiliyor) —
// tarayıcının kendi ayrıştırıcısına bir kere yaptırıp güvenli düz metin alıyoruz.
function stripHtmlToText(html) {
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || "").trim();
}
function escapeHtml(text) {
  const tmp = document.createElement("div");
  tmp.textContent = text == null ? "" : String(text);
  return tmp.innerHTML;
}
function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function safeCssColor(value, fallback = "#64748b") {
  const v = String(value || "").trim();
  // SDP renk alanından yalnız güvenli CSS renk formatlarını kabul et.
  if (/^#[0-9a-fA-F]{3,8}$/.test(v) || /^rgb(a)?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}(\s*,\s*(0|1|0?\.\d+))?\s*\)$/.test(v)) return v;
  return fallback;
}

function issueKeyText(entity) {
  const key = currentSpace?.key || "İŞ";
  return `${key}-${entity.id}`;
}
function issueKey(entity) {
  const statusText = entity.statusName || entity.status || "";
  const isClosed = statusText === "Closed" || statusText === "Resolved";
  const cls = isClosed ? "backlog-row-key backlog-row-key-closed" : "backlog-row-key";
  return `<span class="${cls}">${issueKeyText(entity)}</span>`;
}

function initials(name) {
  if (!name || name === "Atanmamış") return "-";
  return name.split(" ").filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join("");
}

function showToast(message, type = "success") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;

  const textSpan = document.createElement("span");
  textSpan.style.flex = "1";
  textSpan.innerText = message;

  const closeBtn = document.createElement("button");
  closeBtn.className = "toast-close-btn";
  closeBtn.innerHTML = removeXIconSvg();
  closeBtn.onclick = () => {
    toast.style.animation = "slideIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) reverse";
    setTimeout(() => toast.remove(), 200);
  };

  toast.appendChild(textSpan);
  toast.appendChild(closeBtn);
  container.appendChild(toast);

  setTimeout(() => {
    if (!toast.isConnected) return;
    toast.style.animation = "slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1) reverse";
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}