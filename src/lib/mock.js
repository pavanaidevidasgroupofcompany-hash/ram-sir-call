/* ===========================================================================
   MOCK DATA — every state the parser can produce, in one dataset.

   Served in place of /framework-tracker/data when the page URL carries
   `?mock`. It goes through the same load path, the same toRows(), the same
   summarise(), the same views: nothing is stubbed downstream, so what you see
   under ?mock is the real dashboard drawing a dataset built to light up every
   branch at once.

   WHY THIS EXISTS. The live sheet only ever shows a few of the nine states at
   a time — as of writing, three of them have never occurred — so there is no
   way to see "On time — postponed by client" with its follow-up running late,
   or "Delay pending — call not received", short of waiting for one to happen.
   This file is where you look at those.

   THE RULE, reproduced here ONLY to generate consistent fixtures. The
   dashboard itself never computes a verdict; that stays the parser's job.
   Deadline is the end of the next working day, Mon–Sat, Sunday skipped.
   Acting inside the window (any of the three actions) is on time. Past it,
   only "Completed" closes the call. Postponed / not-received open a second
   window from that action date.

   The clock is pinned to TODAY below so the numbers never rot.
   =========================================================================== */

const TODAY = "2026-09-04";                    // a Friday
const NOW_ISO = TODAY + "T09:00:00.000Z";
const SEEDED = "1970-01-01T00:00:00.000Z";     // what a backfilled log row carries

/* ---- calendar helpers (fixture generation only) ---- */
const d = (iso) => { const [y, m, dd] = iso.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd)); };
const iso = (dt) => dt.toISOString().slice(0, 10);
const isWorking = (dt) => dt.getUTCDay() !== 0;                 // Sunday off
const roll = (dt) => { const x = new Date(dt); while (!isWorking(x)) x.setUTCDate(x.getUTCDate() + 1); return x; };
const nextWorking = (dt) => { const x = new Date(dt); do { x.setUTCDate(x.getUTCDate() + 1); } while (!isWorking(x)); return x; };
/* Working days strictly after `from`, up to and including `to`. */
const workingBetween = (from, to) => {
  if (to <= from) return 0;
  let n = 0; const x = new Date(from);
  while (x < to) { x.setUTCDate(x.getUTCDate() + 1); if (isWorking(x)) n++; }
  return n;
};
const at = (isoDate, hh = "10:30") => `${isoDate}T${hh}:00.000Z`;

const ACTIONS = ["Completed", "Call postponed by client", "Call not received"];
const REASON = { "Completed": "complete", "Call postponed by client": "postponed", "Call not received": "not_received" };
const LABEL = {
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

/* Framework → tab, mirroring FRAMEWORK_SETS in the parser: F1–F4 function 1,
   F5–F9 function 2, F10–F13 function 3. */
const TAB = (fw) => {
  const n = Number(fw.slice(1));
  if (n <= 4) return "TEAM AND PEOPLE LEADERSHIP ";
  if (n <= 9) return "OPERATION & PRODUCTIVITY MANAGEMENT";
  return "MARKET RESEARCH & PRODUCT STRATEGY";
};

let logId = 1787000000000000;
const ev = (date, status, seeded = false) => ({ logId: logId++, date, status, seeded });

/**
 * Build one row the way the parser would, from a start date and a list of
 * log events. Everything the row carries is derived here, so a fixture can
 * never claim a verdict its own dates would not produce.
 */
function row({ business, advisor, framework, attempt = "A1", sheetRow, start, events = [], current }) {
  const log = events.map((e) => ({ ...e, at: d(e.date.slice(0, 10)) }));
  const real = log.filter((e) => !e.seeded);
  const firstAction = real.find((e) => ACTIONS.includes(e.status)) || null;
  const completion = real.find((e) => e.status === "Completed") || null;
  const currentStatus = current !== undefined ? current : (log.length ? log[log.length - 1].status : (start ? "Call pending" : ""));

  const startD = start ? d(start) : null;
  const clockStart = startD ? roll(startD) : null;
  const due = clockStart ? nextWorking(clockStart) : null;
  const today = d(TODAY);

  let family = "", resolution = "none", reason = "";
  let subVerdict, verdict, lateDays = 0, calledAt = null;

  if (!clockStart) {
    subVerdict = verdict = (currentStatus === "Response pending" || !currentStatus) ? "paused" : "no_start_date";
  } else if (!firstAction) {
    /* Defensive, and it mirrors the parser: a row with a start date already
       stamped should never read Response pending, because the date is only
       stamped once the client has answered and the status has moved on. If one
       ever does, the clock is stopped rather than run against it. */
    if (currentStatus === "Response pending") {
      subVerdict = verdict = "paused";
    } else {
      lateDays = workingBetween(due, today);
      if (lateDays > 0) { family = "delay"; resolution = "pending"; reason = "no_status_change"; subVerdict = "delay_pending"; verdict = "late_pending"; }
      else { subVerdict = verdict = "in_window"; }
    }
  } else {
    calledAt = firstAction.at;
    lateDays = workingBetween(due, calledAt);
    reason = REASON[firstAction.status];
    if (lateDays === 0) {
      family = "on_time"; resolution = completion ? "complete" : "pending";
      subVerdict = "on_time_" + (reason === "complete" ? "complete" : reason); verdict = "on_time";
    } else if (completion) {
      family = "delay"; resolution = "complete"; subVerdict = "delay_complete"; verdict = "late";
    } else {
      family = "delay"; resolution = "pending"; subVerdict = "delay_pending_" + reason; verdict = "late_pending";
    }
  }

  /* follow-up: answered but not finished */
  let followUp = null;
  if (firstAction && firstAction.status !== "Completed") {
    const openers = real.filter((e) => e.status !== "Completed" && ACTIONS.includes(e.status)
      && (!completion || e.at < completion.at));
    const opener = openers.length ? openers[openers.length - 1] : firstAction;
    const fFrom = roll(opener.at);
    const fDue = nextWorking(fFrom);
    const fDone = completion ? completion.at : null;
    const fLate = fDone ? workingBetween(fDue, fDone) : workingBetween(fDue, today);
    followUp = {
      reason: opener.status, from: iso(fFrom), dueDate: iso(fDue), closedOn: fDone ? iso(fDone) : "",
      verdict: fDone ? (fLate > 0 ? "late" : "on_time") : (fLate > 0 ? "late_pending" : "in_window"),
      lateDays: fLate,
    };
  }

  return {
    business, framework, attempt, advisor, tab: start || log.length ? TAB(framework) : "", row: sheetRow,
    startDate: start || "", clockStart: clockStart ? iso(clockStart) : "", dueDate: due ? iso(due) : "",
    calledDate: calledAt ? iso(calledAt) : "",
    currentStatus, outcome: firstAction ? firstAction.status : "",
    verdict, subVerdict, label: LABEL[subVerdict], family, resolution, reason,
    /* the parser's own rule — the dashboard takes max() of this and lateDays */
    daysOverdue: (resolution === "pending" && due)
      ? (followUp && !followUp.closedOn ? followUp.lateDays : workingBetween(due, today)) : 0,
    lateDays, lateHours: lateDays * 24,
    daysRemaining: (!firstAction && due) ? workingBetween(today, due) : 0,
    resolved: !!completion, followUp,
    postponed: real.some((e) => e.status === "Call postponed by client"),
    postponeCount: real.filter((e) => e.status === "Call postponed by client").length,
    notReceived: real.some((e) => e.status === "Call not received"),
    reopened: log.some((e) => e.status === "Completed") && currentStatus !== "Completed",
    seededOnly: log.length > 0 && log.every((e) => e.seeded),
    history: log.map((e) => ({ logId: e.logId, date: e.date, status: e.status, seeded: e.seeded })),
  };
}

/* ======================================================= THE FIXTURES ====
   Two layers. First eleven hand-written rows, each here to prove one thing,
   named in its comment. Then the volume fixtures below them, which repeat the
   same branches at realistic scale so every card on the Overview carries a
   number. Dates: Aug 24 2026 is a Monday; Aug 30 a Sunday; TODAY (Sep 4) a
   Friday. */
const RAM = "Ram Sir", MAHESH = "Mahesh Sir";

const PROOF = [
  /* ── ON TIME ─────────────────────────────────────────────────────────── */
  // completed inside the window — with a seeded backfill row in its history
  row({ business: "Alpha Traders", advisor: RAM, framework: "F1", sheetRow: 2, start: "2026-08-24",
    events: [ev(SEEDED, "Call pending", true), ev(at("2026-08-25"), "Completed")] }),
  // THE RAM CASE: postponed on time, then forgotten — follow-up 7 working days late
  row({ business: "Alpha Traders", advisor: RAM, framework: "F2", sheetRow: 2, start: "2026-08-25",
    events: [ev(at("2026-08-26"), "Call postponed by client")] }),
  // not received on time; follow-up open and late
  row({ business: "Beta Foods", advisor: RAM, framework: "F1", sheetRow: 3, start: "2026-08-26",
    events: [ev(at("2026-08-27", "16:00"), "Call not received")] }),
  // postponed on time, then completed the next day — follow-up closed ON TIME
  row({ business: "Beta Foods", advisor: RAM, framework: "F2", sheetRow: 3, start: "2026-08-24",
    events: [ev(at("2026-08-25"), "Call postponed by client"), ev(at("2026-08-26"), "Completed")] }),
  // completed on time, then REOPENED (status moved back to Call pending)
  row({ business: "Beta Foods", advisor: MAHESH, framework: "F5", sheetRow: 3, start: "2026-08-24",
    events: [ev(at("2026-08-25"), "Completed"), ev(at("2026-09-01"), "Call pending")] }),

  /* ── DELAY ───────────────────────────────────────────────────────────── */
  // called late, done — 3 working days over
  row({ business: "Gamma Motors", advisor: MAHESH, framework: "F5", sheetRow: 4, start: "2026-08-24",
    events: [ev(at("2026-08-28"), "Completed")] }),
  // JUDGEMENT CALL 1: postponed LATE, then completed — delay_complete, reason=postponed
  row({ business: "Gamma Motors", advisor: MAHESH, framework: "F6", sheetRow: 4, start: "2026-08-24",
    events: [ev(at("2026-08-27"), "Call postponed by client"), ev(at("2026-08-31"), "Completed")] }),
  // never touched — 9 working days over
  row({ business: "Delta Clinic", advisor: RAM, framework: "F1", sheetRow: 5, start: "2026-08-24", events: [] }),
  // postponed late, still open. 18 working days past its FIRST deadline, 2 past
  // the follow-up — the parser's daysOverdue says 2; the dashboard shows 18.
  row({ business: "Delta Clinic", advisor: RAM, framework: "F2", sheetRow: 5, start: "2026-08-10",
    events: [ev(at("2026-09-01"), "Call postponed by client")] }),
  // not received late, still open
  row({ business: "Epsilon Realty", advisor: MAHESH, framework: "F10", sheetRow: 6, start: "2026-08-24",
    events: [ev(at("2026-08-27"), "Call not received")] }),
  // A2 never touched — proves attempts are separate records
  row({ business: "Alpha Traders", advisor: RAM, framework: "F1", attempt: "A2", sheetRow: 2, start: "2026-08-27", events: [] }),

  /* ── NOT JUDGED YET ──────────────────────────────────────────────────── */
  // started today; due tomorrow (Saturday) — in window, 1 day remaining
  row({ business: "Epsilon Realty", advisor: MAHESH, framework: "F11", sheetRow: 6, start: "2026-09-04", events: [] }),
  // started Thursday, A2 — due today, still in window
  row({ business: "Delta Clinic", advisor: RAM, framework: "F1", attempt: "A2", sheetRow: 5, start: "2026-09-03", events: [] }),
  // paused — waiting on the client, so there is no start date and no clock.
  // This is the whole shape of a Response pending row: the call has not been
  // made, and will not be until the client comes back and the status moves on
  // to Call pending. It is never a row with a start date already stamped.
  row({ business: "Zeta Studio", advisor: MAHESH, framework: "F10", sheetRow: 7, start: "",
    events: [ev(at("2026-08-20"), "Response pending")] }),
  // logged as completed but the grid has no start date — unmatched
  row({ business: "Zeta Studio", advisor: MAHESH, framework: "F11", sheetRow: 7, start: "",
    events: [ev(at("2026-08-28"), "Completed")] }),
];

/* ═════════════════════════════════════════════════ ROADMAP FIXTURES ════
   Rows that exist to exercise the horizontal roadmap that opens under a call.
   The eleven proof rows above already cover four of its shapes — a seeded
   backfill, a call with no log at all, one with no start date, and a reopened
   call — so these are the ones left: long chains that have to scroll, repeated
   statuses, a gap of zero, a gap over a Sunday, and a sheet that has run ahead
   of its log.

   They are built by row() like everything else, so each one's verdict is still
   derived from its own dates. The VOLUME counts below are reduced by exactly
   these, state for state, so adding them does not move the headline figures. */
const ROADMAP = [
  /* EIGHT STOPS, AND THE ONLY ONE THAT BEGINS BEFORE IT STARTED. The widest
     case the roadmap has to draw: it scrolls sideways rather than wrapping,
     because a wrapped roadmap reads as two roadmaps.

     It opens on "Response pending" — the wait for the client — five days
     before the start date. That is the one status that can sit to the LEFT of
     Started, and the only place it can ever sit: once the client answers, the
     status becomes "Call pending", the start date is stamped and the clock
     runs. It never comes back mid-chain.

     Postponed first, finished in the end, long after the deadline →
     delay_complete. */
  row({ business: "Nova Instruments", advisor: RAM, framework: "F4", sheetRow: 12, start: "2026-07-06",
    events: [
      ev(at("2026-07-01"), "Response pending"),
      ev(at("2026-07-06"), "Call pending"),
      ev(at("2026-07-09"), "No status"),
      ev(at("2026-07-20"), "Call postponed by client"),
      ev(at("2026-07-27"), "Call not received"),
      ev(at("2026-08-04"), "Call postponed by client"),
      ev(at("2026-08-18"), "Completed"),
    ] }),

  /* A START DATE ON A SUNDAY — the clock rolls forward to Monday before the
     window opens, so `clockStart` and `startDate` differ by a day and the
     roadmap's first gap is measured from the date, not the clock. */
  row({ business: "Ridge Textiles", advisor: MAHESH, framework: "F5", sheetRow: 19, start: "2026-08-30",
    events: [ev(at("2026-09-01"), "Completed")] }),

  /* FIVE STOPS, STILL OPEN — ends on Call pending, so the lit node is red
     rather than green. Postponed after the deadline and never closed. */
  row({ business: "Orion Logistics", advisor: MAHESH, framework: "F7", sheetRow: 13, start: "2026-07-13",
    events: [
      ev(at("2026-07-14"), "No status"),
      ev(at("2026-07-20"), "Call postponed by client"),
      ev(at("2026-07-28"), "Call not received"),
      ev(at("2026-08-10"), "Call pending"),
    ] }),

  /* ZERO-DAY GAPS — everything happened on the start date. Both segments read
     "same day", which is the case a naive date subtraction renders as "0 days"
     and a naive guard renders as blank. */
  row({ business: "Vertex Foods", advisor: RAM, framework: "F3", sheetRow: 14, start: "2026-08-24",
    events: [
      ev(at("2026-08-24", "09:40"), "Call pending"),
      ev(at("2026-08-24", "17:20"), "Completed"),
    ] }),

  /* A GAP OVER A SUNDAY — Sat 29 Aug to Mon 31 Aug. Two calendar days, one
     working day, and the roadmap must say 1: it counts the same way Days and
     Late do, or the three disagree about the same pair of dates. */
  row({ business: "Cedar Clinic", advisor: RAM, framework: "F9", sheetRow: 15, start: "2026-08-29",
    events: [
      ev(at("2026-08-31"), "Call postponed by client"),
      ev(at("2026-09-01"), "Completed"),
    ] }),

  /* THE SHEET IS AHEAD OF THE LOG — someone typed Completed and the log row
     for it has not been written yet. The roadmap ends on a stop dated "now"
     rather than pretending the last logged event is where the call is. Status
     and Outcome disagree here on purpose: that is what this looks like. */
  row({ business: "Harbour Motors", advisor: MAHESH, framework: "F12", sheetRow: 16, start: "2026-08-10",
    events: [ev(at("2026-08-20"), "Call not received")], current: "Completed" }),

  /* THE SAME STATUS TWICE — a client who pushed the call back, then pushed it
     back again, before it was finished. Two identical pills in a row is
     correct, and the dates are what tell them apart. */
  row({ business: "Lumen Interiors", advisor: RAM, framework: "F13", sheetRow: 17, start: "2026-08-10",
    events: [
      ev(at("2026-08-11"), "Call postponed by client"),
      ev(at("2026-08-18"), "Call postponed by client"),
      ev(at("2026-08-25"), "Completed"),
    ] }),

  /* A SEEDED BACKFILL — the log row recording what the status already was when
     logging began. It carries the epoch as its date, so the roadmap draws it
     as a real stop labelled "seeded" and leaves the segments either side of it
     unmeasured: it says what, never when.

     Deliberately NOT a seeded "Call pending": that one is the same fact as the
     start date and the roadmap folds the two together, so it would prove
     nothing about how a seeded row is drawn. */
  row({ business: "Pioneer Traders", advisor: MAHESH, framework: "F2", sheetRow: 18, start: "2026-08-24",
    events: [
      ev(SEEDED, "Call postponed by client", true),
      ev(at("2026-08-26"), "Completed"),
    ] }),
];

/* ═══════════════════════════════════════════════════ VOLUME FIXTURES ════
   The rows above each prove one branch of the rule, and there is exactly one
   of each — right for a test, wrong for a screenshot. At that size half the
   Overview's cards read 0 and the charts have almost nothing to stack, so the
   layout cannot be judged and neither can the numbers.

   These fill the same branches out to a plausible month: ten businesses across
   the three functions, weighted the way a healthy book of work looks — most
   calls answered inside the window, a real but smaller tail of delay.

   Nothing below asserts a verdict. Every row is still built by row() from a
   start date and a list of log events, so its state is derived by the same
   arithmetic the parser uses. Move a date and the verdict moves with it, which
   is the only way a fixture can stay honest. */

const BUSINESSES = [
  ["Alpha Traders", 2], ["Beta Foods", 3], ["Gamma Motors", 4], ["Delta Clinic", 5],
  ["Epsilon Realty", 6], ["Zeta Studio", 7], ["Omega Textiles", 8], ["Sigma Logistics", 9],
  ["Kappa Pharma", 10], ["Theta Interiors", 11],
];
const FRAMEWORKS = ["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F13"];

/* Working days back from TODAY, newest first — STARTS[0] is TODAY itself.
   Indexing by working day rather than by calendar day means a fixture can ask
   for "five days before the deadline" without landing on a Sunday. */
const STARTS = (() => {
  const out = [], x = d(TODAY);
  while (out.length < 60) { if (isWorking(x)) out.push(iso(x)); x.setUTCDate(x.getUTCDate() - 1); }
  return out;
})();
const addWorking = (dt, k) => { let x = dt; for (let i = 0; i < k; i++) x = nextWorking(x); return x; };
const dueOf = (start) => nextWorking(roll(d(start)));

/* Deterministic spread — no Math.random, so two loads of the dashboard show
   the same figures and a screenshot stays reproducible. The strides are
   coprime with the list lengths, which is all "shuffled" has to mean here. */
let seq = 0;
function spread(back) {
  const i = seq++;
  const [business, sheetRow] = BUSINESSES[(i * 3) % BUSINESSES.length];
  return {
    business, sheetRow,
    advisor: i % 3 === 2 ? MAHESH : RAM,
    framework: FRAMEWORKS[(i * 5) % FRAMEWORKS.length],
    attempt: i % 9 === 4 ? "A2" : "A1",
    start: STARTS[back + ((i * 7) % 34)],
  };
}

/* One recipe per state, written as "what happened, relative to the deadline".
   On time means acting on the due date itself; delay means acting one to three
   working days past it. `back` keeps the whole story in the past: on-time rows
   start at least two working days ago so their deadline has arrived, delay rows
   at least five so it has been missed. */
const RECIPES = {
  on_time_complete:           [2, (due) => [ev(at(iso(due)), "Completed")]],
  on_time_postponed:          [2, (due) => [ev(at(iso(due)), "Call postponed by client")]],
  on_time_not_received:       [2, (due) => [ev(at(iso(due)), "Call not received")]],
  delay_complete:             [5, (due, k) => [ev(at(iso(addWorking(due, 1 + (k % 3)))), "Completed")]],
  delay_pending:              [5, () => []],
  delay_pending_postponed:    [5, (due, k) => [ev(at(iso(addWorking(due, 1 + (k % 3)))), "Call postponed by client")]],
  delay_pending_not_received: [5, (due, k) => [ev(at(iso(addWorking(due, 1 + (k % 2)))), "Call not received")]],
};

function make(state, count) {
  const [back, events] = RECIPES[state];
  return Array.from({ length: count }, (_, k) => {
    const base = spread(back);
    return row({ ...base, events: events(dueOf(base.start), k) });
  });
}

/* The mix. Read as a column it is the story the dashboard tells: roughly three
   calls in four answered inside the window, most of those finished on the
   spot; of the rest, more still open than closed late. Counts are chosen with
   the eleven proof rows above included, so the totals land where intended. */
const VOLUME = [
  ...make("on_time_complete", 74),
  ...make("on_time_postponed", 17),
  ...make("on_time_not_received", 10),
  ...make("delay_complete", 10),
  ...make("delay_pending", 13),
  ...make("delay_pending_postponed", 4),
  ...make("delay_pending_not_received", 2),

  /* Not judged, and deliberately a small minority — they leave the on-time /
     delay percentage entirely, so a large pile of them would make the two
     headline numbers describe a shrinking fraction of the book. */
  ...[0, 0, 1, 1].map((b) => row({ ...spread(0), start: STARTS[b], events: [] })),
  /* Paused rows carry no start date, because the call has not been made: the
     client has not come back yet. The date is stamped when they do and the
     status moves to Call pending. */
  ...[1, 2, 3].map((b) => row({ ...spread(0), start: "",
    events: [ev(at(STARTS[b]), "Response pending")] })),
  row({ ...spread(0), start: "", events: [ev(at(STARTS[4]), "Completed")] }),
];

const ROWS = [...PROOF, ...ROADMAP, ...VOLUME];

export function mockResponse() {
  const rows = ROWS.slice().sort((a, b) =>
    a.business.localeCompare(b.business)
    || a.framework.localeCompare(b.framework, undefined, { numeric: true })
    || a.attempt.localeCompare(b.attempt, undefined, { numeric: true }));
  const n = (f) => rows.filter(f).length;
  const sub = (id) => n((r) => r.subVerdict === id);
  return {
    generatedAt: NOW_ISO,
    slaRule: "end-of-next-working-day",
    workingWeek: "Mon-Sat",
    slaHours: 48,
    mock: true,
    counts: {
      attempts: rows.length,
      onTime: n((r) => r.family === "on_time"),
      onTimeComplete: sub("on_time_complete"), onTimePostponed: sub("on_time_postponed"), onTimeNotReceived: sub("on_time_not_received"),
      delay: n((r) => r.family === "delay"),
      delayComplete: sub("delay_complete"), delayPending: sub("delay_pending"),
      delayPendingPostponed: sub("delay_pending_postponed"), delayPendingNotReceived: sub("delay_pending_not_received"),
      inWindow: sub("in_window"), paused: sub("paused"),
      late: n((r) => r.verdict === "late"), latePending: n((r) => r.verdict === "late_pending"),
      followUpOpen: n((r) => r.followUp && !r.followUp.closedOn),
      followUpLate: n((r) => r.followUp && (r.followUp.verdict === "late" || r.followUp.verdict === "late_pending")),
      postponed: n((r) => r.postponed), reopened: n((r) => r.reopened),
      unmatched: n((r) => !r.startDate && r.history.length),
    },
    warnings: [],
    rows,
  };
}

/** True when the page was opened with ?mock in the URL. */
export const MOCK_MODE = typeof window !== "undefined"
  && new URLSearchParams(window.location.search).has("mock");
