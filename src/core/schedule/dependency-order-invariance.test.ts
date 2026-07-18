// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

// ---------------------------------------------------------------------------
// V2 SPIKE (Phase 3 gate) — dependency-mode schedule invariance under reorder.
//
// The AI `reorder_activities` op advertises `affectsDates: false` for
// dependency-mode scenarios: reordering `activities[]` changes DISPLAY ORDER
// ONLY, no dates move. This test is the permanent regression guarantee behind
// that claim.
//
// `kahnTopoSort` seeds its queue in input-array order and drains FIFO, so the
// topological OUTPUT order and any tie-break-sensitive membership legitimately
// vary with input order. The invariance we assert is therefore keyed by
// activity id over the fields that must NOT move — start/end dates, floats,
// late dates, and the whole-schedule totals — and it EXCLUDES the array order
// of `scheduledActivities` (see `fingerprint`, which sorts by id).
//
// Stop rule: if any id-keyed date or float differs across shuffles, the
// `affectsDates: false` messaging is factually wrong and Phase 3 STOPS until
// the discrepancy is understood.
// ---------------------------------------------------------------------------

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { computeDependencySchedule } from "./deterministic";
import type {
  Activity,
  ActivityDependency,
  Milestone,
} from "@domain/models/types";
import { buildWorkCalendar } from "@core/calendar/work-calendar";

type Schedule = ReturnType<typeof computeDependencySchedule>;

const monFri = () => buildWorkCalendar([1, 2, 3, 4, 5], [], []);
const START = "2026-01-05"; // Monday

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a",
    name: "Task",
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...overrides,
  };
}

interface Fixture {
  activities: Activity[];
  dependencies: ActivityDependency[];
  milestones: Milestone[];
}

// Scenario A — diamond join with three parallel roots, a milestone-floored
// root, mixed FS/SS/FF dependencies with +/- lags, a HARD SNET that moves a
// start date, and a SOFT SNLT that exercises the conflict-detection path.
// Every constraint/milestone floor is keyed by activity id, so a correct
// engine applies it regardless of where the activity sits in `activities[]`.
function scenarioA(): Fixture {
  const activities: Activity[] = [
    makeActivity({ id: "A", name: "Alpha", min: 2, mostLikely: 4, max: 7 }),
    makeActivity({
      id: "B",
      name: "Bravo",
      min: 3,
      mostLikely: 5,
      max: 9,
      constraintType: "SNET",
      constraintDate: "2026-01-08", // Thursday — floors B's start
      constraintMode: "hard",
    }),
    makeActivity({
      id: "C",
      name: "Charlie",
      min: 1,
      mostLikely: 3,
      max: 6,
      startsAtMilestoneId: "ms1",
    }),
    makeActivity({ id: "D", name: "Delta", min: 4, mostLikely: 6, max: 11 }),
    makeActivity({
      id: "E",
      name: "Echo",
      min: 2,
      mostLikely: 5,
      max: 8,
      constraintType: "SNLT",
      constraintDate: "2026-01-20",
      constraintMode: "soft",
    }),
    makeActivity({ id: "F", name: "Foxtrot", min: 3, mostLikely: 4, max: 6 }),
  ];
  const dependencies: ActivityDependency[] = [
    { fromActivityId: "A", toActivityId: "D", type: "FS", lagDays: 2 },
    { fromActivityId: "B", toActivityId: "D", type: "SS", lagDays: 1 },
    { fromActivityId: "A", toActivityId: "E", type: "FF", lagDays: -1 },
    { fromActivityId: "C", toActivityId: "E", type: "FS", lagDays: 0 },
    { fromActivityId: "D", toActivityId: "F", type: "FS", lagDays: 0 },
    { fromActivityId: "E", toActivityId: "F", type: "FS", lagDays: 1 },
  ];
  const milestones: Milestone[] = [
    { id: "ms1", name: "Gate", targetDate: "2026-01-14" }, // Wednesday
  ];
  return { activities, dependencies, milestones };
}

// Scenario B — four parallel roots joining a single activity. Maximises the
// step-0 in-degree-0 queue (a 4-way tie-break) so topological order varies as
// much as possible across permutations while the join date stays pinned to the
// slowest root.
function scenarioB(): Fixture {
  const activities: Activity[] = [
    makeActivity({ id: "P", name: "P", min: 2, mostLikely: 3, max: 5 }),
    makeActivity({ id: "Q", name: "Q", min: 5, mostLikely: 8, max: 13 }),
    makeActivity({ id: "R", name: "R", min: 1, mostLikely: 2, max: 4 }),
    makeActivity({ id: "S", name: "S", min: 4, mostLikely: 6, max: 10 }),
    makeActivity({ id: "T", name: "T", min: 3, mostLikely: 4, max: 6 }),
    makeActivity({ id: "U", name: "U", min: 2, mostLikely: 3, max: 5 }),
  ];
  const dependencies: ActivityDependency[] = [
    { fromActivityId: "P", toActivityId: "T", type: "FS", lagDays: 0 },
    { fromActivityId: "Q", toActivityId: "T", type: "FS", lagDays: 0 },
    { fromActivityId: "R", toActivityId: "T", type: "FS", lagDays: 0 },
    { fromActivityId: "S", toActivityId: "T", type: "FS", lagDays: 0 },
    { fromActivityId: "T", toActivityId: "U", type: "FS", lagDays: 0 },
  ];
  return { activities, dependencies, milestones: [] };
}

// Order-invariant projection of a schedule: everything the `affectsDates:false`
// promise covers, keyed by id, with array order and push order removed.
// Conflicts are stringified + sorted so their push order (which follows
// topological/dependency iteration order) never leaks into the comparison.
function fingerprint(s: Schedule): string {
  const acts = [...s.activities]
    .sort((a, b) => a.activityId.localeCompare(b.activityId))
    .map((a) => ({
      id: a.activityId,
      duration: a.duration,
      startDate: a.startDate,
      endDate: a.endDate,
      isActual: a.isActual,
      totalFloat: a.totalFloat,
      freeFloat: a.freeFloat,
      lateStart: a.lateStart,
      lateFinish: a.lateFinish,
      lateStartNet: a.lateStartNet,
      lateFinishNet: a.lateFinishNet,
    }));
  const conflicts = (s.constraintConflicts ?? []).map((c) => JSON.stringify(c)).sort();
  const depConflicts = (s.dependencyConflicts ?? []).map((c) => JSON.stringify(c)).sort();
  return JSON.stringify({
    acts,
    projectEndDate: s.projectEndDate,
    totalDurationDays: s.totalDurationDays,
    spanDays: s.spanDays,
    conflicts,
    depConflicts,
  });
}

// The visible topological order (what the grid renders and what genuinely
// varies across permutations).
function order(s: Schedule): string {
  return s.activities.map((a) => a.activityId).join(",");
}

function permutations<T>(arr: readonly T[]): T[][] {
  if (arr.length <= 1) return [[...arr]];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i]!, ...p]);
  }
  return out;
}

/** fast-check arbitrary yielding a random permutation of `items`. */
function permutationArb<T>(items: readonly T[]): fc.Arbitrary<T[]> {
  return fc
    .array(fc.integer(), { minLength: items.length, maxLength: items.length })
    .map((keys) =>
      items
        .map((item, i) => ({ item, k: keys[i]!, i }))
        .sort((a, b) => a.k - b.k || a.i - b.i)
        .map((x) => x.item),
    );
}

describe("V2 spike — dependency-mode schedule is invariant under activities[] reorder", () => {
  const cal = monFri();

  it.each([
    ["Scenario A (diamond + parallel roots + milestone + hard/soft constraints)", scenarioA],
    ["Scenario B (four-way parallel root tie-break)", scenarioB],
  ])("every permutation of %s yields identical id-keyed dates/floats/totals", (_label, build) => {
    const { activities, dependencies, milestones } = build();
    const canonical = fingerprint(
      computeDependencySchedule(activities, dependencies, START, 0.5, cal, milestones),
    );

    const perms = permutations(activities);
    expect(perms.length).toBe(720); // 6! — exhaustive, deterministic, no flake

    for (const perm of perms) {
      const s = computeDependencySchedule(perm, dependencies, START, 0.5, cal, milestones);
      // Stop-rule assertion: any drift here means `affectsDates:false` is wrong.
      expect(fingerprint(s)).toBe(canonical);
    }
  });

  it("array order genuinely varies across permutations (the exclusion is real, not vacuous)", () => {
    // Proves the invariance test above is meaningful: the topological OUTPUT
    // order really does change with input order — so identical fingerprints
    // reflect true date invariance, not identical outputs.
    const { activities, dependencies, milestones } = scenarioB();
    const orders = new Set(
      permutations(activities).map((perm) =>
        order(computeDependencySchedule(perm, dependencies, START, 0.5, cal, milestones)),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it("invariance holds across the full percentile range (fast-check sweep)", () => {
    const { activities, dependencies, milestones } = scenarioA();
    fc.assert(
      fc.property(
        fc.double({ min: 0.05, max: 0.95, noNaN: true }),
        permutationArb(activities),
        (percentile, perm) => {
          const canonical = fingerprint(
            computeDependencySchedule(activities, dependencies, START, percentile, cal, milestones),
          );
          const shuffled = fingerprint(
            computeDependencySchedule(perm, dependencies, START, percentile, cal, milestones),
          );
          expect(shuffled).toBe(canonical);
        },
      ),
      { numRuns: 300 },
    );
  });
});
