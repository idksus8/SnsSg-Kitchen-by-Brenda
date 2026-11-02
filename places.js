// Address suggestions as the customer types. The Google key stays on the server.
const { enabled, suggest } = require("./_places");
const { limited, tooMany } = require("./_guard");

module.exports = async (req, res) => {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  if (!enabled()) return res.status(200).json({ enabled: false, suggestions: [] });
  if (limited(req, "places", 80, 10 * 60 * 1000)) return tooMany(res);
  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const q = String(body.q || "").replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 120);
    if (q.length < 3) return res.status(200).json({ suggestions: [] });
    return res.status(200).json({ suggestions: await suggest(q) });
  } catch (e) {
    console.error("places error", e && e.message);
    return res.status(200).json({ suggestions: [] }); // the customer can still type the address by hand
  }
};
