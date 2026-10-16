// Small helpers for Supabase (accounts + order history). Uses plain fetch, no extra packages.
const base = () => (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const enabled = () => !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY && process.env.SUPABASE_SERVICE_KEY);

// Works with both the older JWT-style keys (eyJ...) and the newer sb_publishable_/sb_secret_ keys.
function hdr(key, extra) {
  const h = { apikey: key, "Content-Type": "application/json" };
  if (key.startsWith("eyJ")) h.Authorization = "Bearer " + key;
  return Object.assign(h, extra);
}

function bearer(req) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || "");
  return m ? m[1] : "";
}

// Returns the logged-in user, or null if the token is invalid/expired. Throws if Supabase can't be reached.
async function userFromToken(token) {
  const r = await fetch(base() + "/auth/v1/user", {
    headers: hdr(process.env.SUPABASE_ANON_KEY, { Authorization: "Bearer " + token }),
  });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error("supabase user check " + r.status);
  const u = await r.json();
  return u && u.id ? u : null;
}

// Safe to call twice for the same Stripe session (Stripe retries webhooks).
async function saveOrder(row) {
  const r = await fetch(base() + "/rest/v1/orders?on_conflict=stripe_session_id", {
    method: "POST",
    headers: hdr(process.env.SUPABASE_SERVICE_KEY, { Prefer: "resolution=ignore-duplicates,return=minimal" }),
    body: JSON.stringify(row),
  });
  if (!r.ok) throw new Error("save order " + r.status + " " + (await r.text()).slice(0, 200));
}

async function listOrders(userId) {
  const q = "user_id=eq." + encodeURIComponent(userId) +
    "&select=id,stripe_session_id,created_at,items,total_cents,mode,addr,when_text,note&order=created_at.desc&limit=50";
  const r = await fetch(base() + "/rest/v1/orders?" + q, { headers: hdr(process.env.SUPABASE_SERVICE_KEY) });
  if (!r.ok) throw new Error("list orders " + r.status);
  return r.json();
}

// How many saved orders have this kind of id since a time (for example "zelle_*").
async function countSince(pattern, sinceIso) {
  const q = "stripe_session_id=like." + encodeURIComponent(pattern) + "&created_at=gte." + encodeURIComponent(sinceIso) + "&select=id";
  const r = await fetch(base() + "/rest/v1/orders?" + q, { headers: hdr(process.env.SUPABASE_SERVICE_KEY, { Prefer: "count=exact", Range: "0-0" }) });
  if (!r.ok) throw new Error("count orders " + r.status);
  const m = /\/(\d+)$/.exec(r.headers.get("content-range") || "");
  return m ? +m[1] : 0;
}

// True if a Zelle order with the same phone and total was saved since `sinceIso`.
async function findDuplicate(phone, totalCents, sinceIso) {
  const q = "phone=eq." + encodeURIComponent(phone) + "&total_cents=eq." + encodeURIComponent(totalCents) +
    "&stripe_session_id=like." + encodeURIComponent("zelle_*") + "&created_at=gte." + encodeURIComponent(sinceIso) + "&select=id&limit=1";
  const r = await fetch(base() + "/rest/v1/orders?" + q, { headers: hdr(process.env.SUPABASE_SERVICE_KEY) });
  if (!r.ok) throw new Error("find duplicate " + r.status);
  const rows = await r.json();
  return Array.isArray(rows) && rows.length > 0;
}

module.exports = { enabled, bearer, userFromToken, saveOrder, listOrders, countSince, findDuplicate };
