import { describe, it, expect } from "vitest";
import { buildMilestoneSimParams } from "./milestone-sim-params";
import type { Activity, Milestone, Calendar } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> & { id: string; name: string }): Activity {
  return {
    min: 1,
    mostLikely: 2,
    max: 3,
    confidenceLevel: "mediumLowConfidence",
    distributionType: "normal",
    status: "planned",
    ...overrides,
  };
}

describe("buildMilestoneSimParams", () => {
  it("returns empty object when no milestones", () => {
    const result = buildMilestoneSimParams([], [], "2025-01-06");
    expect(result).toEqual({});
  });

  it("returns empty object when milestones exist but no activities assigned", () => {
    const milestones: Milestone[] = [{ id: "ms1", name: "Phase 1", targetDate: "2025-02-01" }];
    const result = buildMilestoneSimParams([], milestones, "2025-01-06");
    expect(result.milestoneActivityIds).toBeUndefined();
  });

  it("maps activities to their milestones", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Task 1", milestoneId: "ms1" }),
      makeActivity({ id: "a2", name: "Task 2", milestoneId: "ms1" }),
      makeActivity({ id: "a3", name: "Task 3" }),
    ];
    const milestones: Milestone[] = [{ id: "ms1", name: "Phase 1", targetDate: "2025-02-01" }];

    const result = buildMilestoneSimParams(activities, milestones, "2025-01-06");
    expect(result.milestoneActivityIds).toEqual({ ms1: ["a1", "a2"] });
  });

  it("computes earliest start offset for startsAtMilestoneId", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Task 1", startsAtMilestoneId: "ms1" }),
    ];
    const milestones: Milestone[] = [{ id: "ms1", name: "Phase 1", targetDate: "2025-01-13" }];
    // Start Mon Jan 6, milestone Mon Jan 13 → 5 working days gap
    const result = buildMilestoneSimParams(activities, milestones, "2025-01-06");
    expect(result.activityEarliestStart).toEqual({ a1: 5 });
  });

  it("snaps non-working day milestone to next working day", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Task 1", startsAtMilestoneId: "ms1" }),
    ];
    // Sat Jan 11 → snaps to Mon Jan 13
    const milestones: Milestone[] = [{ id: "ms1", name: "Phase 1", targetDate: "2025-01-11" }];
    const result = buildMilestoneSimParams(activities, milestones, "2025-01-06");
    // Mon Jan 6 → Mon Jan 13 = 5 working days
    expect(result.activityEarliestStart).toEqual({ a1: 5 });
  });

  it("snaps non-working day project start to next working day", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Task 1", startsAtMilestoneId: "ms1" }),
    ];
    const milestones: Milestone[] = [{ id: "ms1", name: "Phase 1", targetDate: "2025-01-13" }];
    // Start Sat Jan 4 → snaps to Mon Jan 6
    // Mon Jan 6 → Mon Jan 13 = 5 working days
    const result = buildMilestoneSimParams(activities, milestones, "2025-01-04");
    expect(result.activityEarliestStart).toEqual({ a1: 5 });
  });

  it("respects calendar holidays", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Task 1", startsAtMilestoneId: "ms1" }),
    ];
    const milestones: Milestone[] = [{ id: "ms1", name: "Phase 1", targetDate: "2025-01-13" }];
    const calendar: Calendar = {
      holidays: [{ id: "h1", name: "Holiday", startDate: "2025-01-08", endDate: "2025-01-08" }],
    };
    // Start Mon Jan 6, milestone Mon Jan 13, but Jan 8 (Wed) is holiday
    // Working days: Jan 6, Jan 7, Jan 9, Jan 10, Jan 13 → only 4 working days from Jan 6 to Jan 13
    const result = buildMilestoneSimParams(activities, milestones, "2025-01-06", calendar);
    expect(result.activityEarliestStart).toEqual({ a1: 4 });
  });
});
