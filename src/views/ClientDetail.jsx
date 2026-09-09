import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts";

import { slaWindow } from "../config.js";
import { PLOT } from "../theme.js";
import { pct, num, calls, fnShort } from "../lib/format.js";
import { Ico } from "../components/Icons.jsx";
import { Kpi } from "../components/Kpi.jsx";
import { Tip } from "../components/Tip.jsx";
import { CallsTable } from "../components/CallsTable.jsx";
import { StatusHistory } from "../components/StatusHistory.jsx";
import { WarnBanner } from "../components/WarnBanner.jsx";
import { csv, download } from "../lib/data.js";

function ClientDetail({ clientData, warnings, isMobile, C, meta }) {
  const s = clientData.sum;

  return (
    <>
      <div className="kpi-grid">
        <Kpi tone="blue" icon={Ico.list} label="Total calls" value={num(s.total)} />
        <Kpi tone="green" icon={Ico.check} label="On time" value={`${s.onTimePct}%`}
          alt={calls(s.onTimeAll)} />
        <Kpi tone="red" icon={Ico.alert} label="Delayed" value={`${s.delayPct}%`}
          alt={calls(s.delay)} />
        <Kpi tone="amber" icon={Ico.check} label="Delay complete" value={`${pct(s.delay_complete, s.scored)}%`}
          alt={calls(s.delay_complete)} />
        <Kpi tone="red" icon={Ico.clock} label="Delay pending" value={`${pct(s.delay_pending, s.scored)}%`}
          alt={calls(s.delay_pending)} />
      </div>

      <div className="split">
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Outcome split</div>
              <div className="card-sub">{clientData.advisor}</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={352}>
            <PieChart margin={PLOT.m}>
              <Pie dataKey="value" nameKey="name" innerRadius={62} outerRadius={98} paddingAngle={2}
                data={[
                  { name: "On time", value: s.onTimeAll, fill: C.green },
                  { name: "Delayed", value: s.delay, fill: C.red },
                ].filter((d) => d.value > 0)}>
                {[0,1].map((i) => <Cell key={i} />)}
              </Pie>
              <Tooltip content={<Tip C={C} />} />
              <Legend wrapperStyle={{ fontSize: PLOT.legendFont, paddingTop: PLOT.legendPad }} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Days late per call</div>
              <div className="card-sub">Beyond the {slaWindow(meta.slaHours, meta)} window</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={352}>
            <BarChart data={clientData.rows.map((r) => ({
              k: `${fnShort(r.tab)} ${r.framework} ${r.attempt}`, v: r.lateDays,
            }))} margin={PLOT.mAngled}
              maxBarSize={PLOT.maxBar} barCategoryGap={PLOT.catGap}>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} vertical={false} />
              <XAxis dataKey="k" stroke={C.axis} fontSize={PLOT.tick} angle={PLOT.angle}
                textAnchor="end" height={PLOT.axisH} interval={0} tickMargin={8} />
              <YAxis stroke={C.axis} fontSize={PLOT.tick} allowDecimals={false} width={40} />
              <Tooltip content={<Tip C={C} suffix=" days" />} cursor={{ fill: C.cursor }} />
              <Bar dataKey="v" name="Days late" fill={C.red} radius={[5,5,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card flush">
        <div className="card-head">
          <div>
            <div className="card-title">Every call for {clientData.business}</div>
            <div className="card-sub">{num(s.total)} attempts across all frameworks</div>
          </div>
          <button className="btn" onClick={() =>
            download(clientData.business.replace(/\W+/g, "-").toLowerCase() + "-calls.csv", csv(clientData.rows))}>
            Export CSV
          </button>
        </div>
        <CallsTable rows={clientData.rows} isMobile={isMobile} />
      </div>

      {clientData.rows.length > 0 && (
        <div className="card">
          <div className="card-head">
            <div>
              <div className="card-title">Status history</div>
              <div className="card-sub">
                Timeline of status changes from _CallLog — seeded entries are from the initial sheet import
              </div>
            </div>
          </div>
          <div className="sh-grid">
            {clientData.rows.map((r) => (
              <div key={r.framework + r.attempt} className="sh-panel">
                <div className="sh-panel-head">
                  <span className="sh-fw mono">{r.framework}</span>
                  <span className="sh-attempt mono">{r.attempt}</span>
                  {r.reopened && <span className="sh-tag reopened">reopened</span>}
                </div>
                <StatusHistory history={r.history} currentStatus={r.status} />
              </div>
            ))}
          </div>
        </div>
      )}

      {warnings.filter((w) => w.business === clientData.business).length > 0 && (
        <WarnBanner warnings={warnings.filter((w) => w.business === clientData.business)} />
      )}
    </>
  );
}

export { ClientDetail };
