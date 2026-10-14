// Server-side menu and prices. The server never trusts prices sent by the browser.
const MENU = {
  chicken: { name: "Farm Chicken Soup", cents: 2500 },
  goat: { name: "Goat Meat Pepper Soup", cents: 2700 },
  kongoro: { name: "Beef Kongoro (Cow Feet)", cents: 2000 },
  beef: { name: "Beef Soup", cents: 2500 },
  chapati: { name: "Chapati", cents: 250 },
  kisinia: { name: "Kisinia", cents: 3000, options: ["2 chapatis", "Fried cassava", "Fries"] },
};

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
    let opt = "";
    if (m.options) {
      opt = clean(it.opt, 40);
      if (!m.options.includes(opt)) throw new UserError("Please choose a side for " + m.name + ".");
    }
    const note = clean(it.note, 120);
    let label = m.name + (opt ? " (" + opt + ")" : "") + (note ? " - Note: " + note : "");
    return { label: label.slice(0, 240), qty, unitCents: m.cents };
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
  return { name, phone, mode, addr, when, note };
}

// Adds the delivery fee as its own line when the customer chose delivery.
function withDelivery(lines, mode) {
  if (mode !== "Delivery") return lines;
  return lines.concat([{ label: "Delivery fee", qty: 1, unitCents: DELIVERY_FEE_CENTS }]);
}

module.exports = { MENU, UserError, priceOrder, validateCustomer, clean, withDelivery, DELIVERY_FEE_CENTS };
