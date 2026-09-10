/* Sprint reports, active sprint cards, history and velocity */
/* Sprint, Epic and Workload reports */
const WORK_ITEM_TYPE_COLORS = { Story: "#8B5CF6", Task: "#3B82F6", Bug: "#EF4444" };
let reportExpandedCards = new Set(); // Hangi sprint kartlarının detayı açık, tekrar render'da hatırlansın diye
let reportExpandedVelocityRows = new Set(); // Sağ taraftaki hangi geçmiş sprint satırının detayı açık
let reportVelocityMonth = "";
let reportVelocityYear = "";
let reportVelocityRange = { start: null, end: null }; // Özel aralık seçiliyse ay/yıl'ı geçersiz kılar


function renderReports() {
  const scoped = getScopedTickets();
  updateReportsLastUpdated();
  populateVelocityPeriodFilter();
  renderActiveSprintCards(scoped);
  renderSprintVelocityTrend();
  renderEpicReport();
}

function updateReportsLastUpdated() {
  const el = document.getElementById("reportsLastUpdated");
  if (!el) return;
  el.textContent = lastDataRefreshAt
    ? `Son Güncelleme: ${new Date(lastDataRefreshAt).toLocaleString("tr-TR", { day:"2-digit", month:"2-digit", year:"numeric", hour:"2-digit", minute:"2-digit" })}`
    : "Son Güncelleme: Henüz yüklenmedi";
}

// Tüm rapor çıktılarında AYNI kurumsal başlığı, aynı konumda kullanmak için paylaşılan fonksiyon.
function buildReportHeaderRows(now, columnCount = 8) {
  const reportTimestamp = now.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const emptyCells = () => Array(columnCount).fill("");
  const styleCells = (style) => Array(columnCount).fill(style);
  const columnLetter = (index) => {
    let n = index + 1, result = "";
    while (n > 0) {
      const rem = (n - 1) % 26;
      result = String.fromCharCode(65 + rem) + result;
      n = Math.floor((n - 1) / 26);
    }
    return result;
  };
  const lastColumn = columnLetter(columnCount - 1);
  return {
    rows: [
      { height: 26, cells: ["SDP Agile Work Board Reports", ...emptyCells().slice(1)], cellStyles: styleCells(2) },
      { height: 18, cells: [`Rapor Tarihi: ${reportTimestamp}`, ...emptyCells().slice(1)], cellStyles: styleCells(3) },
      { cells: emptyCells() }
    ],
    merges: [`A1:${lastColumn}1`, `A2:${lastColumn}2`]
  };
}

function exportActiveSprintsCsv() {
  const scoped = getScopedTickets();
  const activeSprints = sprints.filter(s => s.status === "Active" && (!currentSpace || String(s.spaceId) === String(currentSpace.id)));
  if (activeSprints.length === 0) {
    showToast("Dışa aktarılacak aktif sprint yok.", "warning");
    return;
  }

  const now = new Date();
  const headerBlock = buildReportHeaderRows(now);

  // Kurumsal başlık bandı — tüm satır genişliğinde (A:H) birleştirilmiş, sola hizalı.
  const rowsData = [
    ...headerBlock.rows,
    { header: true, cells: ["Sprint Key", "İsim", "Planlanan Başlangıç", "Gerçek Başlangıç", "Planlanan Bitiş", "Kalan Gün", "Story", "Task", "Bug"] }
  ];
  const mergeCells = headerBlock.merges;

  activeSprints.forEach((s, sprintIdx) => {
    const sprintTickets = scoped.filter(t => String(t.sprintId) === String(s.id));
    const storyTickets = sprintTickets.filter(t => t.workItemType === "Story");
    const taskTickets = sprintTickets.filter(t => t.workItemType === "Task");
    const bugTickets = sprintTickets.filter(t => t.workItemType === "Bug");

    const fmtDate = (ms) => ms ? formatDateTime(ms) : "—";
    let daysLeftLabel = "—";
    if (s.endDate) {
      const daysLeft = Math.ceil((s.endDate - Date.now()) / (1000 * 60 * 60 * 24));
      daysLeftLabel = daysLeft < 0 ? "Süresi geçti" : daysLeft === 0 ? "Bugün bitiyor" : `${daysLeft} gün`;
    }

    // Sprint özet satırı — hemen altına, o sprint'e bağlı TÜM işler (tipe göre sıralı, renkli)
    // DOĞRUDAN, HER ZAMAN GÖRÜNÜR şekilde yazılıyor. Açma/kapama mekanizması denendi ama farklı
    // Excel/LibreOffice sürümlerinde tutarsız davrandığı için tamamen kaldırıldı — artık basit ve garanti.
    rowsData.push({
      isSprintRow: true,
      cells: [issueKeyText(s), s.name, fmtDate(s.startDate), fmtDate(s.actualStartDate || parseSprintStartMarker(s.resolution)), fmtDate(s.endDate), daysLeftLabel, String(storyTickets.length), String(taskTickets.length), String(bugTickets.length)]
    });

    if (sprintTickets.length === 0) {
      rowsData.push({ cells: ["", "(Bu sprint'te iş yok)", "", "", "", "", "", "", ""] });
    } else {
      [...storyTickets, ...taskTickets, ...bugTickets].forEach(t => {
        rowsData.push({
          isTicketRow: true,
          cells: ["", issueKeyText(t), t.title, t.workItemType, t.statusName, t.assigneeName || "Atanmamış", "", "", ""],
          cellStyles: [null, null, null, xlsxColorStyleIndex(t.workItemType), xlsxColorStyleIndex(t.statusName), null, null, null, null]
        });
      });
    }

    // Sprintler arasına boş bir satır — birden fazla sprint olduğunda görsel olarak net ayrılsınlar.
    if (sprintIdx < activeSprints.length - 1) {
      rowsData.push({ cells: ["", "", "", "", "", "", "", "", ""] });
    }
  });

  downloadXlsx(`aktif-sprintler-${now.toISOString().slice(0, 10)}.xlsx`, "Aktif Sprintler", rowsData, [14, 26, 18, 18, 18, 14, 9, 9, 9], mergeCells);
}

function getSprintLifecycleReportData(sprint) {
  const historical = getSprintHistoricalTickets(sprint);
  const legacy = historical.legacy || parseSprintClosureSnapshot(sprint.resolution);
  const actualStartedAt = sprint.actualStartDate || legacy?.startedAt || parseSprintStartMarker(sprint.resolution) || null;
  const closedAt = sprint.actualEndDate || legacy?.closedAt || null;
  const snapshotTickets = historical.tickets;
  const total = snapshotTickets.length;
  const done = snapshotTickets.filter(t => t.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const actualDurationDays = (actualStartedAt && closedAt) ? ((closedAt - actualStartedAt) / (1000 * 60 * 60 * 24)) : null;
  const plannedDurationDays = (sprint.startDate && sprint.endDate) ? ((sprint.endDate - sprint.startDate) / (1000 * 60 * 60 * 24)) : null;
  const wasOvertime = (sprint.endDate && closedAt) ? closedAt > sprint.endDate : null;
  return {
    sprint, snapshotTickets, closedAt, actualStartedAt, total, done, pct, actualDurationDays, plannedDurationDays, wasOvertime,
    isEstimated: historical.isEstimated
  };
}

function sprintReportAnchorTime(sprint) {
  return sprint.actualStartDate || parseSprintStartMarker(sprint.resolution) || sprint.startDate || null;
}

function exportSprintHistoryCsv() {
  let closedSprints = sprints.filter(s => s.status === "Closed" && (!currentSpace || String(s.spaceId) === String(currentSpace.id)) && sprintReportAnchorTime(s));
  if (reportVelocityRange.start && reportVelocityRange.end) {
    closedSprints = closedSprints.filter(s => { const a = sprintReportAnchorTime(s); return a >= reportVelocityRange.start && a <= reportVelocityRange.end; });
  } else {
    if (reportVelocityMonth) closedSprints = closedSprints.filter(s => (new Date(sprintReportAnchorTime(s)).getMonth() + 1) === parseInt(reportVelocityMonth, 10));
    if (reportVelocityYear) closedSprints = closedSprints.filter(s => new Date(sprintReportAnchorTime(s)).getFullYear() === parseInt(reportVelocityYear, 10));
  }
  if (closedSprints.length === 0) {
    showToast("Dışa aktarılacak, bu filtreye uyan kapanmış sprint yok.", "warning");
    return;
  }

  // Her sprint için gerekli tüm veriyi (metrikler + iş listesi) tek seferde topluyoruz —
  // hem özet istatistikler hem her sprint'in kendi bloğu bu tek listeden besleniyor.
  const sprintData = closedSprints.map(getSprintLifecycleReportData);

  // ---- Özet istatistikler (üstte, 4 kutu) ----
  const withTiming = sprintData.filter(d => d.actualDurationDays !== null);
  const avgPct = Math.round(sprintData.reduce((sum, d) => sum + d.pct, 0) / sprintData.length);
  const fullyDoneCount = sprintData.filter(d => d.pct === 100).length;
  const overtimeCount = sprintData.filter(d => d.wasOvertime).length;
  const avgActualDuration = withTiming.length > 0 ? (withTiming.reduce((sum, d) => sum + d.actualDurationDays, 0) / withTiming.length) : null;

  // ---- Planlanan süreye göre grup tablosu ----
  const bucketLabels = [
    { label: "1 Hafta", min: 0, max: 9 }, { label: "2 Hafta", min: 10, max: 16 },
    { label: "3 Hafta", min: 17, max: 23 }, { label: "4+ Hafta", min: 24, max: Infinity }
  ];

  const now = new Date();
  const headerBlock = buildReportHeaderRows(now);
  const rowsData = [...headerBlock.rows];

  // Özet istatistik kutuları — widget'takiyle aynı 4 metrik, alt alta, okunaklı, arka planlı.
  rowsData.push({ header: true, cells: ["Özet İstatistik", "Değer", "", "", "", "", "", ""] });
  [
    ["Ortalama Tamamlanma", `%${avgPct}`],
    ["Eksiksiz Kapanan", `${fullyDoneCount}/${sprintData.length}`],
    ["Ortalama Sürdüğü Süre", avgActualDuration !== null ? formatDuration(avgActualDuration) : "Bilinmiyor"],
    ["Süresi Aşılarak Kapanan", `${overtimeCount}/${sprintData.length}`]
  ].forEach(([label, value]) => {
    rowsData.push({ isTicketRow: true, cells: [label, value, "", "", "", "", "", ""] });
  });
  rowsData.push({ cells: ["", "", "", "", "", "", "", ""] });

  // Planlanan süreye göre ortalama kapanma tablosu — her grup her zaman gösteriliyor, veri yoksa "Veri yok" yazıyor.
  rowsData.push({ header: true, cells: ["Planlanan Süre", "Sprint Sayısı", "Ortalama Sürdüğü Süre", "", "", "", "", ""] });
  bucketLabels.forEach(b => {
    const inBucket = withTiming.filter(d => d.plannedDurationDays !== null && d.plannedDurationDays >= b.min && d.plannedDurationDays <= b.max);
    if (inBucket.length === 0) {
      rowsData.push({ isTicketRow: true, cells: [b.label, "Veri yok", "Veri yok", "", "", "", "", ""] });
    } else {
      const avgDur = inBucket.reduce((sum, d) => sum + d.actualDurationDays, 0) / inBucket.length;
      rowsData.push({ isTicketRow: true, cells: [b.label, String(inBucket.length), formatDuration(avgDur), "", "", "", "", ""] });
    }
  });
  rowsData.push({ cells: ["", "", "", "", "", "", "", ""] });

  // ---- Her kapanmış sprint için: başlık + dikey metrik listesi (widget'taki gibi alt alta) + işler ----
  rowsData.push({ header: true, cells: ["Kapanan Sprintler", "", "", "", "", "", "", ""] });
  const fmt = (ms) => ms ? new Date(ms).toLocaleString("tr-TR") : "Bilinmiyor";

  sprintData.forEach((d, idx) => {
    rowsData.push({ isSprintRow: true, cells: [issueKeyText(d.sprint), d.sprint.name, "", "", "", "", "", ""] });

    [
      ["Tamamlanma", `%${d.pct} (${d.done}/${d.total})`],
      ["Planlanan Başlangıç", fmt(d.sprint.startDate)],
      ["Gerçek Başlangıç", fmt(d.actualStartedAt)],
      ["Planlanan Bitiş", fmt(d.sprint.endDate)],
      ["Gerçek Kapanış", fmt(d.closedAt)],
      ["Sürdüğü Süre", d.actualDurationDays !== null ? formatDuration(d.actualDurationDays) : "Bilinmiyor"],
      ["Süresi Aşıldı mı", d.wasOvertime === null ? "Bilinmiyor" : (d.wasOvertime ? "Evet" : "Hayır")]
    ].forEach(([label, value]) => {
      rowsData.push({ isTicketRow: true, cells: [label, value, "", "", "", "", "", ""] });
    });

    if (d.snapshotTickets.length === 0) {
      rowsData.push({ isTicketRow: true, cells: ["", "(Bu sprint'te iş yoktu)", "", "", "", "", "", ""] });
    } else {
      d.snapshotTickets.forEach(t => {
        let statusLabel, statusColorKey;
        if (t.completed) { statusLabel = "Tamamlandı"; statusColorKey = "Closed"; }
        else if (t.movedTo?.sprintName) { statusLabel = t.movedTo.createdDuringClose ? `Yeni sprint oluşturuldu ve taşındı: ${t.movedTo.sprintName}` : `Var olan sprint'e taşındı: ${t.movedTo.sprintName}`; statusColorKey = "Onhold"; }
        else if (t.movedTo?.backlog) { statusLabel = "Taşındı: Backlog"; statusColorKey = "Onhold"; }
        else { statusLabel = "Tamamlanmadı"; statusColorKey = "Cancelled"; }
        rowsData.push({
          isTicketRow: true,
          cells: ["", issueKeyText({ id: t.id }), t.title, t.workItemType, statusLabel, t.assigneeName || "Atanmamış", "", ""],
          cellStyles: [null, null, null, xlsxColorStyleIndex(t.workItemType), xlsxColorStyleIndex(statusColorKey), null, null, null]
        });
      });
    }

    if (idx < sprintData.length - 1) rowsData.push({ cells: ["", "", "", "", "", "", "", ""] });
  });

  downloadXlsx(`sprint-gecmisi-${now.toISOString().slice(0, 10)}.xlsx`, "Sprint Geçmişi", rowsData, [22, 26, 16, 16, 16, 14, 10, 10], headerBlock.merges);
}

function renderActiveSprintCards(scoped) {
  const activeSprints = sprints.filter(s => s.status === "Active" && (!currentSpace || String(s.spaceId) === String(currentSpace.id)));
  const cardsEl = document.getElementById("activeSprintCards");
  if (!cardsEl) return;

  if (activeSprints.length === 0) {
    cardsEl.innerHTML = '<div class="empty-state" style="padding:32px;"><p>Şu an aktif bir sprint yok.</p></div>';
    return;
  }

  cardsEl.innerHTML = activeSprints.map(s => {
    const sprintTickets = scoped.filter(t => String(t.sprintId) === String(s.id));
    const total = sprintTickets.length;
    const done = sprintTickets.filter(t => isTicketClosed(t)).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    const isExpanded = reportExpandedCards.has(s.id);

    // Tip sayıları — tıklanabilir, altını açıp/kapatıyor
    const typeCountsHtml = ["Story", "Task", "Bug"].map(type => {
      const count = sprintTickets.filter(t => t.workItemType === type).length;
      return `<span class="report-type-count" style="color:${WORK_ITEM_TYPE_COLORS[type]};">${count} ${type}</span>`;
    }).join(" · ");

    // Aktif sprintte yaşam döngüsü gerçek başlangıçtan hesaplanır.
    // Kalan süre matematiksel olarak "şimdi → planlanan bitiş"tir; planlanan StartDate artık aktif metrikte kullanılmaz.
    const actualStart = s.actualStartDate || parseSprintStartMarker(s.resolution) || null;
    let deadlineHtml = "";
    if (s.endDate) {
      const daysLeft = Math.ceil((s.endDate - Date.now()) / (1000 * 60 * 60 * 24));
      const urgent = daysLeft <= 3;
      const label = daysLeft < 0 ? "Süresi geçti" : daysLeft === 0 ? "Bugün bitiyor" : `${daysLeft} gün kaldı`;
      deadlineHtml = `<span class="report-deadline-badge ${urgent ? "urgent" : ""}">${label}</span>`;
    }
    const plannedStartText = s.startDate ? formatDateTime(s.startDate) : "Belirtilmemiş";
    const actualStartText = actualStart ? formatDateTime(actualStart) : "Henüz başlamadı";
    const plannedEndText = s.endDate ? formatDateTime(s.endDate) : "Belirtilmemiş";
    const dateRangeText = `Planlanan başlangıç: ${plannedStartText} · Gerçek başlangıç: ${actualStartText} · Planlanan bitiş: ${plannedEndText}`;
    const elapsedText = actualStart
      ? `Geçen süre: ${formatDuration((Date.now() - actualStart) / (1000 * 60 * 60 * 24))}`
      : "Gerçek başlangıç henüz kaydedilmedi";

    // Detay satırları (sadece açıkken oluşturuluyor — gereksiz DOM şişkinliği olmasın)
    const detailRowsHtml = isExpanded
      ? (total > 0
          ? sprintTickets.map(t => `
              <div class="report-ticket-detail-row">
                <span class="work-item-icon">${workItemTypeIcon(t.workItemType)}</span>
                ${issueKey(t)}
                <span class="report-ticket-detail-title">${escapeHtml(t.title)}</span>
                <span class="sprint-status-badge" style="color:${t.statusColor}; background:${t.statusColor}22;">${escapeHtml(t.statusName)}</span>
                <span class="report-ticket-detail-assignee">${escapeHtml(t.assigneeName || "Atanmamış")}</span>
              </div>
            `).join("")
          : '<div class="muted" style="font-size:12px; padding:8px 0;">Bu sprint\'te iş yok.</div>')
      : "";

    return `
      <div class="report-sprint-card">
        <div class="report-sprint-card-header">
          <span class="report-sprint-card-title">${issueKey(s)} <span class="report-sprint-icon">${sprintIconSvg()}</span><strong>${escapeHtml(s.name)}</strong></span>
          ${deadlineHtml}
        </div>
        ${s.goal ? `<p class="report-sprint-goal">${escapeHtml(s.goal)}</p>` : ""}
        <p class="report-sprint-dates">${dateRangeText}<br><span>${elapsedText}</span></p>

        <div class="report-type-summary" data-toggle-sprint-detail="${s.id}">
          <span>${typeCountsHtml}</span>
          <span class="report-expand-chevron ${isExpanded ? "open" : ""}">▾</span>
        </div>

        <div class="sprint-progress-bar-wrap" style="margin-top:10px;"><div class="sprint-progress-bar" style="width:${pct}%;"></div></div>
        <div class="report-sprint-card-stats">${done}/${total} tamamlandı (%${pct})</div>

        ${isExpanded ? `<div class="report-ticket-detail-list">${detailRowsHtml}</div>` : ""}
      </div>
    `;
  }).join("");

  cardsEl.querySelectorAll("[data-toggle-sprint-detail]").forEach(el => {
    el.addEventListener("click", () => {
      const sprintId = el.dataset.toggleSprintDetail;
      if (reportExpandedCards.has(sprintId)) reportExpandedCards.delete(sprintId);
      else reportExpandedCards.add(sprintId);
      renderReports();
    });
  });
}

function formatDuration(days) {
  if (days === null || days === undefined) return "—";
  const totalMinutes = days * 24 * 60;
  if (totalMinutes < 60) return `${Math.round(totalMinutes)} dakika`;
  if (totalMinutes < 24 * 60) return `${(totalMinutes / 60).toFixed(1)} saat`;
  return `${days.toFixed(1)} gün`;
}

function renderSprintVelocityTrend() {
  const trendEl = document.getElementById("sprintVelocityTrend");
  if (!trendEl) return;

  let closedSprints = sprints.filter(s => s.status === "Closed" && (!currentSpace || String(s.spaceId) === String(currentSpace.id)) && sprintReportAnchorTime(s));

  if (reportVelocityRange.start && reportVelocityRange.end) {
    closedSprints = closedSprints.filter(s => { const a = sprintReportAnchorTime(s); return a >= reportVelocityRange.start && a <= reportVelocityRange.end; });
  } else {
    if (reportVelocityMonth) closedSprints = closedSprints.filter(s => (new Date(sprintReportAnchorTime(s)).getMonth() + 1) === parseInt(reportVelocityMonth, 10));
    if (reportVelocityYear) closedSprints = closedSprints.filter(s => new Date(sprintReportAnchorTime(s)).getFullYear() === parseInt(reportVelocityYear, 10));
  }
  closedSprints = closedSprints.sort((a, b) => (sprintReportAnchorTime(b) || 0) - (sprintReportAnchorTime(a) || 0)); // En yeni gerçek başlangıç en üstte

  if (closedSprints.length === 0) {
    trendEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>Bu döneme uyan kapanmış sprint yok.</p></div>';
    return;
  }

  // Geçmiş, kapanmış sprintlerin tamamlanma performansına bakıyoruz — bu yüzden getScopedTickets()
  // değil, tüm ticket verisini kullanıyoruz (teknisyen kapsamlaması burada "şu an kimin işi" ile ilgisiz).
  const rows = closedSprints.map(s => {
    const d = getSprintLifecycleReportData(s);
    return {
      id: s.id, name: s.name, keyHtml: issueKey(s), pct: d.pct, done: d.done, total: d.total,
      isEstimated: d.isEstimated, snapshotTickets: d.snapshotTickets, plannedStartAt: s.startDate,
      startedAt: d.actualStartedAt, endDate: s.endDate, closedAt: d.closedAt,
      plannedDurationDays: d.plannedDurationDays, actualDurationDays: d.actualDurationDays, wasOvertime: d.wasOvertime
    };
  });

  // Üstteki özet istatistikler
  const withTiming = rows.filter(r => r.actualDurationDays !== null);
  const avgPct = Math.round(rows.reduce((sum, r) => sum + r.pct, 0) / rows.length);
  const fullyDoneCount = rows.filter(r => r.pct === 100).length;
  const overtimeCount = rows.filter(r => r.wasOvertime).length; // Payda artık toplam kapanan sprint sayısı
  const avgActualDuration = withTiming.length > 0 ? (withTiming.reduce((sum, r) => sum + r.actualDurationDays, 0) / withTiming.length) : null;

  // Planlanan süreye göre (1/2/3/4 hafta) grupla — her grubun ortalama gerçek kapanma süresi.
  // Bir grupta hiç sprint yoksa satır tamamen gizlenmiyor, "Veri yok" ile birlikte gösteriliyor —
  // böylece "2 haftalık sprint hiç yok mu, yoksa unutuldu mu" belirsizliği kalmıyor.
  const bucketLabels = [
    { label: "1 Hafta", min: 0, max: 9 },
    { label: "2 Hafta", min: 10, max: 16 },
    { label: "3 Hafta", min: 17, max: 23 },
    { label: "4+ Hafta", min: 24, max: Infinity }
  ];
  const bucketStatsHtml = bucketLabels.map(b => {
    const inBucket = withTiming.filter(r => r.plannedDurationDays !== null && r.plannedDurationDays >= b.min && r.plannedDurationDays <= b.max);
    if (inBucket.length === 0) {
      return `<div class="report-bucket-row"><span>${b.label}</span><span class="muted">Veri yok</span></div>`;
    }
    const avgDur = inBucket.reduce((sum, r) => sum + r.actualDurationDays, 0) / inBucket.length;
    return `<div class="report-bucket-row"><span>${b.label}</span><span class="muted">${inBucket.length} sprint</span><span><strong>${formatDuration(avgDur)}</strong> ort.</span></div>`;
  }).join("");

  trendEl.innerHTML = `
    <div class="report-velocity-stats-grid">
      <div class="report-stat-box"><strong>%${avgPct}</strong><span>Ortalama tamamlanma (kapanış anında)</span></div>
      <div class="report-stat-box"><strong>${fullyDoneCount}/${rows.length}</strong><span>Eksiksiz kapanan</span></div>
      ${avgActualDuration !== null ? `<div class="report-stat-box"><strong>${formatDuration(avgActualDuration)}</strong><span>Ortalama sürdüğü süre</span></div>` : ""}
      <div class="report-stat-box"><strong>${overtimeCount}/${rows.length}</strong><span>Süresi aşılarak kapanan</span></div>
    </div>
    <div class="report-bucket-table"><div class="report-bucket-title">Planlanan Süreye Göre Ortalama Kapanma</div>${bucketStatsHtml}</div>
    <div class="report-velocity-rows">
      ${rows.map(r => {
        const isExpanded = reportExpandedVelocityRows.has(r.id);
        const detailHtml = isExpanded ? buildVelocityDetailHtml(r) : "";
        return `
          <div class="report-velocity-row-wrap">
            <div class="report-velocity-row" data-toggle-velocity-detail="${r.id}">
              <span class="report-velocity-row-label">${r.keyHtml} <span class="muted">${escapeHtml(r.name)}</span>${r.wasOvertime ? ' <span class="report-overtime-tag">süresi aşıldı</span>' : ""}</span>
              <div class="report-velocity-row-track"><div class="report-velocity-row-fill" style="width:${r.pct}%;"></div></div>
              <span class="report-velocity-row-pct">%${r.pct}</span>
              <span class="report-expand-chevron ${isExpanded ? "open" : ""}">▾</span>
            </div>
            ${detailHtml}
          </div>
        `;
      }).join("")}
    </div>
  `;

  trendEl.querySelectorAll("[data-toggle-velocity-detail]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.toggleVelocityDetail;
      if (reportExpandedVelocityRows.has(id)) reportExpandedVelocityRows.delete(id);
      else reportExpandedVelocityRows.add(id);
      renderSprintVelocityTrend();
    });
  });
}

function buildVelocityDetailHtml(row) {
  const fmt = (ms) => ms ? new Date(ms).toLocaleDateString("tr-TR") : "—";
  const fmtDateTime = (ms) => ms ? new Date(ms).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
  const timingHtml = `
    <div class="report-velocity-timing">
      <span>Planlanan başlangıç: <strong>${fmtDateTime(row.plannedStartAt)}</strong></span>
      <span>Gerçek başlangıç: <strong>${row.startedAt ? fmtDateTime(row.startedAt) : "Bilinmiyor (eski kayıt)"}</strong></span>
      <span>Planlanan bitiş: <strong>${fmtDateTime(row.endDate)}</strong></span>
      <span>Gerçek kapanış: <strong>${row.closedAt ? fmtDateTime(row.closedAt) : "Bilinmiyor (eski kayıt)"}</strong></span>
      ${row.actualDurationDays !== null ? `<span>Sürdüğü Süre: <strong>${formatDuration(row.actualDurationDays)}</strong>${row.wasOvertime ? ' <span class="report-overtime-tag">süresi aşıldı</span>' : ""}</span>` : ""}
    </div>
  `;

  if (row.snapshotTickets.length === 0) {
    return `<div class="report-velocity-detail">${timingHtml}<div class="muted" style="font-size:12px; padding:8px 0;">Bu sprint'te iş yoktu.</div></div>`;
  }
  const rowsHtml = row.snapshotTickets.map(t => {
    let statusLabel, statusClass;
    if (t.completed) {
      statusLabel = "Tamamlandı"; statusClass = "done";
    } else if (t.movedTo?.sprintName) {
      statusLabel = t.movedTo.createdDuringClose ? `→ Yeni ${t.movedTo.sprintName} sprinti oluşturuldu ve taşındı` : `→ Var olan ${t.movedTo.sprintName} sprintine taşındı`; statusClass = "moved";
    } else if (t.movedTo?.backlog) {
      statusLabel = "→ Backlog'a taşındı"; statusClass = "moved";
    } else {
      statusLabel = "Tamamlanmadı"; statusClass = "incomplete";
    }
    return `
      <div class="report-velocity-detail-row">
        <span class="work-item-icon">${workItemTypeIcon(t.workItemType)}</span>
        <span class="report-velocity-detail-title">${escapeHtml(t.title)}</span>
        <span class="report-velocity-detail-assignee">${escapeHtml(t.assigneeName || "Atanmamış")}</span>
        <span class="report-velocity-detail-status ${statusClass}">${statusLabel}</span>
        ${issueKey({ id: t.id, statusName: t.completed ? "Closed" : "" })}
      </div>
    `;
  }).join("");
  return `<div class="report-velocity-detail">${timingHtml}${rowsHtml}</div>`;
}

function populateVelocityPeriodFilter() {
  const yearEl = document.getElementById("reportVelocityYear");
  if (!yearEl || yearEl.options.length > 1) return; // Sadece bir kere doldur

  const years = new Set(sprints.filter(s => s.startDate).map(s => new Date(s.startDate).getFullYear()));
  if (years.size === 0) years.add(new Date().getFullYear());
  const sortedYears = Array.from(years).sort((a, b) => b - a);
  yearEl.innerHTML = '<option value="">Yıl</option>' + sortedYears.map(y => `<option value="${y}">${y}</option>`).join("");
}

// ---------- İş Yükü Raporu ----------
// Bir ticket'ın ham geçmişinden, Technician ve Status alanlarındaki değişiklikleri ayıklar.
// SDP'nin diff.field değeri tam olarak hangi isimle geliyor bilmediğimiz için (sürüme göre
// değişebilir), esnek/büyük-küçük harf duyarsız eşleştirme kullanıyoruz.
function analyzeTicketHistory(rawHistory, ticket) {
  const assignmentTimeline = []; // { timestamp, byName, from, to }
  const statusTimeline = []; // { timestamp, byName, from, to }
  const combinedTimeline = []; // Doğal (SDP) sırasıyla, atama+statü olayları karışık, tek liste

  rawHistory.forEach(entry => {
    entry.diffs.forEach(d => {
      const fieldLower = (d.field || "").toLowerCase();
      const prev = (d.previous_value && d.previous_value !== "null") ? d.previous_value : null;
      if (fieldLower.includes("technician") || fieldLower.includes("assign")) {
        const evt = { type: "assign", timestamp: entry.timestamp, byName: entry.byName, from: prev, to: d.current_value || null };
        assignmentTimeline.push(evt);
        combinedTimeline.push(evt);
      } else if (fieldLower.includes("status")) {
        const evt = { type: "status", timestamp: entry.timestamp, byName: entry.byName, from: prev, to: d.current_value || null };
        statusTimeline.push(evt);
        combinedTimeline.push(evt);
      }
    });
  });

  // KRİTİK DÜZELTME: bir iş oluşturulurken DOĞRUDAN birine atanmışsa, bu bir "değişiklik" değil
  // "oluşturma anındaki ilk değer" olduğu için SDP'nin geçmişinde HİÇ görünmüyor — geçmiş sadece
  // SONRAKİ değişiklikleri tutuyor. Bunu tespit edip başa sentetik bir "oluşturulurken atandı"
  // olayı ekliyoruz, aksi halde "ilk atama" bilgisi tamamen kayıp oluyordu.
  if (ticket) {
    const firstAssignment = assignmentTimeline[0];
    const creationAssignee = firstAssignment ? firstAssignment.from : (ticket.assigneeName || null);
    if (creationAssignee) {
      const syntheticEvt = { type: "assign", timestamp: ticket.createdTimeMs, byName: ticket.createdBy || "Bilinmiyor", from: null, to: creationAssignee, isCreationAssignment: true };
      assignmentTimeline.unshift(syntheticEvt);
      combinedTimeline.unshift(syntheticEvt);
    }
  }

  // Kapatılıp sonradan tekrar açılmış mı? Statü geçmişinde "Closed/Resolved"tan başka bir şeye
  // dönen bir geçiş varsa, bu ticket en az bir kere yeniden açılmış demektir.
  const reopenEvents = [];
  for (let i = 1; i < statusTimeline.length; i++) {
    const prevWasDone = /closed|resolved/i.test(statusTimeline[i - 1].to || "");
    const nowNotDone = !/closed|resolved/i.test(statusTimeline[i].to || "");
    if (prevWasDone && nowNotDone) {
      reopenEvents.push({ timestamp: statusTimeline[i].timestamp, byName: statusTimeline[i].byName });
    }
  }

  const lastAssignment = assignmentTimeline[assignmentTimeline.length - 1] || null;

  return { assignmentTimeline, statusTimeline, combinedTimeline, reopenEvents, lastAssignedAt: lastAssignment ? lastAssignment.timestamp : null };
}


// ---------- Epic Raporu ----------
// Bu rapor yalnızca loadData() ile SDP'den gerçekten yüklenmiş Epic ve Request kayıtlarını kullanır.
// Tahmini velocity, sahte tarih veya üretilmiş/mock veri içermez.
