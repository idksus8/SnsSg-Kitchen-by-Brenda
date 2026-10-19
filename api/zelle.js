// Sends Brenda a text for an order the customer says they paid with Zelle.
// The prices are re-checked on the server, just like card checkout. Nothing is charged here.
const { notify } = require("./_notify");
const { priceOrder, validateCustomer, withDelivery, UserError } = require("./_menu");
const { feeFor } = require("./_uber");
const { limited, tooMany } = require("./_guard");
const { normalizePhone } = require("./_phone");
const { SHOP_NAME } = require("./_menu");
const { enabled, bearer, userFromToken, saveOrder, countSince, findDuplicate } = require("./_supabase");

// Most Zelle order alerts we will send in one hour, so a flood of fake orders cannot bury Brenda in texts.
const MAX_ZELLE_PER_HOUR = 20;
const crypto = require("crypto");
const sheet = require("./_sheet");

function money(cents) { return "$" + (cents / 100).toFixed(2); }

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (limited(req, "zelle", 5, 10 * 60 * 1000)) return tooMany(res);
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const priced = priceOrder(body.items);
    const c = validateCustomer(body.customer);
    normalizePhone(c.phone); // instant format-only backstop (no lookup); the real check already ran when the customer tapped Pay with Zelle
    // The address was already checked and priced when the customer tapped Pay with Zelle, so no lookup happens here.
    const f = c.mode === "Delivery" ? await feeFor(c.addr, body.quote, { lookup: false }) : null;
    const lines = withDelivery(priced.lines, c.mode, f ? f.feeCents : 0);
    const total = lines.reduce((s, l) => s + l.unitCents * l.qty, 0);
    // The customer was told to send an exact amount. If our total is different, they must see the new one before paying.
    if (Number.isInteger(body.expected) && body.expected !== total) {
      return res.status(409).json(Object.assign({
        error: "The total changed to $" + (total / 100).toFixed(2) + ". Please check it before you send payment.",
        totalCents: total,
      }, f ? { feeCents: f.feeCents, quote: f.quote } : {}));
    }

    // Logged-in customers send their token so the order lands in their order history; guests send none.
    let user = null;
    const tok = bearer(req);
    if (tok && enabled()) {
      let down = false;
      try { user = await userFromToken(tok); } catch (e) { down = true; console.error("auth check failed, continuing as guest", e && e.message); }
      if (!user && !down) return res.status(401).json({ error: "Your login expired. Please log in again or continue as guest." });
    }

    if (enabled()) {
      // Uses the order history. If it cannot be reached, orders still go through.
      try {
        if ((await countSince("zelle_*", new Date(Date.now() - 60 * 60 * 1000).toISOString())) >= MAX_ZELLE_PER_HOUR) {
          return res.status(429).json({ error: "We are getting a lot of orders right now. Please text Brenda to place yours." });
        }
        // The same phone and total in the last 10 minutes is a double tap, not a new order: do not text Brenda twice.
        if (await findDuplicate(c.phone, total, new Date(Date.now() - 10 * 60 * 1000).toISOString())) {
          return res.status(200).json({ ok: true, totalCents: total, duplicate: true });
        }
      } catch (e) { console.error("zelle guard check failed, continuing", e && e.message); }
    }

    const parts = [
      "NEW ZELLE ORDER - " + SHOP_NAME,
      "NOT CONFIRMED YET: check your Zelle for " + money(total) + " from " + c.name + " before you start.",
      "",
      lines.map((l) => l.qty + " x " + l.label + " - " + money(l.unitCents * l.qty)).join("\n"),
      "",
      "Total to receive: " + money(total),
      c.mode + (c.mode === "Delivery" && c.addr ? ": " + c.addr : ""),
    ];
    if (c.when) parts.push("Wanted: " + c.when);
    parts.push("Name: " + c.name);
    parts.push("Phone: " + c.phone);
    if (c.note) parts.push("Notes: " + c.note);

    const r = await notify("New Zelle order - " + SHOP_NAME, parts.join("\n").slice(0, 1500));
    if (!r.sent) {
      console.error("zelle order not delivered: alerts set up = " + r.configured);
      return res.status(500).json({ error: "We could not send your order to Brenda. Please try again or contact her directly." });
    }
    const orderId = "zelle_" + crypto.randomUUID();
    if (sheet.enabled()) {
      // Add it to the spreadsheet too, marked so Brenda knows to check her Zelle. Never blocks the order.
      try {
        await sheet.logOrder({
          id: orderId, name: c.name, phone: c.phone, mode: c.mode, addr: c.addr, when: c.when, note: c.note,
          lines: lines.map((l) => ({ label: l.label, qty: l.qty })), totalCents: total, paidBy: "Zelle (check payment)",
        });
      } catch (e) { console.error("spreadsheet error", e && e.message); }
    }
    if (enabled()) {
      // Best effort: a problem saving history never blocks the order alert Brenda already got.
      try {
        await saveOrder({
          stripe_session_id: orderId,
          user_id: user ? user.id : null,
          email: user ? user.email || null : null,
          name: c.name, phone: c.phone, mode: c.mode, addr: c.addr || null, when_text: c.when || null, note: c.note || null,
          items: lines.map((l) => ({ label: l.label, qty: l.qty, cents: l.unitCents * l.qty })),
          total_cents: total,
        });
      } catch (e) { console.error("save zelle order error", e && e.message); }
    }
    return res.status(200).json({ ok: true, totalCents: total });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error("zelle order error", e && e.message);
    return res.status(500).json({ error: "We could not send your order to Brenda. Please try again." });
  }
};
