// The Thanksgiving package is limited to PKG_LIMIT. The count comes from saved orders (card orders are saved once paid,
// Zelle orders when they are sent), so the cap needs the orders database.
const { MENU, PKG_ID, PKG_LIMIT, UserError } = require("./_menu");
const { enabled, sumItems } = require("./_supabase");

async function left() {
  return Math.max(0, PKG_LIMIT - (await sumItems(MENU[PKG_ID].name, "2026-10-01T00:00:00Z")));
}

// Throws if the order has the package and there are not enough left.
async function checkPackages(items) {
  const want = items.filter((i) => i.id === PKG_ID).reduce((s, i) => s + Number(i.qty), 0);
  if (!want) return;
  const busy = new UserError("We cannot check how many Thanksgiving packages are left right now. Please text Brenda to order.");
  if (!enabled()) throw busy;
  let n;
  try { n = await left(); } catch (e) { console.error("package count failed", e && e.message); throw busy; }
  if (n <= 0) throw new UserError("Sorry, the Thanksgiving packages are sold out.");
  if (want > n) throw new UserError("Only " + n + " Thanksgiving package" + (n === 1 ? "" : "s") + " left. Please lower the quantity.");
}

module.exports = { left, checkPackages };
