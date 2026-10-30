// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the Gantt axis naming every year it spans.
//
// Each straw undoes one piece of the change and names EXACTLY the tests it must fail, and no
// others — read "K failing; named-match K", not merely a non-zero exit: the runner prints ✔ when
// ANY named test fails. Each expected set is written here before the run, never inferred from it.
//
// testFile is all of src/, so one run also reaches the parity oracle, the collision test and every
// other test that renders a Gantt chart.
//
// ⚠️ G9 AND G10 ARE THE SAME CHART. Returning plain suppression at once (G9) and never moving a
// year to a later tick (G10) both leave the axis exactly as plain suppression draws it, so their
// sets are identical by construction. Both are kept: they break different lines of code.
const GU = new URL("../src/ui/charts/gantt-utils.ts", import.meta.url).pathname;
const PRINT = new URL("../src/ui/charts/PrintGanttChart.tsx", import.meta.url).pathname;
const LAYOUT = new URL("../src/ui/hooks/use-gantt-layout.ts", import.meta.url).pathname;

// gantt-parity-oracle.test.tsx
const ORACLE_INTERACTIVE = "the INTERACTIVE chart matches its committed geometry";
const ORACLE_PRINT = "the PRINT chart matches its committed geometry";
const ORACLE_LONG_INTERACTIVE = "the long-span INTERACTIVE chart matches its committed geometry";
const ORACLE_LONG_PRINT = "the long-span PRINT chart matches its committed geometry";
const ORACLE_CROWDED_INTERACTIVE = "the crowded INTERACTIVE chart matches its committed geometry";
const ORACLE_CROWDED_PRINT = "the crowded PRINT chart matches its committed geometry";

// gantt-axis-years.test.tsx — the seven conditions of each sweep, after and before a simulation run.
const CONDITIONS = [
  "interactive 1280 (container 1180), fit OFF",
  "interactive 1280 (container 1180), fit ON",
  "interactive 853 (container 769), fit OFF",
  "interactive 853 (container 769), fit ON",
  "interactive 1280, fit ON, today inside the span",
  "print",
  "print, today inside the span",
];
const SIMULATED = CONDITIONS.map((c) => `${c} — names every year it spans`);
// Before a simulation run, since WI-107 (v0.79.34): six conditions name every year, an end year only a milestone
// reaches included; 853 with Fit on still leaves that year to the finish label, under the old title.
const END_YEAR_STILL_HELD_OFF = "interactive 853 (container 769), fit ON";
const UNSIMULATED = CONDITIONS.map((c) =>
  c === END_YEAR_STILL_HELD_OFF
    ? `${c} — names every year but an end year only a milestone reaches`
    : `${c} — names every year it spans, an end year only a milestone reaches included`,
);
const NARROW = "interactive, container 640, fit ON, today inside the span — names every year but the one before today's, under the today line";
// Renamed in WI-107 (v0.79.34): its "middle year with no room" (28 starts) went with the milestone obstacle.
const NARROWEST = "interactive, container 640, wide name column, fit ON, today inside the span — names every year but the one before today's, under the today line";
const DECEMBER_IN_JANUARY = [
  "interactive 1280 (container 1180), fit OFF, today 20 days in — names every year but a December start's, under the today line",
  "print, today 20 days in — names every year but a December start's, under the today line",
];
const LONG = [
  "quarterly ticks, interactive 1280 (container 1180), fit ON — names every year it spans",
  "quarterly ticks, print — names every year it spans",
  "half-yearly ticks, interactive 1280 (container 1180), fit ON — names every year it spans",
  "half-yearly ticks, print — names every year it spans",
];
const NAMED_PRINT_OCT = "print, start 2026-10-05, today the day before: 2027 is named on a tick";
const NAMED_853_NOV = "853 fit ON, start 2026-11-02, today the day before: 2027 is named on a tick";
const NAMED_1280_SEP = "1280 fit ON, start 2026-09-07, today 2026-10-05: 2026 settles on December, not on the tick beside today";
const NAMED_PRINT_AUG = "print, start 2026-08-17, today 2026-09-14: 2026 is named on a tick the today line leaves clear";
const NAMED_PRINT_DEC = "print, start 2026-12-07, today the day before: the first tick is the start, Dec '26";
const NAMED_1280_DEC = "1280 fit ON, start 2026-12-07, today the day before: the first tick is the start, Dec '26";
const NAMED_PRINT_XL = "print at the largest activity font: a two-digit-day finish label ends inside the chart";
const TODAY_HIDDEN = "hidden: it evicts no tick, so the first tick keeps its year";
const BORN_WITH_YEAR = "never draws a tick the generator gave a year without one";
const CLAMP_PAST_EDGE = "slides a label that would pass the edge so it ends exactly edgePx inside";
const TICK_DECEMBER = "monthly, a December start: the first tick is the start, Dec '26";
const TICK_OCTOBER = "quarterly, an October start: the first tick is the start, Q4 '26";
const TICK_JULY = "half-yearly, a July start: the first tick is the start, H2 '26";

// gantt-milestone-name-edge.test.tsx (WI-99, v0.79.5) — a milestone name slides inside the edge by the same clamp.
const NAME_EDGE = [
  "E1 a long name on the furthest date ends 4px inside: 900 − 4 − 92.34; its diamond, line and date stay at 860",
  "E4 a neighbour the slid name would overlap goes on the other row, 18px apart",
  "P1 default font: a long name on the furthest date at 700 − 2 − 38.475; its diamond and date at 680",
  "P2 the \"xl\" activity font (7px): at 700 − 2 − 53.865",
  "P3 a neighbour the slid name would overlap goes on the other row, 10px apart",
];

// gantt-label-beside-milestone.test.tsx (WI-107) — print's diamond and dashed line at each activity font size.
const PRINT_GEOMETRY_ROWS = [
  ["small", "1.5", "2.5"], ["normal", "1.5", "2.5"], ["large", "1.8", "2.2"], ["xl", "2.1", "1.9"],
].flatMap(([size, top, line]) => [
  `print, ${size} activity font: the diamond's top point is ${top}px below the tick labels' baseline`,
  `print, ${size} activity font: the dashed line starts ${line}px below the diamond's top`,
]);

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

/**
 * Plain suppression: every sweep, both long-span oracle charts, six named charts.
 * The two December-in-January sweeps fail too, though not on December: today in December takes a
 * November or early-December start's `Jan 'YY`, and plain suppression cannot move that year on.
 * The narrowest sweep joined in WI-107 (v0.79.34), when it stopped expecting a middle year missed.
 */
const PLAIN_SUPPRESSION = only(
  ORACLE_LONG_INTERACTIVE, ORACLE_LONG_PRINT, ...SIMULATED, ...UNSIMULATED, NARROW, NARROWEST, ...DECEMBER_IN_JANUARY, ...LONG,
  NAMED_PRINT_OCT, NAMED_853_NOV, NAMED_1280_SEP, NAMED_PRINT_AUG, NAMED_PRINT_DEC, NAMED_1280_DEC,
);

export const testFile = "src/";
export const mutations = [
  {
    id: "G9  suppressTicksNamingEveryYear returns plain suppression at once  [expect 30: 2 oracle, 7 + 7 sweeps, narrow, narrowest, 2 December-in-January, 4 long, 6 named]",
    file: GU,
    find: `  if (!allTicks.some((t) => t.label.includes(" '"))) return suppressOverlappingTicks(allTicks, p);\n`,
    replace: "  return suppressOverlappingTicks(allTicks, p);\n",
    expectFailing: PLAIN_SUPPRESSION,
  },
  {
    id: "G10 advanceDroppedCarriers never moves a year  [expect 30: G9's set]",
    file: GU,
    find: "  const keptX = new Set(kept.map((t) => t.x));\n",
    replace: "  return false;\n  const keptX = new Set(kept.map((t) => t.x));\n",
    expectFailing: PLAIN_SUPPRESSION,
  },
  {
    // The label is centred on its line again. Print's clamp only engages at the largest font.
    // ⚠️ Its set went stale at v0.79.5: WI-99 slides a milestone name inside the edge with this same clamp, and its five
    // edge tests fail too. Re-measured alone at WI-107 (v0.79.34), which changes nothing the clamp reaches.
    id: "G11 clampFinishLabelX returns finishX  [expect 10: 3 INTERACTIVE oracle, the clamp past the edge, print XL, 5 milestone-name edge tests]",
    file: GU,
    find: "  return Math.min(finishX, rightEdge - edgePx - halfWidth);",
    replace: "  return finishX;",
    expectFailing: only(ORACLE_INTERACTIVE, ORACLE_LONG_INTERACTIVE, ORACLE_CROWDED_INTERACTIVE, CLAMP_PAST_EDGE, NAMED_PRINT_XL, ...NAME_EDGE),
  },
  {
    // Nothing in the axis tests reads the diamond; the oracle's two milestone-bearing print charts do, and since
    // WI-107 (v0.79.34) the eight print geometry rows of gantt-label-beside-milestone.test.tsx.
    id: "G12 print's milestone diamond back at topMargin - 2  [expect 10: PRINT, crowded PRINT oracle, 8 print geometry rows]",
    file: PRINT,
    find: "points={`${x},${cy - ds} ${x + ds},${cy} ${x},${cy + ds} ${x - ds},${cy}`}",
    replace: "points={`${x},${topMargin - 2 - ds} ${x + ds},${topMargin - 2} ${x},${topMargin - 2 + ds} ${x - ds},${topMargin - 2}`}",
    expectFailing: only(ORACLE_PRINT, ORACLE_CROWDED_PRINT, ...PRINT_GEOMETRY_ROWS),
  },
  {
    // A hidden today line evicts ticks again. Every sweep draws the line, so only the hidden case sees it.
    id: "G13 the interactive today obstacle ignores showToday  [expect 1: the hidden today line]",
    file: LAYOUT,
    find: "    if (showToday && todayX !== null) {",
    replace: "    if (todayX !== null) {",
    expectFailing: only(TODAY_HIDDEN),
  },
  {
    // The obstacle still uses the clamped label, so only where the label is DRAWN changes: at the
    // default font print's clamp never engages, and only the largest font sees it.
    id: "G14 print draws its finish label on the line again  [expect 1: print XL]",
    file: PRINT,
    find: "<text x={finishLabel.x}",
    replace: "<text x={finishX}",
    expectFailing: only(NAMED_PRINT_XL),
  },
  {
    // No tick at the start. A December start viewed in January loses that year to the today line
    // either way, so both narrow sweeps and both December-in-January sweeps keep their counts.
    id: "G15 withStartYearTick returns the ticks unchanged  [expect 23: 3 generateTicks, 7 + 7 sweeps, 4 long, 2 December charts]",
    file: GU,
    find: "  if (!p || (ticks[0] && ticks[0].x.slice(0, 4) === String(start.getFullYear()))) return ticks;\n",
    replace: "  return ticks;\n",
    expectFailing: only(
      TICK_DECEMBER, TICK_OCTOBER, TICK_JULY, ...SIMULATED, ...UNSIMULATED, ...LONG, NAMED_PRINT_DEC, NAMED_1280_DEC,
    ),
  },
  {
    // A year's first tick, left behind when its year moved on, is drawn bare. It names nothing,
    // so no sweep moves; the property and the two charts that show one do.
    id: "G16 a tick born with a year may be drawn without it  [expect 3: the property, 2026-09-07 and 2026-12-07 at 1280]",
    file: GU,
    find: "  return kept.filter((t) => tickHasYear(t.label) || !bornWithYear.has(t.x));",
    replace: "  return kept;",
    expectFailing: only(BORN_WITH_YEAR, NAMED_1280_SEP, NAMED_1280_DEC),
  },
];
