/* Shared cloud state for the Romford office portal.
 * Stores the office database, staff accounts and login requests in
 * Upstash Redis so every device sees the same data.
 *
 * Every request needs the token from /api/auth (Authorization: Bearer ...).
 *  - GET  returns the data. Staff accounts are returned WITHOUT passwords.
 *  - POST saves data. Any signed-in staff member may save bookings (db) and
 *    login requests; only administrators may change staff accounts (users).
 *    New or changed passwords arrive as `newPassword` and are hashed here.
 */
import {
  KEY_DB, KEY_USERS, KEY_REQUESTS, KEY_UPDATED, ROLES, USERNAME_RE, storeConfig, getJSON, setJSON,
  touchUpdated, loadServerUsers, findUser, authenticate, hashPassword, publicUser, readBody, noStore
} from "./_lib.js";

// Applies an admin's edited staff list while keeping existing password hashes.
function mergeUsers(incoming, current) {
  const result = [];
  const seen = new Set();
  for (const u of incoming) {
    if (!u || typeof u.username !== "string" || !USERNAME_RE.test(u.username) || !ROLES.includes(u.role)) continue;
    const key = u.username.toLowerCase();
    if (seen.has(key)) continue;
    const existing = findUser(current, u.username);
    let passwordHash = existing ? existing.passwordHash : null;
    if (typeof u.newPassword === "string" && u.newPassword.length >= 8) passwordHash = hashPassword(u.newPassword);
    if (!passwordHash) continue; // a new account must come with a password
    const { password, newPassword, passwordHash: ignored, ...rest } = u;
    result.push({ ...rest, passwordHash });
    seen.add(key);
  }
  return result;
}

export default async function handler(req, res) {
  noStore(res);
  const { url, token } = storeConfig();
  if (!url || !token) {
    return res.status(500).json({
      error: "Cloud storage is not configured. Attach a Vercel KV / Upstash Redis store to this project."
    });
  }

  try {
    const users = await loadServerUsers();
    const me = authenticate(req, users);
    if (!me) return res.status(401).json({ error: "Please log in." });

    if (req.method === "GET") {
      const [db, requests, updated] = await Promise.all([getJSON(KEY_DB), getJSON(KEY_REQUESTS), getJSON(KEY_UPDATED)]);
      return res.status(200).json({
        db,
        users: users.map(publicUser),
        requests,
        updatedAt: Number(updated) || 0
      });
    }

    if (req.method === "POST") {
      const body = readBody(req);
      if (body.db !== undefined) await setJSON(KEY_DB, body.db);
      if (body.requests !== undefined) await setJSON(KEY_REQUESTS, body.requests);
      if (body.users !== undefined && me.role === "admin" && Array.isArray(body.users)) {
        const next = mergeUsers(body.users, users);
        if (!next.some(u => u.role === "admin" && u.active !== false)) {
          return res.status(400).json({ error: "At least one active administrator is required." });
        }
        await setJSON(KEY_USERS, next);
      }
      const now = await touchUpdated();
      return res.status(200).json({ ok: true, updatedAt: now });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
