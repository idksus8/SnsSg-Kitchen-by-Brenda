// Adds every order as one row in a Google Sheet laid out like Brenda's paper tracker:
// DATE | NAME | CHAPATI | CHICKEN SOUP | BEEF SOUP | GOAT MEAT PEPPER SOUP | UROJO | TOTAL, then a few helpful extras.
// Talks to Google with plain fetch + a service account, so no extra packages are needed.
// Stays switched off until GOOGLE_SHEET_ID, GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY are set in Vercel.
const crypto = require("crypto");

const HEADERS = ["DATE", "NAME", "CHAPATI", "CHICKEN SOUP", "BEEF SOUP", "GOAT MEAT PEPPER SOUP", "UROJO", "TOTAL",
  "OTHER ITEMS", "PICKUP / DELIVERY", "TIME", "PHONE", "PAID BY", "NOTES", "ORDER ID"];

// Which paper column each dish counts in (matched on the dish name only, so a note or a side never changes it).
const COLUMNS = [
  (n) => n === "chapati",
  (n) => n === "farm chicken soup",
  (n) => n === "beef soup",
  (n) => n === "goat meat pepper soup",
  (n) => /^urojo\b/.test(n),
];

const enabled = () => !!(process.env.GOOGLE_SHEET_ID && process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
// GOOGLE_SHEET_TAB is optional. Left empty, the first tab of the sheet is used.
const range = (a) => { const t = (process.env.GOOGLE_SHEET_TAB || "").trim(); return (t ? "'" + t.replace(/'/g, "''") + "'!" : "") + a; };

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
// "Friday, Oct 23, 2026 at 6:30 PM" -> { date: "2026-10-23", time: "6:30 PM" }
function parseWhen(w) {
  w = String(w || "");
  const m = /([A-Za-z]{3})[a-z]*\.? (\d{1,2}), (\d{4})/.exec(w);
  const mo = m && MONTHS[m[1].toLowerCase()];
  const date = mo ? m[3] + "-" + String(mo).padStart(2, "0") + "-" + String(m[2]).padStart(2, "0") : "";
  const t = / at (.+)$/.exec(w);
  return { date, time: t ? t[1] : "" };
}

function orderRow(o) {
  const counts = [0, 0, 0, 0, 0], other = [], notes = [];
  for (const l of o.lines || []) {
    const label = String(l.label || "");
    if (/^delivery fee/i.test(label)) continue; // counted in TOTAL only
    const nm = /^(.*?) - Note: (.*)$/.exec(label);
    if (nm) notes.push(nm[1].split(" - ")[0].split(" (")[0].trim() + ": " + nm[2]);
    const shown = nm ? nm[1] : label;
    const base = shown.split(" - ")[0].split(" (")[0].trim().toLowerCase();
    const i = COLUMNS.findIndex((f) => f(base));
    if (i >= 0) counts[i] += Number(l.qty) || 0; else other.push((Number(l.qty) || 1) + " x " + shown);
  }
  if (o.note) notes.unshift(o.note);
  const w = parseWhen(o.when);
  const type = o.mode === "Delivery" ? "Delivery" + (o.addr ? ": " + o.addr : "") : "Pickup";
  return [
    w.date || new Date().toISOString().slice(0, 10), o.name || "",
    ...counts.map((n) => (n ? n : "")),
    Math.round(Number(o.totalCents) || 0) / 100,
    other.join("; "), type, w.time, o.phone || "", o.paidBy || "", notes.join(" | "), o.id || "",
  ];
}

let tok = { v: "", exp: 0 };
async function accessToken() {
  if (tok.v && Date.now() < tok.exp - 60000) return tok.v;
  const key = process.env.GOOGLE_PRIVATE_KEY.trim().replace(/^"|"$/g, "").replace(/\\n/g, "\n");
  const now = Math.floor(Date.now() / 1000);
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const unsigned = enc({ alg: "RS256", typ: "JWT" }) + "." + enc({
    iss: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: "https://www.googleapis.com/auth/spreadsheets",
    aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  });
  const sig = crypto.createSign("RSA-SHA256").update(unsigned).sign(key).toString("base64url");
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + sig }),
  });
  if (!r.ok) throw new Error("google sign-in " + r.status + " " + (await r.text()).slice(0, 200));
  const j = await r.json();
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tok.v;
}

async function g(path, opt) {
  opt = opt || {};
  const r = await fetch("https://sheets.googleapis.com/v4/spreadsheets/" + encodeURIComponent(process.env.GOOGLE_SHEET_ID) + path, {
    method: opt.method || "GET",
    headers: { Authorization: "Bearer " + (await accessToken()), "Content-Type": "application/json" },
    body: opt.body ? JSON.stringify(opt.body) : undefined,
  });
  if (!r.ok) throw new Error("google sheets " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}

// Adds the order as a new row. Safe to call twice for the same order (Stripe retries): the ORDER ID column is checked first.
// Values are written as plain text/numbers (RAW), so a customer typing "=..." in their name can never run as a formula.
async function logOrder(o) {
  if (!enabled()) return false;
  const got = await g("/values:batchGet?ranges=" + encodeURIComponent(range("A1:A1")) + "&ranges=" + encodeURIComponent(range("O:O")));
  const vr = got.valueRanges || [];
  const hasHeader = !!(vr[0] && vr[0].values && vr[0].values[0] && vr[0].values[0][0]);
  if (!hasHeader) {
    await g("/values/" + encodeURIComponent(range("A1:O1")) + "?valueInputOption=RAW", { method: "PUT", body: { values: [HEADERS] } });
  } else if (vr[1] && vr[1].values && vr[1].values.some((r) => r[0] === o.id)) {
    return false; // already in the sheet
  }
  await g("/values/" + encodeURIComponent(range("A:O")) + ":append?valueInputOption=RAW&insertDataOption=INSERT_ROWS", { method: "POST", body: { values: [orderRow(o)] } });
  return true;
}

module.exports = { enabled, logOrder, orderRow, parseWhen, HEADERS };
