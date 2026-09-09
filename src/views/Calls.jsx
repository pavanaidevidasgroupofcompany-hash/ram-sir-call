import { useMemo, useState } from "react";

import { num } from "../lib/format.js";
import { STATE_LABEL, STATE_ORDER } from "../config.js";
import { normalizeStatus, STATUS_ORDER } from "../lib/status.js";
import { followUpOf, FOLLOW_UP_FILTERS, matchesFollowUp } from "../lib/followup.js";
import { Dropdown } from "../components/Dropdown.jsx";
import { CallsTable } from "../components/CallsTable.jsx";
import { csv, download } from "../lib/data.js";

/* ===========================================================================
   ALL CALLS

   The page header carries the three filters that mean something on every view
   — function, advisor, month. These five are about the table and live with
   it: narrowing to one framework or one status is a question you ask of a list
   of calls, not of the client cards or the charts.

   Keeping them local also keeps them honest. A global filter that is only
   visible on one screen quietly changes the numbers on the others; these
   cannot, because they never leave this component.
   =========================================================================== */

const fwNum = (f) => Number(String(f).replace(/\D/g, "")) || 0;

function Calls({ scoped, isMobile, openClient }) {
  const [biz, setBiz] = useState("all");
  const [fw, setFw] = useState("all");
  const [att, setAtt] = useState("all");
  const [status, setStatus] = useState("all");
  const [state, setState] = useState("all");
  const [fup, setFup] = useState("all");

  /* Options are built from the rows the page filters already handed us, so a
     choice can never offer a value that would return nothing — and the lists
     shrink as the page filters narrow. */
  const opts = useMemo(() => {
    const uniq = (f) => Array.from(new Set(scoped.map(f).filter(Boolean)));
    return {
      biz: [["all", "All businesses"], ...uniq((r) => r.business).sort().map((b) => [b, b])],
      fw: [["all", "All frameworks"],
        ...uniq((r) => r.framework).sort((a, b) => fwNum(a) - fwNum(b)).map((f) => [f, f])],
      att: [["all", "All attempts"], ...uniq((r) => r.attempt).sort().map((a) => [a, a])],
      /* The two vocabularies keep their own order rather than sorting
         alphabetically, then drop whatever no row carries. */
      status: [["all", "All statuses"],
        ...STATUS_ORDER.filter((v) => scoped.some((r) => normalizeStatus(r.status) === v)).map((v) => [v, v])],
      state: [["all", "All outcomes"],
        ...STATE_ORDER.filter((v) => scoped.some((r) => r.state === v)).map((v) => [v, STATE_LABEL[v] || v])],
      /* Only the follow-up choices that would actually return something. On a
         set where nothing was ever postponed there is nothing to follow up,
         and the dropdown does not appear at all. */
      fup: FOLLOW_UP_FILTERS.filter(([k]) => k === "all"
        || scoped.some((r) => matchesFollowUp(r, k))),
    };
  }, [scoped]);

  /* Does anything here carry a second clock? If not the control is furniture. */
  const anyFollowUp = useMemo(() => scoped.some((r) => followUpOf(r)), [scoped]);

  const rows = useMemo(() => scoped.filter((r) =>
    (biz === "all" || r.business === biz) &&
    (fw === "all" || r.framework === fw) &&
    (att === "all" || r.attempt === att) &&
    (status === "all" || normalizeStatus(r.status) === status) &&
    (state === "all" || r.state === state) &&
    matchesFollowUp(r, fup)
  ), [scoped, biz, fw, att, status, state, fup]);

  const FILTERS = [[biz, setBiz], [fw, setFw], [att, setAtt], [status, setStatus],
    [state, setState], [fup, setFup]];
  const active = FILTERS.filter(([v]) => v !== "all").length;
  const clear = () => FILTERS.forEach(([, set]) => set("all"));

  return (
    <div className="card flush">
      <div className="card-head">
        <div>
          <div className="card-title">
            {num(rows.length)} calls
            {active > 0 && rows.length !== scoped.length
              ? <span className="card-title-of"> of {num(scoped.length)}</span> : null}
          </div>
          <div className="card-sub">Click a heading to sort · Click a row for its log · Click a business for all its calls</div>
        </div>
        <button className="btn" onClick={() => download("framework-calls.csv", csv(rows))}>
          Export CSV
        </button>
      </div>

      {/* The table's own filters, in its head rather than the page header —
          they narrow this list and nothing else. */}
      <div className="table-filters">
        {opts.biz.length > 2 && <Dropdown label="Business" value={biz} options={opts.biz} onChange={setBiz} width={200} />}
        <Dropdown label="Framework" value={fw} options={opts.fw} onChange={setFw} width={150} />
        <Dropdown label="Attempt" value={att} options={opts.att} onChange={setAtt} width={140} />
        <Dropdown label="Status" value={status} options={opts.status} onChange={setStatus} width={210} />
        <Dropdown label="Outcome" value={state} options={opts.state} onChange={setState} width={210} />
        {anyFollowUp && (
          <Dropdown label="Follow-up" value={fup} options={opts.fup} onChange={setFup} width={200} />
        )}
        {active > 0 && (
          <button className="btn clear-filters" onClick={clear}>Clear {active}</button>
        )}
      </div>

      <CallsTable rows={rows} isMobile={isMobile} onClient={openClient} />
    </div>
  );
}

export { Calls };
