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
    // ⚠️ THE PIN THAT MOVED IN v0.63.0. Through v0.62.2 this mutation reworded the
    // KNOWN-WRONG estimates advice; now it REVERTS THE FIX — deleting the cycle branch
    // sends a cycle back to the generic branch and its estimates advice. The named test
    // must fail, which is what makes "behaviour changed as intended" a demonstrated claim
    // rather than an asserted one.
    id: "I1  the cycle branch is removed — a cycle falls back to estimates advice",
    file: BANNER,
    find: `  if (error.isCycleError) {`,
    replace: `  if (false) {`,
    expectFailing: /a cycle gets dependency advice/,
  },
  {
    // The cycle branch present but pointing at the wrong place again.
    id: "I2  the cycle advice is reworded back towards estimates",
    file: BANNER,
    find: `        "Two or more activities depend on each other in a loop. Open the Dependencies panel and remove one of the links in the loop.",`,
    replace: `        "Check the affected activity's estimates and settings.",`,
    expectFailing: /a cycle gets dependency advice/,
  },
  {
    // The typed error is what the branch keys on; an untyped throw silently restores the
    // old behaviour without touching the banner at all.
    id: "I2b the cycle error is thrown untyped again",
    file: GRAPH,
    find: `    throw new DependencyCycleError(`,
    replace: `    throw new Error(`,
    expectFailing: /a cycle gets dependency advice/,
  },
  {
    // The calendar branch must stay distinguishable from the generic one; if the predicate
    // stops being consulted, both branches collapse and the pins stop meaning anything.
    //
    // ⚠️ NEEDLE REPAIRED in v0.71.3. It read `return error.isCalendarError`, which is the shape
    // this helper had BEFORE v0.63.0 added the cycle branch and turned the ternary into a chain
    // of `if`s. From then until now the needle matched nothing, so I3 ABORTED the run and I4
    // never executed at all — this spec had been guarding three mutations, not five, and said so
    // only to whoever ran it. Verified stale at 118f678 (an unmodified checkout aborts here
    // identically), so it was not the WI-15 change that broke it.
    //
    // The abort is the runner working as designed: it refuses to report rather than counting a
    // no-op edit as a survivor. That is the one defect class this tool was committed to prevent,
    // and it is why the staleness surfaced at all instead of reading as a passing guard.
    id: "I3  the calendar branch is never taken",
    file: BANNER,
    find: `  if (error.isCalendarError) {`,
    replace: `  if (false) {`,
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
