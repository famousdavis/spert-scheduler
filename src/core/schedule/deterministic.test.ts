import { describe, it, expect } from "vitest";
import { computeDeterministicSchedule, computeDeterministicDurations } from "./deterministic";
import type { Activity } from "@domain/models/types";

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
