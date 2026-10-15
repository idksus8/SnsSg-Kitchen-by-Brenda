// Sends Brenda a text for an order the customer says they paid with Zelle.
// The prices are re-checked on the server, just like card checkout. Nothing is charged here.
const { notify } = require("./_notify");
const { priceOrder, validateCustomer, withDelivery, UserError } = require("./_menu");
const { deliveryFee } = require("./_uber");

function money(cents) { return "$" + (cents / 100).toFixed(2); }

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const priced = priceOrder(body.items);
    const c = validateCustomer(body.customer);
    const lines = withDelivery(priced.lines, c.mode, c.mode === "Delivery" ? await deliveryFee(c.addr) : 0);
    const total = lines.reduce((s, l) => s + l.unitCents * l.qty, 0);

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
    return res.status(200).json({ ok: true, totalCents: total });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error("zelle order error", e && e.message);
    return res.status(500).json({ error: "We could not send your order to Brenda. Please try again." });
  }
};
