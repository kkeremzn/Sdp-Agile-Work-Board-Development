/* Request pagination, Space validation and shared data helpers */
/* SDP data loading, pagination, mapping, cache and polling */
async function fetchAllRequests() {
  let allRequests = [];
  let startIndex = 1;
  const rowCount = 100;
  let hasMore = true;

  while (hasMore) {
    const inputData = {
      list_info: {
        start_index: startIndex,
        row_count: rowCount,
        search_criteria: [
          { field: "template.name", condition: "is", values: [CONFIG.AGILE_TEMPLATE_NAME] }
        ]
      }
    };
    const encodedData = encodeURIComponent(JSON.stringify(inputData));
    
    const response = await fetch(`/api/v3/requests?input_data=${encodedData}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
    });

    if (!response.ok) throw new Error(`HTTP Hatası: ${response.status}`);
    
    const data = await response.json();
    const reqs = data.requests || [];
    allRequests = allRequests.concat(reqs);

    if (data.list_info && data.list_info.has_more_rows) startIndex += rowCount;
    else hasMore = false;
  }
  return allRequests;
}

// Yazma işlemlerinden (Yeni İş/Epic/Sprint oluşturma vb.) önce çağrılır — Space başka bir
// sekmede/kullanıcı tarafından silinmiş olabilir, bunu tespit edip kullanıcıyı uyarır.
async function verifyCurrentSpaceStillExists() {
  if (!currentSpace) return false;
  try {
    const freshList = await fetchSpaces();
    const stillExists = freshList.some(s => String(s.id) === String(currentSpace.id));
    if (!stillExists) {
      showToast("Bu Space artık mevcut değil (başka bir yerden silinmiş olabilir). Space listesine dönülüyor.", "error");
      localStorage.removeItem("sdp_agile_current_space_id");
      currentSpace = null;
      spaces = freshList;
      showSpaceSelector();
      return false;
    }
    return true;
  } catch (err) {
    showToast(`Space doğrulanamadı; güvenlik için işlem durduruldu: ${err.message}`, "warning");
    return false;
  }
}

async function fetchPagedSdpList(path, responseKey, rowCount = 100) {
  const all = [];
  const seenIds = new Set();
  let startIndex = 1;
  let safety = 0;

  while (safety++ < 1000) {
    const joiner = path.includes("?") ? "&" : "?";
    const inputData = encodeURIComponent(JSON.stringify({ list_info: { start_index: startIndex, row_count: rowCount } }));
    const response = await fetch(`${path}${joiner}input_data=${inputData}`, {
      method: "GET",
      credentials: "same-origin",
      headers: { "Accept": "application/vnd.manageengine.sdp.v3+json" }
    });
    if (!response.ok) throw new Error(`${responseKey} listesi alınamadı: ${response.status}`);

    const data = await response.json();
    const page = Array.isArray(data[responseKey]) ? data[responseKey] : [];
    let added = 0;
    for (const item of page) {
      const key = item?.id != null ? String(item.id) : JSON.stringify(item);
      if (seenIds.has(key)) continue;
      seenIds.add(key);
      all.push(item);
      added++;
    }

    const hasMore = Boolean(data.list_info?.has_more_rows);
    if (!hasMore && page.length < rowCount) break;
    // Endpoint start_index'i yok sayıyorsa sonsuz döngüye girmeyelim.
    if (page.length === 0 || added === 0) break;
    startIndex += rowCount;
  }
  return all;
}

function getAttachmentModuleInfo(entityType) {
  if (entityType === "ticket") return { plural: "requests", singularKey: "request" };
  if (entityType === "epic") return { plural: CONFIG.MODULE_EPICS, singularKey: CONFIG.MODULE_EPICS_SINGULAR };
  if (entityType === "sprint") return { plural: CONFIG.MODULE_SPRINTS, singularKey: CONFIG.MODULE_SPRINTS_SINGULAR };
  return null;
}

