const MS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0);
const num = (n) => (+n || 0).toLocaleString("en-IN");
/** ISO -> dd-mm-yyyy, the format the sheet and entry form both use. */
const dmy = (iso) => {
  if (!iso) return "—";
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}-${p[1]}-${p[0]}` : iso;
};
const ymOf = (iso) => (iso ? String(iso).slice(0, 7) : "");

/* Whole days between two ISO dates, or null if either is missing. Both are
   parsed as UTC midnight so the answer is a plain calendar difference and
   cannot be knocked off by an hour by a daylight-saving boundary. */
/* WORKING days between two ISO dates — Sunday is not a working day, so it is
   never counted. Strictly after `from`, up to and including `to`, which is the
   same convention the n8n parser uses for `lateDays`; both columns then count
   the same kind of day and the difference between them is only the SLA window.

   Counting calendar days here was wrong in a way that showed: two calls could
   run 68 and 69 days and both be 58 working days late, because the longer one
   happened to span one more Sunday. A Days column that moves while Late does
   not reads as a bug in whichever number you trust less.

   Parsed as UTC midnight so a daylight-saving boundary cannot knock a day off.

   NOTE: the parser also skips public holidays, from a list only it holds. It
   has none configured, so the two agree today; if holidays are ever added
   there, this count will run high by one per holiday until the API exposes
   them. */
const workingDaysBetween = (fromIso, toIso) => {
  if (!fromIso || !toIso) return null;
  const a = new Date(String(fromIso).slice(0, 10) + "T00:00:00Z");
  const b = new Date(String(toIso).slice(0, 10) + "T00:00:00Z");
  if (isNaN(a.getTime()) || isNaN(b.getTime())) return null;
  if (b <= a) return 0;

  let n = 0;
  const x = new Date(a);
  /* Guard against a bad pair of dates spinning forever — ten years is far
     longer than any real call and still cheap to walk. */
  let guard = 0;
  while (x < b && guard++ < 3650) {
    x.setUTCDate(x.getUTCDate() + 1);
    if (x.getUTCDay() !== 0) n++;          // 0 = Sunday
  }
  return n;
};const yearOf = (ym) => (ym ? +String(ym).slice(0, 4) : 0);
const monLabel = (ym) => {
  if (!ym) return "—";
  const [y, m] = String(ym).split("-");
  return `${MS[+m - 1]} ${y}`;
};
const days = (n) => `${num(n)} ${Math.abs(+n) === 1 ? "day" : "days"}`;
const calls = (n) => `${num(n)} ${Math.abs(+n) === 1 ? "call" : "calls"}`;
/** Short function label: "FUNCTION 1: TEAM & ..." -> "F1" */
const fnShort = (tab) => {
  const m = String(tab || "").match(/^FUNCTION\s*(\d+)/i);
  return m ? "F" + m[1] : String(tab || "").slice(0, 12);
};
const fnTitle = (tab) => {
  const s = String(tab || "");
  return s.indexOf(":") > -1 ? s.split(":").slice(1).join(":").trim() : s;
};

export {
  workingDaysBetween,
  pct, num, dmy, ymOf, monLabel, days, calls, fnShort, fnTitle,
};
