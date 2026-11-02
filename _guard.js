// Simple abuse protection: limits how often one visitor can call an endpoint.
// Note: this memory is per server instance, so it stops quick bursts, not a determined attacker.
// For a stronger limit, also turn on rate limiting in Vercel: Project > Firewall.
const hits = new Map();

function clientIp(req) {
  const xf = String((req.headers && req.headers["x-forwarded-for"]) || "").split(",")[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || "unknown";
}

// Returns true when this visitor has made `max` calls to `name` in the last `windowMs`.
function limited(req, name, max, windowMs) {
  const key = name + "|" + clientIp(req);
  const now = Date.now();
  const arr = (hits.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { hits.set(key, arr); return true; }
  arr.push(now);
  hits.set(key, arr);
  if (hits.size > 5000) {
    for (const [k, v] of hits) if (!v.length || now - v[v.length - 1] > windowMs) hits.delete(k);
  }
  return false;
}

function tooMany(res) {
  res.setHeader("Retry-After", "60");
  return res.status(429).json({ error: "Too many tries. Please wait a minute and try again." });
}

module.exports = { clientIp, limited, tooMany };
