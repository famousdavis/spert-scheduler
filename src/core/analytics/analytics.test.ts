// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import * as fc from "fast-check";
import {
  sortSamples,
  percentile,
  computeStandardPercentiles,
  mean,
  standardDeviation,
  histogram,
  cdf,
  lookupProbability,
  computeBatchPercentileCIs,
  computeStandardPercentileCIs,
} from "./analytics";
import { STANDARD_PERCENTILES } from "@domain/models/types";

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
  it("returns all standard percentiles", () => {
    const arr = new Float64Array(1000);
    for (let i = 0; i < 1000; i++) arr[i] = i;
    const result = computeStandardPercentiles(arr);
    expect(Object.keys(result)).toHaveLength(STANDARD_PERCENTILES.length);
    expect(result[5]).toBeDefined();
    expect(result[80]).toBeDefined();
    expect(result[95]).toBeDefined();
    expect(result[99]).toBeDefined();
  });

  it("percentiles are monotonically non-decreasing", () => {
    const arr = new Float64Array(10000);
    // eslint-disable-next-line sonarjs/pseudo-random
    for (let i = 0; i < 10000; i++) arr[i] = Math.random() * 100; // NOSONAR — test data generation
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
    // eslint-disable-next-line sonarjs/pseudo-random
    for (let i = 0; i < n; i++) arr[i] = Math.random() * 100; // NOSONAR — test data generation
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

  it("last point has probability capped at 0.99", () => {
    const arr = new Float64Array(50);
    for (let i = 0; i < 50; i++) arr[i] = i * 2;
    const points = cdf(arr);
    expect(points[points.length - 1]!.probability).toBe(0.99);
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

describe("lookupProbability", () => {
  it("returns 0 for empty samples", () => {
    expect(lookupProbability([], 10)).toBe(0);
  });

  it("returns 0 when target is below all samples", () => {
    expect(lookupProbability([5, 10, 15, 20], 3)).toBe(0);
  });

  it("returns correct probability for target within range", () => {
    // 4 samples: [10, 20, 30, 40]. Target = 25 → 2 samples ≤ 25 → 2/4 = 0.5
    expect(lookupProbability([10, 20, 30, 40], 25)).toBe(0.5);
  });

  it("returns correct probability for target matching a sample exactly", () => {
    // [10, 20, 30, 40]. Target = 20 → 2 samples ≤ 20 → 2/4 = 0.5
    expect(lookupProbability([10, 20, 30, 40], 20)).toBe(0.5);
  });

  it("caps at 0.99 when target is at or above max", () => {
    expect(lookupProbability([10, 20, 30, 40], 40)).toBe(0.99);
    expect(lookupProbability([10, 20, 30, 40], 100)).toBe(0.99);
  });

  it("returns probability for target equal to min", () => {
    // [10, 20, 30, 40]. Target = 10 → 1 sample ≤ 10 → 1/4 = 0.25
    expect(lookupProbability([10, 20, 30, 40], 10)).toBe(0.25);
  });

  it("handles single-element array", () => {
    expect(lookupProbability([50], 49)).toBe(0);
    expect(lookupProbability([50], 50)).toBe(0.99);
    expect(lookupProbability([50], 51)).toBe(0.99);
  });

  it("handles duplicate samples", () => {
    // [10, 10, 20, 20]. Target = 10 → 2 samples ≤ 10 → 2/4 = 0.5
    expect(lookupProbability([10, 10, 20, 20], 10)).toBe(0.5);
  });

  it("property: probability is monotonically non-decreasing with increasing target", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 1, max: 500 }), { minLength: 10, maxLength: 100 }),
        (unsorted) => {
          const sorted = [...unsorted].sort((a, b) => a - b);
          let prev = 0;
          for (let t = 0; t <= 510; t += 10) {
            const p = lookupProbability(sorted, t);
            if (p < prev) return false;
            prev = p;
          }
          return true;
        }
      ),
      { numRuns: 50 }
    );
  });
});

describe("edge cases", () => {
  it("percentile with single sample returns that value for any p", () => {
    const arr = new Float64Array([42]);
    expect(percentile(arr, 0)).toBe(42);
    expect(percentile(arr, 0.5)).toBe(42);
    expect(percentile(arr, 1)).toBe(42);
  });

  it("mean with single value", () => {
    expect(mean(new Float64Array([7]))).toBe(7);
  });

  it("standardDeviation with single value", () => {
    expect(standardDeviation(new Float64Array([7]))).toBe(0);
  });

  it("histogram with two identical values", () => {
    const bins = histogram(new Float64Array([3, 3]), 10);
    expect(bins).toHaveLength(1);
    expect(bins[0]!.count).toBe(2);
  });
});

/**
 * computeBatchPercentileCIs — the last uncovered sub-threshold function reachable by a
 * plain unit test (cc 11, `/core`, execution count 0). It appeared as "the cheapest open
 * item" in two consecutive censuses and was skipped both times;
 * docs/CENSUS_cognitive-complexity-2026-08-02b.md records it, and this closes it.
 *
 * ⚠️ IT USES `Math.random()` AND IS THEREFORE NOT DETERMINISTIC. Two kinds of test below,
 * kept apart on purpose:
 *   - INVARIANTS, run against the real RNG: lower <= point <= upper, key set, monotonicity.
 *     True for every possible resample, so they cannot flake.
 *   - EXACT VALUES, with Math.random stubbed. Pinning the bootstrap to a known index makes
 *     the whole loop deterministic and lets the CI bounds be asserted precisely rather than
 *     bounded loosely — which is the difference between covering the loop and checking it.
 * An assertion that only holds for *some* resamples would be a flake dressed as a guard,
 * so there are none.
 */
describe("computeBatchPercentileCIs", () => {
  const samples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns an entry for exactly the requested percentiles, and no others", () => {
    const result = computeBatchPercentileCIs(samples, [10, 50, 90], 20);
    expect(Object.keys(result).map(Number).sort((a, b) => a - b)).toEqual([10, 50, 90]);
    expect(result[50]!.percentile).toBe(50);
  });

  it("brackets every point estimate: lower <= point <= upper", () => {
    const result = computeBatchPercentileCIs(samples, [5, 50, 95], 100);
    for (const p of [5, 50, 95]) {
      const ci = result[p]!;
      expect(ci.lower).toBeLessThanOrEqual(ci.point);
      expect(ci.upper).toBeGreaterThanOrEqual(ci.point);
    }
  });

  it("point estimates rise with the percentile", () => {
    const result = computeBatchPercentileCIs(samples, [10, 50, 90], 50);
    expect(result[10]!.point).toBeLessThan(result[50]!.point);
    expect(result[50]!.point).toBeLessThan(result[90]!.point);
  });

  it("reports the confidence level it was given, not the default", () => {
    const result = computeBatchPercentileCIs(samples, [50], 20, 0.8);
    expect(result[50]!.confidence).toBe(0.8);
  });

  it("empty samples yield zeroed entries that still carry the percentile and confidence", () => {
    const result = computeBatchPercentileCIs([], [25, 75], 100, 0.9);
    expect(result[25]).toEqual({ percentile: 25, point: 0, lower: 0, upper: 0, confidence: 0.9 });
    expect(result[75]).toEqual({ percentile: 75, point: 0, lower: 0, upper: 0, confidence: 0.9 });
  });

  it("an empty percentile list yields an empty result rather than throwing", () => {
    expect(computeBatchPercentileCIs(samples, [], 10)).toEqual({});
  });

  it("a single sample collapses point and both bounds onto it", () => {
    const result = computeBatchPercentileCIs([42], [5, 50, 95], 30);
    for (const p of [5, 50, 95]) {
      expect(result[p]).toEqual({
        percentile: p,
        point: 42,
        lower: 42,
        upper: 42,
        confidence: 0.95,
      });
    }
  });

  it("accepts a Float64Array as readily as a number[]", () => {
    const typed = computeBatchPercentileCIs(Float64Array.from(samples), [50], 20);
    expect(typed[50]!.point).toBe(computeBatchPercentileCIs(samples, [50], 20)[50]!.point);
  });

  it("EXACT: with the resample pinned to index 0, both bounds are that element", () => {
    // Math.random() -> 0 makes every draw pick samples[0] — note the ORIGINAL array, not
    // the sorted copy — so every bootstrap resample is constant and both CI bounds land on
    // it exactly. Point estimates still come from the real sorted samples, so this also
    // proves the two are computed from different data.
    vi.spyOn(Math, "random").mockReturnValue(0);
    const unsorted = [70, 10, 90, 30];

    const result = computeBatchPercentileCIs(unsorted, [10, 90], 25);

    expect(result[10]!.lower).toBe(70);
    expect(result[10]!.upper).toBe(70);
    expect(result[90]!.lower).toBe(70);
    expect(result[90]!.upper).toBe(70);
    // …while the point estimates are drawn from the sorted originals, not from index 0.
    // Hand-derived: sorted is [10, 30, 70, 90] and `percentile` interpolates linearly at
    // p·(n-1), so P10 = index 0.3 → 10 + 0.3·20 = 16, and P90 = index 2.7 → 70 + 0.7·20 = 84.
    // Interpolated values like these could only come from the sorted original array, which
    // is a sharper demonstration than a raw element would have been.
    expect(result[10]!.point).toBe(16);
    expect(result[90]!.point).toBe(84);
  });

  it("EXACT: with the resample pinned to the last index, both bounds are that element", () => {
    // The mirror of the test above — a stub returning a constant that happened to match
    // samples[0] would pass that one and fail this one.
    vi.spyOn(Math, "random").mockReturnValue(0.999999);
    const unsorted = [70, 10, 90, 30];

    const result = computeBatchPercentileCIs(unsorted, [50], 25);

    expect(result[50]!.lower).toBe(30);
    expect(result[50]!.upper).toBe(30);
    expect(result[50]!.point).toBe(50);
  });

  it("a single bootstrap iteration still produces usable bounds (index clamping)", () => {
    // lowerIdx/upperIdx both clamp to 0 here; without the Math.max/?? guards this is where
    // an undefined bound would surface.
    const result = computeBatchPercentileCIs(samples, [50], 1);
    expect(result[50]!.lower).toBeTypeOf("number");
    expect(result[50]!.upper).toBeTypeOf("number");
    expect(Number.isNaN(result[50]!.lower)).toBe(false);
    expect(Number.isNaN(result[50]!.upper)).toBe(false);
  });
});

describe("computeStandardPercentileCIs", () => {
  it("covers every standard percentile", () => {
    const result = computeStandardPercentileCIs([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 20);
    expect(Object.keys(result).map(Number).sort((a, b) => a - b)).toEqual(
      [...STANDARD_PERCENTILES].sort((a, b) => a - b)
    );
  });
});
