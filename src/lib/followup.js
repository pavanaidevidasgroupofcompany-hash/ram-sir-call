/* ===========================================================================
   THE FOLLOW-UP WINDOW

   Answered is not finished. "Call postponed by client" and "Call not
   received" both mean the advisor acted — so the headline verdict is on time
   if he acted in time — but neither closes the work. Each opens a SECOND
   window, from the day of that action to the end of the next working day, by
   exactly the same rule as the first.

   Without it, someone who postpones on time and then forgets for a fortnight
   reads as perfect forever: the headline verdict was earned on day one and
   never moves again. The follow-up is what goes overdue in the meantime.

   The parser computes all of it and sends `followUp` on every row. This file
   only says how to show it — the four verdicts it can carry, in the same
   words and tones the rest of the app uses for the same meanings.

     in_window     open, deadline not reached      blue
     late_pending  open, deadline gone             red
     on_time       closed inside its window        green
     late          closed, but after its window    amber
   =========================================================================== */

import { dmy, days } from "./format.js";

const VERDICT = {
  in_window:    { tone: "blue",  short: "In window",  icon: "clock" },
  late_pending: { tone: "red",   short: "Overdue",    icon: "alert" },
  on_time:      { tone: "green", short: "Closed",     icon: "check" },
  late:         { tone: "amber", short: "Closed late", icon: "check" },
};

/** Display shape for a row's follow-up, or null when it has none.
    A row has none when it was completed first time or was never acted on —
    there is nothing to follow up. */
function followUpOf(row) {
  const f = row && row.followUp;
  if (!f || !f.verdict) return null;
  const v = VERDICT[f.verdict] || VERDICT.in_window;
  const late = +f.lateDays || 0;
  return {
    ...v,
    verdict: f.verdict,
    open: !f.closedOn,
    overdue: f.verdict === "late" || f.verdict === "late_pending",
    lateDays: late,
    /* The cell text. Overdue says how far, because "overdue" alone does not
       separate one day from eleven and eleven is the one to ring about. */
    label: f.verdict === "late_pending" ? `${days(late)} overdue`
      : f.verdict === "late" ? `Closed ${days(late)} late`
      : v.short,
    /* The whole story, for the title attribute and the roadmap chip. */
    from: f.from || "", dueDate: f.dueDate || "", closedOn: f.closedOn || "",
    reason: f.reason || "",
    detail: [
      f.reason ? `${f.reason} on ${dmy(f.from)}` : "",
      f.dueDate ? `follow-up due ${dmy(f.dueDate)}` : "",
      f.closedOn ? `closed ${dmy(f.closedOn)}` : "still open",
    ].filter(Boolean).join(" · "),
  };
}

/* The filter vocabulary on All Calls. Each option answers a different
   question, and none of them is a loose synonym of another:

     Overdue          still open AND past its deadline — the list to act on
     Missed…          it blew the window, whether or not it later closed;
                      this is the parser's own followUpLate
     Still open       no closing action yet, due or not; followUpOpen

   "Overdue" deliberately excludes a follow-up that ran late and was then
   finished. That one missed its window, but nobody needs to chase it — and a
   filter that mixes the two gives you a worklist with settled rows in it. */
const FOLLOW_UP_FILTERS = [
  ["all", "Any follow-up"],
  ["overdue", "Overdue now"],
  ["missed", "Missed its window"],
  ["open", "Still open"],
  ["none", "No follow-up"],
];

function matchesFollowUp(row, key) {
  if (key === "all") return true;
  const f = followUpOf(row);
  if (key === "none") return !f;
  if (!f) return false;
  if (key === "overdue") return f.verdict === "late_pending";
  if (key === "missed") return f.overdue;
  if (key === "open") return f.open;
  return true;
}

export { followUpOf, FOLLOW_UP_FILTERS, matchesFollowUp };
