import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import { TriangularDistribution } from "./triangular";
import { createSeededRng } from "@infrastructure/rng";

describe("TriangularDistribution", () => {
  it("has correct mean", () => {
    const dist = new TriangularDistribution(2, 5, 11);
    expect(dist.mean()).toBeCloseTo((2 + 5 + 11) / 3);
  });

  it("has correct variance", () => {
    const dist = new TriangularDistribution(2, 5, 11);
    const expected = (4 + 121 + 25 - 22 - 10 - 55) / 18;
    expect(dist.variance()).toBeCloseTo(expected);
  });

  it("samples are bounded by [a, b]", () => {
    const dist = new TriangularDistribution(1, 4, 10);
    const rng = createSeededRng("tri-bounds");
    for (let i = 0; i < 10000; i++) {
      const s = dist.sample(rng);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(10);
    }
  });

  it("inverseCDF(0) = a, inverseCDF(1) = b", () => {
    const dist = new TriangularDistribution(2, 5, 10);
    expect(dist.inverseCDF(0)).toBe(2);
    expect(dist.inverseCDF(1)).toBe(10);
  });

  it("inverseCDF is monotonically increasing", () => {
    const dist = new TriangularDistribution(1, 5, 12);
    const ps = [0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 1];
    const vals = ps.map((p) => dist.inverseCDF(p));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]!).toBeGreaterThanOrEqual(vals[i - 1]!);
    }
  });

  it("sample mean converges to theoretical mean", () => {
    const dist = new TriangularDistribution(2, 6, 10);
    const rng = createSeededRng("tri-mean");
    let sum = 0;
    const n = 50000;
    for (let i = 0; i < n; i++) {
      sum += dist.sample(rng);
    }
    expect(sum / n).toBeCloseTo(dist.mean(), 1);
  });

  it("throws for a > c", () => {
    expect(() => new TriangularDistribution(5, 3, 10)).toThrow();
  });

  it("throws for c > b", () => {
    expect(() => new TriangularDistribution(1, 12, 10)).toThrow();
  });

  it("throws for a == b", () => {
    expect(() => new TriangularDistribution(5, 5, 5)).toThrow();
  });

  it("property: all samples bounded (fast-check)", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (x, y, z) => {
          const sorted = [x, y, z].sort((a, b) => a - b);
          const [a, c, b] = sorted as [number, number, number];
          if (a === b) return true; // skip degenerate
          const dist = new TriangularDistribution(a, c, b);
          const rng = createSeededRng("fc-tri");
          for (let i = 0; i < 100; i++) {
            const s = dist.sample(rng);
            if (s < a - 1e-10 || s > b + 1e-10) return false;
          }
          return true;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("handles a == c (peak at min, right-skewed)", () => {
    const dist = new TriangularDistribution(2, 2, 10);
    expect(dist.mean()).toBeCloseTo((2 + 2 + 10) / 3);
    const rng = createSeededRng("left-peak");
    for (let i = 0; i < 1000; i++) {
      const s = dist.sample(rng);
      expect(s).toBeGreaterThanOrEqual(2);
      expect(s).toBeLessThanOrEqual(10);
    }
  });

  it("handles c == b (peak at max, left-skewed)", () => {
    const dist = new TriangularDistribution(1, 8, 8);
    expect(dist.mean()).toBeCloseTo((1 + 8 + 8) / 3);
    const rng = createSeededRng("right-peak");
    for (let i = 0; i < 1000; i++) {
      const s = dist.sample(rng);
      expect(s).toBeGreaterThanOrEqual(1);
      expect(s).toBeLessThanOrEqual(8);
    }
  });
});
