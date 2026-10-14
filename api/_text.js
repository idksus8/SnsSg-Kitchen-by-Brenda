// Builds the order text that is sent to Brenda.
function money(cents) { return "$" + (cents / 100).toFixed(2); }

function buildText(session, lineItems) {
  const md = session.metadata || {};
  const lines = lineItems.map((l) => l.quantity + " x " + l.description + " - " + money(l.amount_total));
  const parts = [
    "NEW PAID ORDER - test1",
    "",
    lines.join("\n"),
    "",
    "Total paid: " + money(session.amount_total),
    (md.mode || "Pickup") + (md.mode === "Delivery" && md.addr ? ": " + md.addr : ""),
  ];
  if (md.when) parts.push("Wanted: " + md.when);
  parts.push("Name: " + (md.name || "n/a"));
  parts.push("Phone: " + (md.phone || "n/a"));
  if (md.note) parts.push("Notes: " + md.note);
  const email = session.customer_details && session.customer_details.email;
  if (email) parts.push("Email: " + email);
  return parts.join("\n").slice(0, 1500);
}

module.exports = { buildText, money };
