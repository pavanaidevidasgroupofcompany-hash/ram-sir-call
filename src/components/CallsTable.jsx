import { useState, useMemo, useEffect, Fragment } from "react";
import { dmy, num } from "../lib/format.js";
import { STATE_LABEL, STATE_TONE } from "../config.js";
import { normalizeStatus } from "../lib/status.js";
import { fnShort } from "../lib/format.js";
import { Roadmap } from "./Roadmap.jsx";
import { followUpOf } from "../lib/followup.js";

/* Page sizes, and "All" for anyone who would rather scroll or print. */
const PAGE_SIZES = [25, 50, 100, 0];
const sizeLabel = (n) => (n ? String(n) : "All");

function CallsTable({ rows, isMobile, onClient }) {
  const [sort, setSort] = useState({ key: "lateDays", dir: "desc" });
  const [size, setSize] = useState(25);
  const [page, setPage] = useState(1);
  /* Which row has its history open. One at a time: two roadmaps on screen
     compete for the same reading, and the table stops being a table. */
  const [openRow, setOpenRow] = useState(null);

  const COLS = [
    { key: "business", label: "Business", get: (r) => r.business },
    { key: "tab", label: "Function", get: (r) => fnShort(r.tab) },
    { key: "framework", label: "Framework", get: (r) => r.framework },
    { key: "attempt", label: "Attempt", get: (r) => r.attempt },
    { key: "status", label: "Status", get: (r) => r.status },
    { key: "start", label: "Start", get: (r) => r.start },
    /* When the work finished. Not the first action — see endedOn() in
       lib/data.js for why those are different dates. */
    { key: "end", label: "End", get: (r) => r.end },
    /* Null when the call has no end date yet, which must sort as "unknown"
       rather than as zero — an unfinished call is not a same-day one. */
    { key: "duration", label: "Days", get: (r) => (r.duration == null ? -1 : r.duration) },
    { key: "state", label: "Outcome", get: (r) => r.state },
    { key: "lateDays", label: "Late", get: (r) => r.lateDays },
    /* Answered but not finished. Sorts by how far the SECOND clock has run,
       with -1 for rows that have no follow-up so "worst first" puts the
       forgotten postponements above the calls that never needed one. */
    { key: "followUp", label: "Follow-up",
      get: (r) => { const f = followUpOf(r); return f ? f.lateDays : -1; } },
  ];

  const sorted = useMemo(() => {
    const col = COLS.find((c) => c.key === sort.key) || COLS[0];
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = col.get(a), y = col.get(b);
      if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
      return String(x).localeCompare(String(y)) * dir;
    });
  }, [rows, sort]);

  const total = sorted.length;
  const pageCount = size ? Math.max(1, Math.ceil(total / size)) : 1;

  /* Sorting, filtering or opening a different status all change what page 3
     even means, so the view returns to the first page rather than showing an
     empty one. Clamped rather than reset on pageCount alone, so paging within
     an unchanged list is left where it is. */
  useEffect(() => { setPage(1); setOpenRow(null); }, [rows, sort, size]);
  const current = Math.min(page, pageCount);

  const shown = useMemo(() => {
    if (!size) return sorted;
    const from = (current - 1) * size;
    return sorted.slice(from, from + size);
  }, [sorted, current, size]);

  const first = total ? (current - 1) * (size || total) + 1 : 0;
  const last = size ? Math.min(current * size, total) : total;

  if (!rows.length) return <div className="empty">No calls match the current filters.</div>;

  return (
    <div className="table-wrap">
      {/* The scroller is what scrolls, not the page, which is what lets the
          header stick to its top edge and the first column to its left one. */}
      <div className="table-scroll">
        <table className="row-table sticky">
          <thead>
            <tr>
              {COLS.map((c, i) => (
                <th
                  key={c.key}
                  className={"sortable" + (["duration", "lateDays"].includes(c.key) ? " num" : "")
                    + (i === 0 ? " freeze" : "")}
                  onClick={() => setSort((s) => ({
                    key: c.key, dir: s.key === c.key && s.dir === "desc" ? "asc" : "desc",
                  }))}
                >
                  {c.label}{sort.key === c.key ? (sort.dir === "desc" ? " ▾" : " ▴") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => {
              const id = `${r.business}|${r.framework}|${r.attempt}|${i}`;
              const open = openRow === id;
              return (
            <Fragment key={id}>
              <tr className={"rm-row" + (open ? " on" : "")}
                onClick={() => setOpenRow(open ? null : id)}
                aria-expanded={open}>
                <td className="freeze" style={{ fontWeight: 600 }}>
                  {/* The business name still goes to the client view. Stopping
                      the bubble here keeps the two clicks apart: the name opens
                      the business, the rest of the row opens this call. */}
                  {onClient
                    ? <button className="back-btn" style={{ margin: 0 }}
                        onClick={(e) => { e.stopPropagation(); onClient(r.business); }}>{r.business}</button>
                    : r.business}
                </td>
                <td>{fnShort(r.tab)}</td>
                <td className="mono">{r.framework}</td>
                <td className="mono">{r.attempt}</td>
                {/* Read-only. The status a call is in belongs to the tracker
                    sheet; this dashboard reports it and never sets it. */}
                <td>
                  <span className={"pill status-" + (STATE_TONE[r.state] || "violet")}>
                    {normalizeStatus(r.status)}
                  </span>
                </td>
                <td className="mono">{dmy(r.start)}</td>
                {/* Normally the sheet's End Date — the day the call happened.
                    Where the sheet has none, this falls back to the log, which
                    is when the status was TYPED, and the two are routinely days
                    apart. Badged so a recording date is never read as a call
                    date. Nothing on the current data reaches the fallback. */}
                <td className={r.end ? "mono" : ""}
                    title={r.end && !r.endFromSheet
                      ? "From the log — the day the status was recorded, which can be later than the call. This attempt has no End Date in the tracker sheet."
                      : undefined}
                    style={r.end ? undefined : { color: "var(--hint)", fontSize: 11.5 }}>
                  {r.end ? dmy(r.end) : "not completed"}
                  {r.end && !r.endFromSheet ? <span className="end-logged">logged</span> : null}
                </td>
                <td className="num mono">{r.duration == null ? "—" : r.duration}</td>
                <td><span className={"pill " + r.state} title={r.label || undefined}>{r.label || STATE_LABEL[r.state] || r.state}</span></td>
                {/* Measured to the FIRST action, which is what the rule
                    judges — not to the End beside it. The title says so,
                    because the two dates can be a month apart. */}
                <td className="num mono"
                  title={r.firstAction
                    ? `First acted ${dmy(r.firstAction)}${r.dueDate ? ` · due ${dmy(r.dueDate)}` : ""}`
                    : undefined}
                  style={{ fontWeight: r.lateDays ? 700 : 400, color: r.lateDays ? "var(--red)" : "var(--hint)" }}>
                  {r.lateDays ? r.lateDays : "—"}
                </td>
                {/* The second clock. A call answered on time and then left
                    unfinished shows nothing in Late — that column is about the
                    first deadline, which it met. This is the one that moves. */}
                <td>
                  {(() => {
                    const f = followUpOf(r);
                    if (!f) return <span style={{ color: "var(--hint)" }}>—</span>;
                    return <span className={"pill status-" + f.tone} title={f.detail}>{f.label}</span>;
                  })()}
                </td>
              </tr>
              {open && (
                <tr className="rm-tr">
                  <td colSpan={COLS.length}><Roadmap row={r} /></td>
                </tr>
              )}
            </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* The pager is hidden when everything already fits on one page — a
          control that can only say "1 of 1" is furniture. */}
      {(pageCount > 1 || total > PAGE_SIZES[0]) && (
        <div className="pager">
          <span className="pager-count">
            {num(first)}–{num(last)} of {num(total)}
          </span>

          <div className="pager-size">
            <span className="pager-lbl">Rows</span>
            {PAGE_SIZES.map((n) => (
              <button key={n} type="button"
                className={"pager-btn" + (n === size ? " on" : "")}
                onClick={() => setSize(n)}>
                {sizeLabel(n)}
              </button>
            ))}
          </div>

          {pageCount > 1 && (
            <div className="pager-nav">
              <button type="button" className="pager-btn" disabled={current === 1}
                onClick={() => setPage(current - 1)} aria-label="Previous page">‹</button>
              <span className="pager-page">Page {num(current)} of {num(pageCount)}</span>
              <button type="button" className="pager-btn" disabled={current === pageCount}
                onClick={() => setPage(current + 1)} aria-label="Next page">›</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export { CallsTable };
