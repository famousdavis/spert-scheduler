// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Perturbation audit for the deterministic oracle — the last of the four to get one.
//
// ⚠️ WHY IT WAS MISSING, AND WHY THE EXISTING ARGUMENT WAS NOT ENOUGH.
// PRACTICES.md's realistic-data entry records that `deterministic-oracle.json` carries 11
// `constraintType` entries, so its fixtures were hand-built rather than drawn from the
// sample project — and concludes it escapes the realistic-data blind spot. That is sound
// and it addresses exactly ONE failure mode. **An argument that an oracle avoids one
// failure mode is not a perturbation audit.** Until this file existed, nobody had broken
// each path this oracle claims to cover and confirmed it notices. The gantt parity oracle
// also looked fine by inspection, and was pinning none of its calendar-dependent geometry.
//
// WHAT "THE PATHS IT CLAIMS TO COVER" MEANS HERE. The oracle's fixture matrix is built in
// seven labelled groups (dependency types × lag signs, topologies, constraints × modes,
// forced violations, milestone floors, percentiles, calendars/progress). Each mutation
// below breaks ONE of those claims and names the specific fixture that must catch it — so
// this file asserts not merely that *something* fails, but that the fixture built for that
// path is the one doing the work.
//
// ⚠️ D1 IS A SANITY PROBE AND MUST STAY. A perturbation that cannot fail makes a weak
// oracle look strong; the gantt audit's first harness reported UNPINNED because its edit
// was a silent no-op. D1 shifts every duration by one day, so if D1 ever stops failing the
// harness is broken, not the oracle.
//
// Run: node scripts/falsify.mjs scripts/falsify-spec-deterministic-oracle.mjs
const DET = new URL("../src/core/schedule/deterministic.ts", import.meta.url).pathname;

export const testFile = "src/core/schedule/deterministic-oracle.test.ts";

export const mutations = [
  {
    id: "D1  every duration +1  [SANITY — the oracle must be able to fail]",
    file: DET,
    find: `  const base = Math.max(1, Math.ceil(dist.inverseCDF(percentile)));`,
    replace: `  const base = Math.max(1, Math.ceil(dist.inverseCDF(percentile))) + 1;`,
    expectFailing: /matches the pinned output: single activity/,
  },

  // ---- group 6: percentile actually moves durations -----------------------
  {
    id: "D2  percentile ignored (always P50)",
    file: DET,
    find: `  const base = Math.max(1, Math.ceil(dist.inverseCDF(percentile)));`,
    replace: `  const base = Math.max(1, Math.ceil(dist.inverseCDF(0.5)));`,
    expectFailing: /matches the pinned output: percentile 0\.1 over spread estimates/,
  },

  // ---- group 7: completed / in-progress actuals ---------------------------
  {
    id: "D3  completed actualDuration ignored",
    file: DET,
    find: `  if (activity.status === "complete" && activity.actualDuration != null) {\n    return activity.actualDuration;\n  }`,
    replace: `  if (false && activity.actualDuration != null) {\n    return activity.actualDuration;\n  }`,
    expectFailing: /matches the pinned output: completed and in-progress activities/,
  },
  // ⚠️ D4 IS COMMENTED OUT BECAUSE IT FOUND SOMETHING — see "UNPINNED" at the
  // foot of this file. Deleting `Math.max(activity.actualDuration + 1, base)`
  // changes NOTHING: all 44 tests pass. Re-enable it once the fixture is fixed;
  // it is the check that will prove the fix worked.
  // {
  //   id: "D4  in-progress floor removed",
  //   file: DET,
  //   find: `    return Math.max(activity.actualDuration + 1, base);`,
  //   replace: `    return base;`,
  //   expectFailing: /matches the pinned output: completed and in-progress activities/,
  // },

  // ---- group 1: one mutation per dependency type, plus the clamp ----------
  {
    id: "D5  FS off-by-one (offset = lag, not 1 + lag)",
    file: DET,
    find: `  const offset = 1 + lagDays;`,
    replace: `  const offset = lagDays;`,
    expectFailing: /matches the pinned output: FS lag 0/,
  },
  {
    id: "D6  SS ignores positive lag",
    file: DET,
    find: `  if (lagDays >= 0) return addWorkingDays(predStart, lagDays, calendar);`,
    replace: `  if (lagDays >= 0) return new Date(predStart);`,
    expectFailing: /matches the pinned output: SS lag 3/,
  },
  {
    id: "D7  FF back-calculation skipped (EF used as ES)",
    file: DET,
    find: `  const candidate = activityStartDate(constrainedEF, duration, calendar);`,
    replace: `  const candidate = constrainedEF;`,
    expectFailing: /matches the pinned output: FF lag 3/,
  },
  {
    id: "D8  negative-lag clamp to project start removed (FS)",
    file: DET,
    find: `  const candidate = subtractWorkingDays(predEnd, -offset, calendar);\n  return candidate < projectStart ? new Date(projectStart) : candidate;`,
    replace: `  return subtractWorkingDays(predEnd, -offset, calendar);`,
    expectFailing: /matches the pinned output: FS lag -10/,
  },

  // ---- group 5: milestone floors ------------------------------------------
  {
    id: "D9  milestone floor never applied",
    file: DET,
    find: `  return milestoneDate > activityStart ? milestoneDate : activityStart;`,
    replace: `  return activityStart;`,
    expectFailing: /matches the pinned output: milestone floor raises the start/,
  },
  // ⚠️ D10 IS COMMENTED OUT BECAUSE IT FOUND SOMETHING — see "UNPINNED" below.
  // Removing the weekend advance changes NOTHING; the fixture named for that
  // advance does not pin it.
  // {
  //   id: "D10  milestone date not advanced off a weekend",
  //   file: DET,
  //   find: `  const milestoneDate = advanceToNextWorkingDay(parseDateISO(milestone.targetDate), calendar);`,
  //   replace: `  const milestoneDate = parseDateISO(milestone.targetDate);`,
  //   expectFailing: /matches the pinned output: milestone floor on a Saturday advances to Monday/,
  // },

  // ---- group 3: constraints, forward and backward -------------------------
  {
    id: "D11  forward constraint never applied",
    file: DET,
    find: `  if (!activity.constraintType || !activity.constraintDate || !activity.constraintMode) {\n    return { es: activityStart, ef: activityEnd };\n  }`,
    replace: `  if (true) {\n    return { es: activityStart, ef: activityEnd };\n  }`,
    expectFailing: /matches the pinned output: constraint MSO hard/,
  },
  {
    id: "D12  backward constraint adjustment skipped",
    file: DET,
    find: `    if (activity.constraintType && activity.constraintDate && activity.constraintMode) {\n      const backResult = applyBackwardConstraint(`,
    replace: `    if (false && activity.constraintDate && activity.constraintMode) {\n      const backResult = applyBackwardConstraint(`,
    // ⚠️ RE-AIMED. `constraint MSO hard` does NOT catch this — measured. Only
    // `constraint FNLT hard` and the two forced-violation fixtures do, so 10 of
    // the 12 constraint x mode fixtures pin the FORWARD pass only.
    expectFailing: /matches the pinned output: constraint FNLT hard/,
  },

  // ---- group 4: forced dependency violations ------------------------------
  {
    id: "D13  FS dependency violation never reported",
    file: DET,
    find: `      const required = computeRequired(predEF, 1 + dep.lagDays);\n      violated = succES < required;`,
    replace: `      const required = computeRequired(predEF, 1 + dep.lagDays);\n      violated = false && succES < required;`,
    expectFailing: /matches the pinned output: hard MSO on successor forces an FS violation/,
  },

  // ---- group 2: CPM float, where topology fixtures earn their place -------
  {
    id: "D14  free float floor at zero removed",
    file: DET,
    find: `    freeFloatMap.set(id, Math.max(0, minGap));`,
    replace: `    freeFloatMap.set(id, minGap);`,
    // ⚠️ RE-AIMED. No TOPOLOGY fixture catches this — measured. A negative gap
    // only arises where a constraint has pushed a successor earlier than its
    // predecessor allows, so the floor is pinned exclusively by constraint cases.
    expectFailing: /matches the pinned output: constraint MFO hard/,
  },
  {
    id: "D15  successorGap FS off-by-one",
    file: DET,
    find: `  return countWorkingDays(predEF, succES, calendar) - 1 - succ.lagDays; // FS`,
    replace: `  return countWorkingDays(predEF, succES, calendar) - succ.lagDays; // FS`,
    expectFailing: /matches the pinned output: fan-out then fan-in \(diamond\)/,
  },

  // ---- group 7: the calendar argument itself ------------------------------
  // ⚠️ Targeted deliberately at the PARAMETER, not at the shared date helpers.
  // Breaking addWorkingDays would fail all 41 fixtures and prove nothing about
  // whether the two calendar fixtures pin anything. Dropping the argument fails
  // only the fixtures that pass one.
  {
    id: "D16  supplied calendar ignored (falls back to the default)",
    file: DET,
    find: `  const graph = buildDependencyGraph(\n    activities.map((a) => a.id),\n    dependencies\n  );`,
    replace: `  calendar = undefined;\n  const graph = buildDependencyGraph(\n    activities.map((a) => a.id),\n    dependencies\n  );`,
    expectFailing: /matches the pinned output: four-day work week \(Mon-Thu\)/,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ UNPINNED — what this audit found, 2026-08-06
//
// Sixteen perturbations, one per path the oracle's fixture groups claim to cover.
// Twelve were caught by the fixture built for them. Two were caught by DIFFERENT
// fixtures than expected (D12, D14 — re-aimed above, with the measured reason).
// TWO WERE NOT CAUGHT AT ALL:
//
//   D4  the in-progress duration floor.  `z3` is inProgress with actualDuration 2
//       and min=mostLikely=max=4, so the floor computes Math.max(2 + 1, 4) = 4 —
//       exactly the value the floor exists to override. The branch EXECUTES and
//       its output is identical whether or not it is there. Deleting the floor
//       leaves all 44 tests green.
//       Fix: give the fixture an actualDuration that makes the floor bind
//       (actualDuration 6 on a 4-day activity -> 7, not 4), then regenerate.
//
//   D10 the milestone weekend advance.  The fixture is NAMED "milestone floor on
//       a Saturday advances to Monday" and the pinned start IS the Monday — but
//       removing `advanceToNextWorkingDay` still produces 2025-01-13, because
//       something downstream normalises it anyway. The fixture pins a Monday that
//       would happen regardless; it does not pin the advance.
//       ⚠️ Fix needs domain judgment, not a fixture edit: find where the redundant
//       normalisation happens and decide whether this advance is load-bearing at
//       all. It may be dead, or it may matter for a case no fixture reaches.
//
// Both are the ledger's "a test named for a property it cannot check" shape, which
// this campaign has now recorded four times. Neither is fixed here: fixing D4 means
// regenerating deterministic-oracle.json, which that file's own header says must be
// an explicit reviewed act, and D10 is a question about what the scheduler SHOULD do.
//
// ⚠️ So this file currently proves 14 of the oracle's 16 claimed paths. That is a
// better number than it had yesterday, when it proved none — but it is not 16, and
// the two commented-out mutations above are the record of which two.
// ─────────────────────────────────────────────────────────────────────────────
