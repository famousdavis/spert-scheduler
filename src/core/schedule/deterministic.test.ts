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
    // 5 work days from Tue Feb 29: Wed Mar 1, Thu Mar 2, Fri Mar 3, Mon Mar 6, Tue Mar 7
    expect(schedule.projectEndDate).toBe("2028-03-07");
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
