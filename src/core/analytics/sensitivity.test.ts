import { describe, it, expect } from "vitest";
import {
  computeSensitivityAnalysis,
  getTopSensitiveActivities,
} from "./sensitivity";
import type { Activity } from "@domain/models/types";

/** Helper: create a minimal Activity with required fields. */
function makeActivity(overrides: Partial<Activity> & { id: string; name: string }): Activity {
  return {
    min: 2,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...overrides,
  };
}

describe("computeSensitivityAnalysis", () => {
  it("returns empty array for empty activity list", () => {
    const result = computeSensitivityAnalysis([]);
    expect(result).toEqual([]);
  });

  it("returns one result for a single activity", () => {
    const activities = [makeActivity({ id: "a1", name: "Design" })];
    const result = computeSensitivityAnalysis(activities);

    expect(result).toHaveLength(1);
    expect(result[0]!.activityId).toBe("a1");
    expect(result[0]!.activityName).toBe("Design");
    expect(result[0]!.impactScore).toBeGreaterThan(0);
    expect(result[0]!.varianceContribution).toBeCloseTo(1.0, 5);
    expect(result[0]!.standardDeviation).toBeGreaterThan(0);
    expect(result[0]!.meanDuration).toBeGreaterThan(0);
    expect(result[0]!.coefficientOfVariation).toBeGreaterThan(0);
  });

  it("returns results sorted by impact score descending", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Small", min: 1, mostLikely: 2, max: 3 }),
      makeActivity({ id: "a2", name: "Large", min: 5, mostLikely: 20, max: 50 }),
      makeActivity({ id: "a3", name: "Medium", min: 3, mostLikely: 8, max: 15 }),
    ];
    const result = computeSensitivityAnalysis(activities);

    expect(result).toHaveLength(3);
    // Should be sorted descending by impactScore
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1]!.impactScore).toBeGreaterThanOrEqual(result[i]!.impactScore);
    }
    // The large activity should be first (biggest range = biggest impact)
    expect(result[0]!.activityId).toBe("a2");
  });

  it("variance contributions sum to approximately 1.0", () => {
    const activities = [
      makeActivity({ id: "a1", name: "A", min: 1, mostLikely: 3, max: 8 }),
      makeActivity({ id: "a2", name: "B", min: 2, mostLikely: 5, max: 12 }),
      makeActivity({ id: "a3", name: "C", min: 4, mostLikely: 10, max: 20 }),
    ];
    const result = computeSensitivityAnalysis(activities);

    const totalVarianceContribution = result.reduce(
      (sum, r) => sum + r.varianceContribution,
      0
    );
    expect(totalVarianceContribution).toBeCloseTo(1.0, 10);
  });

  it("coefficient of variation equals sd / mean", () => {
    const activities = [
      makeActivity({ id: "a1", name: "Task", min: 3, mostLikely: 7, max: 15 }),
    ];
    const result = computeSensitivityAnalysis(activities);

    const r = result[0]!;
    expect(r.coefficientOfVariation).toBeCloseTo(
      r.standardDeviation / r.meanDuration,
      10
    );
  });

  it("all-equal estimates produce zero variance but mean-shift impact", () => {
    const activities = [
      makeActivity({
        id: "a1",
        name: "Fixed",
        min: 5,
        mostLikely: 5,
        max: 5,
      }),
    ];
    const result = computeSensitivityAnalysis(activities);

    expect(result).toHaveLength(1);
    const r = result[0]!;
    expect(r.standardDeviation).toBe(0);
    expect(r.coefficientOfVariation).toBe(0);
    // varianceContribution: 0/0 → 0 (guarded in code)
    expect(r.varianceContribution).toBe(0);
    // Impact is non-zero because the mean shifts by 10%: 5 → 5.5 = 0.5
    expect(r.impactScore).toBeCloseTo(0.5, 5);
  });

  it("sdOverride is used when provided", () => {
    const withoutOverride = [
      makeActivity({ id: "a1", name: "Task", min: 2, mostLikely: 5, max: 10 }),
    ];
    const withOverride = [
      makeActivity({
        id: "a1",
        name: "Task",
        min: 2,
        mostLikely: 5,
        max: 10,
        sdOverride: 5.0,
      }),
    ];

    const r1 = computeSensitivityAnalysis(withoutOverride)[0]!;
    const r2 = computeSensitivityAnalysis(withOverride)[0]!;

    // sdOverride = 5 should produce a different SD than the RSM-based SD
    expect(r2.standardDeviation).toBe(5.0);
    expect(r1.standardDeviation).not.toBeCloseTo(5.0, 5);
    // Higher SD → higher impact
    expect(r2.impactScore).toBeGreaterThan(r1.impactScore);
  });
});

describe("getTopSensitiveActivities", () => {
  it("returns only topN results", () => {
    const activities = [
      makeActivity({ id: "a1", name: "A", min: 1, mostLikely: 3, max: 6 }),
      makeActivity({ id: "a2", name: "B", min: 2, mostLikely: 5, max: 10 }),
      makeActivity({ id: "a3", name: "C", min: 3, mostLikely: 7, max: 15 }),
      makeActivity({ id: "a4", name: "D", min: 4, mostLikely: 9, max: 20 }),
    ];

    const result = getTopSensitiveActivities(activities, 2);
    expect(result).toHaveLength(2);
    // Should be the two with highest impact
    expect(result[0]!.impactScore).toBeGreaterThanOrEqual(result[1]!.impactScore);
  });

  it("returns all results when topN exceeds activity count", () => {
    const activities = [
      makeActivity({ id: "a1", name: "A" }),
      makeActivity({ id: "a2", name: "B" }),
    ];

    const result = getTopSensitiveActivities(activities, 10);
    expect(result).toHaveLength(2);
  });

  it("returns empty array for empty input", () => {
    const result = getTopSensitiveActivities([], 5);
    expect(result).toEqual([]);
  });
});
