import { fnShort } from "../lib/format.js";
import { useState } from "react";

function WarnBanner({ warnings }) {
  const [open, setOpen] = useState(false);
  const byType = warnings.reduce((m, w) => { (m[w.type] = m[w.type] || []).push(w); return m; }, {});
  const LABEL = {
    status_without_dates: "are marked Call pending or Completed but have no dates",
    status_attempt_missing: "point at an attempt that has no dates",
    end_without_start: "have an end date with no start date",
    end_before_start: "end before they start",
    future_start: "start in the future",
    future_end: "end in the future",
  };
  return (
    <div className="warn">
      <div className="warn-head" onClick={() => setOpen(!open)}>
        <span className="warn-ico">⚠</span>
        <div style={{ flex: 1 }}>
          <div className="warn-title">{warnings.length} entries in the sheet need a look</div>
          <div className="warn-sub">
            {Object.entries(byType).map(([t, list]) => `${list.length} ${LABEL[t] || t}`).join(" · ")}
            {" — everything is still counted below, nothing has been dropped."}
          </div>
        </div>
        <span className={"warn-caret" + (open ? " up" : "")}>▾</span>
      </div>
      {open && (
        <div className="warn-list">
          {warnings.map((w, i) => (
            <div className="warn-row" key={i}>
              <span className="warn-tag">{fnShort(w.tab)} · row {w.row}</span>
              <span className="warn-msg"><b>{w.business}</b> — {w.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { WarnBanner };
