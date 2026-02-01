import { describe, it, expect } from "vitest";
import {
  computePertMean,
  computeSpertSD,
  resolveSD,
  deriveMinMaxFromML,
  computeSkewIndicator,
  computeCV,
} from "./spert";
import { RSM_VALUES } from "@domain/models/types";

describe("computePertMean", () => {
  it("computes weighted mean: (min + 4*ml + max) / 6", () => {
    expect(computePertMean(2, 5, 14)).toBeCloseTo((2 + 20 + 14) / 6);
  });

  it("equals ml when min == ml == max", () => {
    expect(computePertMean(5, 5, 5)).toBe(5);
  });

  it("computes correctly for asymmetric estimates", () => {
    // (1 + 4*3 + 20) / 6 = 33/6 = 5.5
    expect(computePertMean(1, 3, 20)).toBeCloseTo(5.5);
  });
});

describe("computeSpertSD", () => {
  it("computes (max - min) * RSM", () => {
    const sd = computeSpertSD(2, 10, "mediumConfidence");
    expect(sd).toBeCloseTo((10 - 2) * RSM_VALUES.mediumConfidence);
  });

  it("returns 0 when min == max", () => {
    expect(computeSpertSD(5, 5, "mediumConfidence")).toBe(0);
  });

  it("uses correct RSM for near certainty", () => {
    const sd = computeSpertSD(1, 11, "nearCertainty");
    expect(sd).toBeCloseTo(10 * 0.070710678);
  });

  it("uses correct RSM for guesstimate", () => {
    const sd = computeSpertSD(1, 11, "guesstimate");
    expect(sd).toBeCloseTo(10 * 0.40620192);
  });
});

describe("resolveSD", () => {
  it("returns sdOverride when provided", () => {
    expect(resolveSD(2, 10, "mediumConfidence", 3.0)).toBe(3.0);
  });

  it("falls back to SPERT SD when no override", () => {
    const expected = computeSpertSD(2, 10, "mediumConfidence");
    expect(resolveSD(2, 10, "mediumConfidence")).toBe(expected);
  });
});

describe("deriveMinMaxFromML", () => {
  it("derives min/max from percentages", () => {
    const result = deriveMinMaxFromML(10, 0.3, 0.5);
    expect(result.min).toBeCloseTo(7);
    expect(result.max).toBeCloseTo(15);
  });

  it("returns ml for both when pcts are 0", () => {
    const result = deriveMinMaxFromML(10, 0, 0);
    expect(result.min).toBe(10);
    expect(result.max).toBe(10);
  });
});

describe("computeSkewIndicator", () => {
  it("returns 0 for symmetric estimates", () => {
    // min=2, ml=5, max=8 -> mean = (2+20+8)/6 = 5, skew = (5-5)/sd = 0
    expect(computeSkewIndicator(2, 5, 8, "mediumConfidence")).toBeCloseTo(0);
  });

  it("returns positive for right-skewed estimates", () => {
    // mean > ml when max is much larger
    expect(computeSkewIndicator(2, 3, 20, "mediumConfidence")).toBeGreaterThan(
      0
    );
  });

  it("returns 0 when sd is 0", () => {
    expect(computeSkewIndicator(5, 5, 5, "mediumConfidence")).toBe(0);
  });
});

describe("computeCV", () => {
  it("computes sd/mean", () => {
    expect(computeCV(10, 2)).toBeCloseTo(0.2);
  });

  it("returns 0 when mean is 0", () => {
    expect(computeCV(0, 1)).toBe(0);
  });
});
