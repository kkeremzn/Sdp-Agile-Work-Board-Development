/* Manager workload report and historical technician analysis */
let workloadReportCache = null; // Aynı oturumda tekrar tekrar yüklemesin diye basit bir önbellek
let workloadReportLoadedAt = null;
let workloadExpandedTickets = new Set();
let workloadStatusFilter = "open"; // "open" | "closed" | "all"
let workloadTechnicianFilter = "all";

async function loadWorkloadReport() {
  const progressEl = document.getElementById("workloadReportProgress");
  const contentEl = document.getElementById("workloadReportContent");
  const loadBtn = document.getElementById("loadWorkloadReportBtn");
  if (!progressEl || !contentEl || !loadBtn) return;

  const spaceTickets = tickets.filter(t => !currentSpace || String(t.spaceId) === String(currentSpace.id));
  const openTickets = spaceTickets.filter(t => !isTicketClosed(t));
  // KÖK SEBEP BULUNDU: "son 30 gün" kapsamını lastUpdatedTimeMs'e göre belirliyordum — bu alan
  // toplu (liste) API'sinden geldiğinde muhtemelen boş/null geliyor (Sprint/Epic'te yaşadığımız
  // aynı sorun). Bu yüzden bir arka plan yenilemesinden SONRA, TÜM kapanan işler (sadece o an
  // kapatılan değil, daha önce doğru görünenler de dahil) sessizce bu filtreden düşüyordu — hiçbir
  // hata vermeden, çünkü kod çökmüyordu, sadece filtre yanlış eleniyordu. Artık bu güvenilmez alana
  // hiç güvenmiyoruz — kapanan işleri zaman sınırı koymadan, hepsini çekiyoruz.
  const closedTickets = spaceTickets.filter(t => isTicketClosed(t));
  const relevantTickets = [...openTickets, ...closedTickets];

  if (relevantTickets.length === 0) {
    contentEl.innerHTML = '<div class="empty-state" style="padding:24px;"><p>Gösterilecek açık ya da kapanmış iş yok.</p></div>';
    return;
  }

  loadBtn.disabled = true;
  progressEl.style.display = "block";
  contentEl.innerHTML = "";

  const results = []; // { ticket, analysis }
  let processed = 0;
  let failedCount = 0;

  for (const t of relevantTickets) {
    progressEl.textContent = `İş geçmişleri yükleniyor... (${processed + 1}/${relevantTickets.length})`;
    // Ticket'ı burada, bu anda KOPYALIYORUZ (shallow clone yeterli, tüm alanlar düz değer) —
    // rapor artık canlı `tickets` dizisindeki nesneyle hiçbir bağı olmayan, tamamen bağımsız
    // kendi kopyasını tutuyor. Böylece arka planda ne olursa olsun (yeniden yükleme, başka bir
    // işlem) bu raporun görüntüsü ASLA kendiliğinden değişmez.
    const ticketSnapshot = { ...t };
    try {
      const isClosed = isTicketClosed(t);
      if (isClosed) {
        // Toplu (liste) uç noktası resolution içeriğini atlıyor olabilir (Sprint/Epic'te
        // yaşadığımız aynı sorun) — kapanan işler için güvenilir olsun diye bireysel kaydı
        // ayrıca çekip resolution metnini oradan tazeliyoruz.
        try {
          const fullTicket = await sdpApiFetch(`/api/v3/requests/${t.id}`, "GET");
          const freshResolution = fullTicket.request?.resolution?.content;
          if (freshResolution) ticketSnapshot.resolutionText = freshResolution;
        } catch (detailErr) {
          console.warn(`İş #${t.id} için tam detay alınamadı, mevcut resolution verisiyle devam ediliyor:`, detailErr);
        }
      }
      const rawHistory = await fetchTicketRawHistory(t.id);
      results.push({ ticket: ticketSnapshot, analysis: analyzeTicketHistory(rawHistory, ticketSnapshot) });
    } catch (err) {
      failedCount++;
      results.push({ ticket: ticketSnapshot, analysis: null, error: err.message || "Bilinmeyen hata" }); // Geçmişi alınamayan iş yine de listede kalsın, sadece tarih bilgisi olmasın — hatayı görünür kılıyoruz
    }
    processed++;
  }

  progressEl.style.display = "none";
  loadBtn.disabled = false;
  loadBtn.textContent = "Raporu Yenile";
  if (failedCount > 0) {
    showToast(`${failedCount} işin geçmişi alınamadı, diğerleri gösteriliyor.`, "warning");
  }

  workloadReportCache = results;
  workloadReportLoadedAt = Date.now();
  renderWorkloadReport(results);
}

function buildTicketTimelineHtml(ticket, analysis) {
  const fmtDT = (ms) => ms ? new Date(ms).toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Bilinmiyor";

  // "Oluşturuldu" olayı her zaman, kesin olarak ilk sırada — bu diğer her şeyden mantıken önce
  // gelmek ZORUNDA (bir işin geçmişi, oluşturulmadan önce başlayamaz). Ardından, analyzeTicketHistory
  // tarafından SDP'nin kendi doğal (ve güvenilir) sırasıyla hazırlanmış combinedTimeline geliyor —
  // burada BİR DAHA sıralama yapmıyoruz, çünkü kendi ayrıştırdığımız saatlere göre sıralamak
  // saat dilimi kaymaları yüzünden sırayı bozabiliyordu.
  const creationAssignEvt = (analysis?.combinedTimeline || []).find(e => e.isCreationAssignment);
  const creationAssignText = creationAssignEvt ? `, doğrudan ${creationAssignEvt.to}'e atandı` : "";
  const events = [
    { timestamp: ticket.createdTimeMs, text: `Oluşturuldu (${ticket.createdBy || "Bilinmiyor"})${creationAssignText}` }
  ];
  (analysis?.combinedTimeline || []).forEach(e => {
    if (e.isCreationAssignment) return; // Bu zaten "Oluşturuldu" satırının bir parçası olarak ima ediliyor, ayrıca gösterme
    if (e.type === "assign") {
      const toLabel = e.to || "Atanmamış";
      const fromLabel = e.from ? ` (önceden: ${e.from})` : "";
      events.push({ timestamp: e.timestamp, text: `${e.byName}, işi ${toLabel}'e atadı${fromLabel}` });
    } else {
      events.push({ timestamp: e.timestamp, text: `${e.byName}, durumu "${e.from || "—"}"dan "${e.to}"a değiştirdi` });
    }
  });

  return `
    <div class="report-velocity-detail" style="border-top:1px dashed var(--border); margin-top:8px; padding-top:8px;">
      ${events.map(e => `<div style="font-size:11.5px; padding:3px 0; display:flex; gap:8px;"><span class="muted" style="flex-shrink:0;">${fmtDT(e.timestamp)}</span><span>${e.text}</span></div>`).join("")}
    </div>
  `;
}

function renderWorkloadReport(results) {
  const contentEl = document.getElementById("workloadReportContent");
  if (!contentEl) return;

  try {
    renderWorkloadReportInner(results, contentEl);
  } catch (fatalErr) {
    // Render tamamen çökerse (örn. beklenmedik bir veri şekli), her şeyi sessizce kaybetmek yerine
    // hatayı doğrudan ekranda gösteriyoruz — "hepsi birden gitti" sorununun asıl sebebi muhtemelen
    // buydu: TEK bir satırdaki beklenmeyen veri, TÜM render'ı patlatıp boş bırakıyordu.
    console.error("İş Yükü Raporu render hatası:", fatalErr);
    contentEl.innerHTML = `<div class="empty-state" style="padding:16px; color:var(--danger);"><p>⚠ Rapor gösterilirken bir hata oluştu: ${escapeHtml(fatalErr.message)}</p><p class="muted" style="font-size:11px;">Bu hatayı ekran görüntüsüyle paylaşırsan kesin teşhis koyabilirim.</p></div>`;
  }
}

function renderWorkloadReportInner(results, contentEl) {

  const filtered = results.filter(r => {
    const isClosed = isTicketClosed(r.ticket);
    const statusOk = workloadStatusFilter === "open" ? !isClosed : workloadStatusFilter === "closed" ? isClosed : true;
    const technicianOk = workloadTechnicianFilter === "all" || (workloadTechnicianFilter === "__unassigned__" ? !r.ticket.assigneeId : String(r.ticket.assigneeId || "") === String(workloadTechnicianFilter));
    return statusOk && technicianOk;
  });

  const fmt = (ms) => ms ? new Date(ms).toLocaleDateString("tr-TR") : "Bilinmiyor";

  // Filtre seçenekleri rapor sonucundan türetilmez. İş/Epic oluşturma ekranıyla aynı merkezi
  // SDP teknisyen listesi kullanılır; işi olmayan teknisyen de seçimde görünmeye devam eder.
  const allTechnicians = [...assignees].sort((a,b)=>a.name.localeCompare(b.name,"tr"));
  const hasUnassigned = results.some(r => !r.ticket.assigneeId || !r.ticket.assigneeName || r.ticket.assigneeName === "Atanmamış");

  const filterHtml = `
    <div class="workload-report-controls">
      <div class="filter-chip-group">
        <button class="filter-chip ${workloadStatusFilter === "open" ? "active" : ""}" data-workload-filter="open">Açık</button>
        <button class="filter-chip ${workloadStatusFilter === "closed" ? "active" : ""}" data-workload-filter="closed">Kapalı</button>
        <button class="filter-chip ${workloadStatusFilter === "all" ? "active" : ""}" data-workload-filter="all">Tümü</button>
      </div>
      <div class="workload-tech-group">
        <span class="technician-filter-label">Teknisyen</span>
        <select id="workloadTechnicianSelect" class="report-assignee-filter">
          <option value="all">Tüm Teknisyenler</option>
          ${hasUnassigned ? `<option value="__unassigned__" ${workloadTechnicianFilter === "__unassigned__" ? "selected" : ""}>Atanmamış</option>` : ""}
          ${allTechnicians.map(a => `<option value="${escapeHtml(String(a.id))}" ${String(workloadTechnicianFilter) === String(a.id) ? "selected" : ""}>${escapeHtml(a.name)}</option>`).join("")}
        </select>
      </div>
    </div>
  `;

  const rowsHtml = filtered.map(r => {
    try {
    const t = r.ticket;
    const a = r.analysis;
    const isClosed = isTicketClosed(t);
    const isExpanded = workloadExpandedTickets.has(t.id);
    const reopenedTag = (a?.reopenEvents?.length > 0) ? `<span class="report-overtime-tag" data-tip="En son yeniden açılma: ${a.reopenEvents[a.reopenEvents.length - 1].byName}, ${new Date(a.reopenEvents[a.reopenEvents.length - 1].timestamp).toLocaleString("tr-TR")}">yeniden açıldı</span>` : "";

    let closedInfoHtml = "";
    let resolutionHtml = "";
    if (isClosed && a) {
      const closedEntry = [...a.statusTimeline].reverse().find(s => /closed|resolved/i.test(s.to || ""));
      const closedAt = closedEntry ? closedEntry.timestamp : t.lastUpdatedTimeMs;
      const durationDays = (closedAt && t.createdTimeMs) ? (closedAt - t.createdTimeMs) / (1000 * 60 * 60 * 24) : null;
      const closedByName = closedEntry ? closedEntry.byName : "Bilinmiyor";
      closedInfoHtml = `<span class="muted" style="font-size:11px;">Kapandı: ${closedAt ? fmt(closedAt) : "Bilinmiyor"} (${closedByName})${durationDays !== null && durationDays >= 0 ? ` — ${formatDuration(durationDays)} sürdü` : ""}</span>`;
      if (t.resolutionText) {
        resolutionHtml = `<div class="drawer-resolution-text" style="margin-top:6px; font-size:11.5px;">${escapeHtml(t.resolutionText)}</div>`;
      }
    }

    // Bir işin geçmişi/detayı çekilemediyse artık SESSİZCE kaybolmuyor — hatayı doğrudan
    // satırın içinde gösteriyoruz, ne olduğunu görebilesin diye.
    const errorHtml = r.error
      ? `<div class="muted" style="color:var(--danger); font-size:11px; margin-top:4px;">⚠ Geçmiş verisi alınamadı: ${escapeHtml(r.error)}</div>`
      : "";

    const parentEpic = t.epicId ? epics.find(e => String(e.id) === String(t.epicId)) : null;
    const epicTagHtml = parentEpic ? `<span class="epic-tag">${epicIconSvg()} ${escapeHtml(parentEpic.name)}</span>` : "";

    return `
      <div class="report-velocity-row-wrap ${isClosed ? "workload-row-closed" : ""}">
        <div class="report-velocity-detail-row" data-toggle-workload-ticket="${t.id}" style="cursor:pointer;">
          <span class="work-item-icon">${workItemTypeIcon(t.workItemType)}</span>
          ${issueKey(t)}
          <span class="report-velocity-detail-title">${escapeHtml(t.title)}</span>
          ${epicTagHtml}
          <span class="sprint-status-badge" style="color:${t.statusColor}; background:${t.statusColor}22;">${escapeHtml(t.statusName)}</span>
          <span class="muted" style="font-size:11px;">${escapeHtml(t.assigneeName || "Atanmamış")}</span>
          <span class="muted" style="font-size:11px;">Oluşturuldu: ${fmt(t.createdTimeMs)}</span>
          <span class="muted" style="font-size:11px;">Son atanma: ${a?.lastAssignedAt ? fmt(a.lastAssignedAt) : "Bilinmiyor"}</span>
          ${closedInfoHtml}
          ${reopenedTag}
          <span class="report-expand-chevron ${isExpanded ? "open" : ""}">▾</span>
        </div>
        ${resolutionHtml}
        ${errorHtml}
        ${isExpanded ? buildTicketTimelineHtml(t, a) : ""}
      </div>
    `;
    } catch (rowErr) {
      console.error(`İş #${r.ticket?.id} satırı render edilemedi:`, rowErr);
      return `<div class="muted" style="color:var(--danger); font-size:11px; padding:6px 0;">⚠ "${escapeHtml(r.ticket?.title || "Bir iş")}" gösterilemedi: ${escapeHtml(rowErr.message)}</div>`;
    }
  }).join("");

  const loadedAtHtml = workloadReportLoadedAt
    ? `<p class="muted" style="font-size:11px; margin-bottom:12px;">Bu, ${new Date(workloadReportLoadedAt).toLocaleString("tr-TR")} anındaki durumun görüntüsü — güncellemek için "Raporu Yenile"ye tekrar bas.</p>`
    : "";

  contentEl.innerHTML = `
    ${loadedAtHtml}
    ${filterHtml}
    ${rowsHtml || '<div class="empty-state" style="padding:16px;"><p>Bu filtreye uyan iş yok.</p></div>'}
  `;

  const technicianSelect = document.getElementById("workloadTechnicianSelect");
  if (technicianSelect) {
    technicianSelect.addEventListener("change", () => {
      workloadTechnicianFilter = technicianSelect.value;
      renderWorkloadReport(workloadReportCache || results);
    });
  }

  contentEl.querySelectorAll("[data-toggle-workload-ticket]").forEach(el => {
    el.addEventListener("click", () => {
      const id = el.dataset.toggleWorkloadTicket;
      if (workloadExpandedTickets.has(id)) workloadExpandedTickets.delete(id);
      else workloadExpandedTickets.add(id);
      renderWorkloadReport(workloadReportCache || results);
    });
  });
  contentEl.querySelectorAll("[data-workload-filter]").forEach(el => {
    el.addEventListener("click", () => {
      workloadStatusFilter = el.dataset.workloadFilter;
      renderWorkloadReport(workloadReportCache || results);
    });
  });
}


function exportWorkloadReportXlsx() {
  if (!workloadReportCache || workloadReportCache.length === 0) {
    showToast("Önce İş Yükü Raporu'nu yükle.", "warning");
    return;
  }

  const now = new Date();
  const COLUMN_COUNT = 17;
  const headerBlock = buildReportHeaderRows(now, COLUMN_COUNT);
  const rowsData = [...headerBlock.rows];
  const relevant = workloadReportCache.filter(r => r && r.ticket);
  const isClosedTicket = (t) => isTicketClosed(t);
  const fmtDateTime = (ms) => ms ? new Date(ms).toLocaleString("tr-TR") : "Bilinmiyor";
  const fmtDuration = (days) => {
    if (days == null || !Number.isFinite(days) || days < 0) return "Bilinmiyor";
    if (days < 1) {
      const minutes = Math.max(1, Math.round(days * 24 * 60));
      return minutes < 60 ? `${minutes} dk` : `${(minutes / 60).toFixed(1)} saat`;
    }
    return `${days.toFixed(1)} gün`;
  };

  // Excel, widget'taki seçili Açık/Kapalı/Teknisyen filtresinden bağımsız olarak
  // yüklenmiş raporun TAMAMINI verir. Filtreler yalnızca ekrandaki görünümü etkiler.
  const allTechnicians = Array.from(
    new Set(relevant.map(r => r.ticket.assigneeName || "Atanmamış"))
  ).sort((a, b) => a.localeCompare(b, "tr"));

  const totalOpen = relevant.filter(r => !isClosedTicket(r.ticket)).length;
  const totalClosed = relevant.length - totalOpen;
  const reopenedCount = relevant.filter(r => (r.analysis?.reopenEvents?.length || 0) > 0).length;
  const failedHistory = relevant.filter(r => r.error).length;

  rowsData.push({ header: true, cells: ["Genel Özet", "Değer", ...Array(COLUMN_COUNT - 2).fill("")] });
  [
    ["Toplam İş", String(relevant.length)],
    ["Açık İş", String(totalOpen)],
    ["Kapalı İş", String(totalClosed)],
    ["Teknisyen Sayısı", String(allTechnicians.length)],
    ["Yeniden Açılan İş", String(reopenedCount)],
    ["Geçmişi Alınamayan İş", String(failedHistory)]
  ].forEach(([label, value]) => {
    rowsData.push({ isTicketRow: true, cells: [label, value, ...Array(COLUMN_COUNT - 2).fill("")] });
  });
  rowsData.push({ cells: Array(COLUMN_COUNT).fill("") });

  rowsData.push({
    header: true,
    cells: [
      "Teknisyen", "Grup", "İş Key", "İş Tipi", "Başlık", "Durum", "Öncelik",
      "Epic", "Sprint", "Oluşturan", "Oluşturulma", "Son Atanma", "Kapanma",
      "Süre", "Yeniden Açıldı", "Çözüm", "Kronoloji"
    ]
  });

  allTechnicians.forEach((technician, techIndex) => {
    const techResults = relevant
      .filter(r => (r.ticket.assigneeName || "Atanmamış") === technician)
      .sort((a, b) => {
        const ac = isClosedTicket(a.ticket) ? 1 : 0;
        const bc = isClosedTicket(b.ticket) ? 1 : 0;
        return ac - bc || String(a.ticket.title || "").localeCompare(String(b.ticket.title || ""), "tr");
      });

    const open = techResults.filter(r => !isClosedTicket(r.ticket));
    const closed = techResults.filter(r => isClosedTicket(r.ticket));

    rowsData.push({
      isSprintRow: true,
      cells: [
        technician, `Toplam ${techResults.length} iş`, `Açık: ${open.length}`, `Kapalı: ${closed.length}`,
        "", "", "", "", "", "", "", "", "", "", "", "", ""
      ]
    });

    const appendGroup = (label, groupResults) => {
      rowsData.push({
        isTicketRow: true,
        cells: [label, `${groupResults.length} iş`, ...Array(COLUMN_COUNT - 2).fill("")]
      });

      if (groupResults.length === 0) {
        rowsData.push({ cells: ["", "(Bu grupta iş yok)", ...Array(COLUMN_COUNT - 2).fill("")] });
        return;
      }

      groupResults.forEach(r => {
        const t = r.ticket;
        const a = r.analysis;
        const closed = isClosedTicket(t);
        const closedEntry = a?.statusTimeline
          ? [...a.statusTimeline].reverse().find(s => /closed|resolved/i.test(s.to || ""))
          : null;
        const closedAt = closedEntry?.timestamp || t.lastUpdatedTimeMs || null;
        const durationDays = closed && closedAt && t.createdTimeMs
          ? (closedAt - t.createdTimeMs) / (1000 * 60 * 60 * 24)
          : null;

        const chronology = [`Oluşturuldu: ${fmtDateTime(t.createdTimeMs)} (${t.createdBy || "Bilinmiyor"})`];
        if (a?.combinedTimeline?.length) {
          a.combinedTimeline.forEach(e => {
            if (e.isCreationAssignment) return;
            if (e.type === "assign") {
              chronology.push(`${fmtDateTime(e.timestamp)} — ${e.byName || "Bilinmiyor"}: ${e.to || "Atanmamış"}'e atandı${e.from ? ` (önceden: ${e.from})` : ""}`);
            } else {
              chronology.push(`${fmtDateTime(e.timestamp)} — ${e.byName || "Bilinmiyor"}: ${e.from || "—"} → ${e.to || "—"}`);
            }
          });
        }

        const parentEpic = t.epicId ? epics.find(e => String(e.id) === String(t.epicId)) : null;
        const parentSprint = t.sprintId ? sprints.find(s => String(s.id) === String(t.sprintId)) : null;

        const row = {
          isTicketRow: true,
          cells: [
            t.assigneeName || "Atanmamış", label, issueKeyText(t), t.workItemType || "—",
            t.title || "—", t.statusName || "—", t.priority || "—",
            parentEpic?.name || "—", parentSprint?.name || "—", t.createdBy || "Bilinmiyor",
            fmtDateTime(t.createdTimeMs), a?.lastAssignedAt ? fmtDateTime(a.lastAssignedAt) : "Bilinmiyor",
            closed ? fmtDateTime(closedAt) : "—", closed ? fmtDuration(durationDays) : "Devam ediyor",
            a?.reopenEvents?.length ? `Evet (${a.reopenEvents.length})` : "Hayır",
            t.resolutionText || "—", chronology.join("\\n")
          ],
          cellStyles: [
            null, null, null, xlsxColorStyleIndex(t.workItemType), null,
            xlsxColorStyleIndex(t.statusName), null, null, null, null, null, null, null, null, null, null, null
          ]
        };
        rowsData.push(row);
      });
    };

    appendGroup("AÇIK İŞLER", open);
    appendGroup("KAPALI İŞLER", closed);
    if (techIndex < allTechnicians.length - 1) rowsData.push({ cells: Array(COLUMN_COUNT).fill("") });
  });

  downloadXlsx(
    `is-yuku-raporu-${now.toISOString().slice(0, 10)}.xlsx`,
    "İş Yükü Raporu",
    rowsData,
    [22, 14, 12, 11, 34, 16, 12, 24, 24, 20, 20, 20, 20, 16, 15, 32, 65],
    headerBlock.merges
  );
}

