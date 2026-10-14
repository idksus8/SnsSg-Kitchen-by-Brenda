const Stripe = require("stripe");
const { priceOrder, validateCustomer, withDelivery, UserError } = require("./_menu");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const priced = priceOrder(body.items);
    const c = validateCustomer(body.customer);
    const lines = withDelivery(priced.lines, c.mode);

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = process.env.SITE_URL || "https://" + req.headers.host;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lines.map((l) => ({
        quantity: l.qty,
        price_data: { currency: "usd", unit_amount: l.unitCents, product_data: { name: l.label } },
      })),
      metadata: { name: c.name, phone: c.phone, mode: c.mode, addr: c.addr, when: c.when, note: c.note },
      success_url: origin + "/?paid=1",
      cancel_url: origin + "/",
    });
    return res.status(200).json({ url: session.url });
  } catch (e) {
    if (e instanceof UserError) return res.status(400).json({ error: e.message });
    console.error("checkout error", e && e.message);
    return res.status(500).json({ error: "We could not start checkout. Please try again." });
  }
};
