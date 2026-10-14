const Stripe = require("stripe");
const { enabled, bearer, userFromToken } = require("./_supabase");
const { priceOrder, validateCustomer, withDelivery, UserError } = require("./_menu");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const priced = priceOrder(body.items);
    const c = validateCustomer(body.customer);
    const lines = withDelivery(priced.lines, c.mode);

    // Logged-in customers send their token; guests send none. A bad token is rejected, never treated as a guest.
    let user = null;
    const tok = bearer(req);
    if (tok && enabled()) {
      let down = false;
      try { user = await userFromToken(tok); } catch (e) { down = true; console.error("auth check failed, continuing as guest", e && e.message); }
      if (!user && !down) return res.status(401).json({ error: "Your login expired. Please log in again or continue as guest." });
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const origin = process.env.SITE_URL || "https://" + req.headers.host;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lines.map((l) => ({
        quantity: l.qty,
        price_data: { currency: "usd", unit_amount: l.unitCents, product_data: { name: l.label } },
      })),
      metadata: Object.assign({ name: c.name, phone: c.phone, mode: c.mode, addr: c.addr, when: c.when, note: c.note }, user ? { user_id: user.id } : {}),
      ...(user && user.email ? { customer_email: user.email } : {}),
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
