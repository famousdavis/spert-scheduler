import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { UniformDistribution } from "./uniform";
import { createSeededRng } from "@infrastructure/rng";

describe("UniformDistribution", () => {
  it("computes correct mean", () => {
    const dist = new UniformDistribution(2, 10);
    expect(dist.mean()).toBe(6);
  });

  it("computes correct variance", () => {
    const dist = new UniformDistribution(0, 12);
    // variance = (12-0)^2 / 12 = 144/12 = 12
    expect(dist.variance()).toBe(12);
  });

  it("returns correct parameters", () => {
    const dist = new UniformDistribution(3, 15);
    expect(dist.parameters()).toEqual({ a: 3, b: 15 });
  });

  it("inverseCDF(0) returns a", () => {
    const dist = new UniformDistribution(5, 20);
    expect(dist.inverseCDF(0)).toBe(5);
  });

  it("inverseCDF(1) returns b", () => {
    const dist = new UniformDistribution(5, 20);
    expect(dist.inverseCDF(1)).toBe(20);
  });

  it("inverseCDF(0.5) returns midpoint", () => {
    const dist = new UniformDistribution(0, 10);
    expect(dist.inverseCDF(0.5)).toBe(5);
  });

  it("inverseCDF is monotonically increasing", () => {
    const dist = new UniformDistribution(2, 18);
    const percentiles = [0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99];
    for (let i = 1; i < percentiles.length; i++) {
      expect(dist.inverseCDF(percentiles[i]!)).toBeGreaterThan(
        dist.inverseCDF(percentiles[i - 1]!)
      );
    }
  });

  it("inverseCDF throws for p outside [0, 1]", () => {
    const dist = new UniformDistribution(0, 10);
    expect(() => dist.inverseCDF(-0.1)).toThrow();
    expect(() => dist.inverseCDF(1.1)).toThrow();
  });

  it("all samples fall within [a, b]", () => {
    const dist = new UniformDistribution(3, 17);
    const rng = createSeededRng("uniform-bounds");
    for (let i = 0; i < 10000; i++) {
      const s = dist.sample(rng);
      expect(s).toBeGreaterThanOrEqual(3);
      expect(s).toBeLessThanOrEqual(17);
    }
  });

  it("samples have mean near theoretical mean (large sample)", () => {
    const dist = new UniformDistribution(4, 16);
    const rng = createSeededRng("uniform-mean");
    let sum = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) {
      sum += dist.sample(rng);
    }
    const sampleMean = sum / n;
    expect(sampleMean).toBeCloseTo(10, 0); // within ~1
  });

  it("throws when a > b", () => {
    expect(() => new UniformDistribution(10, 3)).toThrow();
  });

  it("handles degenerate case a === b (point mass)", () => {
    const dist = new UniformDistribution(5, 5);
    expect(dist.mean()).toBe(5);
    expect(dist.variance()).toBe(0);
    expect(dist.inverseCDF(0)).toBe(5);
    expect(dist.inverseCDF(0.5)).toBe(5);
    expect(dist.inverseCDF(1)).toBe(5);
    const rng = createSeededRng("uniform-point");
    for (let i = 0; i < 100; i++) {
      expect(dist.sample(rng)).toBe(5);
    }
  });

  it("property: inverseCDF is bounded by [a, b]", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0.01, max: 100, noNaN: true }),
        fc.double({ min: 0.001, max: 0.999, noNaN: true }),
        (a, range, p) => {
          const b = a + range;
          const dist = new UniformDistribution(a, b);
          const val = dist.inverseCDF(p);
          return val >= a && val <= b;
        }
      )
    );
  });
});
