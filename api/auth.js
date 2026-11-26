/* Server-side login and registration for the Romford office portal.
 * POST { action: "login", username, password }
 *   -> { token, expiresAt, user }   (user never includes a password)
 * POST { action: "register", name, username, role, password }
 *   -> { ok: true }                 (account waits for admin approval)
 */
import {
  KEY_USERS, USERNAME_RE, storeConfig, setJSON, touchUpdated, loadServerUsers, findUser, canLogIn,
  hashPassword, verifyPassword, issueToken, publicUser, tooManyFailures, recordFailure, clearFailures,
  readBody, noStore
} from "./_lib.js";

const MAX_PENDING = 50;

export default async function handler(req, res) {
  noStore(res);
  const { url, token } = storeConfig();
  if (!url || !token) return res.status(500).json({ error: "Cloud storage is not configured." });
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = readBody(req);
    const username = String(body.username || "").trim().toLowerCase();
    const password = String(body.password || "");

    if (body.action === "login") {
      if (!username || !password) return res.status(400).json({ error: "Enter your username and password." });
      if (await tooManyFailures(username)) {
        return res.status(429).json({ error: "Too many failed attempts. Try again in 15 minutes." });
      }
      const users = await loadServerUsers();
      const user = findUser(users, username);
      if (!user || !verifyPassword(password, user.passwordHash)) {
        await recordFailure(username);
        return res.status(401).json({ error: "Incorrect username or password." });
      }
      if (user.active === false) return res.status(403).json({ error: "Your account is disabled. Contact your administrator." });
      if (!canLogIn(user)) {
        return res.status(403).json({
          error: user.approvalStatus === "pending"
            ? "Your registration is awaiting admin approval. Please try again after approval."
            : "Your registration was rejected. Contact your administrator."
        });
      }
      await clearFailures(username);
      const session = issueToken(user);
      return res.status(200).json({ ...session, user: publicUser(user) });
    }

    if (body.action === "register") {
      const name = String(body.name || "").trim().slice(0, 100);
      const role = String(body.role || "");
      if (!name || !["sales", "ops", "accounts"].includes(role) || !USERNAME_RE.test(username)) {
        return res.status(400).json({ error: "Enter your full name, a valid username and department." });
      }
      if (password.length < 8) return res.status(400).json({ error: "Use at least 8 characters for your password." });
      const users = await loadServerUsers();
      if (findUser(users, username)) {
        return res.status(409).json({ error: "That username already exists. Choose another username or log in." });
      }
      if (users.filter(u => u.approvalStatus === "pending").length >= MAX_PENDING) {
        return res.status(429).json({ error: "Too many pending registrations. Ask an administrator to review them first." });
      }
      users.push({
        username, name, role, active: true, approvalStatus: "pending", registeredAt: Date.now(),
        authVersion: 0, permissions: {}, passwordHash: hashPassword(password)
      });
      await setJSON(KEY_USERS, users);
      await touchUpdated();
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ error: "Unknown action." });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}
