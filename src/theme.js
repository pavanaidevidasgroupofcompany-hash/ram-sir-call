const CHART = {
  /* brand = the neutral bar colour, used when a chart is not showing outcomes */
  violet: { blue:"#0C7E9E", green:"#12A150", amber:"#B4780A", red:"#E23D4E", violet:"#6C5CE7", pink:"#C2189E", brand:"#6C5CE7",
           grid:"#ECEEFB", axis:"#9A9DBB", tipBg:"#26264F", tipBorder:"#3A3A72", tipText:"#F4F4FE", tipMuted:"#B9BBDD", cursor:"rgba(108,92,231,.07)" },
  dark:   { blue:"#4FD8FF", green:"#3DDC84", amber:"#F5C451", red:"#FF6B7A", violet:"#8B7BFF", pink:"#FF7AE0", brand:"#8B7BFF",
           grid:"#2A2C57", axis:"#7F82AE", tipBg:"#12132B", tipBorder:"#33356B", tipText:"#ECEDFB", tipMuted:"#A3A6CC", cursor:"rgba(139,123,255,.10)" },
};

/* CHART LAYOUT — the charts' equivalent of the CSS spacing scale.
   Every chart reads from here, so margins, tick sizes, label angles and bar
   widths are the same everywhere instead of each chart inventing its own. The
   numbers are multiples of the CSS scale (8/16/24) so plot areas line up with
   the padding of the card around them.

   The two heights matter most: a chart must reserve room for its axis labels,
   or the labels collide with each other and with the legend. AXIS_H is the
   space angled category labels need below the plot; LEGEND_H is the space a
   legend needs under that. */
const PLOT = {
  tick: 11,                                   // every axis tick, every chart
  legendFont: 12,
  angle: -35,                                 // angled category labels
  axisH: 88,                                  // room reserved for those labels
  legendPad: 24,                              // gap between plot and legend
  maxBar: 44,                                 // stops 2-category charts slabbing
  catGap: "28%",                              // breathing room between bars
  /* Recharts under-sizes STACKED bars: at a 35px band it drew 12px bars however
     barCategoryGap was set. An explicit thickness is the only reliable control,
     so stacked charts pass barSize and let the gap fall out of the band. */
  barSize: 18,
  m: { top: 12, right: 24, left: 0, bottom: 8 },
  /* A label rotated -35° and anchored at its end runs down-and-LEFT from its
     tick, so the first category overhangs the plot's left edge. Without this
     margin the SVG clips it and "BHARAT WEGAD CO…" renders as "AAT WEGAD CO…". */
  mAngled: { top: 12, right: 24, left: 52, bottom: 12 },   /* 32 clipped the first label at 375px; 48 left 1px */
};

/** One truncation rule for every chart label, so axes wrap the same way. */
const shortLabel = (s, n = 16) => {
  const t = String(s == null ? "" : s);
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

export { CHART, PLOT, shortLabel };
