// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// interpolateCDF used to live inside CDFComparisonChart.tsx and could only be reached
// by rendering the chart. It decides the probability the comparison view reports at a
// given duration, so its edges — outside the sampled range, exactly on a point, one
// point, unordered input — are worth asserting directly.

import { describe, it, expect } from "vitest";
import { interpolateCDF } from "./cdf-interpolate";
import type { CDFPoint } from "@domain/models/types";

const pt = (value: number, probability: number): CDFPoint => ({ value, probability });

// A deliberately coarse curve so interpolated answers are exact, not floating fuzz.
const CURVE: CDFPoint[] = [pt(10, 0), pt(20, 0.5), pt(30, 1)];

describe("interpolateCDF", () => {
  it("returns 0 when there is nothing to interpolate from", () => {
    expect(interpolateCDF([], 15)).toBe(0);
  });

  it("returns the exact probability when the target lands on a sampled point", () => {
    expect(interpolateCDF(CURVE, 10)).toBe(0);
    expect(interpolateCDF(CURVE, 20)).toBe(0.5);
    expect(interpolateCDF(CURVE, 30)).toBe(1);
  });

  it("interpolates linearly between two points", () => {
    expect(interpolateCDF(CURVE, 15)).toBeCloseTo(0.25, 10);
    expect(interpolateCDF(CURVE, 25)).toBeCloseTo(0.75, 10);
  });

  it("interpolates proportionally, not just at the midpoint", () => {
    expect(interpolateCDF(CURVE, 12)).toBeCloseTo(0.1, 10);
    expect(interpolateCDF(CURVE, 28)).toBeCloseTo(0.9, 10);
  });

  describe("outside the sampled range", () => {
    it("clamps below the range to the lowest point's probability", () => {
      // Not 0 by coincidence — a curve whose floor is non-zero must clamp to it.
      expect(interpolateCDF([pt(10, 0.2), pt(20, 0.8)], 5)).toBe(0.2);
    });

    it("clamps above the range to the highest point's probability", () => {
      expect(interpolateCDF([pt(10, 0.2), pt(20, 0.8)], 99)).toBe(0.8);
    });
  });

  it("handles a single point at, below and above its value", () => {
    const one = [pt(10, 0.42)];
    expect(interpolateCDF(one, 10)).toBe(0.42);
    expect(interpolateCDF(one, 1)).toBe(0.42);
    expect(interpolateCDF(one, 100)).toBe(0.42);
  });

  it("does not assume the points arrive sorted", () => {
    const shuffled = [pt(30, 1), pt(10, 0), pt(20, 0.5)];
    expect(interpolateCDF(shuffled, 15)).toBeCloseTo(0.25, 10);
    expect(interpolateCDF(shuffled, 25)).toBeCloseTo(0.75, 10);
  });

  it("picks the TIGHTEST bracketing pair, not the outermost", () => {
    // With four points, interpolating at 15 must use 10..20 and ignore 0 and 30.
    // Using the outer pair would give 0.5 here instead of 0.25.
    const wide = [pt(0, 0), pt(10, 0), pt(20, 0.5), pt(30, 1)];
    expect(interpolateCDF(wide, 15)).toBeCloseTo(0.25, 10);
  });

  it("survives duplicate values without dividing by zero", () => {
    const dupes = [pt(10, 0.3), pt(10, 0.3), pt(20, 0.9)];
    expect(Number.isFinite(interpolateCDF(dupes, 15))).toBe(true);
    expect(interpolateCDF(dupes, 10)).toBe(0.3);
  });
});
