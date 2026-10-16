// Uber Direct courier: live delivery price at checkout, and booking the courier when Brenda says the food is ready.
// Stays switched off (flat delivery fee, no courier booking) until every setting below is added in Vercel.
const crypto = require("crypto");
const { UserError, DELIVERY_FEE_CENTS, SHOP_NAME } = require("./_menu");
const { verifyAddress, looksLikeAddress } = require("./_geocode");

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
async function deliveryFee(addr, opts) {
  // Every price (quote, card checkout, Zelle) comes through here, so a made-up address is stopped before it is priced, even with Uber switched off.
  // opts.lookup === false skips the address lookup (only the instant offline check runs): used when a customer taps "I sent the payment".
  if (opts && opts.lookup === false) looksLikeAddress(addr);
  else await verifyAddress(addr);
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
    pickup_name: E().PICKUP_NAME || SHOP_NAME,
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

// ---- Locked delivery price ----
// The price a customer was shown is signed, so checkout charges exactly that price for 15 minutes
// instead of asking Uber again (Uber's price can change between asks).
const QUOTE_MS = 15 * 60 * 1000;
const secret = () => E().DISPATCH_SECRET || crypto.createHash("sha256").update("snssg|" + (E().STRIPE_SECRET_KEY || "x")).digest("hex");
const qsig = (addr, fee, exp) => crypto.createHmac("sha256", secret()).update("quote|" + addr + "|" + fee + "|" + exp).digest("hex").slice(0, 32);
const signQuote = (addr, fee) => { const exp = Date.now() + QUOTE_MS; return fee + "." + exp + "." + qsig(addr, fee, exp); };
// Returns the locked fee in cents, or null if the token is missing, expired, or for a different address.
function readQuote(addr, tok) {
  const m = /^(\d{1,6})\.(\d{10,14})\.([0-9a-f]{32})$/.exec(String(tok || ""));
  if (!m) return null;
  const fee = +m[1], exp = +m[2];
  if (exp < Date.now()) return null;
  const want = Buffer.from(qsig(addr, fee, exp)), got = Buffer.from(m[3]);
  return want.length === got.length && crypto.timingSafeEqual(want, got) ? fee : null;
}
// The fee to charge for this address: the locked price if the customer still has one, otherwise a fresh price.
async function feeFor(addr, tok, opts) {
  const locked = readQuote(addr, tok);
  if (locked !== null) return { feeCents: locked, quote: tok };
  const feeCents = await deliveryFee(addr, opts);
  return { feeCents, quote: signQuote(addr, feeCents) };
}

module.exports = { enabled, deliveryFee, createDelivery, validToken, dispatchLink, signQuote, readQuote, feeFor };
