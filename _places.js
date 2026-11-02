// Google address suggestions + "is this a real street address?" check.
// Stays switched off (plain address box, no check) until GOOGLE_MAPS_API_KEY is added in Vercel.
const { UserError } = require("./_menu");

const key = () => process.env.GOOGLE_MAPS_API_KEY || "";
const enabled = () => !!key();
const NOT_FOUND = "We couldn't find that address. Pick one from the suggestions, or type the street number, street, city and ZIP.";

// Optional: PLACES_NEAR="29.76,-95.37" makes suggestions favour addresses near the kitchen.
function bias() {
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(process.env.PLACES_NEAR || "");
  return m ? { circle: { center: { latitude: +m[1], longitude: +m[2] }, radius: 50000 } } : undefined;
}

async function suggest(input) {
  const body = { input, includedRegionCodes: ["us"] };
  const lb = bias();
  if (lb) body.locationBias = lb;
  const r = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key() },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error("places " + r.status);
  const j = await r.json();
  return (j.suggestions || []).filter((s) => s.placePrediction && s.placePrediction.text).slice(0, 5)
    .map((s) => ({ text: s.placePrediction.text.text }));
}

// Throws a UserError if Google says the address does not exist or has no street number.
// If Google itself is down or misconfigured, it lets the order through (and logs why) so sales are not blocked.
async function verifyAddress(addr) {
  if (!enabled()) return;
  let j;
  try {
    const u = "https://maps.googleapis.com/maps/api/geocode/json?components=country:US&address=" +
      encodeURIComponent(addr) + "&key=" + encodeURIComponent(key());
    j = await (await fetch(u)).json();
  } catch (e) { console.error("address check skipped", e && e.message); return; }
  if (j.status === "ZERO_RESULTS") throw new UserError(NOT_FOUND);
  if (j.status !== "OK" || !j.results || !j.results[0]) { console.error("address check skipped", j.status, j.error_message); return; }
  const g = j.results[0];
  const hasNumber = (g.address_components || []).some((c) => c.types.includes("street_number"));
  const exact = (g.types || []).some((t) => ["street_address", "premise", "subpremise"].includes(t)) ||
    ["ROOFTOP", "RANGE_INTERPOLATED"].includes(g.geometry && g.geometry.location_type);
  if (!hasNumber || !exact) throw new UserError(NOT_FOUND);
}

module.exports = { enabled, suggest, verifyAddress };
