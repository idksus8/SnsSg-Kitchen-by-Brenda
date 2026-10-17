// Server-side menu and prices. The server never trusts prices sent by the browser.
const MENU = {
  chicken: { name: "Farm Chicken Soup", cents: 2500 },
  goat: { name: "Goat Meat Pepper Soup", cents: 2700 },
  kongoro: { name: "Beef Kongoro (Cow Feet)", cents: 2000 },
  beef: { name: "Beef Soup", cents: 2500 },
  mtori: { name: "Beef Mtori (Green Banana Puree)", cents: 2500 },
  chapati: { name: "Chapati", cents: 250 },
  // Kisinia is priced by the fish picked; the first one (Mackerel) is the default.
  kisinia: {
    name: "Kisinia", cents: 2000, options: ["2 chapatis", "Fried cassava", "Fries", "Extra shrimp"], extras: { "Extra shrimp": 600 }, moreSide: 200, // first side included; each further side is $2
    fish: [{ name: "Mackerel", cents: 2000 }, { name: "Pompano", cents: 3200 }, { name: "Drum fish", cents: 4000 }, { name: "Tilapia", cents: 3000 }],
  },
};

// One place for the shop name used in texts, emails and the courier booking. Change it with SHOP_NAME in Vercel.
const SHOP_NAME = process.env.SHOP_NAME || "SnsSg Kitchen";

const DELIVERY_FEE_CENTS = 499;

class UserError extends Error {}

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, max);
}

function priceOrder(items) {
  if (!Array.isArray(items) || items.length === 0) throw new UserError("Your order is empty.");
  if (items.length > 25) throw new UserError("Too many items in one order. Please split it up.");
  const lines = items.map((it) => {
    const m = MENU[it && it.id];
    if (!m) throw new UserError("One of the items is no longer on the menu. Please refresh the page.");
    const qty = Number(it.qty);
    if (!Number.isInteger(qty) || qty < 1 || qty > 50) throw new UserError("Please check the quantities in your order.");
    // Dishes sold by type of fish: the fish picked sets the price. A missing choice means the first (default) fish.
    let fishName = "", unitCents = m.cents;
    if (m.fish) {
      const want = clean(it.fish, 40);
      const f = want ? m.fish.find((x) => x.name === want) : m.fish[0];
      if (!f) throw new UserError("Please choose a type of fish for " + m.name + ".");
      fishName = f.name; unitCents = f.cents;
    }
    let opt = "";
    if (m.options) {
      // Customers can pick one or more sides, sent as "A, B". Each must be on the menu; rebuilt in menu order.
      const picked = Array.from(new Set(clean(it.opt, 100).split(",").map((x) => x.trim()).filter(Boolean)));
      const extras = m.extras || {};
      // Every pick must be on the menu, and at least one must be a real side (Extra shrimp alone does not count).
      if (picked.length === 0 || !picked.every((x) => m.options.includes(x)) || !picked.some((x) => !(x in extras))) throw new UserError("Please choose a side for " + m.name + ".");
      opt = m.options.filter((x) => picked.includes(x)).join(", ");
      unitCents += opt.split(", ").reduce((sum, x) => sum + (extras[x] || 0), 0);
      const sides = opt.split(", ").filter((x) => !(x in extras)).length;
      if (sides > 1) unitCents += (sides - 1) * (m.moreSide || 0);
    }
    const note = clean(it.note, 120);
    let label = m.name + (fishName ? " - " + fishName : "") + (opt ? " (" + opt + ")" : "") + (note ? " - Note: " + note : "");
    return { label: label.slice(0, 240), qty, unitCents };
  });
  const subtotalCents = lines.reduce((s, l) => s + l.unitCents * l.qty, 0);
  return { lines, subtotalCents };
}

function validateCustomer(c) {
  c = c || {};
  const name = clean(c.name, 80);
  const phone = clean(c.phone, 30);
  const mode = c.mode === "Delivery" ? "Delivery" : "Pickup";
  const addr = clean(c.addr, 200);
  const when = clean(c.when, 80);
  const note = clean(c.note, 300);
  if (!name) throw new UserError("Enter your name.");
  if (phone.replace(/\D/g, "").length < 7) throw new UserError("Enter a phone number Brenda can reach.");
  if (mode === "Delivery" && !addr) throw new UserError("Enter your delivery address.");
  // Brenda cooks Friday, Saturday and Sunday only, so the day the customer picked (YYYY-MM-DD) must be one of those.
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(clean(c.whenDate, 10));
  const dt = dm ? new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3])) : null;
  const dow = dt && dt.getUTCMonth() === +dm[2] - 1 ? dt.getUTCDay() : -1;
  if (![5, 6, 0].includes(dow)) throw new UserError("Brenda takes orders for Friday, Saturday and Sunday only. Please refresh the page and choose one of those days.");
  return { name, phone, mode, addr, when, note };
}

// Adds the delivery fee as its own line when the customer chose delivery.
function withDelivery(lines, mode, feeCents) {
  if (mode !== "Delivery") return lines;
  return lines.concat([{ label: "Delivery fee", qty: 1, unitCents: Number.isInteger(feeCents) ? feeCents : DELIVERY_FEE_CENTS }]);
}

module.exports = { SHOP_NAME, MENU, UserError, priceOrder, validateCustomer, clean, withDelivery, DELIVERY_FEE_CENTS };
