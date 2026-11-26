/* Background cloud sync for the Romford office portal.
 * Keeps every device on the same shared data by pulling the cloud copy into
 * local storage and pushing local changes back up. The app itself still reads
 * and writes local storage synchronously, so this layer is non-invasive and the
 * portal keeps working offline (file://) with local-only data.
 *
 * The cloud API needs the login token issued by /api/auth. Without it nothing
 * is pulled or pushed. Passwords are never downloaded: logins are checked on
 * the server.
 */
const CLOUD_TOKEN_KEY = "romford_api_token_v1";
let CLOUD_LAST = 0;
let CLOUD_READY = false;
let CLOUD_TIMER = null;

function cloudEnabled() {
  return location.protocol === "http:" || location.protocol === "https:";
}

function cloudToken() {
  try { return sessionStorage.getItem(CLOUD_TOKEN_KEY) || ""; } catch (_) { return ""; }
}

function setCloudToken(token) {
  try {
    if (token) sessionStorage.setItem(CLOUD_TOKEN_KEY, token);
    else sessionStorage.removeItem(CLOUD_TOKEN_KEY);
  } catch (_) {}
  if (!token) CLOUD_READY = false;
}

function cloudHeaders(extra) {
  return Object.assign({ Authorization: "Bearer " + cloudToken() }, extra || {});
}

// The server rejected our token (expired, password changed, account disabled).
function cloudSessionRejected() {
  setCloudToken("");
  try { if (typeof SESSION_KEY !== "undefined") sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
}

/* Calls /api/auth. Returns {ok, status, data}; status 0 or 404 means no cloud API
 * (for example the local Python server), so callers can fall back to local mode. */
async function cloudAuth(payload) {
  if (!cloudEnabled()) return { ok: false, status: 0, data: {} };
  try {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      cache: "no-store"
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    // Anything that is not a JSON answer means there is no cloud API here.
    if (!data || typeof data !== "object" || [404, 405, 501].includes(res.status)) return { ok: false, status: 0, data: {} };
    return { ok: res.ok, status: res.status, data };
  } catch (_) {
    return { ok: false, status: 0, data: {} };
  }
}

async function cloudPull() {
  if (!cloudEnabled() || !cloudToken()) return;
  try {
    const res = await fetch("/api/state", { cache: "no-store", headers: cloudHeaders() });
    if (res.status === 401) { cloudSessionRejected(); return; }
    if (!res.ok) return;
    const s = await res.json();
    const ts = Number(s.updatedAt || 0);
    CLOUD_READY = true;
    if (ts && ts <= CLOUD_LAST) return;

    let changed = false;
    if (s.db !== undefined && s.db !== null && typeof DB_KEY !== "undefined") {
      localStorage.setItem(DB_KEY, JSON.stringify(s.db)); changed = true;
    }
    if (Array.isArray(s.users) && typeof USERS_KEY !== "undefined") {
      localStorage.setItem(USERS_KEY, JSON.stringify(s.users)); changed = true;
    }
    if (s.requests !== undefined && s.requests !== null && typeof LOGIN_REQUESTS_KEY !== "undefined") {
      localStorage.setItem(LOGIN_REQUESTS_KEY, JSON.stringify(s.requests)); changed = true;
    }
    if (ts) CLOUD_LAST = ts;

    if (changed) {
      if (typeof refreshFromStorage === "function") refreshFromStorage();
      if (typeof currentUsername !== "undefined" && currentUsername &&
          typeof rerenderCurrentView === "function" && !isFormView()) {
        rerenderCurrentView();
      }
      if (typeof updateApprovalNotice === "function") updateApprovalNotice();
      if (typeof checkPendingLogin === "function") { try { checkPendingLogin(); } catch (_) {} }
    }
  } catch (_) {}
}

// Only pushes after a successful pull, so a device never overwrites the
// shared data with an old or empty local copy.
async function cloudPush(keys) {
  if (!cloudEnabled() || !CLOUD_READY || !cloudToken()) return;
  const body = {};
  try {
    if (keys.indexOf("db") > -1 && typeof DB_KEY !== "undefined") body.db = JSON.parse(localStorage.getItem(DB_KEY) || "null");
    if (keys.indexOf("users") > -1 && typeof USERS_KEY !== "undefined") body.users = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    if (keys.indexOf("requests") > -1 && typeof LOGIN_REQUESTS_KEY !== "undefined") body.requests = JSON.parse(localStorage.getItem(LOGIN_REQUESTS_KEY) || "null");
    const res = await fetch("/api/state", {
      method: "POST",
      headers: cloudHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify(body)
    });
    if (res.status === 401) { cloudSessionRejected(); return; }
    if (res.ok) {
      const s = await res.json();
      if (s && s.updatedAt) CLOUD_LAST = Number(s.updatedAt);
      // Staff edits may include a new password: reload the cleaned list from the server.
      if (body.users) { CLOUD_LAST = 0; await cloudPull(); }
    }
  } catch (_) {}
}

function cloudInit() {
  if (!cloudEnabled()) return;
  if (!CLOUD_TIMER) CLOUD_TIMER = setInterval(cloudPull, 5000);
  window.addEventListener("focus", cloudPull);
}
