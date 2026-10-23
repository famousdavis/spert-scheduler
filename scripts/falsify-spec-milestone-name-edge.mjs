// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for where the Gantt draws a milestone's NAME (WI-99, v0.79.5).
//
// A name was centred on its diamond, so a long one on the chart's furthest date ran past the
// svg's right edge and was cut off. Since v0.79.5 each name's centre is slid left by the finish
// label's rule (`clampFinishLabelX`) just far enough to stay inside, the header rows are assigned
// where the names are drawn, and the diamond, its line and its date stay put. Each straw below
// restores the old placement or a plausible half-fix, and names the cases that must go red.
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-milestone-name-edge.mjs
const LAYOUT = new URL("../src/ui/hooks/use-gantt-layout.ts", import.meta.url).pathname;
const CHART = new URL("../src/ui/charts/GanttChart.tsx", import.meta.url).pathname;
const PRINT = new URL("../src/ui/charts/PrintGanttChart.tsx", import.meta.url).pathname;

export const testFile = "src/ui/charts/gantt-milestone-name-edge.test.tsx";
export const mutations = [
  {
    // THE defect on screen: the name drawn on its diamond again.
    id: "S1  the screen name drawn on its diamond",
    file: CHART,
    find: "x={milestoneNameXs[msIndex] ?? mx}",
    replace: "x={mx}",
    expectFailing: /> (?:E1|E4) /, // observed alone: E1, E4
  },
  {
    // THE defect in print: the name drawn on its diamond again.
    id: "S2  the print name drawn on its diamond",
    file: PRINT,
    find: "<text x={milestoneNameXs[msIndex] ?? x}",
    replace: "<text x={x}",
    expectFailing: /> (?:P1|P2|P3) /, // observed alone: P1, P2, P3
  },
  {
    // The half-fix on screen: names slide, but the rows are still assigned from the diamonds,
    // so a slid name lands on top of a neighbour the old rule had cleared.
    id: "S3  screen rows assigned from the diamonds' x",
    file: LAYOUT,
    find: "x: milestoneNameXs[i] ?? 0,",
    replace: "x: milestoneXPositions[i] ?? 0,",
    expectFailing: /> (?:E4) /, // observed alone: E4
  },
  {
    // The same half-fix in print.
    id: "S4  print rows assigned from the diamonds' x",
    file: PRINT,
    find: "x: milestoneNameXs[i] ?? 0,",
    replace: "x: milestoneXPositions[i] ?? 0,",
    expectFailing: /> (?:P3) /, // observed alone: P3
  },
  {
    // The over-fix: the date follows the name, so the date leaves its diamond.
    id: "S5  the screen date drawn at the name's centre",
    file: CHART,
    find: "x={mx}\n                  y={topMargin - MILESTONE_DATE_DY}",
    replace: "x={milestoneNameXs[msIndex] ?? mx}\n                  y={topMargin - MILESTONE_DATE_DY}",
    expectFailing: /> (?:E1) /, // observed alone: E1
  },
  {
    // The over-fix: every name pushed against the edge, whether it fits on its diamond or not.
    id: "S6  every screen name slid against the edge",
    file: LAYOUT,
    find: "clampFinishLabelX(\n          x,\n",
    replace: "clampFinishLabelX(\n          Infinity,\n",
    expectFailing: /> (?:E2|E3|E4) /, // observed alone: E2, E3, E4
  },
  {
    // S5 in print: the date follows the name, so the printed date leaves its diamond.
    id: "S7  the print date drawn at the name's centre",
    file: PRINT,
    find: "<text x={x} y={topMargin - PRINT_MILESTONE_DATE_DY}",
    replace: "<text x={milestoneNameXs[msIndex] ?? x} y={topMargin - PRINT_MILESTONE_DATE_DY}",
    expectFailing: /> (?:P1|P2) /, // observed alone: P1, P2
  },
];
