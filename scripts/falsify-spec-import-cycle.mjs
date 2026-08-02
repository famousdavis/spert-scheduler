// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the import-cycle characterisation tests (§3.5, Phase 1).
//
// These are RECORDED-NOT-SPECIFIED pins over behaviour that is about to change, which makes
// falsifying them more important than usual, not less: a pin that cannot fail will not
// notice the fix either, and PR 2's claim of "behaviour changed as intended" rests entirely
// on these going red when it lands.
//
// Two of the mutations target the BANNER, because that is the pin most at risk of being
// vacuous — an earlier draft recomputed the heading/advice from `isCalendarError` inside the
// test and therefore asserted only its own arithmetic.
const BANNER = new URL("../src/ui/helpers/schedule-error-banner.ts", import.meta.url).pathname;
const GRAPH = new URL("../src/core/schedule/dependency-graph.ts", import.meta.url).pathname;

export const testFile = "src/integration/import-cycle-characterisation.test.ts";
export const mutations = [
  {
    // If the advice string drifts, the KNOWN-WRONG pin must notice. This is the mutation
    // that proves the pin is attached to the app's function and not to a copy of it.
    id: "I1  the non-calendar advice is reworded",
    file: BANNER,
    find: `        advice: "Check the affected activity's estimates and settings.",`,
    replace: `        advice: "Check the dependency graph.",`,
    expectFailing: /KNOWN WRONG/,
  },
  {
    // The heading, likewise — and this one would be the first casualty of a careless
    // third branch that changed the shape for every non-calendar error.
    id: "I2  the non-calendar heading is reworded",
    file: BANNER,
    find: `        heading: "Schedule Error",`,
    replace: `        heading: "Dependency Error",`,
    expectFailing: /KNOWN WRONG/,
  },
  {
    // The calendar branch must stay distinguishable from the generic one; if the predicate
    // stops being consulted, both branches collapse and the pins stop meaning anything.
    id: "I3  the calendar branch is never taken",
    file: BANNER,
    find: `  return error.isCalendarError`,
    replace: `  return false`,
    expectFailing: /calendar branch is unaffected/,
  },
  {
    // The premise that gives every other assertion its meaning. If a self-loop started
    // throwing, "imports cleanly then schedules fine" would be false and the contrast
    // fixture would be testing nothing.
    // ⚠️ NEEDLE EXTENDED WITH CONTEXT ON PURPOSE. The bare self-edge line appears TWICE
    // (populateAdjacency and buildAdjacencyForCycle) — the identical pair that produced
    // three false survivors before `checkNeedleUnique` existed. The trailing line
    // disambiguates to the graph-building copy. checkNeedleUnique aborts if it does not.
    id: "I4  a self-edge is no longer skipped, so a self-loop becomes a cycle",
    file: GRAPH,
    find: `    if (dep.fromActivityId === dep.toActivityId) continue;\n\n    predecessors.get(dep.toActivityId)!.push({`,
    replace: `\n    predecessors.get(dep.toActivityId)!.push({`,
    expectFailing: /genuinely cyclic|schedule and simulate without complaint/,
  },
];
