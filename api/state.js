/* Shared cloud state for the Romford office portal.
 * Stores the office database, staff accounts and login requests in a
 * Redis-compatible store (Vercel KV / Upstash Redis) so every device that
 * opens the site sees the same approvals, logins and bookings.
 *
 * Required environment variables (added automatically when you attach a
 * Vercel KV / Upstash Redis store, or set them by hand):
 *   KV_REST_API_URL   (or UPSTASH_REDIS_REST_URL)
 *   KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_TOKEN)
 */

const KEY_DB = "romford_cloud_db";
const KEY_USERS = "romford_cloud_users";
const KEY_REQUESTS = "romford_cloud_requests";
const KEY_UPDATED = "romford_cloud_updated_at";

// Trim spaces and stray quotes that sometimes get pasted into env var values.
function cleanEnv(value) {
  return value ? String(value).trim().replace(/^["']+|["']+$/g, "").replace(/\/+$/, "") : value;
}

function storeConfig() {
  return {
    url: cleanEnv(process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL),
    token: cleanEnv(process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN)
  };
}

async function redisGet(key) {
  const { url, token } = storeConfig();
  const res = await fetch(`${url}/get/${key}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const json = await res.json();
  return json && json.result != null ? json.result : null;
}

async function redisSet(key, value) {
  const { url, token } = storeConfig();
  await fetch(`${url}/set/${key}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    // Upstash stores the raw request body as the value.
    body: JSON.stringify(value)
  });
}

function parseMaybe(raw) {
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

export default async function handler(req, res) {
  const { url, token } = storeConfig();
  if (!url || !token) {
    return res.status(500).json({
      error: "Cloud storage is not configured. Attach a Vercel KV / Upstash Redis store to this project."
    });
  }

  try {
    if (req.method === "GET") {
      const [db, users, requests, updated] = await Promise.all([
        redisGet(KEY_DB),
        redisGet(KEY_USERS),
        redisGet(KEY_REQUESTS),
        redisGet(KEY_UPDATED)
      ]);
      return res.status(200).json({
        db: parseMaybe(db),
        users: parseMaybe(users),
        requests: parseMaybe(requests),
        updatedAt: Number(parseMaybe(updated)) || 0
      });
    }

    if (req.method === "POST") {
      const body = req.body || {};
      if (body.db !== undefined) await redisSet(KEY_DB, body.db);
      if (body.users !== undefined) await redisSet(KEY_USERS, body.users);
      if (body.requests !== undefined) await redisSet(KEY_REQUESTS, body.requests);
      const now = Date.now();
      await redisSet(KEY_UPDATED, now);
      return res.status(200).json({ ok: true, updatedAt: now });
    }

    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ error: "Method not allowed" });
  } catch (err) {
    return res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
}