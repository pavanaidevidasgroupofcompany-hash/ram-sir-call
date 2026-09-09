import { STATUSES } from "../config.js";

/* ================================================================ status */
/* THIS DASHBOARD IS READ-ONLY.

   It reports the status of every call; it does not set it. Statuses are
   changed in the tracker sheet, and the n8n workflow writes the resulting
   events to _CallLog. This file exists only so the dashboard can DISPLAY
   those values consistently.

   There used to be a status dropdown in the calls table, and with it a
   diffStatuses()/logStatusChange() pair that POSTed to
   /framework-tracker/log. Both are gone: editing a shared operational record
   from a reporting dashboard was the wrong place for it. The log endpoint
   still exists in n8n and is still what fills the history timeline — this
   dashboard just no longer writes to it. */

/** Normalize a raw status string to the canonical form.
    Blank / null / undefined becomes "No status".
    Casing is normalized so "Call Pending" === "Call pending", which matters
    because the sheet is typed by hand and the same status arrives spelled
    several ways. */
function normalizeStatus(raw) {
  const s = String(raw == null ? "" : raw).replace(/\s+/g, " ").trim();
  if (!s) return "No status";
  const hit = STATUSES.find((v) => v.toLowerCase() === s.toLowerCase());
  return hit || s;
}

/* The tone each status is drawn in, following the handoff's suggested mapping.
   One map, used by the status breakdown on the Overview and by the history
   timeline, so a status is never one colour in one place and another
   elsewhere. */
const STATUS_TONE = {
  "No status": "violet",
  /* Red, not the blue the handoff suggested. A call still pending is the
     backlog — it is the number the dashboard exists to shrink, and on live
     data it is the largest one on the page. Blue read as "informational". */
  "Call pending": "red",
  "Response pending": "violet",
  "Call postponed by client": "amber",
  "Call not received": "red",
  "Completed": "green",
};

/* The five statuses a call moves through, in the order the tracker sheet's
   dropdown lists them. "No status" is deliberately not here: it is the absence
   of an answer rather than one of them, and the breakdown only shows it when
   rows actually carry it. */
const STATUS_ORDER = [
  "Call pending",
  "Response pending",
  "Call postponed by client",
  "Call not received",
  "Completed",
];

/* The icon each status carries on its card. Chosen for what the status means,
   not for variety: a clock for something waiting on us, people for something
   waiting on the client, a left arrow for a call pushed back, a warning for a
   call nobody answered, a tick for done. */
const STATUS_ICON = {
  "No status": "list",
  "Call pending": "clock",
  "Response pending": "users",
  "Call postponed by client": "back",
  "Call not received": "alert",
  "Completed": "check",
};

export { normalizeStatus, STATUS_TONE, STATUS_ORDER, STATUS_ICON };
