// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for where the Gantt draws its "Target" label (WI-133, v0.79.1).
//
// The label sits at `topMargin − 25`. With no milestones and "Project name" unticked that put its
// baseline at y = 7 and the tops of its letters above the chart's edge. Since v0.79.1 its baseline is
// never higher than a measured floor, which moves the label only in that layout. Each straw below
// restores the old placement or a plausible half-fix, and names the cases that must go red.
//
// Usage: node scripts/falsify.mjs scripts/falsify-spec-target-label.mjs
const CHART = new URL("../src/ui/charts/GanttChart.tsx", import.meta.url).pathname;
const CONSTANTS = new URL("../src/ui/charts/gantt-constants.ts", import.meta.url).pathname;

export const testFile = "src/ui/charts/GanttChart.target-label.test.tsx";
export const mutations = [
  {
    // THE defect: no floor, so the label's top is cut off when nothing above it makes room.
    id: "S1  the floor removed",
    file: CHART,
    find: "y={Math.max(topMargin - TARGET_LABEL_DY, TARGET_LABEL_MIN_BASELINE)}",
    replace: "y={topMargin - TARGET_LABEL_DY}",
    expectFailing: /> T1 /,
  },
  {
    // The over-fix: the floor as the label's place in every layout, so a label with room moves up.
    id: "S2  the floor applied in every layout",
    file: CHART,
    find: "y={Math.max(topMargin - TARGET_LABEL_DY, TARGET_LABEL_MIN_BASELINE)}",
    replace: "y={TARGET_LABEL_MIN_BASELINE}",
    expectFailing: /> T2 |> T3 /,
  },
  {
    // A floor too small to keep the label's top inside: 11 leaves it at y = 0.5 by getBBox.
    id: "S3  the floor's value too small",
    file: CONSTANTS,
    find: "export const TARGET_LABEL_MIN_BASELINE = 12;",
    replace: "export const TARGET_LABEL_MIN_BASELINE = 11;",
    expectFailing: /> T1 /,
  },
];
