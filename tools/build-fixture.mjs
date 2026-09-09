/* Runs the REAL parser (n8n/parse-framework-calls.js) over sheet exports and
   writes the payload the /data webhook would return.

   The point is that no logic is re-implemented here. The parser body is read
   from disk and executed with a stubbed n8n `$()` helper, so what you see in
   the fixture is exactly what the Code node produces — if the two ever drift,
   this stops being useful.

   Usage:
     node tools/extract-sheets.mjs      # xlsx -> tools/raw-sheets.json
     node tools/build-fixture.mjs       # raw-sheets.json -> tools/fixture.json
*/
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

const raw = JSON.parse(readFileSync(resolve(here, "raw-sheets.json"), "utf8"));
const body = readFileSync(resolve(root, "n8n", "parse-framework-calls.js"), "utf8");

/* Stand-in for n8n's node accessor. The parser only ever calls
   $('<node name>').first().json — nothing else of the runtime is needed. */
const $ = (node) => ({
  first: () => ({
    json:
      node === "HTTP - Load All Tabs" ? { valueRanges: raw.valueRanges } :
      node === "HTTP - Load Log"      ? { values: raw.logValues } :
      (() => { throw new Error("parser asked for an unstubbed node: " + node); })(),
  }),
});

const out = new Function("$", body)($);
const payload = out[0].json;

writeFileSync(resolve(here, "fixture.json"), JSON.stringify(payload, null, 2));

const c = payload.counts;
const pct = (n) => ((n / c.attempts) * 100).toFixed(1) + "%";
console.log("parser      :", payload.parserVersion, "| SLA", payload.slaHours + "h");
console.log("attempts    :", c.attempts);
console.log("  on time   :", c.onTime, pct(c.onTime));
console.log("  late      :", c.late, pct(c.late));
console.log("  late open :", c.latePending, pct(c.latePending));
console.log("  in window :", c.inWindow);
console.log("  paused    :", c.paused);
console.log("closed by   : log", c.closedFromLog, "| grid", c.closedFromGrid);
console.log("unmatched   :", c.unmatched, "(log event, no start date)");
console.log("\nwrote tools/fixture.json");
