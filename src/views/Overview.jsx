import { useState, useRef, useEffect, useMemo } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";

import { slaWindow, CHART_SERIES, SUB_LABEL } from "../config.js";
import { PLOT } from "../theme.js";
import { pct, num, dmy, calls } from "../lib/format.js";
import { Seg } from "../components/Seg.jsx";
import { Tip } from "../components/Tip.jsx";
import { Ico } from "../components/Icons.jsx";
import { CallsTable } from "../components/CallsTable.jsx";

/* ===========================================================================
   THE OVERVIEW

     1. WHERE EVERY CALL STANDS   on time vs delayed, each with its reasons
     2. THE VERDICT, BROKEN DOWN  the same split, cut by function or business

   A KPI row and a row of status cards used to sit above both, and were removed
   at the owner's request. Neither removal dropped a figure: the nine states
   drive the Outcome column and this chart's series, the six statuses drive the
   Status column and the All Calls filters, and the on-time/delay split still
   opens the client detail view per business.
   =========================================================================== */

/* WHERE EVERY CALL STANDS — the verdict as two panels.

   One question: did the advisor act inside the window? Each panel carries the
   family total, its share as a ring, and the reasons the parser distinguishes
   underneath.

   Every card carries its own qualifier — "— On Time" or a leading "Delay" —
   rather than leaning on the panel heading above it. The panel is the context
   only while you are looking at the panel; read a card on its own, or quoted
   into a message, and "Call Postponed by Client" does not say which side of
   the deadline it happened on. The parser's exact wording is still on each
   card's `title`, and nothing is renamed in the data.

   Icons reuse the set the rest of the app uses for the same meanings: a tick
   for done, a clock for waiting, a left arrow for pushed back, a warning for
   nobody answering. */
const FAMILIES = [
  {
    key: "on_time", name: "On Time Calls", tone: "green", icon: "check",
    ids: [
      ["on_time_complete", "Complete — On Time", "check"],
      ["on_time_postponed", "Call Postponed by Client — On Time", "clock"],
      ["on_time_not_received", "Call Not Received — On Time", "alert"],
    ],
  },
  {
    key: "delay", name: "Delayed Calls", tone: "red", icon: "clock",
    ids: [
      ["delay_complete", "Delay Complete", "check"],
      ["delay_pending", "Delay Pending", "clock"],
      ["delay_pending_postponed", "Delay Call Postponed by Client", "back"],
      ["delay_pending_not_received", "Delay Call Not Received", "alert"],
    ],
  },
];

/* A ring, drawn as two circles. Cheaper and sharper than a chart library for
   one number, and it scales with the card rather than needing a fixed pixel
   height the way a ResponsiveContainer does. */
function Donut({ share, tone }) {
  const r = 34;
  const circumference = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className={"donut " + tone} role="img"
      aria-label={`${share}%`}>
      <circle className="donut-track" cx="40" cy="40" r={r} />
      <circle className="donut-fill" cx="40" cy="40" r={r}
        strokeDasharray={`${(circumference * share) / 100} ${circumference}`}
        transform="rotate(-90 40 40)" />
      <text className="donut-text" x="40" y="40">{share}%</text>
    </svg>
  );
}

const BREAKDOWNS = [
  ["function", "By function"],
  ["business", "By business"],
  ["late", "Days late"],
];

function Overview({ sum, scoped, lateByClient, byFunction, byClientChart, C, ch, meta, isMobile, openClient }) {
  const [breakdown, setBreakdown] = useState("function");

  /* Which reason card is open, if any. The calls behind it are shown here, in
     place, rather than by jumping to All Calls: the question the click asks —
     "which calls are these 21?" — is asked while looking at the panel, and an
     answer that replaces the screen you asked it from makes you navigate back
     to carry on reading. Clicking the open card again closes it. */
  const [open, setOpen] = useState(null);
  const openRows = useMemo(
    () => (open ? scoped.filter((r) => r.subVerdict === open) : []), [scoped, open]);

  /* Opening one pushes the chart down past the fold, so bring the table to the
     reader rather than leaving them to find it. Only on a change of card — not
     on every re-render, or a filter change elsewhere would yank the page. */
  const panel = useRef(null);
  useEffect(() => {
    if (open && panel.current) panel.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [open]);

  /* Earliest and latest start date among the calls in view. Read from the rows
     rather than from the month filter, so it reflects what is actually on
     screen even when no filter is set. */
  const dates = scoped.map((r) => r.start).filter(Boolean).sort();
  const range = dates.length
    ? (dates[0] === dates[dates.length - 1]
        ? dmy(dates[0])
        : `${dmy(dates[0])} – ${dmy(dates[dates.length - 1])}`)
    : "";

  return (
    <>
      {/* ══════════════════════════════════ 1 · WHERE EVERY CALL STANDS ═══ */}
      <section className="card">
        <div className="card-head">
          <div className="card-title">Where every call stands</div>
          {/* The span of start dates actually on screen, so the panels are never
              read as covering a period they do not. It narrows with the filters.
              Not a picker — the Started filter above is what changes it. */}
          {range && (
            <div className="date-range" title="Start dates of the calls in view">
              {Ico.list}
              <span>{range}</span>
            </div>
          )}
        </div>

        {/* Each panel is as wide as it has reasons — 3fr and 4fr — so the
            delayed panel's fourth card sits on the same row as the other three
            instead of wrapping alone. Derived from FAMILIES, so adding a reason
            widens its panel rather than breaking the row. */}
        <div className="stands"
          style={{ "--stands-cols": FAMILIES.map((f) => `${f.ids.length}fr`).join(" ") }}>
          {FAMILIES.map((f) => {
            const count = f.key === "on_time" ? sum.onTimeAll : sum.delay;
            const share = f.key === "on_time" ? sum.onTimePct : sum.delayPct;
            return (
              <div className={"stands-panel " + f.tone} key={f.key}
                style={{ "--sub-cols": f.ids.length }}>
                <div className="stands-head">
                  <div className="stands-icon">{Ico[f.icon]}</div>
                  <div className="stands-figure">
                    <div className="stands-name">{f.name}</div>
                    <div className="stands-count">{num(count)}</div>
                    <div className="stands-of">Calls</div>
                  </div>
                  <Donut share={share} tone={f.tone} />
                </div>

                <div className="stands-subs">
                  {f.ids.map(([id, label, icon]) => {
                    const n = sum.sub[id] || 0;
                    /* A card with nothing behind it is not a link. Clicking it
                       would land on an empty table, which reads as a broken
                       filter rather than as an honest zero — and the zero is
                       already the answer, here on the card. */
                    return (
                      <button key={id} type="button"
                        className={"stands-sub " + f.tone + (n ? "" : " zero")
                          + (open === id ? " on" : "")}
                        title={n ? `${SUB_LABEL[id]} — show these ${calls(n)}` : SUB_LABEL[id]}
                        aria-expanded={open === id} disabled={!n}
                        onClick={() => setOpen(open === id ? null : id)}>
                        <div className="stands-sub-top">
                          <span className="stands-sub-icon">{Ico[icon]}</span>
                          <span className="stands-sub-pct">{pct(n, sum.scored)}%</span>
                        </div>
                        <div className="stands-sub-value">{num(n)}</div>
                        <div className="stands-sub-label">{label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─────────────────────────────── the calls behind one reason card ─── */}
      {open && (
        <section className="card flush drill-card" ref={panel}>
          <div className="card-head">
            <div className="card-title">
              {SUB_LABEL[open]}
              <span className="card-title-of"> · {calls(openRows.length)}</span>
            </div>
            <button type="button" className="btn" onClick={() => setOpen(null)}>Close ✕</button>
          </div>
          <CallsTable rows={openRows} isMobile={isMobile} onClient={openClient} />
        </section>
      )}

      {/* ═══════════════════════════════════════════ 2 · THE BREAKDOWNS ═══ */}
      <section className="card">
        <div className="card-head">
          <div>
            <div className="card-title">The verdict, broken down</div>
            <div className="card-sub">
              {breakdown === "late"
                ? `Days beyond the ${slaWindow(meta.slaHours, meta)} window, summed across each business's calls.`
                : "Every call, stacked by how it ended up."}
            </div>
          </div>
          <Seg label="Cut by" value={breakdown} setValue={setBreakdown} options={BREAKDOWNS} />
        </div>

        {breakdown === "function" && (
          <ResponsiveContainer width="100%" height={ch(352, 296)}>
            <BarChart data={byFunction} margin={PLOT.m}
              maxBarSize={PLOT.maxBar} barCategoryGap={PLOT.catGap}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="k" stroke={C.axis} fontSize={PLOT.tick} tickMargin={8} />
              <YAxis stroke={C.axis} fontSize={PLOT.tick} allowDecimals={false} width={40} />
              <Tooltip content={<Tip C={C} />} cursor={{ fill: C.cursor }} />
              <Legend wrapperStyle={{ fontSize: PLOT.legendFont, paddingTop: PLOT.legendPad }} />
              {CHART_SERIES.map((x, i) => (
                <Bar key={x.state} dataKey={x.label} stackId="a" fill={C[x.color]}
                  radius={i === CHART_SERIES.length - 1 ? [6, 6, 0, 0] : [0, 0, 0, 0]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}

        {breakdown === "business" && (
          <ResponsiveContainer width="100%" height={ch(80 + byClientChart.length * 36, 68 + byClientChart.length * 30)}>
            <BarChart data={byClientChart} layout="vertical" margin={PLOT.m}
              barSize={PLOT.barSize} barCategoryGap={PLOT.catGap}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} horizontal={false} />
              <XAxis type="number" stroke={C.axis} fontSize={PLOT.tick} allowDecimals={false} tickMargin={8} />
              <YAxis type="category" dataKey="k" stroke={C.axis} fontSize={PLOT.tick}
                width={ch(168, 104)} interval={0} tickMargin={8} />
              <Tooltip content={<Tip C={C} />} cursor={{ fill: C.cursor }} />
              <Legend wrapperStyle={{ fontSize: PLOT.legendFont, paddingTop: PLOT.legendPad }} />
              {CHART_SERIES.map((x) => (
                <Bar key={x.state} dataKey={x.label} stackId="a" fill={C[x.color]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}

        {breakdown === "late" && (
          lateByClient.length ? (
            <ResponsiveContainer width="100%" height={ch(372, 328)}>
              <BarChart data={lateByClient} margin={PLOT.mAngled}
                maxBarSize={PLOT.maxBar} barCategoryGap={PLOT.catGap}>
                <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
                <XAxis dataKey="k" stroke={C.axis} fontSize={PLOT.tick} angle={PLOT.angle}
                  textAnchor="end" height={PLOT.axisH} interval={0} tickMargin={8} />
                <YAxis stroke={C.axis} fontSize={PLOT.tick} allowDecimals={false} width={40} />
                <Tooltip content={<Tip C={C} suffix=" days" />} cursor={{ fill: C.cursor }} />
                <Bar dataKey="v" name="Days late" fill={C.red} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty">No call is past its window under the current filters.</div>
          )
        )}
      </section>
    </>
  );
}

export { Overview };
