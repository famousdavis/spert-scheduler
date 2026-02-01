import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { NormalDistribution, normalQuantile } from "./normal";
import { createSeededRng } from "@infrastructure/rng";

describe("normalQuantile (Acklam)", () => {
  it("returns 0 for p=0.5", () => {
    expect(normalQuantile(0.5)).toBeCloseTo(0, 8);
  });

  it("returns ~-1.6449 for p=0.05", () => {
    expect(normalQuantile(0.05)).toBeCloseTo(-1.6449, 3);
  });

  it("returns ~1.6449 for p=0.95", () => {
    expect(normalQuantile(0.95)).toBeCloseTo(1.6449, 3);
  });

  it("returns ~-2.3263 for p=0.01", () => {
    expect(normalQuantile(0.01)).toBeCloseTo(-2.3263, 3);
  });

  it("throws for p=0 and p=1", () => {
    expect(() => normalQuantile(0)).toThrow();
    expect(() => normalQuantile(1)).toThrow();
  });

  it("is monotonically non-decreasing for well-separated inputs (property)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0.001, max: 0.998, noNaN: true }),
        (a) => {
          // Test with a guaranteed separation of at least 0.001
          const b = Math.min(a + 0.001, 0.999);
          if (b <= a) return true; // skip degenerate
          return normalQuantile(a) <= normalQuantile(b);
        }
      ),
      { numRuns: 1000 }
    );
  });
});

describe("NormalDistribution", () => {
  it("has correct mean and variance", () => {
    const dist = new NormalDistribution(10, 2);
    expect(dist.mean()).toBe(10);
    expect(dist.variance()).toBe(4);
  });

  it("inverseCDF(0.5) equals mean", () => {
    const dist = new NormalDistribution(10, 2);
    expect(dist.inverseCDF(0.5)).toBeCloseTo(10, 6);
  });

  it("inverseCDF produces monotonic results", () => {
    const dist = new NormalDistribution(10, 3);
    const ps = [0.01, 0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95, 0.99];
    const vals = ps.map((p) => dist.inverseCDF(p));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]!).toBeGreaterThan(vals[i - 1]!);
    }
  });

  it("samples have mean near mu (large sample)", () => {
    const dist = new NormalDistribution(50, 5);
    const rng = createSeededRng("normal-test");
    let sum = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) {
      sum += dist.sample(rng);
    }
    const sampleMean = sum / n;
    expect(sampleMean).toBeCloseTo(50, 0); // within ~1
  });

  it("returns mean when sigma is 0", () => {
    const dist = new NormalDistribution(7, 0);
    expect(dist.inverseCDF(0.1)).toBe(7);
    expect(dist.inverseCDF(0.9)).toBe(7);
    const rng = createSeededRng("zero-sigma");
    expect(dist.sample(rng)).toBe(7);
  });

  it("throws for negative sigma", () => {
    expect(() => new NormalDistribution(10, -1)).toThrow();
  });
});
