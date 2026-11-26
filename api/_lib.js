/* Shared server helpers for the Romford office portal API.
 * Files starting with "_" are not exposed as Vercel routes.
 *
 * Security model:
 *  - Staff passwords are stored only as scrypt hashes in Redis and are never
 *    sent back to any browser.
 *  - /api/auth checks passwords on the server and returns a signed token.
 *  - /api/state needs that token; only admins may change staff accounts.
 *
 * Environment variables:
 *   KV_REST_API_URL / UPSTASH_REDIS_REST_URL     (required)
 *   KV_REST_API_TOKEN / UPSTASH_REDIS_REST_TOKEN (required)
 *   AUTH_SECRET    (optional; token signing key, derived from the Redis token if unset)
 */
import crypto from "crypto";

export const KEY_DB = "romford_cloud_db";
export const KEY_USERS = "romford_cloud_users";
export const KEY_REQUESTS = "romford_cloud_requests";
export const KEY_UPDATED = "romford_cloud_updated_at";

export const ROLES = ["sales", "ops", "accounts", "admin"];
export const USERNAME_RE = /^[a-z0-9_.-]{2,50}$/i;
const SESSION_TTL = 8 * 60 * 60 * 1000;
const MAX_FAILED_LOGINS = 10;
const FAILED_LOGIN_WINDOW_S = 15 * 60;

// Trim spaces and stray quotes that sometimes get pasted into env var values.
function cleanEnv(value) {
  return value ? String(value).trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "") : value;
}

export function storeConfig() {
  return {
    url: cleanEnv(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
    token: cleanEnv(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  };
}

export async function redis(command) {
  const { url, token } = storeConfig();
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(command)
  });
  const json = await res.json();
  if (json && json.error) throw new Error("Storage error: " + json.error);
  return json ? json.result : null;
}

export function parseStored(raw) {
  if (raw == null) return null;
  let v;
  try { v = JSON.parse(raw); } catch (_) { return null; }
  // Older saves wrapped the data as {"value": "<json>"}; unwrap those.
  if (v && typeof v === "object" && !Array.isArray(v) && Object.keys(v).length === 1 && "value" in v) {
    v = v.value;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch (_) {} }
  }
  return v;
}

export async function getJSON(key) { return parseStored(await redis(["GET", key])); }
export async function setJSON(key, value) { await redis(["SET", key, JSON.stringify(value)]); }

export async function touchUpdated() {
  const now = Date.now();
  await setJSON(KEY_UPDATED, now);
  return now;
}

/* ---------- passwords ---------- */
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), salt, 32).toString("hex");
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(password, stored) {
  if (typeof stored !== "string" || !stored.startsWith("scrypt$")) return false;
  const [, salt, hash] = stored.split("$");
  const expected = Buffer.from(hash, "hex");
  const actual = crypto.scryptSync(String(password), salt, expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

/* ---------- users ---------- */
export function publicUser(u) {
  const { password, passwordHash, newPassword, ...rest } = u;
  return rest;
}

// Loads staff accounts, converting any old plain-text passwords to hashes.
export async function loadServerUsers() {
  let users = await getJSON(KEY_USERS);
  if (!Array.isArray(users)) users = [];
  let changed = false;
  users = users.filter(u => u && typeof u.username === "string" && ROLES.includes(u.role)).map(u => {
    if (typeof u.password === "string" && !u.passwordHash) {
      changed = true;
      const { password, ...rest } = u;
      return { ...rest, passwordHash: hashPassword(password) };
    }
    if ("password" in u || "newPassword" in u) {
      changed = true;
      const { password, newPassword, ...rest } = u;
      return rest;
    }
    return u;
  });
  if (!users.some(u => u.role === "admin")) {
    // First run: create the owner account. Change this password after logging in.
    users.push({
      username: "shahinsha", name: "Shahinsha", role: "admin", active: true, permissions: {}, authVersion: 0,
      passwordHash: hashPassword(cleanEnv(process.env.ADMIN_PASSWORD) || "shahinsha@123")
    });
    changed = true;
  }
  if (changed) await setJSON(KEY_USERS, users);
  return users;
}

export function findUser(users, username) {
  const name = String(username || "").trim().toLowerCase();
  return users.find(u => u.username.toLowerCase() === name) || null;
}

export function canLogIn(u) {
  if (!u || u.active === false) return false;
  if (u.role === "admin") return true;
  return u.approvalStatus == null || u.approvalStatus === "approved";
}

/* ---------- tokens ---------- */
function secret() {
  const explicit = cleanEnv(process.env.AUTH_SECRET);
  if (explicit) return explicit;
  return crypto.createHash("sha256").update("romford-session:" + (storeConfig().token || "")).digest("hex");
}

function sign(data) {
  return crypto.createHmac("sha256", secret()).update(data).digest("base64url");
}

export function issueToken(u) {
  const payload = { u: u.username, r: u.role, v: u.authVersion || 0, exp: Date.now() + SESSION_TTL };
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return { token: `${data}.${sign(data)}`, expiresAt: payload.exp };
}

// Returns the signed-in user for this request, or null.
export function authenticate(req, users) {
  const header = req.headers && (req.headers.authorization || req.headers.Authorization);
  const match = /^Bearer\s+([\w-]+)\.([\w-]+)$/.exec(header || "");
  if (!match) return null;
  const [, data, sig] = match;
  const expected = sign(data);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  let payload;
  try { payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")); } catch (_) { return null; }
  if (!payload || !(payload.exp > Date.now())) return null;
  const u = findUser(users, payload.u);
  if (!u || u.role !== payload.r || (u.authVersion || 0) !== payload.v || !canLogIn(u)) return null;
  return u;
}

/* ---------- brute-force protection ---------- */
function failKey(username) { return "romford_login_fail:" + String(username).toLowerCase().slice(0, 60); }

export async function tooManyFailures(username) {
  return Number(await redis(["GET", failKey(username)])) >= MAX_FAILED_LOGINS;
}
export async function recordFailure(username) {
  const key = failKey(username);
  await redis(["INCR", key]);
  await redis(["EXPIRE", key, FAILED_LOGIN_WINDOW_S]);
}
export async function clearFailures(username) { await redis(["DEL", failKey(username)]); }

export function readBody(req) {
  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  return body && typeof body === "object" ? body : {};
}

export function noStore(res) { res.setHeader("Cache-Control", "no-store"); }
