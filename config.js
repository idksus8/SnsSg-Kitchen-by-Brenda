// Tells the website whether accounts are turned on and how many Thanksgiving packages are left.
// Only the public (anon) key is ever sent to the browser.
const { enabled } = require("./_supabase");
const { left } = require("./_package");

module.exports = async (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=30");
  let pkgLeft = null;
  try { if (enabled()) pkgLeft = await left(); } catch (e) {}
  if (!enabled()) return res.status(200).json({ enabled: false, pkgLeft });
  return res.status(200).json({
    enabled: true,
    url: process.env.SUPABASE_URL.replace(/\/+$/, ""),
    key: process.env.SUPABASE_ANON_KEY,
    pkgLeft,
  });
};
