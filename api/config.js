// Tells the website whether accounts are turned on. Only the public (anon) key is ever sent to the browser.
const { enabled } = require("./_supabase");

module.exports = (req, res) => {
  res.setHeader("Cache-Control", "public, max-age=300");
  if (!enabled()) return res.status(200).json({ enabled: false });
  return res.status(200).json({
    enabled: true,
    url: process.env.SUPABASE_URL.replace(/\/+$/, ""),
    key: process.env.SUPABASE_ANON_KEY,
  });
};
