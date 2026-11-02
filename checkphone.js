// Lets the checkout page check the phone number the moment the customer taps "Pay with Zelle", before any payment instructions are shown.
// (Card checkout does the same check inside api/checkout.js when the customer taps pay.)
const { UserError } = require("./_menu");
const { verifyPhone } = require("./_phone");
const { limited, tooMany } = require("./_guard");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (limited(req, "checkphone", 20, 10 * 60 * 1000)) return tooMany(res);
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    await verifyPhone(String(body.phone || "").slice(0, 30));
    return res.status(200).json({ ok: true });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error("checkphone error", e && e.message);
    return res.status(500).json({ error: "We could not check your phone number. Please try again." });
  }
};
