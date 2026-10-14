// Returns the logged-in customer's past orders. The user is identified from their token, never from the request body.
const { enabled, bearer, userFromToken, listOrders } = require("./_supabase");

module.exports = async (req, res) => {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });
  res.setHeader("Cache-Control", "no-store");
  if (!enabled()) return res.status(404).json({ error: "Accounts are not turned on." });
  try {
    const tok = bearer(req);
    const user = tok ? await userFromToken(tok) : null;
    if (!user) return res.status(401).json({ error: "Please log in to see your orders." });
    return res.status(200).json({ orders: await listOrders(user.id) });
  } catch (e) {
    console.error("orders error", e && e.message);
    return res.status(500).json({ error: "We could not load your orders. Please try again." });
  }
};
