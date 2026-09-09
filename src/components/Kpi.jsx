import { Ico } from "./Icons.jsx";

/* The KPI card: icon chip, optional badge, label, metric.

   There is no caption line. It used to carry a sentence under the number
   ("121 of 122 ran over") and it was removed at the owner's request — the
   label and the badge already say what the figure is, and five sentences
   across a row competed with the five numbers they were explaining.

   `sub` is deliberately not a prop any more rather than an ignored one, so a
   caption cannot be quietly reintroduced on one card and not the others. */
function Kpi({ tone, icon, label, value, alt, hero }) {
  return (
    <div className={"kpi " + tone + (hero ? " hero" : "")}>
      <div className="kpi-top">
        <div className="kpi-icon">{icon}</div>
        {alt ? <div className="kpi-alt">{alt}</div> : null}
      </div>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
    </div>
  );
}

export { Kpi };
