// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for where the Cumulative Distribution chart draws its labels (WI-127, v0.78.1).
//
// Before v0.78.1 the project-target label sat to the RIGHT of the plot, in the svg's 30 px margin, so
// "P95 = 145.3 days" showed as "P95"; and the Finish-by label ended just left of its line, so a line
// near the left edge cut the label's first characters. Each label now sits in one of the two empty corners
// of the plot (the CDF climbs from bottom-left to top-right). Each straw below restores one wrong placement
// — the old one, or a plausible half-fix — and names the cases that must go red.
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-cdf-labels.mjs
const CHART = new URL("../src/ui/charts/CDFChart.tsx", import.meta.url).pathname;

export const testFile = "src/ui/charts/CDFChart.labels.test.tsx";
export const mutations = [
  {
    id: "S1  the Finish-by label is always at the bottom, left of its line",
    file: CHART,
    find: '? "insideTopLeft" : "insideBottomRight"',
    replace: '? "insideBottomRight" : "insideBottomRight"',
    expectFailing: /> T1 /,
  },
  {
    id: "S2  the Finish-by label is always at the top, right of its line",
    file: CHART,
    find: '? "insideTopLeft" : "insideBottomRight"',
    replace: '? "insideTopLeft" : "insideTopLeft"',
    expectFailing: /> T2 |> T3 /,
  },
  {
    // The boundary: a line at exactly the middle of the range belongs to the second half.
    id: "S3  a Finish-by line at the exact middle counts as the first half",
    file: CHART,
    find: "targetDuration < (lo + hi) / 2",
    replace: "targetDuration <= (lo + hi) / 2",
    expectFailing: /> T3 /,
  },
  {
    // The pre-v0.78.1 placement, kept for a later line: left of it, but at the TOP, where the curve is.
    id: "S4  a later Finish-by line keeps the old top-right placement",
    file: CHART,
    find: '"insideTopLeft" : "insideBottomRight";',
    replace: '"insideTopLeft" : "insideTopRight";',
    expectFailing: /> T2 |> T3 /,
  },
  {
    // THE defect: the label drawn in the margin, past the svg's clipped right edge.
    id: "S5  the project-target label is back to the right of the plot",
    file: CHART,
    find: 'position: probabilityTarget >= 0.5 ? "insideTopRight" : "insideBottomRight",',
    replace: 'position: "right",',
    expectFailing: /> T4 |> T5 /,
  },
  {
    id: "S6  the project-target label is always below its line",
    file: CHART,
    find: '>= 0.5 ? "insideTopRight" : "insideBottomRight"',
    replace: '>= 0.5 ? "insideTopRight" : "insideTopRight"',
    expectFailing: /> T5 /,
  },
  {
    id: "S7  the project-target label is always above its line",
    file: CHART,
    find: '>= 0.5 ? "insideTopRight" : "insideBottomRight"',
    replace: '>= 0.5 ? "insideBottomRight" : "insideBottomRight"',
    expectFailing: /> T4 /,
  },
];
