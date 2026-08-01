// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { createDistributionForActivity } from "./factory";
import { NormalDistribution } from "./normal";
import { LogNormalDistribution } from "./log-normal";
import { TriangularDistribution } from "./triangular";
import { UniformDistribution } from "./uniform";
import type { Activity } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Test Activity",
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...overrides,
  };
}

describe("createDistributionForActivity", () => {
  it("creates NormalDistribution for normal type", () => {
    const dist = createDistributionForActivity(
      makeActivity({ distributionType: "normal" })
    );
    expect(dist).toBeInstanceOf(NormalDistribution);
  });

  it("creates LogNormalDistribution for logNormal type", () => {
    const dist = createDistributionForActivity(
      makeActivity({ distributionType: "logNormal" })
    );
    expect(dist).toBeInstanceOf(LogNormalDistribution);
  });

  it("creates TriangularDistribution for triangular type", () => {
    const dist = createDistributionForActivity(
      makeActivity({ distributionType: "triangular" })
    );
    expect(dist).toBeInstanceOf(TriangularDistribution);
  });

  it("normal distribution has correct PERT mean", () => {
    const activity = makeActivity({ min: 2, mostLikely: 5, max: 14 });
    const dist = createDistributionForActivity(activity);
    // PERT mean = (2 + 20 + 14) / 6 = 6
    expect(dist.mean()).toBeCloseTo(6);
  });

  it("uses sdOverride when provided", () => {
    const activity = makeActivity({ sdOverride: 3.5 });
    const dist = createDistributionForActivity(activity);
    const params = dist.parameters() as { sigma: number };
    expect(params.sigma).toBe(3.5);
  });

  it("throws for logNormal with zero mean", () => {
    const activity = makeActivity({
      min: 0,
      mostLikely: 0,
      max: 0,
      distributionType: "logNormal",
    });
    expect(() => createDistributionForActivity(activity)).toThrow();
  });

  it("wraps a Triangular order-violation with the activity's name", () => {
    const activity = makeActivity({
      name: "Bad Row",
      min: 5,
      mostLikely: 3,
      max: 1,
      distributionType: "triangular",
    });
    expect(() => createDistributionForActivity(activity)).toThrow(/Bad Row/);
  });

  it("creates UniformDistribution for uniform type", () => {
    const dist = createDistributionForActivity(
      makeActivity({ distributionType: "uniform" })
    );
    expect(dist).toBeInstanceOf(UniformDistribution);
  });

  it("uniform distribution uses activity min and max directly", () => {
    const activity = makeActivity({
      min: 3,
      mostLikely: 7,
      max: 10,
      distributionType: "uniform",
    });
    const dist = createDistributionForActivity(activity);
    expect(dist.parameters()).toEqual({ a: 3, b: 10 });
    expect(dist.mean()).toBe(6.5);
  });

  it("creates uniform distribution as point mass when min === max", () => {
    const activity = makeActivity({
      min: 7,
      mostLikely: 7,
      max: 7,
      distributionType: "uniform",
    });
    const dist = createDistributionForActivity(activity);
    expect(dist).toBeInstanceOf(UniformDistribution);
    expect(dist.mean()).toBe(7);
    expect(dist.variance()).toBe(0);
    expect(dist.inverseCDF(0.5)).toBe(7);
  });

  it("creates normal distribution with zero variance (min == max)", () => {
    const activity = makeActivity({
      min: 5,
      mostLikely: 5,
      max: 5,
      distributionType: "normal",
    });
    const dist = createDistributionForActivity(activity);
    expect(dist).toBeInstanceOf(NormalDistribution);
    expect(dist.mean()).toBe(5);
    expect(dist.variance()).toBe(0);
    expect(dist.inverseCDF(0.5)).toBe(5);
  });

  // -- Defensive branches ---------------------------------------------------
  //
  // The 2026-08-01 mutation baseline (docs/mutation-baseline-core-scope.md) scored
  // this file 55.56% — the weakest in Stryker's scope — and all four survivors were
  // in the two branches below. The score itself rests on only nine valid mutants and
  // is not worth much; the survivors are, because this function picks the
  // distribution for EVERY activity and neither guard was exercised.
  //
  // Both branches exist for data the type system cannot vouch for: a project from an
  // older export, a hand-edited file, or a future schema version read by an older
  // build. So the fixtures below deliberately construct Activities that normal
  // validation would reject — that is the point of the branches.

  describe("LogNormal PERT-mean guard", () => {
    it("rejects a PERT mean of exactly zero", () => {
      // The comparison is `mean <= 0`, so zero must throw. Without this case,
      // mutating it to `mean < 0` survives.
      const activity = makeActivity({
        min: 0,
        mostLikely: 0,
        max: 0,
        distributionType: "logNormal",
      });
      expect(() => createDistributionForActivity(activity)).toThrow(
        /Cannot create LogNormal distribution for activity "Test Activity": PERT mean must be > 0, got 0/
      );
    });

    it("rejects a negative PERT mean", () => {
      const activity = makeActivity({
        min: -6,
        mostLikely: 0,
        max: 0,
        distributionType: "logNormal",
      });
      expect(() => createDistributionForActivity(activity)).toThrow(
        /PERT mean must be > 0, got -1/
      );
    });

    it("accepts the smallest positive PERT mean, so the guard is not over-broad", () => {
      const activity = makeActivity({
        min: 1,
        mostLikely: 1,
        max: 1,
        distributionType: "logNormal",
      });
      expect(createDistributionForActivity(activity)).toBeInstanceOf(
        LogNormalDistribution
      );
    });

    it("preserves the original error as `cause`", () => {
      const activity = makeActivity({
        min: 0,
        mostLikely: 0,
        max: 0,
        distributionType: "logNormal",
      });
      try {
        createDistributionForActivity(activity);
        expect.unreachable("expected the PERT-mean guard to throw");
      } catch (err) {
        expect((err as { cause?: unknown }).cause).toBeInstanceOf(Error);
        expect(((err as { cause?: Error }).cause)!.message).toBe(
          "PERT mean must be > 0, got 0"
        );
      }
    });
  });

  describe("unknown distributionType label fallback", () => {
    // Reaching the `default` arm requires a runtime value outside the compile-time
    // union, which is exactly the malformed-data case the fallback documents.
    const unknownType = makeActivity({
      distributionType: "weibull" as Activity["distributionType"],
    });

    it("names the unknown type in the message rather than 'undefined'", () => {
      // DISTRIBUTION_LABELS has no "weibull" key, so the lookup is genuinely
      // undefined here and `?? activity.distributionType` is what supplies the name.
      // Mutating `??` to `&&` yields "Cannot create undefined distribution", which
      // the second assertion below rejects.
      expect(() => createDistributionForActivity(unknownType)).toThrow(
        /Cannot create weibull distribution for activity "Test Activity"/
      );
      expect(() => createDistributionForActivity(unknownType)).not.toThrow(
        /Cannot create undefined distribution/
      );
    });

    it("keeps the underlying reason in the message", () => {
      expect(() => createDistributionForActivity(unknownType)).toThrow(
        /Unknown distribution type: weibull/
      );
    });

    it("still uses the friendly label for a known type", () => {
      // Guards the other direction: the fallback must not shadow the label table.
      const activity = makeActivity({
        min: 0,
        mostLikely: 0,
        max: 0,
        distributionType: "logNormal",
      });
      expect(() => createDistributionForActivity(activity)).toThrow(
        /Cannot create LogNormal distribution/
      );
    });
  });
});
