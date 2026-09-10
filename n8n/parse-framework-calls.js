/* ─────────────────────────────────────────────────────────────────────────────
   Framework call SLA parser  —  body of the "Parse Framework Calls" code node.

   This file and the node must stay identical. tools/build-fixture.mjs executes
   THIS file against real sheet exports, so if the two drift the fixture stops
   proving anything.

   DEADLINE RULE — "today and tomorrow":
     A call that goes pending on day D must happen by the END of the next
     working day. Working week is Mon–Sat; Sunday is off. Office hours are NOT
     part of the maths — only whole days are compared, so a 9:30 AM pending and
     a 6:00 PM pending on the same day share the same deadline.

   WHAT COUNTS AS MEETING THE DEADLINE:
     ANY action inside the window is on time — the advisor did his job. The
     sub-label records which action it was. Past the window, only "Completed"
     closes the attempt.

   ═══ WHAT CHANGED, AND WHY ══════════════════════════════════════════════════

   THE SHEET'S "End Date - Fn" COLUMN IS THE DAY THE CALL HAPPENED. A _CallLog
   row is written when somebody TYPES a status, and the two are routinely days
   apart: one attempt was completed on the 5th and recorded on the 7th, and
   every figure downstream ran two days long because of it.

   This parser previously read only `row[c - 1]` — the Start Date column — and
   took every closing date from the log timestamp. So `startDate` came from the
   sheet while the completion came from the paperwork, and mixing those two
   sources inside one measurement is what made calls look late. A log timestamp
   can only ever be LATER than the call, so the error was always in the same
   direction: advisors charged for slow data entry rather than slow calling.

   Three things follow from reading the End Date column:

     1. When a Completed event closes an attempt AND the sheet has an end date,
        the sheet's date is used — for the End column and for the lateness.
        Postponed / not-received keep the log, because the grid has no column
        for those and there the log really is the only record.

     2. An attempt the sheet closed that nobody logged is no longer reported as
        never-closed. It used to fall through to "delay pending — no status
        change" purely because the log was silent.

     3. `closedFrom` says which source closed each row — 'grid' | 'log' | '' —
        so a real date and a recorded one can never again be confused.

   The grid's Status column is read for the same reason: an attempt the sheet
   calls Completed should not display as "Call pending" just because nobody
   logged it. The log still wins whenever it has anything to say.

   FOLLOW-UP LAYER:
     An attempt that ended in 'postponed' or 'not received' is answered but not
     finished. A SECOND window opens from that action date and is reported in
     `followUp`. Set TRACK_FOLLOW_UP to false to switch this off.
   ───────────────────────────────────────────────────────────────────────── */

const ADVISOR_COL  = 1;
const BUSINESS_COL = 2;
const FIRST_BLOCK  = 3;
const SEED_YEAR    = 1970;

const GRID_NODE = 'HTTP - Load All Tabs';
const LOG_NODE  = 'HTTP - Load Log';

// Sunday (0) is the weekly off. Add 'YYYY-MM-DD' strings for public holidays.
const WEEKLY_OFF = [0];
const HOLIDAYS = new Set([
  // '2026-01-26',
  // '2026-03-04',
]);

const TRACK_FOLLOW_UP = true;

// Any of these means the advisor acted. All three stop the SLA clock.
const ACTIONS = ['Completed', 'Call postponed by client', 'Call not received'];

// Only this one actually finishes the work; the other two leave a follow-up open.
const RESOLVED = 'Completed';

const POSTPONED = 'Call postponed by client';
const NOT_RECEIVED = 'Call not received';
const AWAITING  = 'Response pending';
const RUNNING   = 'Call pending';

const SUB = {
  'Completed': 'complete',
  'Call postponed by client': 'postponed',
  'Call not received': 'not_received',
};

const LABELS = {
  on_time_complete:            'On time — completed',
  on_time_postponed:           'On time — postponed by client',
  on_time_not_received:        'On time — call not received',

  delay_complete:              'Delay complete',
  delay_pending:               'Delay pending — no status change',
  delay_pending_postponed:     'Delay pending — postponed by client',
  delay_pending_not_received:  'Delay pending — call not received',

  in_window:                   'Call pending — in window',
  paused:                      'Paused — response pending',
  no_start_date:               'No start date',
};

const NOW = new Date();

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

// Order and counts must stay identical to FRAMEWORK_SETS in the Apps Script,
// or logged calls will never join to their start dates.
const FRAMEWORK_SETS = [
  { match: /team|people|leadership/i,                count: 4 },
  { match: /operation|productivity/i,                count: 5 },
  { match: /market\s*research|product\s*strategy/i,  count: 4 },
  { match: /marketing|lead\s*gen/i,                  count: 4 },
  { match: /sales|conversion/i,                      count: 6 },
  { match: /finance|technolog|growth/i,              count: 6 }
];

function setIndexFor(tabName) {
  const name = String(tabName || '').trim();
  const keyed = name.match(/^FUNCTION\s*(\d+)/i);
  if (keyed) {
    const order = Number(keyed[1]) - 1;
    if (order >= 0 && order < FRAMEWORK_SETS.length) return order;
  }
  for (let i = 0; i < FRAMEWORK_SETS.length; i++) {
    if (FRAMEWORK_SETS[i].match.test(name)) return i;
  }
  return -1;
}

function frameworkBase(tabName) {
  const at = setIndexFor(tabName);
  if (at === -1) return 0;
  let n = 1;
  for (let i = 0; i < at; i++) n += FRAMEWORK_SETS[i].count;
  return n;
}

function parseDate(v) {
  if (v === null || v === undefined || v === '') return null;

  if (typeof v === 'number' && isFinite(v)) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    return isNaN(d.getTime()) ? null
      : new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }

  const s = String(v).trim();
  let m;

  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);

  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);

  m = s.match(/^(\d{1,2})-([A-Za-z]{3})[A-Za-z]*-(\d{4})$/);
  if (m && MONTHS[m[2].toLowerCase()]) {
    return new Date(+m[3], MONTHS[m[2].toLowerCase()] - 1, +m[1]);
  }
  return null;
}

const pad = (n) => String(n).padStart(2, '0');
const iso = (d) => d ? d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) : '';

// Strip the time off a timestamp — the whole SLA is day-based.
const dayOf = (d) => d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null;

const isWorkingDay = (d) =>
  WEEKLY_OFF.indexOf(d.getDay()) === -1 && !HOLIDAYS.has(iso(d));

// If a date lands on a Sunday or holiday, the working day is the next one.
function rollForward(d) {
  const x = new Date(d.getTime());
  let guard = 0;
  while (!isWorkingDay(x) && guard++ < 30) x.setDate(x.getDate() + 1);
  return x;
}

// "Tomorrow", skipping the weekly off and holidays.
function nextWorkingDay(d) {
  const x = new Date(d.getTime());
  let guard = 0;
  do { x.setDate(x.getDate() + 1); } while (!isWorkingDay(x) && guard++ < 30);
  return x;
}

// Working days strictly after `from`, up to and including `to`. 0 if to <= from.
function workingDaysBetween(from, to) {
  if (!from || !to || to.getTime() <= from.getTime()) return 0;
  let n = 0, guard = 0;
  const x = new Date(from.getTime());
  while (x.getTime() < to.getTime() && guard++ < 3650) {
    x.setDate(x.getDate() + 1);
    if (isWorkingDay(x)) n++;
  }
  return n;
}

function readAttempts(cell) {
  const out = {};
  String(cell == null ? '' : cell).split('|').forEach((chunk) => {
    const m = chunk.trim().match(/^(A\d+)\s*:\s*(.+?)\s*$/i);
    if (m) {
      const d = parseDate(m[2]);
      if (d) out[m[1].toUpperCase()] = d;
    }
  });
  return out;
}

/* The Status column is typed by hand and comes in two shapes in the same sheet:
   "A1: Completed" and "Call Pending A1". A cell with neither marker applies to
   every attempt in that block. */
function readStatuses(cell) {
  const out = { byAttempt: {}, plain: '' };
  String(cell == null ? '' : cell).split('|').forEach((chunk) => {
    const s = chunk.trim();
    if (!s) return;
    let m = s.match(/^(A\d+)\s*:\s*(.+?)\s*$/i);
    if (m) { out.byAttempt[m[1].toUpperCase()] = m[2].trim(); return; }
    m = s.match(/^(.+?)\s+(A\d+)\s*$/i);
    if (m) { out.byAttempt[m[2].toUpperCase()] = m[1].trim(); return; }
    out.plain = s;
  });
  return out;
}

const key = (b, f, a) => b + '|' + f + '|' + a;

const deadlines = {};
const businesses = {};

const gridRanges = ($(GRID_NODE).first().json.valueRanges) || [];

gridRanges.forEach((rangeObj) => {
  const tab = String(rangeObj.range || '').split('!')[0]
    .replace(/^'|'$/g, '').replace(/''/g, "'");
  const values = rangeObj.values || [];
  if (!values.length) return;

  const head = values[0].map((h) => String(h == null ? '' : h));
  if (!/business/i.test(head[BUSINESS_COL] || '')) return;

  const base = frameworkBase(tab);
  let block = -1;

  for (let c = FIRST_BLOCK; c < head.length; c++) {
    if (!/status/i.test(head[c] || '')) continue;

    block++;

    const fwMatch = head[c].match(/\bF\d+\b/i);
    const framework = base
      ? 'F' + (base + block)
      : (fwMatch ? fwMatch[0].toUpperCase() : 'F' + (block + 1));

    for (let r = 1; r < values.length; r++) {
      const row = values[r] || [];
      const business = String(row[BUSINESS_COL] == null ? '' : row[BUSINESS_COL]).trim();
      if (!business) continue;

      const advisor = String(row[ADVISOR_COL] == null ? '' : row[ADVISOR_COL]).trim()
                      || '(no advisor)';
      businesses[business] = advisor;

      /* Each block is three columns: Start Date | Status | End Date. Only the
         first was being read, which is why every closing date had to come from
         the log. */
      const starts = readAttempts(row[c - 1]);
      const ends   = readAttempts(row[c + 1]);
      const stat   = readStatuses(row[c]);

      Object.keys(starts).forEach((attempt) => {
        deadlines[key(business, framework, attempt)] = {
          start: starts[attempt],
          end: ends[attempt] || null,
          status: stat.byAttempt[attempt] || stat.plain || '',
          advisor, tab, row: r + 1,
        };
      });
    }
  }
});

const logValues = ($(LOG_NODE).first().json.values) || [];
const events = [];

for (let i = 1; i < logValues.length; i++) {
  const r = logValues[i] || [];
  const business  = String(r[3] == null ? '' : r[3]).trim();
  const framework = String(r[4] == null ? '' : r[4]).trim().toUpperCase();
  const status    = String(r[6] == null ? '' : r[6]).trim();
  if (!business || !framework || !status) continue;

  const when = new Date(String(r[1] || ''));
  if (isNaN(when.getTime())) continue;

  events.push({
    logId: Number(r[0]) || i,
    at: when,
    advisor: String(r[2] == null ? '' : r[2]).trim(),
    business,
    framework,
    attempt: String(r[5] == null ? '' : r[5]).trim().toUpperCase() || 'A1',
    status,
    seeded: when.getUTCFullYear() === SEED_YEAR,
  });
}

events.sort((a, b) => (a.at - b.at) || (a.logId - b.logId));

const byAttempt = {};
events.forEach((ev) => {
  const k = key(ev.business, ev.framework, ev.attempt);
  (byAttempt[k] = byAttempt[k] || []).push(ev);
});

const TODAY = dayOf(NOW);

const rows = [];
const allKeys = new Set(Object.keys(deadlines).concat(Object.keys(byAttempt)));

allKeys.forEach((k) => {
  const [business, framework, attempt] = k.split('|');
  const grid = deadlines[k] || null;
  const log  = byAttempt[k] || [];

  const advisor = (grid && grid.advisor)
    || (log.length && log[log.length - 1].advisor)
    || businesses[business] || '(no advisor)';

  const start   = grid ? dayOf(grid.start) : null;

  // The sheet's own record of the day the call happened.
  const gridEnd = grid && grid.end ? dayOf(grid.end) : null;
  const gridStatus = grid ? (grid.status || '') : '';

  // The log wins on status when it has anything to say; otherwise the sheet's
  // status column speaks, so an attempt the sheet calls Completed is not shown
  // as Call pending just because nobody logged it.
  const current = log.length ? log[log.length - 1].status
                : gridStatus ? gridStatus
                : '';

  // The first time the advisor did anything — any of the three actions.
  const firstAction = log.find(
    (ev) => !ev.seeded && ACTIONS.indexOf(ev.status) !== -1
  ) || null;

  const completion = log.find((ev) => !ev.seeded && ev.status === RESOLVED) || null;

  /* THE DAY THE WORK FINISHED. The sheet when it has a date, the log otherwise.
     Everything that asks "is this closed, and when" reads this, so the answer
     cannot differ between the verdict, the follow-up and the payload. */
  const closedOn = gridEnd || (completion ? dayOf(completion.at) : null);

  const clockStart = start ? rollForward(start) : null;
  const due = clockStart ? nextWorkingDay(clockStart) : null;

  // family    on_time | delay | ''            (which side of the deadline)
  // resolution complete | pending | none      (is the work finished)
  // reason    complete | postponed | not_received | no_status_change | ''
  let family = '', resolution = 'none', reason = '';
  let subVerdict, verdict, lateDays = 0, calledAt = null, closedFrom = '';

  if (!clockStart) {
    subVerdict = verdict = (current === AWAITING || !current) ? 'paused' : 'no_start_date';

  } else if (!firstAction && gridEnd) {
    /* THE SHEET CLOSED IT AND NOBODY LOGGED IT. Reported as never-closed until
       now, purely because the log was silent — the call is in the sheet. */
    calledAt = gridEnd;
    closedFrom = 'grid';
    lateDays = workingDaysBetween(due, calledAt);
    reason = 'complete';
    resolution = 'complete';
    if (lateDays === 0) {
      family = 'on_time'; subVerdict = 'on_time_complete'; verdict = 'on_time';
    } else {
      family = 'delay'; subVerdict = 'delay_complete'; verdict = 'late';
    }

  } else if (!firstAction) {
    // Nobody has touched it, and the sheet has no end date either.
    if (current === AWAITING) {
      subVerdict = verdict = 'paused';
    } else {
      lateDays = workingDaysBetween(due, TODAY);
      if (lateDays > 0) {
        family = 'delay'; resolution = 'pending'; reason = 'no_status_change';
        subVerdict = 'delay_pending';
        verdict = 'late_pending';
      } else {
        subVerdict = verdict = 'in_window';
      }
    }

  } else {
    /* A Completed event closed it and the sheet says which day. The sheet wins:
       the log only knows when the status was typed. Postponed / not-received
       have no column of their own, so those keep the log. */
    const useSheet = firstAction.status === RESOLVED && gridEnd;
    calledAt = useSheet ? gridEnd : dayOf(firstAction.at);
    closedFrom = useSheet ? 'grid' : 'log';

    lateDays = workingDaysBetween(due, calledAt);
    reason = SUB[firstAction.status];

    if (lateDays === 0) {
      // Acted inside the window — on time, whichever action it was.
      family = 'on_time';
      resolution = closedOn ? 'complete' : 'pending';
      subVerdict = 'on_time_' + reason;
      verdict = 'on_time';
    } else if (closedOn) {
      // Acted after the window and the call eventually happened.
      family = 'delay'; resolution = 'complete';
      subVerdict = 'delay_complete';
      verdict = 'late';
    } else {
      // Acted after the window but it is still not finished.
      family = 'delay'; resolution = 'pending';
      subVerdict = 'delay_pending_' + reason;
      verdict = 'late_pending';
    }
  }

  // ── Follow-up window ──────────────────────────────────────────────────────
  // Opened when the attempt was answered but not finished (postponed / not
  // received). Runs from that action date to the end of the next working day.
  let followUp = null;

  if (TRACK_FOLLOW_UP && firstAction && firstAction.status !== RESOLVED) {
    // The most recent unresolved action, so repeated postponements keep rolling.
    const openers = log.filter(
      (ev) => !ev.seeded && ev.status !== RESOLVED && ACTIONS.indexOf(ev.status) !== -1
        && (!completion || ev.at.getTime() < completion.at.getTime())
    );
    const opener = openers.length ? openers[openers.length - 1] : firstAction;

    const fFrom = rollForward(dayOf(opener.at));
    const fDue  = nextWorkingDay(fFrom);
    // Closed on the day the call happened, not the day it was typed.
    const fDone = closedOn;

    const fLate = fDone
      ? workingDaysBetween(fDue, fDone)
      : workingDaysBetween(fDue, TODAY);

    followUp = {
      reason: opener.status,
      from: iso(fFrom),
      dueDate: iso(fDue),
      closedOn: iso(fDone),
      verdict: fDone
        ? (fLate > 0 ? 'late' : 'on_time')
        : (fLate > 0 ? 'late_pending' : 'in_window'),
      lateDays: fLate,
    };
  }

  rows.push({
    business,
    framework,
    attempt,
    advisor,
    tab: grid ? grid.tab : '',
    row: grid ? grid.row : 0,

    startDate: iso(start),            // date the call went pending
    clockStart: iso(clockStart),      // start rolled off a Sunday/holiday
    dueDate: iso(due),                // end of this day is the deadline
    calledDate: iso(calledAt),        // the day the call happened

    /* The sheet's End Date column, verbatim, and the log timestamp that used to
       stand in for it. Sent separately so the two can never be confused again;
       the dashboard reads `sheetEnd` for its End column. */
    sheetEnd: iso(gridEnd),
    recordedAt: firstAction ? firstAction.at.toISOString() : '',
    closedFrom,                       // 'grid' | 'log' | ''

    currentStatus: current || (start ? RUNNING : ''),
    outcome: firstAction ? firstAction.status
           : (closedFrom === 'grid' ? RESOLVED : ''),

    verdict,                          // legacy: on_time | late | late_pending | in_window | paused
    subVerdict,                       // the real state, one of the ten
    label: LABELS[subVerdict] || subVerdict,
    family,                           // on_time | delay | ''
    resolution,                       // complete | pending | none
    reason,                           // complete | postponed | not_received | no_status_change

    // Days past the deadline that currently applies — the follow-up deadline
    // once one is open, otherwise the original one.
    daysOverdue: (resolution === 'pending' && due)
      ? (followUp && !followUp.closedOn ? followUp.lateDays : workingDaysBetween(due, TODAY))
      : 0,

    lateDays,
    lateHours: lateDays * 24,         // kept so existing dashboard fields still resolve
    daysRemaining: (!firstAction && due && !gridEnd)
      ? workingDaysBetween(TODAY, due) : 0,

    resolved: !!closedOn,
    followUp,
    postponed: log.some((ev) => !ev.seeded && ev.status === POSTPONED),
    postponeCount: log.filter((ev) => !ev.seeded && ev.status === POSTPONED).length,
    notReceived: log.some((ev) => !ev.seeded && ev.status === NOT_RECEIVED),

    reopened: log.filter((ev) => ev.status === RESOLVED).length > 0
              && current !== RESOLVED,
    seededOnly: log.length > 0 && log.every((ev) => ev.seeded),

    history: log.map((ev) => ({
      logId: ev.logId,
      date: ev.at.toISOString(),
      status: ev.status,
      seeded: ev.seeded,
    })),
  });
});

rows.sort((a, b) =>
  a.business.localeCompare(b.business)
  || a.framework.localeCompare(b.framework, undefined, { numeric: true })
  || a.attempt.localeCompare(b.attempt, undefined, { numeric: true })
);

return [{
  json: {
    generatedAt: NOW.toISOString(),
    parserVersion: 'v6-sheet-end-date',
    slaRule: 'end-of-next-working-day',
    workingWeek: 'Mon-Sat',
    slaHours: 48,                     // legacy field: the outer bound of the window
    counts: {
      attempts: rows.length,

      onTime:             rows.filter((r) => r.family === 'on_time').length,
      onTimeComplete:     rows.filter((r) => r.subVerdict === 'on_time_complete').length,
      onTimePostponed:    rows.filter((r) => r.subVerdict === 'on_time_postponed').length,
      onTimeNotReceived:  rows.filter((r) => r.subVerdict === 'on_time_not_received').length,

      delay:              rows.filter((r) => r.family === 'delay').length,
      delayComplete:      rows.filter((r) => r.subVerdict === 'delay_complete').length,
      delayPending:       rows.filter((r) => r.subVerdict === 'delay_pending').length,
      delayPendingPostponed:   rows.filter((r) => r.subVerdict === 'delay_pending_postponed').length,
      delayPendingNotReceived: rows.filter((r) => r.subVerdict === 'delay_pending_not_received').length,

      inWindow: rows.filter((r) => r.subVerdict === 'in_window').length,
      paused:   rows.filter((r) => r.subVerdict === 'paused').length,

      // legacy aliases
      late:        rows.filter((r) => r.verdict === 'late').length,
      latePending: rows.filter((r) => r.verdict === 'late_pending').length,

      // Which source supplied the closing date.
      closedFromGrid: rows.filter((r) => r.closedFrom === 'grid').length,
      closedFromLog:  rows.filter((r) => r.closedFrom === 'log').length,

      // Answered on time but never finished, and the follow-up is now overdue.
      followUpOpen: rows.filter((r) => r.followUp && !r.followUp.closedOn).length,
      followUpLate: rows.filter((r) => r.followUp
        && (r.followUp.verdict === 'late' || r.followUp.verdict === 'late_pending')).length,

      postponed: rows.filter((r) => r.postponed).length,
      reopened: rows.filter((r) => r.reopened).length,
      unmatched: rows.filter((r) => !r.startDate && r.history.length).length,
    },
    rows,
  },
}];
