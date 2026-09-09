import { pct, dmy, ymOf, workingDaysBetween } from "./format.js";
import { normalizeStatus, STATUS_ORDER } from "./status.js";
import { STATE_LABEL, SUB_STATES, SUB_FAMILY, SUB_LABEL } from "../config.js";

/* ============================================================== row model */
/* The n8n "Parse Framework Calls" node returns objects with these fields:
   business, framework, attempt, advisor, tab, row, startDate, dueDate,
   calledDate, closedFrom, currentStatus, outcome, verdict, lateHours,
   lateDays, reopened, seededOnly, history[]

   history[] is built from _CallLog: each entry has logId, date, status,
   seeded. This replaces the old separate "frameworks" array.

   NOTE `calledDate` is the FIRST action, not the completion, and there is no
   completion date in the payload. `endOf` below derives one from history[];
   read its note before trusting either date. */

/* The coarse bucket a row falls into, derived from `subVerdict` rather than
   from the legacy `verdict`.

   Why not `verdict`: it collapses the four delay states into two, so
   "postponed and still open" and "nobody has touched it" both arrive as
   `late_pending` and the reason is lost. `subVerdict` is the parser's real
   answer and keeps them apart.

   `paused` maps to itself. It used to fold into `in_window`, which put a
   stopped clock on the on-time side of the split and inflated the on-time
   figure with calls that had not been judged at all. */
const STATE_OF_SUB = {
  on_time_complete: "on_time",
  on_time_postponed: "on_time",
  on_time_not_received: "on_time",
  delay_complete: "delay_complete",
  delay_pending: "delay_pending",
  delay_pending_postponed: "delay_pending",
  delay_pending_not_received: "delay_pending",
  in_window: "in_window",
  paused: "paused",
  no_start_date: "invalid",
};

/* Older payloads carry only `verdict`. Keep reading them so a stale workflow
   degrades to the coarse view instead of rendering an empty dashboard. */
const STATE_OF_VERDICT = {
  on_time: "on_time",
  late: "delay_complete",
  late_pending: "delay_pending",
  in_window: "in_window",
  paused: "paused",
  no_start_date: "invalid",
};

function stateOf(row) {
  if (row.subVerdict && STATE_OF_SUB[row.subVerdict]) return STATE_OF_SUB[row.subVerdict];
  return STATE_OF_VERDICT[row.verdict] || "invalid";
}

/* ========================================================= WHEN IT ENDED */
/* The date the call ENDED — which is not a date the parser sends.

   The parser sends exactly one date for the work itself, `calledDate`, and it
   is the FIRST ACTION: the first of Completed, "Call postponed by client" and
   "Call not received". There is no completion date in the payload at all.

   For a call finished at the first attempt those are the same day, which is
   why this went unnoticed: End read correctly on every one-attempt call and
   quietly showed the wrong day on the rest. Nova Instruments F4 was postponed
   on 20-07 and finished on 18-08, and End showed 20-07 — the postponement,
   labelled as the end of the call.

   The completion IS in the payload, in `history`, so it is derived from there:

     THE LAST non-seeded "Completed" entry. Last rather than first, because a
     call completed, reopened and completed again ended on the second one.

     SEEDED ENTRIES ARE SKIPPED. A backfilled log row records that the status
     *was* Completed; it carries the epoch, not the day the call closed, so
     reading its date would date every backfilled call to 1970.

     `closedFrom: "grid"` IS THE EXCEPTION. There the sheet closed the attempt
     and nobody logged it, so there is no history to read — and `calledDate`
     genuinely is the completion, because the grid's own end date is the only
     reason the parser found one.

   A call answered but never finished returns "", and the table reads "not
   completed" rather than showing the day it was postponed as if it had ended.
   That is the second bug this fixes.

   Status is normalised on the way past, as everywhere else in the dashboard:
   the log is typed by hand and "completed" is the same event as "Completed". */
function endOf(r) {
  const log = r.history || [];
  for (let i = log.length - 1; i >= 0; i--) {
    const ev = log[i];
    if (!ev.seeded && normalizeStatus(ev.status) === "Completed") {
      return String(ev.date || "").slice(0, 10);
    }
  }
  return r.closedFrom === "grid" ? r.calledDate || "" : "";
}

function toRows(raw) {
  return (raw || []).map((r) => {
    const end = endOf(r);
    return {
      tab: r.tab || "",
      sheetRow: r.row || 0,
      advisor: r.advisor || "",
      business: r.business || "",
      framework: r.framework || "",
      attempt: r.attempt || "A1",
      status: r.currentStatus || "",
      start: r.startDate || "",
      end,
      /* The parser's own `calledDate` — the FIRST action, kept under a name that
         says which date it is. It is what the SLA is judged against, so `Late`
         below still measures to it while `end` and `duration` no longer do; the
         Late column names it in a tooltip, because on a postponed-then-finished
         call the two dates can be a month apart and a Days that disagrees with a
         Late looks like an error in whichever you trust less. */
      firstAction: r.calledDate || "",
      /* "log" | "grid" | "" — where the parser found its date. `endOf` needs it:
         on a grid close there is no history, and `calledDate` IS the end. */
      closedFrom: r.closedFrom || "",
      state: stateOf(r),
      /* How long the call actually took, start to END, in WORKING days — Sundays
         excluded, exactly as the parser counts `lateDays`. It is not lateness:
         `lateDays` below is that, and this is no longer that plus the window —
         see the note on `firstAction`.

         The backend sends no duration of its own, only lateHours/lateDays, and
         this used to read `+r.lateHours`. That put hours-late under a heading
         reading "Days", so a 65-day call showed 1519.3 beside a Late of 63.3 —
         the same figure twice, in two units, neither of them the turnaround.
         Subtracting two dates the backend already sends is not recreating its
         SLA logic; the verdict and the lateness still come from it untouched. */
      duration: workingDaysBetween(r.startDate, end),
      lateDays: +r.lateDays || 0,
      ym: ymOf(r.startDate),
      history: r.history || [],
      reopened: r.reopened || false,
      seededOnly: r.seededOnly || false,
      outcome: r.outcome || "",
      dueDate: r.dueDate || "",
      /* The parser names its own verdict now — "On time — postponed by client",
         "Late — call not received" and so on. Prefer that over the coarser
         five-state label, so a call answered on time but postponed is not shown
         as a plain "On time" with the reason thrown away. */
      label: r.label || "",
      subVerdict: r.subVerdict || "",
      followUp: r.followUp || null,
      postponed: !!r.postponed,
      notReceived: !!r.notReceived,
      resolved: !!r.resolved,
      /* on_time | delay | ''  — which side of the deadline, straight from the
         parser. The empty string is in_window / paused / no_start_date, none of
         which sit on either side. */
      family: r.family || SUB_FAMILY[r.subVerdict] || "",
      /* complete | pending | none — is the work actually finished. */
      resolution: r.resolution || "",
      /* complete | postponed | not_received | no_status_change */
      reason: r.reason || "",
      clockStart: r.clockStart || "",
      daysRemaining: +r.daysRemaining || 0,
      /* Days past whichever deadline currently applies. The parser reports the
         follow-up clock whenever one is open, which understates a row that also
         blew its original window — so take the worse of the two. A call 56 days
         past its first deadline and 6 past its follow-up is 56 days overdue, and
         sorting "worst first" has to agree. */
      daysOverdue: Math.max(+r.daysOverdue || 0, +r.lateDays || 0),
    };
  });
}

/** The one place call outcomes are counted, so every view agrees. */
function summarise(rows) {
  const s = {
    total: rows.length, on_time: 0, delay_complete: 0, delay_pending: 0,
    in_window: 0, invalid: 0, future: 0, lateDays: 0, completed: 0, open: 0,
  };

  /* Every status starts at zero so all five always appear, whether or not any
     call is currently in one. A zero is a real answer — "nothing is postponed"
     is worth seeing, and a status that vanished from the breakdown would read
     as a status that no longer exists. */
  const byStatus = {};
  STATUS_ORDER.forEach((k) => { byStatus[k] = 0; });

  rows.forEach((r) => {
    s[r.state] = (s[r.state] || 0) + 1;
    s.lateDays += r.lateDays;
    if (r.end) s.completed++; else s.open++;

    /* Anything outside the five — "No status", or a value the sheet has that
       the vocabulary does not — is counted under its own name rather than
       dropped, so the breakdown always adds up to the total. */
    const status = normalizeStatus(r.status);
    byStatus[status] = (byStatus[status] || 0) + 1;
  });
  s.byStatus = byStatus;

  /* THE NINE-STATE BREAKDOWN.

     Counted by `subVerdict`, using the parser's own ids. These were keyed on
     an older set of names — on_time_completed, late_postponed — which the
     parser no longer emits, so every counter silently read zero. Building the
     keys from SUB_STATES means the two can only drift if this file is edited,
     not if the parser is.

     Every state starts at zero so all nine always appear: "nothing was
     postponed on time" is a real answer, and a state that vanished from the
     breakdown would read as one that cannot happen. */
  const sub = {};
  SUB_STATES.forEach((x) => { sub[x.id] = 0; });

  /* Postponed and not-received mean answered but NOT finished. Each opens a
     second window, and `followUp` is where it stands. followUpLate is the one
     that matters: acted in time, then let it run. */
  let followUpOpen = 0, followUpLate = 0;

  rows.forEach((r) => {
    if (r.subVerdict) sub[r.subVerdict] = (sub[r.subVerdict] || 0) + 1;
    const f = r.followUp;
    if (f) {
      if (!f.closedOn) followUpOpen++;
      if (f.verdict === "late" || f.verdict === "late_pending") followUpLate++;
    }
  });
  s.sub = sub;
  s.followUpOpen = followUpOpen;
  s.followUpLate = followUpLate;

  /* Acted inside the window, whichever action it was. */
  s.answered = sub.on_time_complete + sub.on_time_postponed + sub.on_time_not_received;
  /* THE SPLIT. Every call that CAN be judged is either on time or in delay,
     so the pair always reads 100%.

       on time = the advisor acted inside the window, whatever the action
       delay   = the window passed before he acted, or he still has not

     Three kinds of call are NOT judged and leave the denominator entirely.
     All three are reported on screen, so the numbers reconcile to the total:

       in window     the deadline has not passed yet. No verdict is owed.
       paused        response pending; the clock is stopped.
       no start date nothing to measure from.

     `paused` used to count as on time, which flattered the figure with calls
     nobody had judged. */
  s.notJudged = s.in_window + s.paused + s.invalid + s.future;
  s.badDates = s.invalid + s.future;
  s.onTimeAll = s.on_time;
  s.delay = s.delay_complete + s.delay_pending;
  s.scored = s.onTimeAll + s.delay;          // = total − notJudged
  s.onTimePct = pct(s.onTimeAll, s.scored);
  // Derived, not rounded separately, so the two can never show 99.9 or 100.1.
  s.delayPct = s.scored ? Math.round((100 - s.onTimePct) * 10) / 10 : 0;
  s.avgLate = s.delay ? Math.round((s.lateDays / s.delay) * 10) / 10 : 0;
  return s;
}

function csv(rows) {
  const head = ["Function","Sheet Row","Advisor","Business","Framework","Attempt","Status","Start","First Acted","End","Outcome","Duration (days)","Days Late","Follow-up","Follow-up Due","Follow-up Days Late"];
  const body = rows.map((r) => {
    /* The second clock travels with the export, or a spreadsheet built from
       this file cannot see the calls that were answered on time and then left
       unfinished — the ones whose Days Late column reads blank.

       So does First Acted, for the same reason the Late column carries it in a
       tooltip: Duration runs start → End and Days Late runs start → First
       Acted, so on a postponed-then-finished call the two answer different
       questions. Exporting End alone leaves a spreadsheet that cannot tell
       whether a 37-day call missed its deadline by 37 days or by 11. */
    const f = r.followUp;
    return [
      r.tab, r.sheetRow, r.advisor, r.business, r.framework, r.attempt, r.status,
      dmy(r.start), dmy(r.firstAction), dmy(r.end), STATE_LABEL[r.state] || r.state, r.duration, r.lateDays,
      f ? f.verdict : "", f ? dmy(f.dueDate) : "", f ? (f.lateDays || 0) : "",
    ];
  });
  return [head, ...body]
    .map((line) => line.map((c) => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function download(name, text) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8;" }));
  a.download = name;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}


export { toRows, summarise, csv, download };
