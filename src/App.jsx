/* ===========================================================================
   FRAMEWORK TRACKER

   Reads the n8n "Framework Call Tracker" workflow, which joins the function
   tabs to the _CallLog sheet and returns one row per attempt with its status
   history. This app fetches, filters and displays. It calculates no SLA of its
   own and invents no framework numbers — both are the backend's job — and it
   writes nothing at all. See the README.
   =========================================================================== */

import { useState, useEffect, useMemo, useCallback } from "react";

import { URLS, SLA_DAYS, slaLabel, slaWindow, STATE_LABEL, CHART_SERIES, SERIES_OF_STATE } from "./config.js";
import { CHART } from "./theme.js";
import { pct, num, fnShort, fnTitle, monLabel } from "./lib/format.js";
import { toRows, summarise } from "./lib/data.js";
import { mockResponse, MOCK_MODE } from "./lib/mock.js";

import { useIsMobile } from "./hooks/useIsMobile.js";

import { Dropdown } from "./components/Dropdown.jsx";
import { WarnBanner } from "./components/WarnBanner.jsx";
import { Ico } from "./components/Icons.jsx";

import { Overview, Clients, Pending, Calls, ClientDetail } from "./views/index.js";

import "./styles.css";

function App() {
  const [mode, setMode] = useState("violet");
  useEffect(() => { document.documentElement.setAttribute("data-theme", mode); }, [mode]);
  const C = CHART[mode];
  const isMobile = useIsMobile();
  const ch = (d, m) => (isMobile ? m : d);

  const [rows, setRows] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [fws, setFws] = useState([]);
  const [functions, setFunctions] = useState([]);
  const [meta, setMeta] = useState({ today: "", slaDays: SLA_DAYS, slaHours: SLA_DAYS * 24, slaRule: "", workingWeek: "", updatedAt: "", parserVersion: "" });
  const [source, setSource] = useState("loading");
  const [loading, setLoading] = useState(false);
  const [errMsg, setErrMsg] = useState(null);

  const [view, setView] = useState("overview");
  const [drawer, setDrawer] = useState(false);
  const [client, setClient] = useState(null);
  const [fnFilter, setFnFilter] = useState("all");
  const [advFilter, setAdvFilter] = useState("all");
  const [month, setMonth] = useState("all");

  const load = useCallback(async () => {
    setLoading(true); setErrMsg(null);
    try {
      /* ?mock in the URL swaps the webhook for the fixture set in lib/mock.js.
         Everything after this line is identical either way, which is the
         point: the mock exercises the real dashboard, not a copy of it. */
      let j;
      if (MOCK_MODE) {
        j = mockResponse();
      } else {
        const res = await fetch(URLS.data + "?t=" + Date.now(),
          { headers: { Accept: "application/json" }, cache: "no-store" });
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        j = await res.json();
        if (!j || j.success === false) throw new Error(j && j.message ? j.message : "Webhook returned no data");
      }

      const parsed = toRows(j.rows);
      setRows(parsed);
      setWarnings(j.warnings || []);

      const lifecycle = parsed.map((r) => ({
        tab: r.tab, business: r.business, advisor: r.advisor,
        framework: r.framework, attempt: r.attempt, status: r.status,
        start: r.start, end: r.end,
        stage: r.status === "Response pending" ? "awaiting"
          : r.status === "Completed" ? "closed" : "running",
      }));
      setFws(lifecycle);

      const uniqueTabs = [...new Set(parsed.map((r) => r.tab).filter(Boolean))];
      setFunctions(uniqueTabs.map((t) => ({ tab: t })));

      setMeta({
        today: j.today || j.generatedAt || new Date().toISOString().slice(0, 10),
        slaDays: j.slaDays || (j.slaHours ? Math.round(j.slaHours / 24) : SLA_DAYS),
        slaHours: j.slaHours || (j.slaDays ? j.slaDays * 24 : SLA_DAYS * 24),
        slaRule: j.slaRule || "",
        workingWeek: j.workingWeek || "",
        updatedAt: j.updatedAt || j.generatedAt || "",
        parserVersion: j.parserVersion || "",
      });
      setSource(MOCK_MODE ? "mock" : "live");
    } catch (e) {
      setErrMsg(e.message || String(e));
      setSource("error");
      setRows([]); setWarnings([]); setFws([]);
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const advisors = useMemo(
    () => Array.from(new Set(rows.map((r) => r.advisor))).sort(), [rows]);
  const months = useMemo(
    () => Array.from(new Set(rows.map((r) => r.ym).filter(Boolean))).sort(), [rows]);

  const scoped = useMemo(() => rows.filter((r) =>
    (fnFilter === "all" || r.tab === fnFilter) &&
    (advFilter === "all" || r.advisor === advFilter) &&
    (month === "all" || r.ym === month)
  ), [rows, fnFilter, advFilter, month]);

  const sum = useMemo(() => summarise(scoped), [scoped]);


  const fwScoped = useMemo(() => fws.filter((f) =>
    (fnFilter === "all" || f.tab === fnFilter) &&
    (advFilter === "all" || f.advisor === advFilter)
  ), [fws, fnFilter, advFilter]);

  const nsByClient = useMemo(() => {
    const m = {};
    fwScoped.forEach((f) => {
      if (f.stage === "awaiting") m[f.business] = (m[f.business] || 0) + 1;
    });
    return m;
  }, [fwScoped]);

  const clients = useMemo(() => {
    const by = {};
    scoped.forEach((r) => {
      if (!by[r.business]) by[r.business] = { business: r.business, advisor: r.advisor, rows: [] };
      by[r.business].rows.push(r);
    });
    return Object.values(by)
      .map((c) => ({ ...c, sum: summarise(c.rows), notStarted: nsByClient[c.business] || 0 }))
      .sort((a, b) => b.sum.lateDays - a.sum.lateDays || b.sum.total - a.sum.total);
  }, [scoped, nsByClient]);

  const pendingClients = useMemo(
    () => clients
      .filter((c) => c.sum.delay_pending > 0)
      .sort((a, b) =>
        b.sum.delay_pending - a.sum.delay_pending ||
        b.sum.lateDays - a.sum.lateDays ||
        b.sum.total - a.sum.total),
    [clients]);

  const [origin, setOrigin] = useState("clients");
  const openClient = (name) => {
    if (view !== "client") setOrigin(view);
    setClient(name); setView("client"); setDrawer(false);
  };
  const clientData = useMemo(
    () => clients.find((c) => c.business === client) || null, [clients, client]);

  const lateByClient = useMemo(() => clients
    .filter((c) => c.sum.lateDays > 0)
    .slice(0, 12)
    .map((c) => ({ k: c.business.length > 16 ? c.business.slice(0, 15) + "…" : c.business, v: c.sum.lateDays })),
    [clients]);

  /* Both stacked charts are keyed on CHART_SERIES labels — the same list the
     bars are drawn from — so a renamed state cannot leave a chart silently
     counting into keys that no longer exist. */
  const emptySeries = () => Object.fromEntries(CHART_SERIES.map((x) => [x.label, 0]));
  const seriesLabel = (state) => {
    const st = SERIES_OF_STATE(state);
    const hit = CHART_SERIES.find((x) => x.state === st);
    return hit ? hit.label : null;
  };

  const byFunction = useMemo(() => {
    const by = {};
    scoped.forEach((r) => {
      const k = fnShort(r.tab);
      if (!by[k]) by[k] = { k, ...emptySeries() };
      const lbl = seriesLabel(r.state);
      if (lbl) by[k][lbl]++;
    });
    return Object.values(by).sort((a, b) => a.k.localeCompare(b.k));
  }, [scoped]);

  const byClientChart = useMemo(() => clients.slice(0, 12).map((c) => {
    const row = { k: c.business.length > 16 ? c.business.slice(0, 15) + "…" : c.business, ...emptySeries() };
    CHART_SERIES.forEach((x) => {
      row[x.label] = x.state === "invalid"
        ? (c.sum.invalid || 0) + (c.sum.future || 0)
        : (c.sum[x.state] || 0);
    });
    return row;
  }), [clients]);

  const NAV = [
    { group: "Overview", items: [{ id: "overview", label: "Overview", icon: Ico.grid }] },
    { group: "Clients", items: [
      { id: "clients", label: "Client Cards", icon: Ico.users },
      { id: "pending", label: "Delay Pending Clients", icon: Ico.clock,
        badge: pendingClients.length },
    ] },
    { group: "Detail", items: [
      { id: "calls", label: "All Calls", icon: Ico.list },
    ] },
  ];
  const TITLES = {
    overview: ["Overview", `Every call measured against the ${slaWindow(meta.slaHours, meta)} window from start to close`],
    clients: ["Client Cards", "One card per business — tap a card for the full call history"],
    pending: ["Delay Pending Clients", "Ranked by open overdue calls — worst first"],
    calls: ["All Calls", "Every attempt, sortable and exportable"],
    client: [clientData ? clientData.business : "Client", "Full call history, outcome breakdown, and status timeline"],
  };
  const [title, subtitle] = TITLES[view] || TITLES.overview;

  const periodOpts = [["all", "All months"], ...months.map((m) => [m, monLabel(m)])];
  const fnOpts = [["all", "All functions"], ...functions.map((f) => [f.tab, fnShort(f.tab) + " · " + fnTitle(f.tab)])];
  const advOpts = [["all", "All advisors"], ...advisors.map((a) => [a, a])];

  const ready = (source === "live" || source === "mock") && rows.length > 0;

  /* meta rides along so every view words the SLA from the number the parser
     actually applied, rather than from a hardcoded string. */
  const VIEW_PROPS = { C, ch, isMobile, meta, sum, scoped, clients, lateByClient, byFunction, byClientChart, openClient };

  return (
    <div className="app">
      {drawer && <div className="backdrop" onClick={() => setDrawer(false)} />}
      <aside className={"sidebar" + (drawer ? " open" : "")}>
        <div className="sb-logo tone-blue">
          <div className="sb-logo-inner">
            <div className="sb-mark">FC</div>
            <div className="sb-brand-txt">
              <div className="sb-logo-name">Framework Tracker</div>
              <div className="sb-logo-sub">Call turnaround</div>
            </div>
          </div>
        </div>
        {NAV.map((sec) => (
          <div className="sb-section" key={sec.group}>
            <div className="sb-label">{sec.group}</div>
            {sec.items.map((it) => (
              <button key={it.id}
                className={"sb-item" + (view === it.id ? " active" : "")}
                onClick={() => { setView(it.id); setDrawer(false); }}>
                {it.icon}{it.label}
                {it.badge ? <span className="sb-badge warn">{it.badge}</span> : null}
              </button>
            ))}
          </div>
        ))}
        <div className="sb-foot">
          <span className={"src " + source}><i />
            {source === "live" ? "Live · n8n" : source === "mock" ? "Mock data" : source === "error" ? "Not connected" : "Loading…"}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" onClick={load} disabled={loading} style={{ flex: 1, justifyContent: "center" }}>
              {loading ? "Refreshing…" : "Refresh"}
            </button>
            <button className="btn" onClick={() => setMode(mode === "violet" ? "dark" : "violet")}
              title={mode === "violet" ? "Switch to dark" : "Switch to light"}
              style={{ justifyContent: "center" }}>{mode === "violet" ? "🌙" : "☀"}</button>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="page-header">
          <div className="page-title-row">
            <div className="ph-left">
              <button className="hamburger" onClick={() => setDrawer(true)}>☰</button>
              <div className="ph-titles">
                <h1 className="page-title">{title}</h1>
                <p className="page-sub">{subtitle}</p>
              </div>
            </div>
            {ready && (
              <div className="period">
                <Dropdown label="Function" value={fnFilter} options={fnOpts} onChange={setFnFilter} width={230} />
                {advisors.length > 1 && <Dropdown label="Advisor" value={advFilter} options={advOpts} onChange={setAdvFilter} width={160} />}
                <Dropdown label="Started" value={month} options={periodOpts} onChange={setMonth} width={150} />
              </div>
            )}
          </div>
        </div>

        <div className="content">
          {MOCK_MODE && (
            <div className="mock-banner" role="status">
              <b>Mock data.</b> Nothing on this page is real — it is a fixture built to show
              every state at once. Remove <code>?mock</code> from the address for live data.
            </div>
          )}
          {!ready ? (
            <div className="state-panel">
              {loading ? (
                <div>
                  <div className="state-spin">↻</div>
                  <div className="state-title">Loading framework calls</div>
                  <div className="state-sub">Reading the tracker sheet through n8n…</div>
                </div>
              ) : source === "error" ? (
                <div>
                  <div className="state-ico">⚠</div>
                  <div className="state-title">Can't reach n8n</div>
                  <div className="state-sub">{errMsg}</div>
                  <div className="state-url">{URLS.data}</div>
                  <div className="state-sub" style={{ marginTop: 12 }}>
                    Check the workflow is active and the Sheet ID is filled in, then refresh.
                  </div>
                  <button className="btn" onClick={load} style={{ marginTop: 14 }}>Try again</button>
                </div>
              ) : (
                <div>
                  <div className="state-ico">◔</div>
                  <div className="state-title">No calls recorded yet</div>
                  <div className="state-sub">
                    The sheet was read successfully but no framework has a start date on it.
                    Add a start date in the tracker and refresh.
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="view-fade" key={view + client}>
              {warnings.length > 0 && view === "overview" && <WarnBanner warnings={warnings} />}

              {scoped.length === 0 ? (
                <div className="empty">
                  No calls match these filters. Try widening the function, advisor, or month.
                </div>
              ) : (
                <>
                  {view === "overview" && <Overview {...VIEW_PROPS} />}
                  {view === "clients" && <Clients {...VIEW_PROPS} />}
                  {view === "pending" && <Pending {...VIEW_PROPS} pendingClients={pendingClients} />}
                  {view === "calls" && <Calls {...VIEW_PROPS} />}
                  {view === "client" && (
                    !clientData ? (
                      <div className="empty">
                        That business has no calls under the current filters.
                        <div style={{ marginTop: 10 }}>
                          <button className="btn" onClick={() => setView("clients")}>Back to all clients</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <button className="back-btn" onClick={() => setView(origin)}>
                          Back to {(TITLES[origin] || TITLES.clients)[0]}
                        </button>
                        <ClientDetail {...VIEW_PROPS} clientData={clientData} warnings={warnings} />
                      </>
                    )
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
