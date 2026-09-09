/* Run with: npm run test:status

   Two things are pinned down here.

   1. normalizeStatus — the sheet is typed by hand, so the same status arrives
      spelled several ways. Everything on screen goes through this, and the
      history timeline uses it to decide whether the current status is already
      the last entry or a newer one.

   2. THE DASHBOARD DOES NOT WRITE. It reports on a shared operational record
      and never changes it. That used to be enforced by a before/after guard in
      front of a POST; it is now enforced by there being no POST at all, which
      is a much easier thing to keep true. The last test walks the source and
      fails if a write path ever reappears — a comment mentioning the removed
      endpoint is fine, a fetch reaching it is not.
*/

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { normalizeStatus } from "../src/lib/status.js";

let failed = 0;

function t(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log((ok ? "  PASS  " : "  FAIL  ") + name);
  if (!ok) {
    console.log("          got  " + JSON.stringify(got));
    console.log("          want " + JSON.stringify(want));
  }
}

console.log("\nnormalizeStatus");
t("blank becomes No status", normalizeStatus(""), "No status");
t("null becomes No status", normalizeStatus(null), "No status");
t("undefined becomes No status", normalizeStatus(undefined), "No status");
t("casing is normalised", normalizeStatus("call PENDING"), "Call pending");
t("inner whitespace is collapsed", normalizeStatus("Call   pending"), "Call pending");
t("surrounding whitespace is trimmed", normalizeStatus("  Completed  "), "Completed");
t("the sheet's spelling is kept",
  normalizeStatus("call postponed BY client"), "Call postponed by client");
t("an unknown value is shown as written", normalizeStatus("Rescheduled"), "Rescheduled");

console.log("\nthe dashboard is read-only");

/* Walk src/ and collect anything that would actually send a write. Comments
   are stripped first so the notes explaining why the write path was removed
   do not trip the check that removed it. */
function sourceFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (/\.(jsx?|mjs)$/.test(name)) out.push(full);
  }
  return out;
}

const stripComments = (code) =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const offenders = [];
for (const file of sourceFiles("src")) {
  const code = stripComments(readFileSync(file, "utf8"));
  const hits = [];
  if (/method\s*:\s*["'`](POST|PUT|PATCH|DELETE)/i.test(code)) hits.push("a mutating fetch");
  if (/framework-tracker\/log|URLS\.log|TRACKER_URLS\.log/.test(code)) hits.push("the log endpoint");
  if (/logStatusChange|diffStatuses/.test(code)) hits.push("a status-write helper");
  if (hits.length) offenders.push(file.replace(/\\/g, "/") + " — " + hits.join(", "));
}

t("no source file sends a write", offenders, []);
if (offenders.length) offenders.forEach((o) => console.log("          " + o));

console.log("\nResponse pending is a starting status");

/* THE RULE, from the people who type it: "Response pending" is the wait for
   the client to come back. There is no call yet and no start date — the date
   is stamped only when they answer and the status moves on to "Call pending".
   So it can sit at the head of a call's history and nowhere else.

   Checked against the mock, because the mock is the only dataset here whose
   history is written by hand and so the only one that can get it wrong. A
   fixture with Response pending in the middle of a chain is a fixture of
   something that cannot happen, and the roadmap drawn from it would teach the
   reader a sequence the tracker never produces. */
const { mockResponse } = await import("../src/lib/mock.js");
const mockRows = mockResponse().rows;

const misplaced = mockRows.flatMap((r) =>
  (r.history || [])
    .filter((h) => h.status === "Response pending"
      && r.startDate && h.date.slice(0, 10) >= r.startDate)
    .map((h) => `${r.business} ${r.framework} — ${h.date.slice(0, 10)} is on/after start ${r.startDate}`));

t("never on or after a start date", misplaced, []);
if (misplaced.length) misplaced.forEach((m) => console.log("          " + m));

const paused = mockRows.filter((r) => r.subVerdict === "paused");
t("every paused row carries no start date",
  paused.length > 0 && paused.every((r) => !r.startDate), true);

console.log(failed ? `\n${failed} FAILED\n` : "\nall green\n");
process.exit(failed ? 1 : 0);
