// Sends the "new order" alert to Brenda on every channel that is set up.
// Set up any one of these (or several) in Vercel > Settings > Environment Variables:
//   Text message (Twilio): TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM, OWNER_PHONE
//   Email (Resend):        RESEND_API_KEY, NOTIFY_EMAIL   (optional: EMAIL_FROM)
//   Phone alert (ntfy):    NTFY_TOPIC
const env = process.env;
const { SHOP_NAME } = require("./_menu");

const channels = [
  {
    name: "text",
    on: () => !!(env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN && env.TWILIO_FROM && env.OWNER_PHONE),
    send: async (subject, text) => {
      const client = require("twilio")(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN);
      await client.messages.create({ to: env.OWNER_PHONE, from: env.TWILIO_FROM, body: text.slice(0, 1500) });
    },
  },
  {
    name: "email",
    on: () => !!(env.RESEND_API_KEY && env.NOTIFY_EMAIL),
    send: async (subject, text) => {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: env.EMAIL_FROM || SHOP_NAME + " <onboarding@resend.dev>",
          to: [env.NOTIFY_EMAIL],
          subject,
          text,
        }),
      });
      if (!r.ok) throw new Error("email " + r.status + " " + (await r.text()).slice(0, 200));
    },
  },
  {
    name: "ntfy",
    on: () => !!env.NTFY_TOPIC,
    send: async (subject, text) => {
      const r = await fetch("https://ntfy.sh/" + encodeURIComponent(env.NTFY_TOPIC), {
        method: "POST",
        headers: { Title: subject.replace(/[^\x20-\x7e]/g, ""), Priority: "high", Tags: "fork_and_knife" },
        body: text,
      });
      if (!r.ok) throw new Error("ntfy " + r.status);
    },
  },
];

// Returns how many channels are set up and how many actually delivered.
async function notify(subject, text) {
  const active = channels.filter((c) => c.on());
  const results = await Promise.allSettled(active.map((c) => c.send(subject, text)));
  let sent = 0;
  results.forEach((r, i) => {
    if (r.status === "fulfilled") sent++;
    else console.error("alert failed (" + active[i].name + ")", r.reason && r.reason.message);
  });
  return { configured: active.length, sent };
}

module.exports = { notify };
