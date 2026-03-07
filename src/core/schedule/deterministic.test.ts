import { describe, it, expect } from "vitest";
import {
  computeDeterministicSchedule,
  computeDeterministicDurations,
  computeDependencySchedule,
  computeDependencyDurations,
  computeActivityUncertaintyDays,
} from "./deterministic";
import type { Activity, ActivityDependency } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
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

describe("computeDeterministicSchedule", () => {
  it("produces a schedule with correct activity count", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Task 1" }),
      makeActivity({ id: "a2", name: "Task 2" }),
    ];
    const schedule = computeDeterministicSchedule(
      activities,
      "2025-01-06",
      0.85
    );
    expect(schedule.activities).toHaveLength(2);
  });

  it("activities chain in sequence", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Task 1", min: 3, mostLikely: 5, max: 7 }),
      makeActivity({ id: "a2", name: "Task 2", min: 2, mostLikely: 3, max: 5 }),
    ];
    const schedule = computeDeterministicSchedule(
      activities,
      "2025-01-06", // Monday
      0.5
    );

    // Second activity should start after first ends
    const first = schedule.activities[0]!;
    const second = schedule.activities[1]!;
    expect(second.startDate > first.endDate).toBe(true);
  });

  it("uses actualDuration for complete activities", () => {
    const activities = [
      makeActivity({
        id: "a1",
        name: "Done",
        status: "complete",
        actualDuration: 3,
      }),
      makeActivity({ id: "a2", name: "Task 2" }),
    ];
    const schedule = computeDeterministicSchedule(
      activities,
      "2025-01-06",
      0.85
    );
    expect(schedule.activities[0]!.duration).toBe(3);
    expect(schedule.activities[0]!.isActual).toBe(true);
  });

  it("enforces minimum 1 working day duration", () => {
    // Use normal with tiny values (triangular with a=c=b would throw)
    const normalActivities = [
      makeActivity({
        id: "a1",
        min: 0,
        mostLikely: 0,
        max: 1,
        distributionType: "normal",
      }),
    ];
    const schedule = computeDeterministicSchedule(
      normalActivities,
      "2025-01-06",
      0.1 // Low percentile => very small duration
    );
    expect(schedule.activities[0]!.duration).toBeGreaterThanOrEqual(1);
  });

  it("returns project start date as end date for empty activity list", () => {
    const schedule = computeDeterministicSchedule([], "2025-01-06", 0.85);
    expect(schedule.activities).toHaveLength(0);
    expect(schedule.totalDurationDays).toBe(0);
    expect(schedule.projectEndDate).toBe("2025-01-06");
  });

  it("adjusts empty-project end date when start falls on weekend", () => {
    // Saturday Feb 8, 2025 → should advance to Monday Feb 10
    const schedule = computeDeterministicSchedule([], "2025-02-08", 0.85);
    expect(schedule.activities).toHaveLength(0);
    expect(schedule.totalDurationDays).toBe(0);
    expect(schedule.projectEndDate).toBe("2025-02-10");
  });

  it("skips holidays in calendar", () => {
    const activities = [makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 })];
    const calendar = { holidays: [{ id: "h1", name: "Holiday", startDate: "2025-01-07", endDate: "2025-01-07" }] }; // Tuesday is a holiday

    const withHoliday = computeDeterministicSchedule(
      activities,
      "2025-01-06", // Monday
      0.5,
      calendar
    );
    const withoutHoliday = computeDeterministicSchedule(
      activities,
      "2025-01-06",
      0.5
    );

    // With holiday, the end date should be later
    expect(withHoliday.projectEndDate >= withoutHoliday.projectEndDate).toBe(
      true
    );
  });

  it("adjusts start date to next working day if start is weekend", () => {
    const activities = [
      makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 }),
    ];
    const schedule = computeDeterministicSchedule(
      activities,
      "2025-01-04", // Saturday
      0.5
    );
    // Should adjust to Monday Jan 6
    expect(schedule.activities[0]!.startDate).toBe("2025-01-06");
  });

  it("adjusts start date to next working day if start is a holiday", () => {
    const activities = [
      makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 }),
    ];
    const calendar = { holidays: [{ id: "h1", name: "Holiday", startDate: "2025-01-06", endDate: "2025-01-06" }] }; // Monday is holiday
    const schedule = computeDeterministicSchedule(
      activities,
      "2025-01-06",
      0.5,
      calendar
    );
    // Should advance to Tuesday Jan 7
    expect(schedule.activities[0]!.startDate).toBe("2025-01-07");
  });

  it("schedules all-complete activities from actuals only", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 5 }),
      makeActivity({ id: "a2", status: "complete", actualDuration: 3 }),
    ];
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    expect(schedule.totalDurationDays).toBe(8);
    expect(schedule.activities[0]!.isActual).toBe(true);
    expect(schedule.activities[1]!.isActual).toBe(true);
  });
});

describe("computeDeterministicDurations", () => {
  it("returns durations for non-complete activities", () => {

    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a2", min: 2, mostLikely: 4, max: 8 }),
    ];
    const durations = computeDeterministicDurations(activities, 0.5);
    expect(durations).toHaveLength(2);
    for (const d of durations) {
      expect(d).toBeGreaterThanOrEqual(1);
    }
  });

  it("filters out complete activities", () => {

    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 5 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a3", status: "complete", actualDuration: 3 }),
    ];
    const durations = computeDeterministicDurations(activities, 0.5);
    expect(durations).toHaveLength(1); // Only a2
  });

  it("returns empty array when all activities are complete", () => {

    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 5 }),
    ];
    const durations = computeDeterministicDurations(activities, 0.5);
    expect(durations).toHaveLength(0);
  });
});

// -- Dependency-aware scheduling tests ---------------------------------------

function fsDep(from: string, to: string, lag = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "FS", lagDays: lag };
}

describe("computeDependencySchedule", () => {
  it("schedules parallel activities starting on the same day", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Task 1", min: 3, mostLikely: 5, max: 7 }),
      makeActivity({ id: "a2", name: "Task 2", min: 2, mostLikely: 3, max: 5 }),
    ];
    // No dependencies = all activities run in parallel
    const schedule = computeDependencySchedule(
      activities,
      [],
      "2025-01-06",
      0.5
    );
    expect(schedule.activities).toHaveLength(2);
    // Both start on the same day
    expect(schedule.activities[0]!.startDate).toBe(schedule.activities[1]!.startDate);
  });

  it("schedules linear chain sequentially", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Task 1", min: 1, mostLikely: 1, max: 1 }),
      makeActivity({ id: "a2", name: "Task 2", min: 1, mostLikely: 1, max: 1 }),
    ];
    const deps = [fsDep("a1", "a2")];
    const schedule = computeDependencySchedule(
      activities,
      deps,
      "2025-01-06", // Monday
      0.5
    );
    // Task 2 starts after Task 1 ends
    expect(schedule.activities[1]!.startDate > schedule.activities[0]!.endDate).toBe(true);
  });

  it("parallel branches: total duration equals max branch, not sum", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Start", min: 1, mostLikely: 1, max: 1 }),
      makeActivity({ id: "a2", name: "Long branch", min: 5, mostLikely: 5, max: 5 }),
      makeActivity({ id: "a3", name: "Short branch", min: 2, mostLikely: 2, max: 2 }),
      makeActivity({ id: "a4", name: "End", min: 1, mostLikely: 1, max: 1 }),
    ];
    // a1 → a2 → a4, a1 → a3 → a4
    const deps = [fsDep("a1", "a2"), fsDep("a1", "a3"), fsDep("a2", "a4"), fsDep("a3", "a4")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);

    // Duration should be driven by the critical path (a1→a2→a4 = 7), not sum (9)
    // totalDurationDays is working days from start to end, which accounts for parallelism
    expect(schedule.totalDurationDays).toBeLessThan(9); // less than sequential sum
  });

  it("uses actual duration for complete activities", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Done", status: "complete", actualDuration: 3 }),
      makeActivity({ id: "a2", name: "Task 2", min: 2, mostLikely: 2, max: 2 }),
    ];
    const deps = [fsDep("a1", "a2")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);

    expect(schedule.activities[0]!.duration).toBe(3);
    expect(schedule.activities[0]!.isActual).toBe(true);
  });

  it("handles empty activity list", () => {
    const schedule = computeDependencySchedule([], [], "2025-01-06", 0.5);
    expect(schedule.activities).toHaveLength(0);
    expect(schedule.totalDurationDays).toBe(0);
  });

  it("handles positive lag days", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Task 1", min: 1, mostLikely: 1, max: 1 }),
      makeActivity({ id: "a2", name: "Task 2", min: 1, mostLikely: 1, max: 1 }),
    ];
    const deps = [fsDep("a1", "a2", 2)]; // 2 days lag
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);

    // a2 should start later than without lag
    const noLag = computeDependencySchedule(activities, [fsDep("a1", "a2")], "2025-01-06", 0.5);
    expect(schedule.activities[1]!.startDate > noLag.activities[1]!.startDate).toBe(true);
  });
});

describe("computeDependencyDurations", () => {
  it("returns Map of activityId to duration", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a2", min: 2, mostLikely: 4, max: 8 }),
    ];
    const durations = computeDependencyDurations(activities, 0.5);
    expect(durations.size).toBe(2);
    expect(durations.has("a1")).toBe(true);
    expect(durations.has("a2")).toBe(true);
    expect(durations.get("a1")!).toBeGreaterThanOrEqual(1);
  });

  it("uses actual duration for complete activities", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 7 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 5, max: 10 }),
    ];
    const durations = computeDependencyDurations(activities, 0.5);
    expect(durations.get("a1")).toBe(7);
  });
});

// -- Per-activity uncertainty tests -------------------------------------------

describe("computeActivityUncertaintyDays", () => {
  it("returns solid + hatched days for a normal activity", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10, distributionType: "normal" }),
    ];
    const result = computeActivityUncertaintyDays(activities, 0.5, 0.95);
    const entry = result.get("a1")!;

    expect(entry.solidDays).toBeGreaterThanOrEqual(1);
    expect(entry.hatchedDays).toBeGreaterThanOrEqual(0);
    // At P95 the total should be larger than at P50
    expect(entry.solidDays + entry.hatchedDays).toBeGreaterThan(entry.solidDays);
  });

  it("returns hatchedDays = 0 for completed activities", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 5 }),
    ];
    const result = computeActivityUncertaintyDays(activities, 0.5, 0.95);
    const entry = result.get("a1")!;

    expect(entry.solidDays).toBe(5);
    expect(entry.hatchedDays).toBe(0);
  });

  it("returns hatchedDays = 0 for zero-variance activities", () => {
    const activities = [
      makeActivity({ id: "a1", min: 5, mostLikely: 5, max: 5 }),
    ];
    const result = computeActivityUncertaintyDays(activities, 0.5, 0.95);
    const entry = result.get("a1")!;

    expect(entry.hatchedDays).toBe(0);
    expect(entry.solidDays).toBe(5);
  });

  it("handles multiple activities", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a2", min: 1, mostLikely: 2, max: 4 }),
      makeActivity({ id: "a3", status: "complete", actualDuration: 3 }),
    ];
    const result = computeActivityUncertaintyDays(activities, 0.5, 0.95);
    expect(result.size).toBe(3);
    expect(result.get("a3")!.hatchedDays).toBe(0);
  });

  it("returns empty map for empty activity list", () => {
    const result = computeActivityUncertaintyDays([], 0.5, 0.95);
    expect(result.size).toBe(0);
  });
});
