// Uber Direct courier: live delivery price at checkout, and booking the courier when Brenda says the food is ready.
// Stays switched off (flat delivery fee, no courier booking) until every setting below is added in Vercel.
const crypto = require("crypto");
const { UserError, DELIVERY_FEE_CENTS } = require("./_menu");

const E = () => process.env;
const enabled = () => !!(E().UBER_CLIENT_ID && E().UBER_CLIENT_SECRET && E().UBER_CUSTOMER_ID && E().PICKUP_ADDRESS && E().DISPATCH_SECRET);

let tok = { v: "", exp: 0 };
async function token() {
  if (tok.v && Date.now() < tok.exp) return tok.v;
  const r = await fetch("https://auth.uber.com/oauth/v2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: E().UBER_CLIENT_ID, client_secret: E().UBER_CLIENT_SECRET, grant_type: "client_credentials", scope: "eats.deliveries" }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("uber auth " + r.status);
  tok = { v: j.access_token, exp: Date.now() + ((j.expires_in || 3600) - 120) * 1000 };
  return tok.v;
}

async function call(path, body) {
  const r = await fetch("https://api.uber.com/v1/customers/" + E().UBER_CUSTOMER_ID + path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + (await token()) },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error("uber " + r.status + " " + JSON.stringify(j).slice(0, 200)); e.status = r.status; throw e; }
  return j;
}

async function quote(addr) {
  try {
    return await call("/delivery_quotes", { pickup_address: E().PICKUP_ADDRESS, dropoff_address: addr });
  } catch (e) {
    if (e.status === 400 || e.status === 422) throw new UserError("Sorry, we can't deliver to that address. Please check it or choose pickup.");
    throw e;
  }
}

// What the customer pays for delivery, in cents.
async function deliveryFee(addr) {
  if (!enabled()) return DELIVERY_FEE_CENTS;
  const q = await quote(addr);
  if (!Number.isInteger(q.fee)) throw new Error("uber quote had no fee");
  return q.fee;
}

function phone(p) {
  const d = String(p || "").replace(/\D/g, "");
  return d.length === 10 ? "+1" + d : "+" + d;
}

async function createDelivery({ addr, name, phone: ph, items, ref }) {
  const q = await quote(addr);
  return call("/deliveries", {
    quote_id: q.id,
    pickup_name: E().PICKUP_NAME || "SnsSg Kitchen",
    pickup_address: E().PICKUP_ADDRESS,
    pickup_phone_number: phone(E().OWNER_PHONE),
    dropoff_name: name,
    dropoff_address: addr,
    dropoff_phone_number: phone(ph),
    manifest_reference: ref,
    manifest_items: items.map((i) => ({ name: String(i.name).slice(0, 80), quantity: i.qty, size: "medium" })),
  });
}

const sign = (id) => crypto.createHmac("sha256", E().DISPATCH_SECRET || "x").update(String(id)).digest("hex").slice(0, 32);
const validToken = (id, t) => enabled() && !!t && t.length === 32 && crypto.timingSafeEqual(Buffer.from(sign(id)), Buffer.from(t));
const dispatchLink = (origin, id) => (enabled() ? origin + "/api/dispatch?s=" + encodeURIComponent(id) + "&t=" + sign(id) : "");

module.exports = { enabled, deliveryFee, createDelivery, validToken, dispatchLink };
