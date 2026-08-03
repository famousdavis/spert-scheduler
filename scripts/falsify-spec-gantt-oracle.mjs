// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof the Gantt parity oracle can FAIL — the audit that found it couldn't, made repeatable.
//
// ⚠️ WHY THIS EXISTS AS A COMMITTED SPEC. The 2026-08-02 audit ran as a throwaway shell
// script, which is the exact shape the campaign already ruled out once: "the runner was
// durable while its inputs lived in a scratchpad for a day." An audit nobody can re-run is
// a claim, not a check.
//
// G2 and G3 are the two paths the audit found UNPINNED — breaking either left the oracle
// 9/9 green, because the fixture supplied no calendar (and `weekendShading` defaults to
// false) and its 25-day span was too short for tick suppression to do any work. Both now
// fail it. If either stops failing, the fixture has regressed to the state that made this
// oracle claim more than it delivered.
//
// ⚠️ G1 is a SANITY probe and must stay. The first version of the audit harness reported
// `dateToX` as UNPINNED because its edit was a silent no-op — a probe built to find
// checks-that-cannot-fail exhibiting exactly that defect. A perturbation that cannot fail
// makes a weak oracle look strong.
const GU = new URL("../src/ui/charts/gantt-utils.ts", import.meta.url).pathname;

export const testFile = "src/ui/charts/gantt-parity-oracle.test.tsx";

export const mutations = [
  {
    id: "G1  dateToX +0.5  [SANITY — the oracle must be able to fail]",
    file: GU,
    find: `  return leftMargin + ratio * chartAreaWidth;`,
    replace: `  return leftMargin + ratio * chartAreaWidth + 0.5;`,
    expectFailing: /INTERACTIVE chart matches its committed geometry/,
  },
  {
    id: "G2  computeWeekendShadingRects -> []  [was UNPINNED before the audit]",
    file: GU,
    find: `  if (dateRange === 0) return [];\n  return collectNonWorkSpans(`,
    replace: `  return [];\n  return collectNonWorkSpans(`,
    expectFailing: /INTERACTIVE chart matches its committed geometry/,
  },
  // ⚠️ G5 AND G6 ARE THE GATE ON THE §3.3 DECOMPOSITION, not extra coverage.
  // The oracle authorised that refactor by pinning computeWeekendShadingRects' output.
  // After the split, logic that was inside the pinned function now lives in two units,
  // and propagation MUST NOT BE ASSUMED — a net can authorise a refactor that then moves
  // logic out of its reach. Each unit is mutated separately here. If either ever survives,
  // the decomposition has escaped the net and is not safe as written.
  {
    id: "G5  collectNonWorkSpans -> []  [decomposition gate: calendar half]",
    file: GU,
    find: `  const spans: NonWorkSpan[] = [];`,
    replace: `  return [];\n  const spans: NonWorkSpan[] = [];`,
    expectFailing: /INTERACTIVE chart matches its committed geometry/,
  },
  {
    id: "G6  spanToRect -> null  [decomposition gate: geometry half]",
    file: GU,
    find: `  const x1 = dateToX(formatDateISO(span.start), minTimestamp, dateRange, chartAreaWidth, leftMargin);`,
    replace: `  return null;\n  const x1 = dateToX(formatDateISO(span.start), minTimestamp, dateRange, chartAreaWidth, leftMargin);`,
    expectFailing: /INTERACTIVE chart matches its committed geometry/,
  },
  {
    id: "G3  suppressOverlappingTicks -> passthrough  [was UNPINNED before the audit]",
    file: GU,
    find: `  const filtered: Tick[] = [];\n  let lastX = -Infinity;`,
    replace: `  return allTicks;\n  const filtered: Tick[] = [];\n  let lastX = -Infinity;`,
    expectFailing: /long-span INTERACTIVE chart matches its committed geometry/,
  },
  {
    id: "G4  longDateLabel -> constant string",
    file: GU,
    find: `export function longDateLabel(dateStr: string): string {`,
    replace: `export function longDateLabel(dateStr: string): string { return "XX";`,
    expectFailing: /INTERACTIVE chart matches its committed geometry/,
  },
];
