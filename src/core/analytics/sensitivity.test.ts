// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  computeSensitivityAnalysis,
  getTopSensitiveActivities,
} from "./sensitivity";
import {
  DISTRIBUTION_TYPES,
  RSM_LEVELS,
  type Activity,
  type DistributionType,
  type RSMLevel,
} from "@domain/models/types";
import { createDistributionForActivity } from "@core/distributions/factory";

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

// -- Each activity's own distribution (v0.76.2) -----------------------------------------------

/** Min, Most Likely, Max. */
type Triple = readonly [number, number, number];

/** The panel's mean and SD for one activity analysed on its own, `undefined` when left out. */
function figuresFor(
  distributionType: DistributionType,
  [min, mostLikely, max]: Triple,
  confidenceLevel: RSMLevel = "mediumConfidence"
): { mean: number | undefined; sd: number | undefined } {
  const [result] = computeSensitivityAnalysis([
    makeActivity({ id: "a", name: "A", distributionType, confidenceLevel, min, mostLikely, max }),
  ]);
  return { mean: result?.meanDuration, sd: result?.standardDeviation };
}

interface AgreementCase {
  distributionType: DistributionType;
  confidenceLevel: RSMLevel;
  triple: Triple;
}

/** Every type at every level, on a skewed, a narrow, a symmetric and a zero-width estimate. */
const AGREEMENT_TRIPLES: Triple[] = [
  [10, 15, 30],
  [3, 4, 9],
  [10, 20, 30],
  [5, 5, 5],
];
const AGREEMENT_CASES: AgreementCase[] = DISTRIBUTION_TYPES.flatMap((distributionType) =>
  RSM_LEVELS.flatMap((confidenceLevel) =>
    AGREEMENT_TRIPLES.map((triple) => ({ distributionType, confidenceLevel, triple }))
  )
);

/** Where the panel's figures differ from the distribution's own by more than 1e-9, or null. */
function disagreement({ distributionType, confidenceLevel, triple }: AgreementCase): string | null {
  const [min, mostLikely, max] = triple;
  const activity = makeActivity({ id: "a", name: "A", distributionType, confidenceLevel, min, mostLikely, max });
  const distribution = createDistributionForActivity(activity);
  const ownMean = distribution.mean();
  const ownSd = Math.sqrt(distribution.variance());
  const { mean, sd } = figuresFor(distributionType, triple, confidenceLevel);
  const agrees =
    mean !== undefined && sd !== undefined && Math.abs(mean - ownMean) <= 1e-9 && Math.abs(sd - ownSd) <= 1e-9;
  return agrees ? null : `${distributionType} ${confidenceLevel} ${triple.join("/")}: panel ${mean}/${sd}, own ${ownMean}/${ownSd}`;
}

/** Every whole-number estimate with each of its three points from 0 to `top`. */
function wholeTriples(top: number): Triple[] {
  const values = Array.from({ length: top + 1 }, (_, i) => i);
  return values.flatMap((min) => values.flatMap((mostLikely) => values.map((max): Triple => [min, mostLikely, max])));
}

/**
 * The rows the grid flags, written out here rather than asked of `estimateOrderIssues` or
 * `logNormalHasNoMean`: estimates out of order, or a LogNormal whose estimates are all zero.
 */
function isFlagged(distributionType: DistributionType, [min, mostLikely, max]: Triple): boolean {
  const inOrder = min <= mostLikely && mostLikely <= max;
  const logNormalAtZero = distributionType === "logNormal" && min + mostLikely + max === 0;
  return !inOrder || logNormalAtZero;
}

const VERDICT_CASES = DISTRIBUTION_TYPES.flatMap((distributionType) =>
  wholeTriples(8).map((triple) => ({ distributionType, triple }))
);

/** What is wrong with the panel's verdict on one estimate, or null. */
function verdictFailure({ distributionType, triple }: { distributionType: DistributionType; triple: Triple }): string | null {
  const { sd } = figuresFor(distributionType, triple);
  const analysed = sd !== undefined;
  const expected = !isFlagged(distributionType, triple);
  if (analysed !== expected) return `${distributionType} ${triple.join("/")}: analysed ${analysed}, expected ${expected}`;
  if (analysed && sd < 0) return `${distributionType} ${triple.join("/")}: σ ${sd}`;
  return null;
}

describe("each activity's own distribution — the one the simulation samples", () => {
  it("Triangular: its own mean and SD, whatever the Confidence level", () => {
    const high = figuresFor("triangular", [10, 15, 30], "highConfidence");
    const guess = figuresFor("triangular", [10, 15, 30], "guesstimate");
    expect(high.mean).toBeCloseTo(55 / 3, 10);
    expect(high.sd).toBeCloseTo(Math.sqrt(325 / 18), 10);
    expect(guess.mean).toBeCloseTo(55 / 3, 10);
    expect(guess.sd).toBeCloseTo(Math.sqrt(325 / 18), 10);
  });

  it("Uniform: the midpoint and range / √12", () => {
    const { mean, sd } = figuresFor("uniform", [10, 15, 30]);
    expect(mean).toBeCloseTo(20, 10);
    expect(sd).toBeCloseTo(20 / Math.sqrt(12), 10);
  });

  it("Beta-PERT: the SD of the symmetric Beta(β, β) at its level, whatever the skew", () => {
    // β = 4 at Medium and 1.25 at Guesstimate; a symmetric Beta(β, β) on [0, 1] has SD 1 / (2√(2β + 1)).
    expect(figuresFor("betaPert", [10, 15, 30]).sd).toBeCloseTo(20 / 6, 10);
    expect(figuresFor("betaPert", [10, 15, 30], "guesstimate").sd).toBeCloseTo(20 / (2 * Math.sqrt(3.5)), 10);
    const symmetric = figuresFor("betaPert", [10, 20, 30]);
    expect(symmetric.mean).toBeCloseTo(20, 10);
    expect(symmetric.sd).toBeCloseTo(20 / 6, 10);
  });

  it("T-Normal and LogNormal: the PERT mean and range × the Confidence multiplier, unchanged", () => {
    const normal = figuresFor("normal", [10, 15, 30]);
    const logNormal = figuresFor("logNormal", [10, 15, 30]);
    expect(normal.mean).toBeCloseTo(50 / 3, 10);
    expect(normal.sd).toBeCloseTo(4, 10);
    expect(logNormal.mean).toBeCloseTo(50 / 3, 10);
    expect(logNormal.sd).toBeCloseTo(4, 10);
  });

  it("agrees with the distribution the simulation builds, for every type and level", () => {
    const disagreements = AGREEMENT_CASES.map(disagreement).filter((d) => d !== null);
    expect(AGREEMENT_CASES).toHaveLength(5 * 10 * 4);
    expect(disagreements).toEqual([]);
  });

  it("leaves out an activity whose estimates are out of order, or LogNormal at zero", () => {
    const result = computeSensitivityAnalysis([
      makeActivity({ id: "ok", name: "Valid" }),
      makeActivity({ id: "tri", name: "Triangular", distributionType: "triangular", min: 30, mostLikely: 15, max: 10 }),
      makeActivity({ id: "uni", name: "Uniform", distributionType: "uniform", min: 10, mostLikely: 5, max: 20 }),
      makeActivity({ id: "ln", name: "LogNormal", distributionType: "logNormal", min: 0, mostLikely: 0, max: 0 }),
    ]);
    expect(result.map((r) => r.activityId)).toEqual(["ok"]);
    expect(result[0]!.varianceContribution).toBe(1);
  });

  it("leaves out a LogNormal whose estimates are too small to give it a mean", () => {
    const result = computeSensitivityAnalysis([
      makeActivity({ id: "ok", name: "Valid" }),
      makeActivity({ id: "tiny", name: "Tiny", distributionType: "logNormal", min: 0, mostLikely: 0, max: 5e-324 }),
    ]);
    expect(result.map((r) => r.activityId)).toEqual(["ok"]);
  });

  it("never throws or shows a negative SD, and leaves out exactly the flagged estimates", () => {
    const failures = VERDICT_CASES.map(verdictFailure).filter((f) => f !== null);
    expect(VERDICT_CASES).toHaveLength(5 * 9 * 9 * 9);
    expect(failures).toEqual([]);
  });
});
