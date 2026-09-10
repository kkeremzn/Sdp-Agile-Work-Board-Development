/* Technician identity verification and fail-closed Space updated_by fallback */
// Oturum kimliği için hibrit yaklaşım: önce salt-okuma SDP context/technician eşleşmesi denenir.
// Technician rolü bu listeleri okuyamıyorsa, v243'te sahada çalışan Space PUT fallback devreye girer.
let identityProbedThisSession = false;
let lastIdentityVerification = null;

function readParentSdpUser() {
  try {
    const user = window.parent?.sdp_user || window.top?.sdp_user || null;
    return user && typeof user === "object" ? user : null;
  } catch (_) { return null; }
}

function identityCandidateFromParent(parentUser) {
  if (!parentUser || typeof parentUser !== "object") return { rawId: null, rawName: null };
  return {
    rawId: parentUser.USERID ?? parentUser.USER_ID ?? parentUser.userId ?? parentUser.ID ?? parentUser.TECHNICIANID ?? parentUser.TECHNICIAN_ID ?? null,
    rawName: parentUser.DISPLAYNAME ?? parentUser.NAME ?? parentUser.USERNAME ?? parentUser.username ?? parentUser.LOGIN_NAME ?? parentUser.login_name ?? null
  };
}

function normalizedIdentityText(value) { return String(value ?? "").trim().toLocaleLowerCase("tr-TR"); }
function technicianIdentityFields(tech) {
  return [tech?.name, tech?.display_name, tech?.login_name, tech?.loginname, tech?.email_id, tech?.email].filter(Boolean).map(normalizedIdentityText);
}

async function verifyParentIdentityReadOnly() {
  const parentUser = readParentSdpUser();
  const { rawId, rawName } = identityCandidateFromParent(parentUser);
  const result = { parentContextFound: !!parentUser, rawId: rawId == null ? null : String(rawId), rawName: rawName == null ? null : String(rawName), verified: null, verificationSource: null, warning: null };
  if (!parentUser) { result.warning = "SDP widget context bulunamadı."; return result; }

  let techs = [];
  try {
    techs = await fetchPagedSdpList(`/api/v3/technicians`, "technicians");
    result.verificationSource = "/api/v3/technicians";
  } catch (err) {
    techs = assignees.map(a => ({ id: a.id, name: a.name }));
    result.verificationSource = "Epic Assignee native technician listesi";
    result.warning = `Technicians endpoint'i bu rolde okunamadı: ${err.message || err}`;
  }

  if (rawId != null) {
    const byId = techs.find(t => String(t.id) === String(rawId));
    if (byId) { result.verified = { id: String(byId.id), name: String(byId.name || byId.display_name || rawName || "Teknisyen") }; return result; }
  }
  if (rawName) {
    const needle = normalizedIdentityText(rawName);
    const matches = techs.filter(t => technicianIdentityFields(t).includes(needle));
    if (matches.length === 1) { result.verified = { id: String(matches[0].id), name: String(matches[0].name || matches[0].display_name || rawName) }; return result; }
  }
  if (!result.warning) result.warning = "Parent oturum bilgisi teknisyen kaydıyla eşleşmedi.";
  return result;
}

async function probeIdentityViaSpaceField() {
  const ownerField = CONFIG.SPACE_OWNER_FIELD_KEY || "sahip";
  if (!currentSpace) return { verified: null, verificationSource: "Space PUT fallback", warning: "Aktif Space yok." };
  try {
    const payload = { [CONFIG.MODULE_SPACES_SINGULAR]: { [ownerField]: `identity-${Date.now()}` } };
    const result = await sdpApiFetch(`/api/v3/${CONFIG.MODULE_SPACES}/${currentSpace.id}`, "PUT", payload);
    const record = result?.[CONFIG.MODULE_SPACES_SINGULAR];
    const author = record?.updated_by || record?.last_updated_by || record?.created_by;
    if (author?.id && author?.name) return { verified: { id: String(author.id), name: String(author.name) }, verificationSource: `PUT /api/v3/${CONFIG.MODULE_SPACES}/{id} → updated_by`, warning: null };
    return { verified: null, verificationSource: `PUT /api/v3/${CONFIG.MODULE_SPACES}/{id}`, warning: "SDP response'unda updated_by teknisyeni gelmedi." };
  } catch (err) {
    return { verified: null, verificationSource: `PUT /api/v3/${CONFIG.MODULE_SPACES}/{id}`, warning: `Space kimlik fallback'i başarısız: ${err.message || err}` };
  }
}

async function resolveIdentityFromWidgetContext(force = false) {
  if (identityProbedThisSession && !force && currentUser?.id) return lastIdentityVerification;
  const readOnly = await verifyParentIdentityReadOnly();
  if (readOnly.verified) {
    applyConfirmedIdentity(readOnly.verified);
    identityProbedThisSession = true;
    lastIdentityVerification = { ...readOnly, method: "read-only" };
    return lastIdentityVerification;
  }
  if (!isManager) {
    const fallback = await probeIdentityViaSpaceField();
    if (fallback.verified) {
      applyConfirmedIdentity(fallback.verified);
      identityProbedThisSession = true;
      lastIdentityVerification = { ...readOnly, ...fallback, parentContextFound: readOnly.parentContextFound, rawId: readOnly.rawId, rawName: readOnly.rawName, method: "space-write-fallback" };
      return lastIdentityVerification;
    }
    currentUser = null;
    updateDetectedUserNameBadge();
    lastIdentityVerification = { ...readOnly, fallbackWarning: fallback.warning, fallbackSource: fallback.verificationSource, method: "failed" };
    showToast("Oturum teknisyeni doğrulanamadı. Space modülünde Edit izni ve Sahip alanını kontrol et.", "warning");
    return lastIdentityVerification;
  }
  lastIdentityVerification = { ...readOnly, method: "manager-unverified" };
  return lastIdentityVerification;
}



function applyConfirmedIdentity(confirmedAuthor) {
  if (!confirmedAuthor?.id || !confirmedAuthor?.name) return;
  const confirmedId = String(confirmedAuthor.id);
  const confirmedName = String(confirmedAuthor.name);
  const changed = !currentUser || String(currentUser.id) !== confirmedId || String(currentUser.name) !== confirmedName;
  currentUser = { id: confirmedId, name: confirmedName };
  updateDetectedUserNameBadge();
  if (changed) {
    showToast(`Kimliğin "${confirmedName}" olarak doğrulandı.`, "success");
    renderAll();
  }
}
