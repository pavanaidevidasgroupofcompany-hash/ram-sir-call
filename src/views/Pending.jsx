import { slaWindow } from "../config.js";
import { ClientCard } from "../components/ClientCard.jsx";
import { CallsTable } from "../components/CallsTable.jsx";
import { csv, download } from "../lib/data.js";

function Pending({ pendingClients, scoped, openClient, C, isMobile, meta }) {
  if (pendingClients.length === 0) {
    return (
      <div className="empty">
        No client has an open overdue call — nothing is started, past the
        {" " + slaWindow(meta.slaHours, meta)} window, and still waiting to be closed.
        Frameworks awaiting a response aren't counted here, since their
        countdown hasn't started.
      </div>
    );
  }

  return (
    <>
      <div className="cl-grid">
        {pendingClients.map((c, i) => (
          <ClientCard key={c.business} c={c} onOpen={openClient} C={C} rank={i + 1} />
        ))}
      </div>

      <div className="card flush">
        <div className="card-head">
          <div>
            <div className="card-title">Every open overdue call</div>
            <div className="card-sub">
              Started, past the {slaWindow(meta.slaHours, meta)} window, no end date recorded
            </div>
          </div>
          <button className="btn" onClick={() => download(
            "delay-pending-calls.csv",
            csv(scoped.filter((r) => r.state === "delay_pending")))}>
            Export CSV
          </button>
        </div>
        <CallsTable rows={scoped.filter((r) => r.state === "delay_pending")}
          isMobile={isMobile} onClient={openClient} />
      </div>
    </>
  );
}

export { Pending };
