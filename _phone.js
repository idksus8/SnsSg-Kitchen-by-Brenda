// Checks that a customer's phone number looks real before we take the order, so Brenda and the courier can actually reach them.
// Step 1 (always): the number must be a properly shaped phone number, and obvious fakes (1111111111, 123-456-7890, 555-0100...) are turned away.
// Step 2 (only if Twilio is already set up for texts): Twilio's number check confirms the number is a valid, assigned number.
// If Twilio's check is down or slow, the order still goes through.
// Note: no check can prove a person answers that number; this catches typos and made-up numbers.
const { UserError } = require("./_menu");

const BAD = "Please enter a real phone number Brenda can reach (for example: 713-555-0123).";
const TIMEOUT_MS = 5000;
const cache = new Map();
const CACHE_MS = 60 * 60 * 1000;

// Returns the number in +E.164 form, or throws a UserError if it cannot be a real number.
function normalizePhone(raw) {
  const s = String(raw || "").trim();
  const digits = s.replace(/\D/g, "");
  // Outside the US/Canada: must start with + and a country code other than 1; only the length can be checked.
  if (s.startsWith("+") && !s.startsWith("+1")) {
    if (digits.length < 8 || digits.length > 15 || digits[0] === "0") throw new UserError(BAD);
    return "+" + digits;
  }
  let n = digits;
  if (n.length === 11 && n[0] === "1") n = n.slice(1);
  if (n.length !== 10) throw new UserError(BAD);
  const area = n.slice(0, 3), exch = n.slice(3, 6), line = n.slice(6);
  if (!/[2-9]/.test(area[0]) || !/[2-9]/.test(exch[0])) throw new UserError(BAD); // US numbers never start an area code or exchange with 0 or 1
  if (area[1] === "1" && area[2] === "1") throw new UserError(BAD);               // 211, 311, 411, 911 are services, not people
  if (exch === "555" && /^01\d\d$/.test(line)) throw new UserError(BAD);          // 555-0100 to 555-0199 are reserved for movies and examples
  if (/^(\d)\1{9}$/.test(n) || n === "1234567890" || n === "2345678901" || n === "9876543210") throw new UserError(BAD);
  if (/^(\d)\1{6}$/.test(n.slice(3))) throw new UserError(BAD);                   // 713-222-2222 style
  return "+1" + n;
}

async function twilioSaysValid(e164) {
  const sid = process.env.TWILIO_ACCOUNT_SID, tok = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !tok) return true;
  const hit = cache.get(e164);
  if (hit && Date.now() - hit.t < CACHE_MS) return hit.ok;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch("https://lookups.twilio.com/v2/PhoneNumbers/" + encodeURIComponent(e164), {
      signal: ctl.signal,
      headers: { Authorization: "Basic " + Buffer.from(sid + ":" + tok).toString("base64") },
    });
    if (!r.ok) throw new Error("twilio lookup http " + r.status);
    const j = await r.json();
    const ok = j.valid !== false; // only an explicit "not valid" turns the customer away
    cache.set(e164, { ok, t: Date.now() });
    if (cache.size > 2000) for (const [k, v] of cache) if (Date.now() - v.t > CACHE_MS) cache.delete(k);
    return ok;
  } catch (e) {
    console.error("phone check unavailable, letting the order through", e && e.message);
    return true;
  } finally {
    clearTimeout(timer);
  }
}

// Throws a UserError the customer can read if the number is not real.
async function verifyPhone(raw) {
  const e164 = normalizePhone(raw);
  if (!(await twilioSaysValid(e164))) throw new UserError(BAD);
}

module.exports = { verifyPhone, normalizePhone };
