// Sends Brenda a text for an order the customer says they paid with Zelle.
// The prices are re-checked on the server, just like card checkout. Nothing is charged here.
const { notify } = require("./_notify");
const { priceOrder, validateCustomer, withDelivery, UserError } = require("./_menu");
const { deliveryFee } = require("./_uber");
const { enabled, bearer, userFromToken, saveOrder } = require("./_supabase");
const crypto = require("crypto");

function money(cents) { return "$" + (cents / 100).toFixed(2); }

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const priced = priceOrder(body.items);
    const c = validateCustomer(body.customer);
    const lines = withDelivery(priced.lines, c.mode, c.mode === "Delivery" ? await deliveryFee(c.addr) : 0);
    const total = lines.reduce((s, l) => s + l.unitCents * l.qty, 0);

    // Logged-in customers send their token so the order lands in their order history; guests send none.
    let user = null;
    const tok = bearer(req);
    if (tok && enabled()) {
      let down = false;
      try { user = await userFromToken(tok); } catch (e) { down = true; console.error("auth check failed, continuing as guest", e && e.message); }
      if (!user && !down) return res.status(401).json({ error: "Your login expired. Please log in again or continue as guest." });
    }

    const parts = [
      "NEW ZELLE ORDER - SnsSg Kitchen by Brenda",
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

    const r = await notify("New Zelle order - SnsSg Kitchen", parts.join("\n").slice(0, 1500));
    if (!r.sent) {
      console.error("zelle order not delivered: alerts set up = " + r.configured);
      return res.status(500).json({ error: "We could not send your order to Brenda. Please try again or contact her directly." });
    }
    if (enabled()) {
      // Best effort: a problem saving history never blocks the order alert Brenda already got.
      try {
        await saveOrder({
          stripe_session_id: "zelle_" + crypto.randomUUID(),
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
