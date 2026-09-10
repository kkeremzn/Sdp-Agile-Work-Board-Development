/* Dependency-free XLSX writer */
/* Minimal dependency-free XLSX writer */
// ---------- .xlsx Dışa Aktarma (dış kütüphane yok, tamamen kendi yazdığımız minimal motor) ----------
// XLSX dosyaları aslında içinde XML dosyaları olan bir ZIP arşivi. CDN/kütüphane bağımlılığından
// kaçınmak için (font hatasından ders çıkardık — kapalı ağlarda dış kaynak riskli), ZIP'i ve
// gerekli XML'leri sıfırdan, sadece JS ile üretiyoruz. "STORE" (sıkıştırmasız) yöntemi kullanıyoruz —
// bu, karmaşık bir sıkıştırma algoritması gerektirmiyor, sadece doğru CRC32 ve ZIP başlıkları yeterli.

const XLSX_CRC_TABLE = (() => {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c;
  }
  return table;
})();
function xlsxCrc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < bytes.length; i++) crc = XLSX_CRC_TABLE[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function buildMinimalZip(files) {
  // files: [{name, content: Uint8Array}]
  const encoder = new TextEncoder();
  const chunks = [];
  const centralChunks = [];
  let offset = 0;

  const writeUInt32LE = (view, pos, val) => { view.setUint32(pos, val, true); };
  const writeUInt16LE = (view, pos, val) => { view.setUint16(pos, val, true); };

  files.forEach(f => {
    const nameBytes = encoder.encode(f.name);
    const content = f.content;
    const crc = xlsxCrc32(content);
    const size = content.length;

    const localHeader = new Uint8Array(30);
    const lv = new DataView(localHeader.buffer);
    writeUInt32LE(lv, 0, 0x04034b50);
    writeUInt16LE(lv, 4, 20);
    writeUInt16LE(lv, 6, 0);
    writeUInt16LE(lv, 8, 0);
    writeUInt16LE(lv, 10, 0);
    writeUInt16LE(lv, 12, 0);
    writeUInt32LE(lv, 14, crc);
    writeUInt32LE(lv, 18, size);
    writeUInt32LE(lv, 22, size);
    writeUInt16LE(lv, 26, nameBytes.length);
    writeUInt16LE(lv, 28, 0);

    chunks.push(localHeader, nameBytes, content);

    const centralHeader = new Uint8Array(46);
    const cv = new DataView(centralHeader.buffer);
    writeUInt32LE(cv, 0, 0x02014b50);
    writeUInt16LE(cv, 4, 20);
    writeUInt16LE(cv, 6, 20);
    writeUInt16LE(cv, 8, 0);
    writeUInt16LE(cv, 10, 0);
    writeUInt16LE(cv, 12, 0);
    writeUInt16LE(cv, 14, 0);
    writeUInt32LE(cv, 16, crc);
    writeUInt32LE(cv, 20, size);
    writeUInt32LE(cv, 24, size);
    writeUInt16LE(cv, 28, nameBytes.length);
    writeUInt16LE(cv, 30, 0);
    writeUInt16LE(cv, 32, 0);
    writeUInt16LE(cv, 34, 0);
    writeUInt16LE(cv, 36, 0);
    writeUInt32LE(cv, 38, 0);
    writeUInt32LE(cv, 42, offset);

    centralChunks.push(centralHeader, nameBytes);
    offset += localHeader.length + nameBytes.length + content.length;
  });

  const centralOffset = offset;
  let centralSize = 0;
  centralChunks.forEach(c => centralSize += c.length);

  const endRecord = new Uint8Array(22);
  const ev = new DataView(endRecord.buffer);
  writeUInt32LE(ev, 0, 0x06054b50);
  writeUInt16LE(ev, 4, 0);
  writeUInt16LE(ev, 6, 0);
  writeUInt16LE(ev, 8, files.length);
  writeUInt16LE(ev, 10, files.length);
  writeUInt32LE(ev, 12, centralSize);
  writeUInt32LE(ev, 16, centralOffset);
  writeUInt16LE(ev, 20, 0);

  const allChunks = [...chunks, ...centralChunks, endRecord];
  let totalSize = 0;
  allChunks.forEach(c => totalSize += c.length);
  const result = new Uint8Array(totalSize);
  let pos = 0;
  allChunks.forEach(c => { result.set(c, pos); pos += c.length; });
  return result;
}

function xlsxEscape(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// rowsData: [{level, cells: [str,...]}] — level>0 olan satırlar, üstündeki level=0 satırın altında
// gizli/gruplu başlar, Excel'de solda çıkan +/- ile açılıp kapanabilir (native "Outline" özelliği).
// Widget'ın kendi statü ve tip renkleriyle BİREBİR eşleşen Excel dolgu renkleri (STATUS_MAP ve
// WORK_ITEM_TYPE_COLORS ile aynı kaynak) — "widget'ta ne görüyorsam Excel'de de aynısını istiyorum"
// isteğini karşılamak için. Widget'taki gibi hafif/pastel dolgu + koyu metin kullanıyoruz.
const XLSX_TYPE_FILLS = { "Story": "8B5CF6", "Task": "3B82F6", "Bug": "EF4444" };
const XLSX_STATUS_FILLS = {
  "Closed": "006600", "Open": "0066FF", "Onhold": "FF0000", "Resolved": "00CC55",
  "Assigned": "006699", "In Progress": "00B8A3", "Cancelled": "999999",
  "Future": "8B8DA3", "Active": "00B8A3"
};
// Stil index sırası sabit — hem stil tablosunu kurarken hem hücrelere referans verirken bu sırayı kullanıyoruz.
const XLSX_COLOR_KEYS = [...Object.keys(XLSX_TYPE_FILLS), ...Object.keys(XLSX_STATUS_FILLS).filter(k => !(k in XLSX_TYPE_FILLS))];
function xlsxSprintRowStyleIndex() {
  return 4 + XLSX_COLOR_KEYS.length; // Renklerden hemen sonra, tek ve sabit bir index
}

function xlsxTicketRowStyleIndex() {
  return 5 + XLSX_COLOR_KEYS.length; // Sprint satırı stilinden hemen sonra
}

function xlsxColorStyleIndex(label) {
  const idx = XLSX_COLOR_KEYS.indexOf(label);
  return idx === -1 ? null : idx + 4; // 0=varsayılan, 1=tablo başlığı, 2=rapor başlığı, 3=rapor alt yazısı, 4'ten itibaren renkler
}

function buildXlsxSheetXml(rowsData, colWidths, mergeCells) {
  const rowsXml = rowsData.map((row, idx) => {
    const rowNum = idx + 1;
    const cellsXml = row.cells.map((val, colIdx) => {
      const colLetter = String.fromCharCode(65 + colIdx);
      const cellStyleIdx = row.cellStyles && row.cellStyles[colIdx] != null ? row.cellStyles[colIdx] : (row.header ? 1 : (row.isSprintRow ? xlsxSprintRowStyleIndex() : (row.isTicketRow ? xlsxTicketRowStyleIndex() : null)));
      const styleAttr = cellStyleIdx != null ? ` s="${cellStyleIdx}"` : "";
      return `<c r="${colLetter}${rowNum}" t="inlineStr"${styleAttr}><is><t xml:space="preserve">${xlsxEscape(val)}</t></is></c>`;
    }).join("");
    const outlineAttr = row.level ? ` outlineLevel="${row.level}"` : "";
    const hiddenAttr = row.level ? ` hidden="1"` : "";
    // OOXML spesifikasyonu: bir satırın altında gizli/gruplu detay satırları varsa (özet satırıysa),
    // "collapsed" özniteliği MUTLAKA olmalı — bunu unutmak Excel'in +/- kontrolünü hiç göstermemesine
    // ya da tutarsız davranmasına yol açıyordu, veri "kaybolmuş" gibi görünüyordu. Bu, ilk versiyondaki
    // asıl sorunun kök sebebiydi.
    const collapsedAttr = row.isSummary ? ` collapsed="1"` : "";
    return `<row r="${rowNum}" customHeight="1" ht="${row.height || 15}"${outlineAttr}${hiddenAttr}${collapsedAttr}>${cellsXml}</row>`;
  }).join("");

  const colsXml = colWidths
    ? `<cols>${colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const mergeCellsXml = mergeCells && mergeCells.length > 0
    ? `<mergeCells count="${mergeCells.length}">${mergeCells.map(range => `<mergeCell ref="${range}"/>`).join("")}</mergeCells>`
    : "";

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetPr><outlinePr summaryBelow="0" summaryRight="0"/></sheetPr>
<sheetFormatPr defaultRowHeight="15" outlineLevelRow="1"/>
${colsXml}
<sheetData>${rowsXml}</sheetData>
${mergeCellsXml}
</worksheet>`;
}

function buildXlsxStylesXml() {
  // Font 0: varsayılan. Font 1: tablo başlığı (kalın, beyaz). Font 2: rapor başlığı (büyük, kalın, beyaz).
  // Font 3: rapor alt yazısı/tarih (küçük, açık gri). Sonra her renk için siyah metin.
  const fontsXml = `<font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><b/><sz val="16"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font><font><sz val="10"/><name val="Calibri"/><color rgb="FFCBD5E1"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FF1E293B"/></font>`;

  // Fill 0: none (zorunlu). Fill 1: gray125 (zorunlu placeholder). Fill 2: tablo başlığı (koyu mavi).
  // Fill 3: rapor başlığı bandı (koyu, kurumsal lacivert).
  // Sonra her renk için widget'taki gibi HAFİF/PASTEL bir dolgu (yaklaşık %15 opaklık hissi vermek için
  // FF yerine daha açık bir ARGB tonu kullanıyoruz — gerçek alfa şeffaflığı Excel dolgularında güvenilir
  // desteklenmiyor, o yüzden rengin kendisini açık bir tonda karıştırıyoruz).
  const lighten = (hex) => {
    const r = parseInt(hex.slice(0, 2), 16), g = parseInt(hex.slice(2, 4), 16), b = parseInt(hex.slice(4, 6), 16);
    const mix = (c) => Math.round(c + (255 - c) * 0.82).toString(16).padStart(2, "0").toUpperCase();
    return mix(r) + mix(g) + mix(b);
  };
  const colorFillsXml = XLSX_COLOR_KEYS.map(key => {
    const hex = XLSX_TYPE_FILLS[key] || XLSX_STATUS_FILLS[key];
    return `<fill><patternFill patternType="solid"><fgColor rgb="FF${lighten(hex)}"/><bgColor indexed="64"/></patternFill></fill>`;
  }).join("");

  const fillsXml = `<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF2F5496"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF1E293B"/><bgColor indexed="64"/></patternFill></fill>${colorFillsXml}<fill><patternFill patternType="solid"><fgColor rgb="FFDCE6F5"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F5F9"/><bgColor indexed="64"/></patternFill></fill>`;
  const fillCount = 6 + XLSX_COLOR_KEYS.length;

  // cellXfs: 0=varsayılan, 1=tablo başlığı, 2=rapor başlığı (ortalı), 3=rapor alt yazısı (ortalı), 4+ = her renk,
  // sonra sprint satırı (açık mavi-gri, kalın), en sonda iş satırı (çok açık gri — boş satırlardan
  // ve birbirinden net ayrılsın diye kullanıcı isteği üzerine eklendi)
  const colorXfsXml = XLSX_COLOR_KEYS.map((key, i) => `<xf numFmtId="0" fontId="0" fillId="${4 + i}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`).join("");
  const sprintRowFillId = 4 + XLSX_COLOR_KEYS.length;
  const ticketRowFillId = 5 + XLSX_COLOR_KEYS.length;
  const cellXfsXml = `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` +
    `<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
    `<xf numFmtId="0" fontId="3" fillId="3" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="left" vertical="center"/></xf>` +
    colorXfsXml +
    `<xf numFmtId="0" fontId="4" fillId="${sprintRowFillId}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>` +
    `<xf numFmtId="0" fontId="0" fillId="${ticketRowFillId}" borderId="0" xfId="0" applyFont="1" applyFill="1"/>`;
  const xfCount = 6 + XLSX_COLOR_KEYS.length;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="5">${fontsXml}</fonts>
<fills count="${fillCount}">${fillsXml}</fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="${xfCount}">${cellXfsXml}</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function downloadXlsx(filename, sheetName, rowsData, colWidths, mergeCells) {
  const encoder = new TextEncoder();
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="${xlsxEscape(sheetName)}" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

  const files = [
    { name: "[Content_Types].xml", content: encoder.encode(contentTypesXml) },
    { name: "_rels/.rels", content: encoder.encode(rootRelsXml) },
    { name: "xl/workbook.xml", content: encoder.encode(workbookXml) },
    { name: "xl/_rels/workbook.xml.rels", content: encoder.encode(workbookRelsXml) },
    { name: "xl/styles.xml", content: encoder.encode(buildXlsxStylesXml()) },
    { name: "xl/worksheets/sheet1.xml", content: encoder.encode(buildXlsxSheetXml(rowsData, colWidths, mergeCells)) }
  ];

  const zipBytes = buildMinimalZip(files);
  const blob = new Blob([zipBytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const blobUrl = URL.createObjectURL(blob);

  // Widget sandbox'lı bir iframe içinde çalışıyor — indirme linkini window.top'un (sandbox dışı)
  // belgesinde oluşturup tıklatıyoruz, aksi halde indirme sessizce engellenebiliyor.
  const topWindow = (() => { try { return window.top.document ? window.top : window; } catch (e) { return window; } })();
  const a = topWindow.document.createElement("a");
  a.href = blobUrl;
  a.download = filename;
  topWindow.document.body.appendChild(a);
  a.click();
  setTimeout(() => { a.remove(); URL.revokeObjectURL(blobUrl); }, 2000);
}

