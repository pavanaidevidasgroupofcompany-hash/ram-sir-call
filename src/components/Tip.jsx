import { num } from "../lib/format.js";

function Tip({ active, payload, label, C, suffix }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ background: C.tipBg, border: `1px solid ${C.tipBorder}`, borderRadius: 10, padding: "8px 11px", fontSize: 12, boxShadow: "0 12px 34px rgba(0,0,0,.35)" }}>
      {label != null && <div style={{ color: C.tipMuted, marginBottom: 5 }}>{label}</div>}
      {payload.map((p, i) => (
        <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", color: C.tipText, lineHeight: 1.7 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color || p.fill }} />
          <span style={{ color: C.tipMuted }}>{p.name}</span>
          <span style={{ marginLeft: "auto", fontWeight: 700 }}>{num(p.value)}{suffix || ""}</span>
        </div>
      ))}
    </div>
  );
}

export { Tip };
