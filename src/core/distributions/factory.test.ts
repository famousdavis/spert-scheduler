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
});
