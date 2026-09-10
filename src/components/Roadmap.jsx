import { dmy, workingDaysBetween } from "../lib/format.js";
import { normalizeStatus, STATUS_TONE, STATUS_ICON } from "../lib/status.js";
import { Ico } from "./Icons.jsx";
import { followUpOf } from "../lib/followup.js";

/* ===========================================================================
   THE CALL ROADMAP

   One call's whole history on a horizontal line, drawn left to right: every
   _CallLog entry in order, with the start date among them as the "Call
   pending" stop that opened the call, ending at where the call is now — which
   is the one node that glows. Opens under a row in the calls table; the same
   rows, the same log, just laid out as a journey rather than a column.

   The line can begin before the call does. "Response pending" is the wait for
   the client to answer, and it carries no start date at all — the clock only
   starts when they do answer, the status moves to "Call pending" and the date
   is stamped. So it sits to the LEFT of the pending stop, and it is the only
   status that ever does.

   Nothing here is derived. The stops are the parser's `history` array as
   sent, plus the start date the row already carries, plus the current status
   when the log has not caught up to it yet (the same rule StatusHistory
   applies in the client view). The only arithmetic is the gap between stops,
   in working days, which is display — the SLA verdict is untouched.
   =========================================================================== */

/* A backfilled log row carries the epoch as its date. It is a real entry —
   it is how the tracker knew the status before logging began — but it has
   no moment, so it gets no date and no gap. */
const SEEDED = "1970-01-01";

/* The status that opens a call. The tracker stamps the start date at the same
   moment, so the two are one event and the roadmap draws them as one stop. */
const PENDING = "Call pending";

function stopsOf(row) {
  const out = (row.history || []).map((h, i) => {
    const status = normalizeStatus(h.status);
    const seeded = !!h.seeded || String(h.date || "").startsWith(SEEDED);
    return {
      key: h.logId || `${i}|${h.date}|${status}`,
      label: status, date: seeded ? "" : (h.date || ""), seeded,
      tone: STATUS_TONE[status] || "violet", icon: STATUS_ICON[status] || "list",
    };
  });

  /* The start date IS the call going pending — the tracker stamps it at the
     moment the status becomes "Call pending". So the first stop is that
     status, not a separate "Started" event: inventing one would draw two
     stops for one thing, and put a name on the roadmap the sheet never uses.

     If the log already carries the Call pending row for that day, that entry
     is the stop and nothing is inserted. Otherwise the stop is built from the
     start date, which for most rows is the only record of it — the live log
     usually begins after the call was already pending.

     It goes at its own date among the log rather than unconditionally first,
     because a call can carry a status from BEFORE it started: "Response
     pending" is the wait for the client, and the date is only stamped once
     they have answered. Pinning it to the front would draw that wait as
     though it came after the call began, which is the one thing it never
     does. */
  if (row.start) {
    /* A call goes pending ONCE. If the log already carries a Call pending row
       — on any date — that entry is the stop and no milestone is inserted:
       the log row is the recording of the very event the start date marks, and
       drawing both reads as a call that went pending twice. They are commonly
       days apart, because the status is often typed up later.

       A seeded Call pending is the same event again, and that one takes the
       start date, since a backfill records the status but never the moment. */
    const already = out.findIndex((s) => s.label === PENDING);
    if (already >= 0) {
      out[already].milestone = true;
      if (out[already].seeded) { out[already].date = row.start; out[already].seeded = false; }
    } else {
      const at = out.findIndex((s) => s.date && s.date.slice(0, 10) >= row.start);
      out.splice(at === -1 ? out.length : at, 0, {
        key: "start", label: PENDING, date: row.start, milestone: true,
        tone: STATUS_TONE[PENDING] || "red", icon: STATUS_ICON[PENDING] || "clock",
      });
    }
  }
  /* The sheet can be ahead of the log — a status the log has no row for. Then
     the last stop is the status itself, so the lit node is always where the
     call actually is.

     If that status is Completed and the sheet recorded the day, the stop takes
     that date. Most closed calls are like this: the End Date column closed them
     and nobody logged a status change, and dating them "now" would say every
     one of them finished today. Only a status the sheet cannot date falls back
     to "now". */
  const cur = normalizeStatus(row.status);
  const last = out[out.length - 1];
  if (cur && (!last || last.label !== cur)) {
    const dated = cur === "Completed" && row.end ? row.end : "";
    out.push({ key: "now", label: cur, date: dated, live: !dated,
      tone: STATUS_TONE[cur] || "violet", icon: STATUS_ICON[cur] || "list" });
  }
  return out;
}

const when = (iso) => {
  if (!iso) return "";
  const day = dmy(iso.slice(0, 10));
  if (!iso.includes("T")) return day;
  const t = new Date(iso);
  return isNaN(t) ? day
    : `${day} · ${t.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
};

const gapLabel = (n) => (n === 0 ? "same day" : `${n} ${n === 1 ? "day" : "days"}`);

function Roadmap({ row }) {
  const stops = stopsOf(row);
  const logged = (row.history || []).length;
  /* The second clock, when one is running. It belongs here rather than only in
     a table column: the roadmap is the answer to "where is this call", and for
     a call answered but not finished, the honest answer is the follow-up —
     the last stop looks settled and the deadline behind it is not. */
  const fu = followUpOf(row);

  return (
    <div className="rm" role="group"
      aria-label={`History of ${row.business} ${row.framework} ${row.attempt}`}>
      <div className="rm-cap">
        <span className="rm-cap-title">Where this call has been</span>
        <span className="rm-cap-n">{logged} log {logged === 1 ? "entry" : "entries"}</span>
        {fu && (
          <span className={"rm-fu " + fu.tone} title={fu.detail}>
            {Ico[fu.icon]}
            <span className="rm-fu-lbl">Follow-up</span>
            <span className="rm-fu-val">{fu.label}</span>
            {fu.dueDate && <span className="rm-fu-due">due {dmy(fu.dueDate)}</span>}
          </span>
        )}
      </div>

      <div className="rm-track">
        {stops.map((s, i) => {
          const next = stops[i + 1];
          const gap = next && s.date && next.date
            ? workingDaysBetween(s.date.slice(0, 10), next.date.slice(0, 10)) : null;
          const now = i === stops.length - 1;
          return (
            <div key={s.key} style={{ "--i": i }}
              className={"rm-node " + s.tone + (now ? " now" : "") + (s.milestone ? " milestone" : "")}>
              {next && <span className="rm-seg" aria-hidden="true" />}
              {gap != null && <span className="rm-gap">{gapLabel(gap)}</span>}
              <span className="rm-dot" aria-hidden="true">{Ico[s.icon]}</span>
              <span className={"sh-pill " + s.tone}>{s.label}</span>
              {/* A log stop's date is when the status was RECORDED, which is
                  not always the day the call happened — someone completes on
                  Friday and types it in on Monday. Saying "logged" stops the
                  timestamp being read as the call date.

                  Keyed on the timestamp, not on the stop's role: anything from
                  the log carries a time and is marked, while a date taken from
                  the sheet is a plain day and is not. */}
              <span className="rm-date">
                {s.seeded ? "seeded"
                  : s.live ? "now"
                  : !s.date.includes("T") ? when(s.date)
                  : <><span className="rm-logged">logged</span> {when(s.date)}</>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export { Roadmap };
