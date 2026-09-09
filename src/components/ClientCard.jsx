import { pct, days } from "../lib/format.js";

function ClientCard({ c, onOpen, C, rank }) {
  const s = c.sum;
  /* Widths are of the scored calls, matching the pill below. On-time segments
     lead so the bar reads as one on-time block against one delayed block. */
  const seg = (v, color) => (v ? <i style={{ width: pct(v, s.scored) + "%", background: color }} /> : null);
  return (
    <button className="cl-card" onClick={() => onOpen(c.business)}>
      <div>
        <div className="cl-name">
          {rank ? <span className="cl-rank">#{rank}</span> : null}
          <span>{c.business}</span>
        </div>
        <div className="cl-adv">{c.advisor} · {days(s.lateDays)} late in total</div>
      </div>
      <div className="cl-bar">
        {seg(s.on_time, C.green)}
        {seg(s.in_window, C.blue)}
        {seg(s.paused, C.violet)}
        {seg(s.delay_complete, C.amber)}
        {seg(s.delay_pending, C.red)}
      </div>
      <div className="cl-stats">
        {/* Named exactly as the KPIs and pills name them, so a card and a chart
            never use two words for the same bucket. */}
        <span className="cl-stat"><b style={{ color: "var(--green)" }}>{s.onTimeAll}</b> on time</span>
        <span className="cl-stat"><b style={{ color: "var(--amber)" }}>{s.delay_complete}</b> delay complete</span>
        <span className="cl-stat"><b style={{ color: "var(--red)" }}>{s.delay_pending}</b> delay pending</span>
      </div>
      <div className="cl-foot">
        <span>
          {s.total} calls
          {c.notStarted ? <span style={{ color: "var(--hint)" }}> · {c.notStarted} awaiting response</span> : null}
        </span>
        <span className={"pill " + (s.onTimePct >= 60 ? "on_time" : s.onTimePct >= 30 ? "delay_complete" : "delay_pending")}>
          {s.onTimePct}% on time
        </span>
      </div>
    </button>
  );
}

export { ClientCard };
