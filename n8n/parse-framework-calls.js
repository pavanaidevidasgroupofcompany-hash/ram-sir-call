/* ============================================================================
   PARSE FRAMEWORK CALLS  —  body of the n8n Code node of the same name.

   This file is the source of truth. It is run locally by
   tools/build-fixture.mjs over exported sheets, and the identical body is
   pasted into the "Parse Framework Calls" node in
   framework_call_tracker.json. Keep the two in step.

   WHAT CHANGED (v5) AND WHY
   -------------------------
   v4 took completion ONLY from the _CallLog sheet and ignored the grid's
   "End Date - Fn" columns entirely. But the grid is where the work is actually
   recorded: 96 attempts carry an end date while only 21 of them have a log
   event. The other 75 were therefore read as started-and-never-closed, which
   is what pushed the dashboard to 82% delay-pending — a join problem, not a
   delivery problem.

   The log is still preferred, because it carries a real timestamp and the full
   status history. The grid end date is a FALLBACK used only when an attempt
   has no outcome event of its own. Every row now says which source closed it
   in `closedFrom`, so the two can never be silently confused:

       'log'  — a _CallLog outcome event closed it (timestamped, authoritative)
       'grid' — no log event; the sheet's End Date column closed it (date only)
       ''     — still open

   A grid end date is date-only, so a call started and closed on the same day
   measures 0 hours, and one closed the next day measures 24. That is the same
   arithmetic v4 applied to grid dates before the log existed.
   ========================================================================== */

const SLA_HOURS = 48;
const ADVISOR_COL = 1;
const BUSINESS_COL = 2;
const FIRST_BLOCK = 3;
const SEED_YEAR = 1970;

const GRID_NODE = 'HTTP - Load All Tabs';
const LOG_NODE = 'HTTP - Load Log';

const CALL_OUTCOMES = ['Completed', 'Call postponed by client', 'Call not received'];
const AWAITING = 'Response pending';
const RUNNING = 'Call pending';
const DONE = 'Completed';

const NOW = new Date();

const MONTHS = { jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12 };

// Order and counts must stay identical to FRAMEWORK_SETS in the Apps Script,
// or logged calls will never join to their start dates.
const FRAMEWORK_SETS = [
  { match: /team|people|leadership/i,            count: 4 },
  { match: /operation|productivity/i,            count: 5 },
  { match: /market\s*research|product\s*strategy/i, count: 4 },
  { match: /marketing|lead\s*gen/i,              count: 4 },
  { match: /sales|conversion/i,                  count: 6 },
  { match: /finance|technolog|growth/i,          count: 6 }
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
const hours = (a, b) => (b.getTime() - a.getTime()) / 3600000;

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

/** "Completed A2" / "A1: Completed | A2: Call pending" -> status for an attempt. */
function readStatuses(cell) {
  const raw = String(cell == null ? '' : cell).replace(/\s+/g, ' ').trim();
  const out = { byAttempt: {}, plain: '' };
  if (!raw) return out;

  let sawPair = false;
  raw.split('|').forEach((chunk) => {
    const m = chunk.trim().match(/^(A\d+)\s*:\s*(.+?)\s*$/i);
    if (m) { sawPair = true; out.byAttempt[m[1].toUpperCase()] = m[2].trim(); }
  });
  if (sawPair) return out;

  // "Completed A2" — status first, attempt trailing
  const t = raw.match(/^(.*?)\s*(A\d+)$/i);
  if (t) { out.byAttempt[t[2].toUpperCase()] = t[1].trim(); return out; }

  out.plain = raw;
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

      const starts = readAttempts(row[c - 1]);
      const ends = readAttempts(row[c + 1]);      // v5: the End Date column
      const stat = readStatuses(row[c]);

      Object.keys(starts).forEach((attempt) => {
        deadlines[key(business, framework, attempt)] = {
          start: starts[attempt],
          end: ends[attempt] || null,            // v5: fallback close
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
  const business = String(r[3] == null ? '' : r[3]).trim();
  const framework = String(r[4] == null ? '' : r[4]).trim().toUpperCase();
  const status = String(r[6] == null ? '' : r[6]).trim();
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

const rows = [];
const allKeys = new Set(Object.keys(deadlines).concat(Object.keys(byAttempt)));

allKeys.forEach((k) => {
  const [business, framework, attempt] = k.split('|');
  const grid = deadlines[k] || null;
  const log = byAttempt[k] || [];

  const advisor = (grid && grid.advisor)
    || (log.length && log[log.length - 1].advisor)
    || businesses[business] || '(no advisor)';

  const start = grid ? grid.start : null;
  const gridEnd = grid ? grid.end : null;
  const gridStatus = grid ? grid.status : '';
  const due = start ? new Date(start.getTime() + SLA_HOURS * 3600000) : null;

  // The log wins on status when it has anything to say; otherwise the grid's
  // own status column speaks, so an attempt the sheet calls Completed is not
  // reported as Call pending just because nobody logged it.
  const current = log.length ? log[log.length - 1].status
                : gridStatus ? gridStatus
                : (start ? RUNNING : '');

  const firstOutcome = log.find(
    (ev) => !ev.seeded && CALL_OUTCOMES.indexOf(ev.status) !== -1
  ) || null;

  let verdict, lateHours = 0, calledAt = null, closedFrom = '';

  if (!start) {
    verdict = current === AWAITING || !current ? 'paused' : 'no_start_date';
  } else if (firstOutcome) {
    calledAt = firstOutcome.at;
    closedFrom = 'log';
    lateHours = Math.max(0, hours(start, calledAt) - SLA_HOURS);
    verdict = lateHours > 0 ? 'late' : 'on_time';
  } else if (gridEnd) {
    // v5 fallback: the sheet closed it, nobody logged it.
    calledAt = gridEnd;
    closedFrom = 'grid';
    lateHours = Math.max(0, hours(start, calledAt) - SLA_HOURS);
    verdict = lateHours > 0 ? 'late' : 'on_time';
  } else if (current === AWAITING) {
    verdict = 'paused';
  } else {
    lateHours = Math.max(0, hours(start, NOW) - SLA_HOURS);
    verdict = lateHours > 0 ? 'late_pending' : 'in_window';
  }

  rows.push({
    business,
    framework,
    attempt,
    advisor,
    tab: grid ? grid.tab : '',
    row: grid ? grid.row : 0,
    startDate: iso(start),
    dueDate: iso(due),
    calledDate: iso(calledAt),
    closedFrom,
    currentStatus: current,
    outcome: firstOutcome ? firstOutcome.status : (closedFrom === 'grid' ? DONE : ''),
    verdict,
    lateHours: Math.round(lateHours * 10) / 10,
    lateDays: Math.round((lateHours / 24) * 10) / 10,
    reopened: log.filter((ev) => ev.status === DONE).length > 0
              && current !== DONE,
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
    parserVersion: 'v5-2026-09',
    slaHours: SLA_HOURS,
    counts: {
      attempts: rows.length,
      onTime: rows.filter((r) => r.verdict === 'on_time').length,
      late: rows.filter((r) => r.verdict === 'late').length,
      latePending: rows.filter((r) => r.verdict === 'late_pending').length,
      inWindow: rows.filter((r) => r.verdict === 'in_window').length,
      paused: rows.filter((r) => r.verdict === 'paused').length,
      reopened: rows.filter((r) => r.reopened).length,
      unmatched: rows.filter((r) => !r.startDate && r.history.length).length,
      // v5: how each closed attempt was closed, so the split stays visible
      closedFromLog: rows.filter((r) => r.closedFrom === 'log').length,
      closedFromGrid: rows.filter((r) => r.closedFrom === 'grid').length,
    },
    rows,
  },
}];
