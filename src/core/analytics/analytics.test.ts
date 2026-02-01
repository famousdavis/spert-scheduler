import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  sortSamples,
  percentile,
  computeStandardPercentiles,
  mean,
  standardDeviation,
  histogram,
  cdf,
} from "./analytics";

describe("sortSamples", () => {
  it("sorts in ascending order", () => {
    const arr = new Float64Array([5, 2, 8, 1, 9]);
    sortSamples(arr);
    expect(Array.from(arr)).toEqual([1, 2, 5, 8, 9]);
  });
});

describe("percentile", () => {
  it("returns min for p=0", () => {
    const arr = new Float64Array([1, 2, 3, 4, 5]);
    expect(percentile(arr, 0)).toBe(1);
  });

  it("returns max for p=1", () => {
    const arr = new Float64Array([1, 2, 3, 4, 5]);
    expect(percentile(arr, 1)).toBe(5);
  });

  it("returns median for p=0.5 (odd count)", () => {
    const arr = new Float64Array([1, 2, 3, 4, 5]);
    expect(percentile(arr, 0.5)).toBe(3);
  });

  it("interpolates for p=0.5 (even count)", () => {
    const arr = new Float64Array([1, 2, 3, 4]);
    expect(percentile(arr, 0.5)).toBeCloseTo(2.5);
  });

  it("throws for empty array", () => {
    expect(() => percentile(new Float64Array(0), 0.5)).toThrow();
  });
});

describe("computeStandardPercentiles", () => {
  it("returns all 12 standard percentiles", () => {
    const arr = new Float64Array(1000);
    for (let i = 0; i < 1000; i++) arr[i] = i;
    const result = computeStandardPercentiles(arr);
    expect(Object.keys(result)).toHaveLength(12);
    expect(result[5]).toBeDefined();
    expect(result[95]).toBeDefined();
    expect(result[99]).toBeDefined();
  });

  it("percentiles are monotonically non-decreasing", () => {
    const arr = new Float64Array(10000);
    for (let i = 0; i < 10000; i++) arr[i] = Math.random() * 100;
    sortSamples(arr);
    const result = computeStandardPercentiles(arr);
    const keys = [5, 10, 25, 50, 75, 85, 90, 95, 96, 97, 98, 99];
    for (let i = 1; i < keys.length; i++) {
      expect(result[keys[i]!]).toBeGreaterThanOrEqual(result[keys[i - 1]!]!);
    }
  });
});

describe("mean", () => {
  it("computes arithmetic mean", () => {
    expect(mean(new Float64Array([2, 4, 6]))).toBe(4);
  });

  it("returns 0 for empty", () => {
    expect(mean(new Float64Array(0))).toBe(0);
  });
});

describe("standardDeviation", () => {
  it("computes population SD", () => {
    // [2, 4, 6] -> mean=4, variance=(4+0+4)/3=8/3, SD=sqrt(8/3)
    expect(standardDeviation(new Float64Array([2, 4, 6]))).toBeCloseTo(
      Math.sqrt(8 / 3)
    );
  });

  it("returns 0 for constant values", () => {
    expect(standardDeviation(new Float64Array([5, 5, 5]))).toBe(0);
  });

  it("returns 0 for empty", () => {
    expect(standardDeviation(new Float64Array(0))).toBe(0);
  });
});

describe("histogram", () => {
  it("creates correct number of bins", () => {
    const arr = new Float64Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const bins = histogram(arr, 5);
    expect(bins).toHaveLength(5);
  });

  it("bin counts sum to sample count", () => {
    const n = 1000;
    const arr = new Float64Array(n);
    for (let i = 0; i < n; i++) arr[i] = Math.random() * 100;
    const bins = histogram(arr, 20);
    const totalCount = bins.reduce((sum, b) => sum + b.count, 0);
    expect(totalCount).toBe(n);
  });

  it("property: bin counts always sum to sample count (fast-check)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 10, max: 500 }),
        fc.integer({ min: 2, max: 50 }),
        (n, binCount) => {
          const arr = new Float64Array(n);
          for (let i = 0; i < n; i++) arr[i] = i * 1.5;
          const bins = histogram(arr, binCount);
          const total = bins.reduce((sum, b) => sum + b.count, 0);
          return total === n;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("returns empty for empty input", () => {
    expect(histogram(new Float64Array(0), 10)).toEqual([]);
  });

  it("handles single-value input", () => {
    const bins = histogram(new Float64Array([5, 5, 5]), 10);
    expect(bins).toHaveLength(1);
    expect(bins[0]!.count).toBe(3);
  });
});

describe("cdf", () => {
  it("produces monotonically non-decreasing probabilities", () => {
    const arr = new Float64Array(100);
    for (let i = 0; i < 100; i++) arr[i] = i;
    const points = cdf(arr);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]!.probability).toBeGreaterThanOrEqual(
        points[i - 1]!.probability
      );
    }
  });

  it("last point has probability 1", () => {
    const arr = new Float64Array(50);
    for (let i = 0; i < 50; i++) arr[i] = i * 2;
    const points = cdf(arr);
    expect(points[points.length - 1]!.probability).toBe(1);
  });

  it("downsamples when maxPoints is specified", () => {
    const arr = new Float64Array(1000);
    for (let i = 0; i < 1000; i++) arr[i] = i;
    const points = cdf(arr, 100);
    expect(points.length).toBeLessThanOrEqual(102); // 100 + possible last point
  });

  it("returns empty for empty input", () => {
    expect(cdf(new Float64Array(0))).toEqual([]);
  });
});
