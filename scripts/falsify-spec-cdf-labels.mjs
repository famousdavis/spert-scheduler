// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for where the Cumulative Distribution chart draws its labels (WI-127, v0.78.1 and v0.78.2).
//
// Before v0.78.1 the project-target label sat to the RIGHT of the plot, in the svg's 30 px margin, so
// "P95 = 145.3 days" showed as "P95"; and the Finish-by label ended just left of its line, so a line
// near the left edge cut the label's first characters. The project-target label now sits inside the plot's
// right end. A Finish-by line before the middle of the range takes its label at the top, to its right; a line
// at or past the middle, at the top, to its left — unless the project target is P96 or higher, when the label
// goes to the bottom (v0.78.2). Each straw below restores one wrong placement — an old one, or a plausible
// half-fix — and names the cases that must go red.
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-cdf-labels.mjs
const CHART = new URL("../src/ui/charts/CDFChart.tsx", import.meta.url).pathname;

export const testFile = "src/ui/charts/CDFChart.labels.test.tsx";
export const mutations = [
  {
    id: "S1  the Finish-by label is always at the bottom, left of its line",
    file: CHART,
    find: "position: targetLabelPosition(targetDuration, data, probabilityTarget),",
    replace: 'position: "insideBottomRight",',
    expectFailing: /> T1 |> T2 |> T3 |> T8 /,
  },
  {
    id: "S2  the Finish-by label is always at the top, right of its line",
    file: CHART,
    find: "position: targetLabelPosition(targetDuration, data, probabilityTarget),",
    replace: 'position: "insideTopLeft",',
    expectFailing: /> T2 |> T3 |> T6 |> T7 /,
  },
  {
    // The boundary: a line at exactly the middle of the range belongs to the second half.
    id: "S3  a Finish-by line at the exact middle counts as the first half",
    file: CHART,
    find: "targetDuration < (lo + hi) / 2",
    replace: "targetDuration <= (lo + hi) / 2",
    expectFailing: /> T3 |> T7 /,
  },
  {
    // v0.78.1's rule: every label at or past the middle at the bottom, whatever the project target.
    id: "S4  a later Finish-by label is at the bottom whatever the project target",
    file: CHART,
    find: ': "insideTopRight";',
    replace: ': "insideBottomRight";',
    expectFailing: /> T2 |> T3 /,
  },
  {
    // The pre-v0.78.1 rule: every label at or past the middle at the top, even where the target's label rises into it.
    id: "S5  a later Finish-by label is at the top whatever the project target",
    file: CHART,
    find: '>= 96 ? "insideBottomRight"',
    replace: '>= 96 ? "insideTopRight"',
    expectFailing: /> T6 |> T7 /,
  },
  {
    // The threshold's boundary: P96 itself moves the label down.
    id: "S6  a project target of exactly P96 keeps a later label at the top",
    file: CHART,
    find: "* 100) >= 96",
    replace: "* 100) > 96",
    expectFailing: /> T6 /,
  },
  {
    // THE defect: the label drawn in the margin, past the svg's clipped right edge.
    id: "S7  the project-target label is back to the right of the plot",
    file: CHART,
    find: 'position: probabilityTarget >= 0.5 ? "insideTopRight" : "insideBottomRight",',
    replace: 'position: "right",',
    expectFailing: /> T4 |> T5 /,
  },
  {
    id: "S8  the project-target label is always below its line",
    file: CHART,
    find: '>= 0.5 ? "insideTopRight" : "insideBottomRight"',
    replace: '>= 0.5 ? "insideTopRight" : "insideTopRight"',
    expectFailing: /> T5 /,
  },
  {
    id: "S9  the project-target label is always above its line",
    file: CHART,
    find: '>= 0.5 ? "insideTopRight" : "insideBottomRight"',
    replace: '>= 0.5 ? "insideBottomRight" : "insideBottomRight"',
    expectFailing: /> T4 /,
  },
];
