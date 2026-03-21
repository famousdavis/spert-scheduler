// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { computeDeterministicSchedule } from "@core/schedule/deterministic";
import { runTrials } from "@core/simulation/monte-carlo";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import type { Activity } from "@domain/models/types";

/**
 * Integration tests for scheduling constraints in sequential (non-dependency) mode.
 * Validates that constraints affect both deterministic schedules and Monte Carlo simulations.
 */

function makeActivity(overrides: Partial<Activity> & { id: string; name: string }): Activity {
  return {
    min: 5,
    mostLikely: 10,
    max: 20,
    confidenceLevel: "mediumConfidence" as const,
    distributionType: "normal" as const,
    status: "planned" as const,
    ...overrides,
  };
}

describe("Sequential constraints — deterministic schedule", () => {
  const startDate = "2026-01-05"; // Monday

  it("SNET pushes an activity later when constraint date is after natural start", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 3, mostLikely: 5, max: 8 }),
      makeActivity({
        id: "a2",
        name: "Activity 2",
        min: 2,
        mostLikely: 3,
        max: 5,
        constraintType: "SNET",
        constraintDate: "2026-02-02", // Monday, well after Activity 1 would end
        constraintMode: "hard",
      }),
    ];

    const schedule = computeDeterministicSchedule(activities, startDate, 0.5);

    // Activity 2 should start on or after 2026-02-02
    expect(schedule.activities[1]!.startDate >= "2026-02-02").toBe(true);
    // Activity 1 should start normally
    expect(schedule.activities[0]!.startDate).toBe("2026-01-05");
  });

  it("SNET has no effect when constraint date is before natural start", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 3, mostLikely: 5, max: 8 }),
      makeActivity({
        id: "a2",
        name: "Activity 2",
        min: 2,
        mostLikely: 3,
        max: 5,
        constraintType: "SNET",
        constraintDate: "2026-01-06", // Tuesday, before Activity 1 finishes
        constraintMode: "hard",
      }),
    ];

    const scheduleWithConstraint = computeDeterministicSchedule(activities, startDate, 0.5);

    // Remove constraint and compare
    const activitiesNoConstraint: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 3, mostLikely: 5, max: 8 }),
      makeActivity({ id: "a2", name: "Activity 2", min: 2, mostLikely: 3, max: 5 }),
    ];
    const scheduleWithout = computeDeterministicSchedule(activitiesNoConstraint, startDate, 0.5);

    expect(scheduleWithConstraint.activities[1]!.startDate).toBe(
      scheduleWithout.activities[1]!.startDate
    );
  });

  it("MSO pins start date and generates conflict when predecessor pushes past it", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 10, mostLikely: 15, max: 25 }),
      makeActivity({
        id: "a2",
        name: "Activity 2",
        min: 2,
        mostLikely: 3,
        max: 5,
        constraintType: "MSO",
        constraintDate: "2026-01-08", // Thursday — before Activity 1 finishes
        constraintMode: "hard",
      }),
    ];

    const schedule = computeDeterministicSchedule(activities, startDate, 0.5);

    // MSO pins start to constraint date even when predecessor hasn't finished
    expect(schedule.activities[1]!.startDate).toBe("2026-01-08");
    // Should produce a conflict
    expect(schedule.constraintConflicts).toBeDefined();
    expect(schedule.constraintConflicts!.length).toBeGreaterThan(0);
    expect(schedule.constraintConflicts![0]!.constraintType).toBe("MSO");
  });

  it("SNET constraint propagates to subsequent activities", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 3, mostLikely: 5, max: 8 }),
      makeActivity({
        id: "a2",
        name: "Activity 2",
        min: 2,
        mostLikely: 3,
        max: 5,
        constraintType: "SNET",
        constraintDate: "2026-03-02", // March — far in the future
        constraintMode: "hard",
      }),
      makeActivity({ id: "a3", name: "Activity 3", min: 2, mostLikely: 3, max: 5 }),
    ];

    const schedule = computeDeterministicSchedule(activities, startDate, 0.5);

    // Activity 3 should start after Activity 2's constrained end, not after Activity 1
    expect(schedule.activities[2]!.startDate > "2026-03-02").toBe(true);
  });

  it("soft constraints do not move dates in forward pass", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 3, mostLikely: 5, max: 8 }),
      makeActivity({
        id: "a2",
        name: "Activity 2",
        min: 2,
        mostLikely: 3,
        max: 5,
        constraintType: "SNET",
        constraintDate: "2026-06-01",
        constraintMode: "soft",
      }),
    ];

    const activitiesNoConstraint: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 3, mostLikely: 5, max: 8 }),
      makeActivity({ id: "a2", name: "Activity 2", min: 2, mostLikely: 3, max: 5 }),
    ];

    const withSoft = computeDeterministicSchedule(activities, startDate, 0.5);
    const without = computeDeterministicSchedule(activitiesNoConstraint, startDate, 0.5);

    // Soft constraint should NOT push Activity 2 to June
    expect(withSoft.activities[1]!.startDate).toBe(without.activities[1]!.startDate);
  });

  it("FNET pushes finish date later when constraint is after natural finish", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 3, mostLikely: 5, max: 8 }),
      makeActivity({
        id: "a2",
        name: "Activity 2",
        min: 2,
        mostLikely: 3,
        max: 5,
        constraintType: "FNET",
        constraintDate: "2026-03-02",
        constraintMode: "hard",
      }),
    ];

    const schedule = computeDeterministicSchedule(activities, startDate, 0.5);

    // Activity 2's end should be at least the constraint date
    expect(schedule.activities[1]!.endDate >= "2026-03-02").toBe(true);
  });

  it("returns constraintConflicts: undefined when no constraints exist", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1" }),
      makeActivity({ id: "a2", name: "Activity 2" }),
    ];

    const schedule = computeDeterministicSchedule(activities, startDate, 0.5);
    expect(schedule.constraintConflicts).toBeUndefined();
  });
});

describe("Sequential constraints — Monte Carlo simulation", () => {
  it("SNET constraint increases MC total duration compared to unconstrained", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 3, mostLikely: 5, max: 8 }),
      makeActivity({
        id: "a2",
        name: "Activity 2",
        min: 2,
        mostLikely: 3,
        max: 5,
        constraintType: "SNET",
        constraintDate: "2026-06-01", // Far future — ensures large gap
        constraintMode: "hard",
      }),
    ];

    // With constraint
    const constrainedSamples = runTrials({
      activities,
      trialCount: 1000,
      rngSeed: "test-seed-42",
      sequentialConstraints: [
        null, // Activity 1: no constraint
        { type: "SNET", offsetFromStart: 100, mode: "hard" }, // Activity 2: SNET at offset 100
      ],
    });

    // Without constraint
    const unconstrainedSamples = runTrials({
      activities,
      trialCount: 1000,
      rngSeed: "test-seed-42",
    });

    // Average constrained duration should be significantly larger
    const avgConstrained = Array.from(constrainedSamples).reduce((a, b) => a + b, 0) / 1000;
    const avgUnconstrained = Array.from(unconstrainedSamples).reduce((a, b) => a + b, 0) / 1000;

    expect(avgConstrained).toBeGreaterThan(avgUnconstrained + 50);
  });

  it("soft constraints do not affect MC results", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 3, mostLikely: 5, max: 8 }),
      makeActivity({ id: "a2", name: "Activity 2", min: 2, mostLikely: 3, max: 5 }),
    ];

    const withSoft = runTrials({
      activities,
      trialCount: 1000,
      rngSeed: "test-seed-42",
      sequentialConstraints: [
        null,
        { type: "SNET", offsetFromStart: 200, mode: "soft" },
      ],
    });

    const without = runTrials({
      activities,
      trialCount: 1000,
      rngSeed: "test-seed-42",
    });

    // Same seed, same activities — soft constraint should produce identical results
    expect(Array.from(withSoft)).toEqual(Array.from(without));
  });

  it("null constraint entries are ignored (fast path equivalent)", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1", min: 5, mostLikely: 10, max: 20 }),
    ];

    const withNulls = runTrials({
      activities,
      trialCount: 500,
      rngSeed: "test-seed-99",
      sequentialConstraints: [null],
    });

    const without = runTrials({
      activities,
      trialCount: 500,
      rngSeed: "test-seed-99",
    });

    // All-null constraint array should match unconstrained
    // Note: different code paths (position-tracking vs simple sum) but same results
    // for single activity with no constraints
    const avgWith = Array.from(withNulls).reduce((a, b) => a + b, 0) / 500;
    const avgWithout = Array.from(without).reduce((a, b) => a + b, 0) / 500;
    expect(Math.abs(avgWith - avgWithout)).toBeLessThan(0.01);
  });
});

describe("buildSimulationParams — sequential constraints", () => {
  const startDate = "2026-01-05"; // Monday

  it("includes sequentialConstraints when activities have constraints in sequential mode", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1" }),
      makeActivity({
        id: "a2",
        name: "Activity 2",
        constraintType: "SNET",
        constraintDate: "2026-02-02",
        constraintMode: "hard",
      }),
    ];

    const params = buildSimulationParams(
      activities,
      false, // sequential mode
      0.5,
      [],
      [],
      startDate,
      undefined,
      true,
    );

    expect(params.sequentialConstraints).toBeDefined();
    expect(params.sequentialConstraints!.length).toBe(2);
    expect(params.sequentialConstraints![0]).toBeNull();
    expect(params.sequentialConstraints![1]).not.toBeNull();
    expect(params.sequentialConstraints![1]!.type).toBe("SNET");
    expect(params.sequentialConstraints![1]!.offsetFromStart).toBeGreaterThan(0);
  });

  it("returns undefined sequentialConstraints when no activities have constraints", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Activity 1" }),
      makeActivity({ id: "a2", name: "Activity 2" }),
    ];

    const params = buildSimulationParams(
      activities,
      false,
      0.5,
      [],
      [],
      startDate,
      undefined,
      true,
    );

    expect(params.sequentialConstraints).toBeUndefined();
  });

  it("returns undefined sequentialConstraints in dependency mode", () => {
    const activities: Activity[] = [
      makeActivity({
        id: "a1",
        name: "Activity 1",
        constraintType: "SNET",
        constraintDate: "2026-02-02",
        constraintMode: "hard",
      }),
    ];

    const params = buildSimulationParams(
      activities,
      true, // dependency mode
      0.5,
      [],
      [],
      startDate,
      undefined,
      true,
    );

    expect(params.sequentialConstraints).toBeUndefined();
    // Constraints should go through constraintMap in dependency mode instead
    expect(params.dependencyParams?.constraintMap).toBeDefined();
  });
});
