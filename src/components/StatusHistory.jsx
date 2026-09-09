import { dmy } from "../lib/format.js";
import { normalizeStatus, STATUS_TONE } from "../lib/status.js";

function StatusHistory({ history, currentStatus }) {
  if (!history || !history.length) {
    return (
      <div className="sh-empty">
        No status changes recorded yet. Change a status to start tracking history.
      </div>
    );
  }

  /* Build a merged timeline: history entries + current status as the latest.
     History entries come from _CallLog (sorted chronologically by the
     dashboard backend). The current status is the most recent state. */
  const entries = history.map((h) => ({
    date: h.date,
    status: normalizeStatus(h.status),
    seeded: h.seeded,
    logId: h.logId,
  }));

  /* Add current status if it differs from the last history entry */
  const lastHist = entries[entries.length - 1];
  if (currentStatus && normalizeStatus(currentStatus) !== (lastHist ? lastHist.status : "")) {
    entries.push({
      date: new Date().toISOString(),
      status: normalizeStatus(currentStatus),
      seeded: false,
      logId: null,
    });
  }

  return (
    <div className="sh-timeline">
      {entries.map((e, i) => {
        const tone = STATUS_TONE[e.status] || "violet";
        const isFirst = i === 0;
        const isLast = i === entries.length - 1;
        return (
          <div key={e.logId || i} className={"sh-entry" + (isLast ? " sh-current" : "")}>
            <div className="sh-dot-col">
              <div className={"sh-dot " + tone} />
              {!isLast && <div className="sh-line" />}
            </div>
            <div className="sh-body">
              <div className="sh-head">
                <span className={"sh-pill " + tone}>{e.status}</span>
                {e.seeded && <span className="sh-seeded">seeded</span>}
              </div>
              <div className="sh-date">
                {dmy(e.date ? e.date.slice(0, 10) : "")}
                {e.date ? " " + new Date(e.date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export { StatusHistory };
