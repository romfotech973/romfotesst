/* Background cloud sync for the Romford office portal.
 * Keeps every device on the same shared data by pulling the cloud copy into
 * local storage and pushing local changes back up. The app itself still reads
 * and writes local storage synchronously, so this layer is non-invasive and the
 * portal keeps working offline (file://) with local-only data.
 */
let CLOUD_LAST = 0;
let CLOUD_READY = false;
let CLOUD_TIMER = null;

function cloudEnabled() {
  return location.protocol === "http:" || location.protocol === "https:";
}

async function cloudPull() {
  if (!cloudEnabled()) { CLOUD_READY = true; return; }
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) { CLOUD_READY = true; return; }
    const s = await res.json();
    const ts = Number(s.updatedAt || 0);
    if (ts && ts <= CLOUD_LAST) { CLOUD_READY = true; return; }

    let changed = false;
    if (s.db !== undefined && s.db !== null && typeof DB_KEY !== "undefined") {
      localStorage.setItem(DB_KEY, JSON.stringify(s.db)); changed = true;
    }
    if (s.users !== undefined && s.users !== null && typeof USERS_KEY !== "undefined") {
      localStorage.setItem(USERS_KEY, JSON.stringify(s.users)); changed = true;
    }
    if (s.requests !== undefined && s.requests !== null && typeof LOGIN_REQUESTS_KEY !== "undefined") {
      localStorage.setItem(LOGIN_REQUESTS_KEY, JSON.stringify(s.requests)); changed = true;
    }
    if (ts) CLOUD_LAST = ts;
    CLOUD_READY = true;

    if (changed) {
      if (typeof refreshFromStorage === "function") refreshFromStorage();
      if (typeof currentUsername !== "undefined" && currentUsername &&
          typeof rerenderCurrentView === "function" && !isFormView()) {
        rerenderCurrentView();
      }
      if (typeof updateApprovalNotice === "function") updateApprovalNotice();
      if (typeof checkPendingLogin === "function") { try { checkPendingLogin(); } catch (_) {} }
    }
  } catch (_) {
    CLOUD_READY = true;
  }
}

async function cloudPush(keys) {
  if (!cloudEnabled() || !CLOUD_READY) return;
  const body = {};
  try {
    if (keys.indexOf("db") > -1 && typeof DB_KEY !== "undefined") body.db = JSON.parse(localStorage.getItem(DB_KEY) || "null");
    if (keys.indexOf("users") > -1 && typeof USERS_KEY !== "undefined") body.users = JSON.parse(localStorage.getItem(USERS_KEY) || "null");
    if (keys.indexOf("requests") > -1 && typeof LOGIN_REQUESTS_KEY !== "undefined") body.requests = JSON.parse(localStorage.getItem(LOGIN_REQUESTS_KEY) || "null");
    const res = await fetch("/api/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const s = await res.json();
      if (s && s.updatedAt) CLOUD_LAST = Number(s.updatedAt);
    }
  } catch (_) {}
}

function cloudInit() {
  if (!cloudEnabled()) return;
  if (!CLOUD_TIMER) CLOUD_TIMER = setInterval(cloudPull, 5000);
  window.addEventListener("focus", cloudPull);
}