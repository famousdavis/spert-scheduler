// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the chart text WI-102 made readable (v0.79.3; bar labels v0.79.4).
//
// A Gantt bar's label is white on every bar, on screen, in copies and in print, and every colour preset's bars are dark
// enough for white to read at least 4.5:1 on them (v0.79.4, the owner's option B — v0.79.3's black-or-white label was
// reversed, and its six straws on it replaced by S1–S4); the Gantt's milestone names, dates and "Target" are a readable
// shade of their marker's colour where the chart is white and their own colour on the dark chart; the histogram's
// Mean, Buffer and P95 labels, the cumulative distribution chart's axis titles, P95 label and "Finish by" readout, the
// comparison chart's scenario names and axis title, and the printed legend's "Date prepared" each read at least 4.5:1
// on their ground. Each straw below restores one old colour, or a plausible half-fix, and names the tests that must go
// red — observed one straw at a time against the whole suite before this file was written (2026-10-22).
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-chart-contrast.mjs
const src = (p) => new URL(`../src/${p}`, import.meta.url).pathname;
const UTILS = src("ui/charts/gantt-utils.ts");
const ROW = src("ui/charts/GanttActivityRow.tsx");
const PRINT = src("ui/charts/PrintGanttChart.tsx");
const HISTOGRAM = src("ui/charts/HistogramChart.tsx");
const CDF = src("ui/charts/CDFChart.tsx");
const COMPARE = src("ui/charts/CDFComparisonChart.tsx");
const PRINT_SECTIONS = src("ui/components/print-sections.tsx");
const CONSTANTS = src("ui/charts/gantt-constants.ts");
const PANEL = src("ui/components/SimulationPanel.tsx");

/** The screen's bar label fill — the glyph "C" below it is also #ffffff, so the needle carries the line above. */
const BAR_LABEL_FILL = 'fontSize={ra.barLabelFontSize}\n' + " ".repeat(22) + 'fill="#ffffff"';

export const testFile = "src/";
export const mutations = [
  {
    id: "S1  the Gantt's bar label is drawn black again",
    file: ROW,
    find: BAR_LABEL_FILL,
    replace: 'fontSize={ra.barLabelFontSize}\n' + " ".repeat(22) + 'fill="#000000"',
    expectFailing: /> G2 |> G3 |> G4 /,
  },
  {
    // v0.79.3's rule, inline: black where black contrasts more with the bar's fill (WCAG 2.x), else white.
    id: "S2  the Gantt's bar label is chosen by contrast again",
    file: ROW,
    find: BAR_LABEL_FILL,
    replace:
      'fontSize={ra.barLabelFontSize}\n' + " ".repeat(22) +
      "fill={((l) => ((l + 0.05) / 0.05 > 1.05 / (l + 0.05) ? \"#000000\" : \"#ffffff\"))([1, 3, 5].reduce((sum, at, i) => " +
      "{ const s = parseInt(geo.barColor.slice(at, at + 2), 16) / 255; " +
      "return sum + [0.2126, 0.7152, 0.0722][i] * (s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4); }, 0))}",
    expectFailing: /> G2 |> G3 |> G4 /,
  },
  {
    id: "S3  the printed Gantt's bar label is not white",
    file: PRINT,
    find: 'fontSize={ra.printBarLabelFontSize} fill="#fff"',
    replace: 'fontSize={ra.printBarLabelFontSize} fill="#000"',
    expectFailing: /> G4 /,
  },
  {
    id: "S4  Classic's light planned bar is its v0.79.3 blue again",
    file: CONSTANTS,
    find: 'light: { barPlanned: "#3473da",',
    replace: 'light: { barPlanned: "#3b82f6",',
    expectFailing: /> G1 /,
  },
  {
    id: "S7  milestone and Target text is not darkened on white",
    file: UTILS,
    find: "return isDark ? color : readableOnWhite(color);",
    replace: "return color;",
    // Also two of gantt-milestone-marker-color's own tests: the screen's name no longer maps to its diamond.
    expectFailing: /> G5 |> G6 |> G8 |> the interactive Gantt: green, amber and red by health|> PARITY: both charts colour every milestone the same/,
  },
  {
    id: "S8  milestone and Target text is darkened on the dark chart too",
    file: UTILS,
    find: "return isDark ? color : readableOnWhite(color);",
    replace: "return readableOnWhite(color);",
    expectFailing: /> G5 |> G6 |> G8 /,
  },
  {
    id: "S9  the printed milestone name and date are drawn in the health colour again",
    file: PRINT,
    find: 'fontSize={fs5} fill={readableOnWhite(healthColor)} fontWeight="600">',
    replace: 'fontSize={fs5} fill={healthColor} fontWeight="600">',
    also: { find: "fontSize={fs4} fill={readableOnWhite(healthColor)}>", replace: "fontSize={fs4} fill={healthColor}>" },
    // Also two of gantt-milestone-marker-color's own tests: the printed name no longer maps to its diamond.
    expectFailing: /> G7 |> the printed Gantt: green, amber and red by health|> PARITY: both charts colour every milestone the same/,
  },
  {
    id: "S10 the printed \"Target\" is drawn in the health colour again",
    file: PRINT,
    find: 'fontSize={fs5} fontWeight="500" fill={readableOnWhite(color)}>',
    replace: 'fontSize={fs5} fontWeight="500" fill={color}>',
    expectFailing: /> G9 /,
  },
  {
    id: "S11 the histogram's light and dark label colours swapped",
    file: HISTOGRAM,
    find: "return isDark ? LABEL_TEXT.dark : LABEL_TEXT.light;",
    replace: "return isDark ? LABEL_TEXT.light : LABEL_TEXT.dark;",
    expectFailing: /> H1 /,
  },
  {
    id: "S12 the cumulative chart's x-axis title loses its fill",
    file: CDF,
    find: "offset: -5, fontSize: 12, fill: labelFill }}",
    replace: "offset: -5, fontSize: 12 }}",
    expectFailing: /> D1 /,
  },
  {
    id: "S13 the cumulative chart's y-axis title loses its fill",
    file: CDF,
    find: 'position: "insideLeft", fontSize: 12, fill: labelFill }}',
    replace: 'position: "insideLeft", fontSize: 12 }}',
    expectFailing: /> D1 /,
  },
  {
    id: "S14 the cumulative chart's P95 label loses its fill",
    file: CDF,
    find: "fill: labelFill,",
    replace: "",
    expectFailing: /> D1 /,
  },
  {
    id: "S15 the comparison chart's names are drawn in their lines' colours again",
    file: COMPARE,
    find: "formatter={legendName}",
    replace: "",
    expectFailing: /> K1 /,
  },
  {
    id: "S16 the comparison chart's axis title loses its fill",
    file: COMPARE,
    find: "fontSize: 12, fill: AXIS_TICK_FILL_LIGHT }}",
    replace: "fontSize: 12 }}",
    expectFailing: /> K2 /,
  },
  {
    id: "S17 the printed comparison chart's axis title loses its fill",
    file: PRINT_SECTIONS,
    find: "fontSize: 12, fill: axisTick(false).fill }}",
    replace: "fontSize: 12 }}",
    expectFailing: /> K3 /,
  },
  {
    id: "S18 the Finish-by colour ignores the theme",
    file: PANEL,
    find: "const c = isDark ? HEALTH_COLORS.dark : HEALTH_COLORS.light;",
    replace: "const c = HEALTH_COLORS.light;",
    expectFailing: /> F1 |> F2 /,
  },
  {
    id: "S19 the Finish-by colours are the old #16a34a / #f59e0b / #dc2626 in both themes",
    file: PANEL,
    find: 'light: { green: "#15803d", amber: "#b45309", red: "#dc2626" },',
    replace: 'light: { green: "#16a34a", amber: "#f59e0b", red: "#dc2626" },',
    also: {
      find: 'dark: { green: "#4ade80", amber: "#f59e0b", red: "#f87171" },',
      replace: 'dark: { green: "#16a34a", amber: "#f59e0b", red: "#dc2626" },',
    },
    expectFailing: /> F1 |> F2 /,
  },
  {
    id: "S20 the printed \"Date prepared\" is text-gray-400 again",
    file: PRINT,
    find: '<span className="ml-auto text-gray-500">',
    replace: '<span className="ml-auto text-gray-400">',
    expectFailing: /> G10 /,
  },
];
