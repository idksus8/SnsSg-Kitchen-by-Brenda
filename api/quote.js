// Tells the checkout page what delivery will cost for an address (Uber's live price, or the flat fee if Uber is not set up).
const { UserError } = require("./_menu");
const { deliveryFee, signQuote } = require("./_uber");
const { limited, tooMany } = require("./_guard");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (limited(req, "quote", 20, 10 * 60 * 1000)) return tooMany(res);
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const addr = String(body.addr || "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 200);
    if (!addr) throw new UserError("Enter your delivery address.");
    const feeCents = await deliveryFee(addr);
    return res.status(200).json({ feeCents, quote: signQuote(addr, feeCents) });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error("quote error", e && e.message);
    return res.status(500).json({ error: "We could not get the delivery price. Please try again." });
  }
};
