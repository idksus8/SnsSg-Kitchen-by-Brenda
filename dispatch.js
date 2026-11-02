// Link in Brenda's order text. She opens it when the food is ready and taps one button to book the Uber courier.
const Stripe = require("stripe");
const crypto = require("crypto");
const { enabled, validToken, createDelivery } = require("./_uber");
const { SHOP_NAME } = require("./_menu");

// Orders being booked right now on this server, plus a short wait that lets a second tap show up, so one order can never book two couriers.
const inflight = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const page = (res, code, html) => {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  return res.status(code).send('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(SHOP_NAME) + '</title><body style="font-family:system-ui,sans-serif;max-width:460px;margin:40px auto;padding:0 20px;line-height:1.5">' + html + "</body>");
};

module.exports = async (req, res) => {
  const q = new URL(req.url, "http://x").searchParams;
  const id = q.get("s") || "", t = q.get("t") || "";
  if (!enabled() || !validToken(id, t)) return page(res, 403, "<h2>This link is not valid.</h2>");
  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(id);
    const md = s.metadata || {};
    if (s.payment_status !== "paid" || md.mode !== "Delivery") return page(res, 400, "<h2>This is not a paid delivery order.</h2>");
    const pi = await stripe.paymentIntents.retrieve(s.payment_intent);
    const done = (m) => "<h2>Courier already requested</h2>" + (m.uber_tracking_url ? '<p><a href="' + esc(m.uber_tracking_url) + '">Track the delivery</a></p>' : "");
    if (pi.metadata && pi.metadata.uber_delivery_id) return page(res, 200, done(pi.metadata));
    if (req.method !== "POST") {
      return page(res, 200, "<h2>Food is ready?</h2><p>Send an Uber courier to pick up this order for <strong>" + esc(md.name) + "</strong>:<br>" + esc(md.addr) + '</p><form method="POST" onsubmit="this.firstChild.disabled=true"><button style="font-size:1.1rem;padding:14px 22px;border:0;border-radius:10px;background:#17372B;color:#fff;width:100%">Send Uber courier now</button></form>');
    }
    // Claim this order before booking. Every tap writes its own claim, waits, and only the claim still standing goes ahead.
    const busyPage = () => page(res, 200, "<h2>Already booking</h2><p>The courier is being requested. Refresh this page in a moment.</p>");
    if (inflight.has(id)) return busyPage();
    inflight.add(id);
    try {
      const claim = crypto.randomUUID();
      await stripe.paymentIntents.update(pi.id, { metadata: { uber_claim: claim } });
      await sleep(1500);
      const again = await stripe.paymentIntents.retrieve(pi.id);
      if (again.metadata && again.metadata.uber_delivery_id) return page(res, 200, done(again.metadata));
      if (!again.metadata || again.metadata.uber_claim !== claim) return busyPage();
      return await book();
    } finally { inflight.delete(id); }

    async function book() {
    const li = await stripe.checkout.sessions.listLineItems(id, { limit: 100 });
    const items = li.data.filter((l) => l.description !== "Delivery fee").map((l) => ({ name: l.description, qty: l.quantity }));
    const d = await createDelivery({ addr: md.addr, name: md.name, phone: md.phone, items, ref: id.slice(-12) });
    await stripe.paymentIntents.update(pi.id, { metadata: { uber_delivery_id: d.id, uber_tracking_url: d.tracking_url || "" } });
    return page(res, 200, "<h2>Courier requested</h2><p>Uber is finding a driver.</p>" + (d.tracking_url ? '<p><a href="' + esc(d.tracking_url) + '">Track the delivery</a></p>' : ""));
    }
  } catch (e) {
    console.error("dispatch error", e && e.message);
    return page(res, 500, "<h2>Could not book the courier</h2><p>Please try again, or book it yourself in the Uber Direct dashboard.</p>");
  }
};
