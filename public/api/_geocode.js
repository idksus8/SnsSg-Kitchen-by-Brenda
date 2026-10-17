// Checks that a delivery address is a real place before we quote or charge for it.
// Uses the free US Census geocoder (no sign-up, no key). If GOOGLE_MAPS_API_KEY is set in Vercel, Google is used instead (better with new buildings).
// If the lookup service itself is down or slow, the order is allowed through: a broken lookup must never stop Brenda from getting orders.
const { UserError } = require("./_menu");

const NOT_FOUND = "We couldn't find that address. Please enter the street number, street, city and ZIP (for example: 123 Main St, Houston, TX 77002).";
const TIMEOUT_MS = 6000;

// Remembers recent answers so the same address typed twice (quote, then checkout) only looks up once.
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;

// "Apt 4B", "Unit 12", "Suite 300", "#7" confuse the lookup and are not part of the street, so they are left out of the check only.
function forLookup(addr) {
  return addr
    .replace(/[,\s]+(apt|apartment|unit|ste|suite|bldg|building|fl|floor|rm|room)\.?\s*#?\s*[\w-]+/gi, "")
    .replace(/[,\s]+#\s*[\w-]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function getJson(url) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) throw new Error("geocoder http " + r.status);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

// Returns true (real), false (no such address). Throws if the service could not be reached.
async function lookup(addr) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (key) {
    const j = await getJson("https://maps.googleapis.com/maps/api/geocode/json?address=" + encodeURIComponent(addr) + "&components=country:US&key=" + encodeURIComponent(key));
    if (j.status === "ZERO_RESULTS") return false;
    if (j.status !== "OK") throw new Error("google geocoder " + j.status);
    // A result that is only a city, ZIP or state is not a place we can deliver to; it needs to be a street address or a building.
    return j.results.some((x) => (x.types || []).some((t) => ["street_address", "premise", "subpremise", "establishment", "point_of_interest", "route"].includes(t)));
  }
  const j = await getJson("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=" + encodeURIComponent(addr));
  if (!j || !j.result || !Array.isArray(j.result.addressMatches)) throw new Error("census geocoder bad reply");
  return j.result.addressMatches.length > 0;
}

// Instant offline check (no lookup): rules out empty, too-short and number-less text like "asdf" or "Houston".
function looksLikeAddress(addr) {
  const q = forLookup(String(addr || ""));
  if (q.length < 6 || !/\d/.test(q) || !/[a-z]/i.test(q)) throw new UserError(NOT_FOUND);
  return q;
}

// Throws a UserError the customer can read if the address is not real. Returns quietly otherwise.
async function verifyAddress(addr) {
  const q = looksLikeAddress(addr);
  const hit = cache.get(q.toLowerCase());
  if (hit && Date.now() - hit.t < CACHE_MS) {
    if (!hit.ok) throw new UserError(NOT_FOUND);
    return;
  }
  let ok;
  try {
    ok = await lookup(q);
  } catch (e) {
    console.error("address check unavailable, letting the order through", e && e.message);
    return;
  }
  cache.set(q.toLowerCase(), { ok, t: Date.now() });
  if (cache.size > 2000) for (const [k, v] of cache) if (Date.now() - v.t > CACHE_MS) cache.delete(k);
  if (!ok) throw new UserError(NOT_FOUND);
}

module.exports = { verifyAddress, looksLikeAddress, forLookup };
