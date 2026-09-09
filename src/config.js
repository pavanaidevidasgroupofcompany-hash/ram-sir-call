/* ================================================================== config */

/* ===========================================================================
   THE WEBHOOKS. This is the only place they are defined — nothing to set up
   elsewhere, and no .env file. The dashboard is ready to run as shipped.

     data      https://srv1853541.hstgr.cloud/webhook/framework-tracker/data
               every attempt, parsed. Everything on screen comes from this.
     functions https://srv1853541.hstgr.cloud/webhook/framework-tracker/functions
               just the tab list.

   Both are built from the two constants below, so moving the dashboard to a
   different n8n instance is a ONE-LINE change to N8N_HOST. If you also rename
   the webhook path in n8n, change SLUG to match — the workflow sets that path
   in three nodes ("Webhook - Data", "Webhook - Functions" and "Webhook - Log")
   and all three must agree, even though this app only calls the first two.

   THIS DASHBOARD ONLY READS. There is no write path anywhere in it: statuses
   are changed in the tracker sheet, not here. The workflow's /log endpoint is
   what fills the `history` array on every row, and this app displays that
   history — but nothing here POSTs to it. The URL is deliberately absent below
   so a future edit cannot reach it by accident.

   HEALTH CHECK — open the data URL in a browser. A good response starts with
   "generatedAt" and carries "slaHours": 48 and a "rows" array. A response with
   no "rows" means an older workflow is deployed: re-import
   framework_call_tracker_n8n_workflow.json from this project's n8n/ folder.

   CORS is handled by the workflow, which sets Access-Control-Allow-Origin: *
   on its responses. A CORS error in the console means the request never
   reached the Respond node — check the workflow is active.
   ======================================================================== */
const N8N_HOST_DEFAULT = "https://srv1853541.hstgr.cloud";

/* ?api=<origin> points the dashboard at a different host for one page load —
   used to review a parser change against tools/fixture-server.mjs before it is
   deployed to n8n. Nothing is stored, so a plain reload returns to live. */
const API_OVERRIDE =
  typeof location !== "undefined"
    ? new URLSearchParams(location.search).get("api")
    : null;

const N8N_HOST = API_OVERRIDE || N8N_HOST_DEFAULT;
const SLUG = "framework-tracker";
const URLS = {
  data: `${N8N_HOST}/webhook/${SLUG}/data`,
  functions: `${N8N_HOST}/webhook/${SLUG}/functions`,
};

/* The SLA the whole dashboard is judged against. Only a fallback for the first
   paint — the real number arrives with every response as `slaHours`. */
const SLA_DAYS = 2;

/* HOW THE WINDOW IS SHOWN.

   These were once the fixed strings "24 hours" / "24-hour" while the parser
   measured 48, so every "past the 24-hour window" caption was wrong by double.
   Nothing here is hardcoded any more.

   The parser describes its own rule: it replaced the fixed 48-hour clock with
   "end of the next working day", Mon-Sat, and says so in `slaRule` /
   `workingWeek`. `slaHours` remains in the payload as a legacy outer bound, so
   wording the screen from it would state a rule the backend no longer applies
   — exactly the drift these helpers exist to stop.

   The rule wins when the payload carries one; the hours are the fallback. */
const SLA_RULES = {
  "end-of-next-working-day": {
    window: "next working day",
    label: "the end of the next working day",
    note: (week) => `Deadline is the end of the next working day (${week || "Mon-Sat"}).`,
  },
};

const slaPhrase = (meta) => SLA_RULES[meta && meta.slaRule] || null;

const slaLabel = (hours, meta) => {
  const rule = slaPhrase(meta);
  if (rule) return rule.label;
  const h = Number(hours) || SLA_DAYS * 24;
  if (h % 24 === 0) {
    const d = h / 24;
    return d === 1 ? "24 hours" : `${d} days`;
  }
  return `${h} hours`;
};
const slaWindow = (hours, meta) => {
  const rule = slaPhrase(meta);
  if (rule) return rule.window;
  const h = Number(hours) || SLA_DAYS * 24;
  if (h % 24 === 0) {
    const d = h / 24;
    return d === 1 ? "24-hour" : `${d}-day`;
  }
  return `${h}-hour`;
};

/* ===========================================================================
   THE NINE STATES.

   The parser decides all of this; the dashboard only names and colours it.
   Every row carries `subVerdict` (one of the nine) and `label` (the parser's
   own wording). These maps exist so the dashboard can order, group and tint
   them — never to re-derive them.

   The shape of the rule, in the parser's words:

     ON TIME   the advisor acted inside the window, whichever action it was.
               Completed, postponed by the client, or not received — he did
               his job either way.
     DELAY     the window passed. Only "Completed" closes it; anything else
               is still pending, and the reason says which.
     Neither   in_window is not judged yet; paused has the clock stopped;
               no_start_date cannot be judged at all.

   ORDER matters: this is the order the breakdown reads in, best to worst,
   with the unjudged trailing. */
const SUB_STATES = [
  { id: "on_time_complete",           family: "on_time", tone: "green" },
  { id: "on_time_postponed",          family: "on_time", tone: "green" },
  { id: "on_time_not_received",       family: "on_time", tone: "green" },

  { id: "delay_complete",             family: "delay",   tone: "amber" },
  { id: "delay_pending",              family: "delay",   tone: "red" },
  { id: "delay_pending_postponed",    family: "delay",   tone: "red" },
  { id: "delay_pending_not_received", family: "delay",   tone: "red" },

  { id: "in_window",                  family: "",        tone: "blue" },
  { id: "paused",                     family: "",        tone: "violet" },
  { id: "no_start_date",              family: "",        tone: "hint" },
];

const SUB_TONE = Object.fromEntries(SUB_STATES.map((s) => [s.id, s.tone]));
const SUB_FAMILY = Object.fromEntries(SUB_STATES.map((s) => [s.id, s.family]));

/* A fallback only. `label` comes from the parser on every row and is what the
   screen actually shows; this is for the rare row whose subVerdict is unknown
   to this build — a new state added upstream should read as itself, not as a
   blank. */
const SUB_LABEL = {
  on_time_complete:           "On time — completed",
  on_time_postponed:          "On time — postponed by client",
  on_time_not_received:       "On time — call not received",
  delay_complete:             "Delay complete",
  delay_pending:              "Delay pending — no status change",
  delay_pending_postponed:    "Delay pending — postponed by client",
  delay_pending_not_received: "Delay pending — call not received",
  in_window:                  "Call pending — in window",
  paused:                     "Paused — response pending",
  no_start_date:              "No start date",
};

/* The coarse bucket every row still falls into, for the charts and client
   cards that stack five series rather than ten. `paused` is its own state
   here: it is not on time. The clock is stopped, so the call has neither met
   the window nor breached it, and counting it either way misstates that side. */
const STATE_LABEL = {
  on_time: "On time",
  delay_complete: "Delay complete",
  delay_pending: "Delay pending",
  in_window: "Call pending — in window",
  paused: "Paused — response pending",
  invalid: "No start date",
  future: "Future dated",
};
/* The order the coarse outcomes read in, best to worst, unjudged last — the
   order the Outcome filter offers them in. */
const STATE_ORDER = [
  "on_time", "delay_complete", "delay_pending", "in_window", "paused", "invalid", "future",
];

const STATE_TONE = {
  on_time: "green", delay_complete: "amber", delay_pending: "red",
  in_window: "blue", paused: "violet", invalid: "hint", future: "hint",
};

/* THE CHART SERIES. One list, so the code that builds a stacked chart's data
   and the code that draws its bars key on the same strings. They used to be
   written out separately in two files; a label change in one left the other
   incrementing keys that no longer existed, and a whole chart read zero without
   an error. `color` names a CHART palette entry in theme.js. */
const CHART_SERIES = [
  { state: "on_time",        label: STATE_LABEL.on_time,        color: "green" },
  { state: "delay_complete", label: STATE_LABEL.delay_complete, color: "amber" },
  { state: "delay_pending",  label: STATE_LABEL.delay_pending,  color: "red" },
  { state: "in_window",      label: STATE_LABEL.in_window,      color: "blue" },
  { state: "paused",         label: STATE_LABEL.paused,         color: "violet" },
  { state: "invalid",        label: STATE_LABEL.invalid,        color: "pink" },
];
/* future-dated rows are a data problem of the same kind as no-start-date. */
const SERIES_OF_STATE = (st) => (st === "future" ? "invalid" : st);

/* The canonical status values, as the tracker sheet and _CallLog spell them.
   Status casing is normalized so "Call Pending" and "Call pending" are treated
   the same, and a blank status reads as "No status". Used for display only —
   see lib/status.js. */
const STATUSES = [
  "No status",
  "Call pending",
  "Response pending",
  "Call postponed by client",
  "Call not received",
  "Completed",
];

export {
  URLS, SLA_DAYS, slaLabel, slaWindow, slaPhrase,
  STATE_LABEL, STATE_TONE, STATE_ORDER, STATUSES,
  SUB_STATES, SUB_TONE, SUB_FAMILY, SUB_LABEL,
  CHART_SERIES, SERIES_OF_STATE,
};
