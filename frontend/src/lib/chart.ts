// Shared chart styling for Recharts. Single-series charts use the brand violet;
// multi-series identity colours come from COMPONENT_COLOR (validated palette).
export const CHART = {
  series: "#8C5CFF",
  seriesSoft: "rgba(140, 92, 255, 0.28)",
  reference: "#2CE5F6",
  grid: "rgb(42 42 62)",
  axis: "rgb(132 129 160)",
  tick: { fill: "rgb(166 163 194)", fontSize: 12 },
  tooltip: {
    contentStyle: {
      background: "rgb(24 24 38)",
      border: "1px solid rgb(62 62 90)",
      borderRadius: 10,
      color: "rgb(238 237 247)",
      fontSize: 13,
      boxShadow: "0 18px 40px -20px rgba(0,0,0,0.9)",
    },
    labelStyle: { color: "rgb(238 237 247)", fontWeight: 700 },
    itemStyle: { color: "rgb(238 237 247)" },
    cursor: { fill: "rgba(140, 92, 255, 0.08)" },
  },
};
