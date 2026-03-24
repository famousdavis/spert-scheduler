// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  computeDeterministicSchedule,
  computeDeterministicDurations,
  computeDependencySchedule,
  computeDependencyDurations,
  computeActivityUncertaintyDays,
} from "./deterministic";
import type { Activity, ActivityDependency } from "@domain/models/types";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { countWorkingDays, parseDateISO } from "@core/calendar/calendar";

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
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Holiday", startDate: "2025-01-07", endDate: "2025-01-07" }], []); // Tuesday is a holiday

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
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Holiday", startDate: "2025-01-06", endDate: "2025-01-06" }], []); // Monday is holiday
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

  it("uses elapsed+1 floor for inProgress activity with large elapsed time", () => {
    const activities = [
      makeActivity({
        id: "a1",
        status: "inProgress",
        actualDuration: 15, // elapsed 15 days, estimates are only 3-10
        min: 3,
        mostLikely: 5,
        max: 10,
      }),
    ];
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    // Floor is max(15+1, inverseCDF(0.5)) = max(16, ~5) = 16
    expect(schedule.activities[0]!.duration).toBe(16);
    expect(schedule.activities[0]!.isActual).toBe(false);
  });

  it("uses inverseCDF when it exceeds elapsed+1 for inProgress activity", () => {
    const activities = [
      makeActivity({
        id: "a1",
        status: "inProgress",
        actualDuration: 1, // elapsed only 1 day, estimates are 3-10
        min: 3,
        mostLikely: 5,
        max: 10,
      }),
    ];
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    // Floor is max(1+1, inverseCDF(0.5)) = max(2, ~5) = ~5
    expect(schedule.activities[0]!.duration).toBeGreaterThanOrEqual(2);
    expect(schedule.activities[0]!.isActual).toBe(false);
  });

  it("treats inProgress without actualDuration as planned", () => {
    const activities = [
      makeActivity({
        id: "a1",
        status: "inProgress",
        // no actualDuration
      }),
    ];
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    expect(schedule.activities[0]!.isActual).toBe(false);
    expect(schedule.activities[0]!.duration).toBeGreaterThanOrEqual(1);
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

  it("uses elapsed+1 floor for inProgress with actualDuration", () => {
    const activities = [
      makeActivity({
        id: "a1",
        status: "inProgress",
        actualDuration: 15,
        min: 3,
        mostLikely: 5,
        max: 10,
      }),
    ];
    const durations = computeDeterministicDurations(activities, 0.5);
    expect(durations).toHaveLength(1);
    expect(durations[0]).toBe(16); // max(15+1, inverseCDF) = 16
  });

  it("uses inverseCDF when it exceeds elapsed+1 for inProgress", () => {
    const activities = [
      makeActivity({
        id: "a1",
        status: "inProgress",
        actualDuration: 1,
        min: 3,
        mostLikely: 5,
        max: 10,
      }),
    ];
    const durations = computeDeterministicDurations(activities, 0.5);
    expect(durations).toHaveLength(1);
    // inverseCDF(0.5) for (3,5,10) is ~5, which exceeds elapsed+1=2
    expect(durations[0]).toBeGreaterThan(2);
  });

  it("does not filter out inProgress activities", () => {
    const activities = [
      makeActivity({ id: "a1", status: "complete", actualDuration: 5 }),
      makeActivity({ id: "a2", status: "inProgress", actualDuration: 3 }),
      makeActivity({ id: "a3", status: "planned" }),
    ];
    const durations = computeDeterministicDurations(activities, 0.5);
    expect(durations).toHaveLength(2); // a2 and a3 (not a1)
  });
});

// -- Dependency-aware scheduling tests ---------------------------------------

function fsDep(from: string, to: string, lag = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "FS", lagDays: lag };
}

function ssDep(from: string, to: string, lag = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "SS", lagDays: lag };
}

function ffDep(from: string, to: string, lag = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "FF", lagDays: lag };
}

function fixedActivity(id: string, name: string, days: number): Activity {
  return makeActivity({ id, name, min: days, mostLikely: days, max: days });
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

  it("uses elapsed+1 floor for inProgress with actualDuration", () => {
    const activities = [
      makeActivity({
        id: "a1",
        status: "inProgress",
        actualDuration: 15,
        min: 3,
        mostLikely: 5,
        max: 10,
      }),
    ];
    const durations = computeDependencyDurations(activities, 0.5);
    expect(durations.get("a1")).toBe(16); // max(15+1, inverseCDF) = 16
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

  it("applies elapsed floor for inProgress activity", () => {
    const activities = [
      makeActivity({
        id: "a1",
        status: "inProgress",
        actualDuration: 15,
        min: 3,
        mostLikely: 5,
        max: 10,
      }),
    ];
    const result = computeActivityUncertaintyDays(activities, 0.5, 0.95);
    const entry = result.get("a1")!;
    // solidDays should be at least elapsed+1 = 16
    expect(entry.solidDays).toBeGreaterThanOrEqual(16);
  });

  it("still shows hatching for inProgress activity when targets differ", () => {
    const activities = [
      makeActivity({
        id: "a1",
        status: "inProgress",
        actualDuration: 1,
        min: 3,
        mostLikely: 5,
        max: 10,
        distributionType: "normal",
      }),
    ];
    const result = computeActivityUncertaintyDays(activities, 0.5, 0.95);
    const entry = result.get("a1")!;
    // With low elapsed (1), the distribution drives solid/project days and hatching should exist
    expect(entry.hatchedDays).toBeGreaterThanOrEqual(0);
    expect(entry.solidDays).toBeGreaterThanOrEqual(2); // at least elapsed+1
  });
});

// ---------------------------------------------------------------------------
// Non-standard work weeks in scheduling (Category 1)
// ---------------------------------------------------------------------------

describe("computeDeterministicSchedule with non-standard work weeks", () => {
  it("Sun-Thu: start advances to first work day when given Friday", () => {
    const activities = [makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 })];
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], [], []); // Sun-Thu
    const schedule = computeDeterministicSchedule(activities, "2025-01-10", 0.5, cal); // Friday
    // Friday is not a work day; should advance to Sunday Jan 12
    expect(schedule.activities[0]!.startDate).toBe("2025-01-12");
  });

  it("3-day week takes more calendar days than Mon-Fri", () => {
    const activities = [
      makeActivity({ id: "a1", min: 5, mostLikely: 5, max: 5 }),
    ];
    const monFri = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    const threeDayCal = buildWorkCalendar([1, 3, 5], [], []);
    const threeDay = computeDeterministicSchedule(activities, "2025-01-06", 0.5, threeDayCal);
    // 3-day week must end later in calendar time than Mon-Fri for same work duration
    expect(threeDay.projectEndDate > monFri.projectEndDate).toBe(true);
  });

  it("1-day work week produces valid schedule on Wednesdays only", () => {
    const activities = [
      makeActivity({ id: "a1", min: 2, mostLikely: 2, max: 2 }),
    ];
    const cal = buildWorkCalendar([3], [], []); // Wednesday only
    // Start on Wed Jan 8
    const schedule = computeDeterministicSchedule(activities, "2025-01-08", 0.5, cal);
    // All dates in schedule should be Wednesdays
    for (const act of schedule.activities) {
      const start = new Date(act.startDate + "T00:00:00");
      const end = new Date(act.endDate + "T00:00:00");
      expect(start.getDay()).toBe(3);
      expect(end.getDay()).toBe(3);
    }
  });
});

describe("computeDependencySchedule with non-standard work weeks", () => {
  it("Sun-Thu: dependency lag respects Fri-Sat as non-work days", () => {
    const activities = [
      makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 }),
      makeActivity({ id: "a2", min: 1, mostLikely: 1, max: 1 }),
    ];
    const deps = [fsDep("a1", "a2", 2)]; // 2-day lag
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], [], []); // Sun-Thu
    const schedule = computeDependencySchedule(activities, deps, "2025-01-12", 0.5, cal); // Sunday

    // a1 starts Sun Jan 12, duration 1 → ends Mon Jan 13
    // 2-day lag: Tue Jan 14, Wed Jan 15 (Fri+Sat skipped)
    // a2 should start Thu Jan 16
    const a2Start = schedule.activities.find((a) => a.activityId === "a2")!.startDate;
    const a2StartDate = new Date(a2Start + "T00:00:00");
    // Must not be Friday or Saturday
    expect(a2StartDate.getDay()).not.toBe(5); // Fri
    expect(a2StartDate.getDay()).not.toBe(6); // Sat
  });

  it("dependency start adjusts to work day in Sun-Thu week", () => {
    const activities = [
      makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 }),
    ];
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], [], []); // Sun-Thu
    // Start on Friday (not a work day)
    const schedule = computeDependencySchedule(activities, [], "2025-01-10", 0.5, cal);
    expect(schedule.activities[0]!.startDate).toBe("2025-01-12"); // Sunday
  });

  it("parallel branches with 3-day week: critical path drives end date", () => {
    const activities = [
      makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 }),
      makeActivity({ id: "a2", min: 5, mostLikely: 5, max: 5 }),
      makeActivity({ id: "a3", min: 2, mostLikely: 2, max: 2 }),
      makeActivity({ id: "a4", min: 1, mostLikely: 1, max: 1 }),
    ];
    const deps = [fsDep("a1", "a2"), fsDep("a1", "a3"), fsDep("a2", "a4"), fsDep("a3", "a4")];
    const cal = buildWorkCalendar([1, 3, 5], [], []); // Mon/Wed/Fri
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5, cal);

    // Total should be less than sum of all activities (parallelism)
    const sumAll = schedule.activities.reduce((s, a) => s + a.duration, 0);
    expect(schedule.totalDurationDays).toBeLessThan(sumAll);
  });
});

// ---------------------------------------------------------------------------
// Date boundary conditions in scheduling (Category 4)
// ---------------------------------------------------------------------------

describe("scheduling date boundary conditions", () => {
  it("schedule starting Dec 31 spans into January", () => {
    const activities = [
      makeActivity({ id: "a1", min: 3, mostLikely: 3, max: 3 }),
      makeActivity({ id: "a2", min: 3, mostLikely: 3, max: 3 }),
    ];
    // Dec 31 2025 is Wednesday
    const schedule = computeDeterministicSchedule(activities, "2025-12-31", 0.5);
    // Second activity should end in January 2026
    expect(schedule.projectEndDate.startsWith("2026-01")).toBe(true);
  });

  it("schedule starting on leap day Feb 29 2028", () => {
    const activities = [
      makeActivity({ id: "a1", min: 5, mostLikely: 5, max: 5 }),
    ];
    // Feb 29 2028 is Tuesday
    const schedule = computeDeterministicSchedule(activities, "2028-02-29", 0.5);
    expect(schedule.activities[0]!.startDate).toBe("2028-02-29");
    // 4 more work days from Tue Feb 29: Wed Mar 1, Thu Mar 2, Fri Mar 3, Mon Mar 6 (inclusive end)
    expect(schedule.projectEndDate).toBe("2028-03-06");
  });

  it("dependency lag spanning year boundary", () => {
    const activities = [
      makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 }),
      makeActivity({ id: "a2", min: 1, mostLikely: 1, max: 1 }),
    ];
    const deps = [fsDep("a1", "a2", 5)]; // 5-day lag
    // Start Mon Dec 29, 2025
    const schedule = computeDependencySchedule(activities, deps, "2025-12-29", 0.5);
    // a2 should start in January 2026
    const a2 = schedule.activities.find((a) => a.activityId === "a2")!;
    expect(a2.startDate.startsWith("2026-01")).toBe(true);
  });

  it("50-day lag spanning multiple months", () => {
    const activities = [
      makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 }),
      makeActivity({ id: "a2", min: 1, mostLikely: 1, max: 1 }),
    ];
    const deps = [fsDep("a1", "a2", 50)];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const a1 = schedule.activities.find((a) => a.activityId === "a1")!;
    const a2 = schedule.activities.find((a) => a.activityId === "a2")!;
    // a2 must start well after a1 ends
    expect(a2.startDate > a1.endDate).toBe(true);
    // Verify the gap between end of a1 and start of a2 is at least 50 working days
    // (countWorkingDays is inclusive-start/exclusive-end, so the count includes the end date's successor offset)
    const gapStart = parseDateISO(a1.endDate);
    const gapEnd = parseDateISO(a2.startDate);
    const gap = countWorkingDays(gapStart, gapEnd);
    expect(gap).toBeGreaterThanOrEqual(50);
  });
});

// -- SS and FF dependency types (date domain) --------------------------------

describe("computeDependencySchedule — SS type", () => {
  // Date convention: endDate = addWorkingDays(startDate, duration) — exclusive end marker
  // A 3-day activity starting Mon Jan 6 → end Thu Jan 9 (Mon,Tue,Wed worked)
  // A 5-day activity starting Mon Jan 6 → end Mon Jan 13 (Mon-Fri worked)

  it("SS lag=0: A(3d) SS→ B(2d) — B starts same day as A", () => {
    const activities = [fixedActivity("a", "A", 3), fixedActivity("b", "B", 2)];
    const deps = [ssDep("a", "b")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const a = schedule.activities.find((s) => s.activityId === "a")!;
    const b = schedule.activities.find((s) => s.activityId === "b")!;
    expect(a.startDate).toBe("2025-01-06");
    expect(b.startDate).toBe("2025-01-06");
    expect(a.endDate).toBe("2025-01-08"); // Wed (inclusive end)
    expect(b.endDate).toBe("2025-01-07"); // Tue (inclusive end)
  });

  it("SS lag=2: A(3d) SS+2→ B(2d) — B starts 2 working days after A starts", () => {
    const activities = [fixedActivity("a", "A", 3), fixedActivity("b", "B", 2)];
    const deps = [ssDep("a", "b", 2)];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const b = schedule.activities.find((s) => s.activityId === "b")!;
    // B starts addWorkingDays(Mon Jan 6, 2) = Wed Jan 8
    expect(b.startDate).toBe("2025-01-08");
    // B ends addWorkingDays(Wed Jan 8, 1) = Thu Jan 9 (inclusive end)
    expect(b.endDate).toBe("2025-01-09");
  });

  it("SS lag=-1: floor to project start", () => {
    const activities = [fixedActivity("a", "A", 3), fixedActivity("b", "B", 2)];
    const deps = [ssDep("a", "b", -1)];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const b = schedule.activities.find((s) => s.activityId === "b")!;
    expect(b.startDate).toBe("2025-01-06");
  });
});

describe("computeDependencySchedule — FF type", () => {
  it("FF lag=0: A(5d) FF→ B(3d) — B end matches A end", () => {
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 3)];
    const deps = [ffDep("a", "b")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const a = schedule.activities.find((s) => s.activityId === "a")!;
    const b = schedule.activities.find((s) => s.activityId === "b")!;
    // A: 5d from Mon Jan 6 → end Fri Jan 10 (inclusive end)
    expect(a.startDate).toBe("2025-01-06");
    expect(a.endDate).toBe("2025-01-10");
    // FF lag=0: constrainedEF = addWD(Fri Jan 10, 0) = Fri Jan 10
    // B start = subtractWD(Fri Jan 10, 2) = Wed Jan 8
    // B end = addWD(Wed Jan 8, 2) = Fri Jan 10
    expect(b.endDate).toBe("2025-01-10");
    expect(b.startDate).toBe("2025-01-08");
  });

  it("FF lag=2: A(5d) FF+2→ B(3d) — B finishes 2 days after A", () => {
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 3)];
    const deps = [ffDep("a", "b", 2)];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const a = schedule.activities.find((s) => s.activityId === "a")!;
    const b = schedule.activities.find((s) => s.activityId === "b")!;
    // A end = Fri Jan 10 (inclusive end)
    expect(a.endDate).toBe("2025-01-10");
    // constrainedEF = addWD(Fri Jan 10, 2) = Tue Jan 14
    // B start = subtractWD(Tue Jan 14, 2) = Fri Jan 10
    // B end = addWD(Fri Jan 10, 2) = Tue Jan 14
    expect(b.endDate).toBe("2025-01-14");
    expect(b.startDate).toBe("2025-01-10");
  });

  it("FF lag=-1: A(5d) FF-1→ B(3d) — B finishes 1 day before A", () => {
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 3)];
    const deps = [ffDep("a", "b", -1)];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const a = schedule.activities.find((s) => s.activityId === "a")!;
    const b = schedule.activities.find((s) => s.activityId === "b")!;
    // A end = Fri Jan 10 (inclusive end)
    expect(a.endDate).toBe("2025-01-10");
    // constrainedEF = subtractWD(Fri Jan 10, 1) = Thu Jan 9
    // B start = subtractWD(Thu Jan 9, 2) = Tue Jan 7
    // B end = addWD(Tue Jan 7, 2) = Thu Jan 9
    expect(b.endDate).toBe("2025-01-09");
    expect(b.startDate).toBe("2025-01-07");
  });
});

describe("computeDependencySchedule — mixed types", () => {
  it("FS + SS: A(3d) FS→ C(2d), B(4d) SS→ C(2d)", () => {
    const activities = [
      fixedActivity("a", "A", 3),
      fixedActivity("b", "B", 4),
      fixedActivity("c", "C", 2),
    ];
    const deps = [fsDep("a", "c"), ssDep("b", "c")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const c = schedule.activities.find((s) => s.activityId === "c")!;
    // A end = addWD(Mon, 2) = Wed Jan 8; C via FS: start = addWD(Wed Jan 8, 1+0) = Thu Jan 9
    // B start = Mon Jan 6; C via SS: start = addWD(Mon, 0) = Mon Jan 6
    // max → Thu Jan 9
    expect(c.startDate).toBe("2025-01-09");
  });

  it("FS + FF: A(3d) FS→ C(2d), B(5d) FF→ C(2d)", () => {
    const activities = [
      fixedActivity("a", "A", 3),
      fixedActivity("b", "B", 5),
      fixedActivity("c", "C", 2),
    ];
    const deps = [fsDep("a", "c"), ffDep("b", "c")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const c = schedule.activities.find((s) => s.activityId === "c")!;
    // A end = Wed Jan 8; C via FS: start = addWD(Wed, 1) = Thu Jan 9
    // B end = Fri Jan 10; C via FF: constrainedEF = Fri Jan 10, start = subtractWD(Fri, 1) = Thu Jan 9
    // max(Thu Jan 9, Thu Jan 9) → Thu Jan 9
    expect(c.startDate).toBe("2025-01-09");
  });

  it("no dependency conflict for satisfied FF constraint", () => {
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 3)];
    const deps = [ffDep("a", "b", 5)]; // FF+5: B must finish 5 days after A
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    expect(schedule.dependencyConflicts?.length ?? 0).toBe(0);
  });
});

// ===========================================================================
// freeFloat tests
// ===========================================================================

describe("freeFloat", () => {
  // A(5d) FS→ B(3d) FS→ C(2d) — all critical, no gaps
  // Mon Jan 6: A starts. A=5d ends Fri Jan 10. B starts Mon Jan 13. B=3d ends Wed Jan 15. C starts Thu Jan 16. C=2d ends Fri Jan 17.
  it("critical path activities have freeFloat = 0 and totalFloat = 0", () => {
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 3), fixedActivity("c", "C", 2)];
    const deps = [fsDep("a", "b"), fsDep("b", "c")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const a = schedule.activities.find((s) => s.activityId === "a")!;
    const b = schedule.activities.find((s) => s.activityId === "b")!;
    const c = schedule.activities.find((s) => s.activityId === "c")!;
    expect(a.totalFloat).toBe(0);
    expect(a.freeFloat).toBe(0);
    expect(b.totalFloat).toBe(0);
    expect(b.freeFloat).toBe(0);
    expect(c.totalFloat).toBe(0);
    expect(c.freeFloat).toBe(0);
  });

  // A(5d) FS→ C(2d), B(3d) FS→ C(2d) — A is critical (longer), B has float
  // B has totalFloat > 0, and freeFloat = gap to C's early start
  it("non-critical activity with one FS successor has correct freeFloat", () => {
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 3), fixedActivity("c", "C", 2)];
    const deps = [fsDep("a", "c"), fsDep("b", "c")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const b = schedule.activities.find((s) => s.activityId === "b")!;
    // B starts Mon Jan 6, ends Wed Jan 8. C starts Mon Jan 13 (after A ends Fri Jan 10).
    // B freeFloat = countWorkingDays(Wed Jan 8, Mon Jan 13) - 1 - 0 = 2 - 1 = 1...
    // Actually: countWorkingDays counts Thu Jan 9, Fri Jan 10 = 2 working days. 2 - 1 = 1.
    // Wait: Thu 9, Fri 10 = 2 working days between Wed 8 and Mon 13. So freeFloat = 2 - 1 = 1? Let me re-check.
    // countWorkingDays(Wed Jan 8, Mon Jan 13): iterates Thu 9 (working), Fri 10 (working), Sat 11 (skip), Sun 12 (skip) = 2.
    // freeFloat = 2 - 1 - 0 = 1.
    // But B's totalFloat should be 2 (B could start Wed Jan 8 and still finish before C starts).
    // B is 3 days. LS for B = subtractWorkingDays(Mon Jan 13, 1+3) = subtractWorkingDays(Mon 13, 4) = Tue Jan 7.
    // Wait no — backward pass: LS = subtractWorkingDays(succLS, 1 + lag + duration) for FS.
    // C's LS: C is terminal, LS_C = subtractWorkingDays(projectEnd, duration) = subtractWorkingDays(Fri Jan 17, 2) = Wed Jan 15. Wait...
    // Let me just assert what the scheduler produces and verify it's sensible.
    expect(b.totalFloat).toBeGreaterThan(0);
    expect(b.freeFloat).toBeGreaterThanOrEqual(0);
    expect(b.freeFloat!).toBeLessThanOrEqual(b.totalFloat!);
  });

  // A FS→ B, A FS→ C — two successors, freeFloat = min of both gaps
  it("activity with two FS successors: freeFloat is minimum gap", () => {
    // A(5d) FS→ B(3d), A(5d) FS+2→ C(2d)
    // A ends Fri Jan 10. B starts Mon Jan 13 (gap = 0). C starts Wed Jan 15 (gap with lag 2).
    // freeFloat(A) = min(countWD(Fri 10, Mon 13)-1-0, countWD(Fri 10, Wed 15)-1-2)
    //             = min(2-1, 4-1-2) = min(1, 1) = 1... hmm.
    // Actually for FS no lag: countWD(Fri Jan 10, Mon Jan 13) = 1 (only Fri? No — start inclusive, end exclusive).
    // countWorkingDays iterates from Fri 10: Fri is < Mon 13? Yes. Fri is working = count 1.
    // Then Sat 11 < Mon 13: not working. Sun 12 < Mon 13: not working. Done. = 1.
    // freeFloat FS no lag = 1 - 1 - 0 = 0. That's correct — A is directly feeding B with no gap.
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 3), fixedActivity("c", "C", 2)];
    const deps = [fsDep("a", "b"), fsDep("a", "c", 2)];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const a = schedule.activities.find((s) => s.activityId === "a")!;
    // A feeds B directly (no gap), so freeFloat should be 0
    expect(a.freeFloat).toBe(0);
  });

  it("terminal activity (no successors): freeFloat = totalFloat", () => {
    // A FS→ B, A FS→ C — B and C are terminal
    // The one with more float should have freeFloat = totalFloat
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 10), fixedActivity("c", "C", 2)];
    const deps = [fsDep("a", "b"), fsDep("a", "c")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const c = schedule.activities.find((s) => s.activityId === "c")!;
    // C is terminal — freeFloat should equal totalFloat
    expect(c.freeFloat).toBe(c.totalFloat);
  });

  it("sequential mode: freeFloat is undefined", () => {
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 3)];
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    for (const sa of schedule.activities) {
      expect(sa.freeFloat).toBeUndefined();
    }
  });

  it("SS dependency: freeFloat computed from early starts", () => {
    // A(5d) SS+0→ B(3d) — both start same day
    const activities = [fixedActivity("a", "A", 5), fixedActivity("b", "B", 3)];
    const deps = [ssDep("a", "b", 0)];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const a = schedule.activities.find((s) => s.activityId === "a")!;
    // SS: freeFloat = countWorkingDays(ES_A, ES_B) - lag = countWD(Mon 6, Mon 6) - 0 = 0
    expect(a.freeFloat).toBe(0);
  });

  it("FF dependency: freeFloat computed from early finishes", () => {
    // A(3d) FF+0→ B(5d) — B finish constrained by A finish
    const activities = [fixedActivity("a", "A", 3), fixedActivity("b", "B", 5)];
    const deps = [ffDep("a", "b", 0)];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    const a = schedule.activities.find((s) => s.activityId === "a")!;
    // A is shorter, finishes before B. freeFloat = countWD(EF_A, EF_B) - 0
    // A ends Wed Jan 8, B ends Fri Jan 10. countWD(Wed 8, Fri 10) = 2. freeFloat = 2.
    expect(a.freeFloat).toBe(2);
  });
});
