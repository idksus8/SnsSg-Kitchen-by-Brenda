const Stripe = require("stripe");
const twilio = require("twilio");
const { buildText } = require("./_text");
const { enabled, saveOrder } = require("./_supabase");

async function rawBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).end();
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let event;
  try {
    event = stripe.webhooks.constructEvent(
      await rawBody(req),
      req.headers["stripe-signature"],
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (e) {
    return res.status(400).send("Bad signature");
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    if (session.payment_status !== "paid") return res.status(200).json({ received: true });
    try {
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 100 });
      if (enabled()) {
        // Save to order history first. A failure here is logged but never blocks the text to Brenda.
        try {
          const md = session.metadata || {};
          await saveOrder({
            stripe_session_id: session.id,
            user_id: md.user_id || null,
            email: (session.customer_details && session.customer_details.email) || null,
            name: md.name || null, phone: md.phone || null, mode: md.mode || "Pickup",
            addr: md.addr || null, when_text: md.when || null, note: md.note || null,
            items: items.data.map((l) => ({ label: l.description, qty: l.quantity, cents: l.amount_total })),
            total_cents: session.amount_total,
          });
        } catch (e) { console.error("save order error", e && e.message); }
      }
      const body = buildText(session, items.data);
      const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      await client.messages.create({ to: process.env.OWNER_PHONE, from: process.env.TWILIO_FROM, body });
    } catch (e) {
      console.error("notify error", e && e.message);
      return res.status(500).json({ error: "notify failed" }); // Stripe will retry
    }
  }
  return res.status(200).json({ received: true });
};

module.exports.config = { api: { bodyParser: false } };
