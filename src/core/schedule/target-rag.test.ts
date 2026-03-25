// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { computeTargetRAGColor, type TargetRAGParams } from "./target-rag";

/** Helper to build params with sensible defaults */
function makeParams(overrides: Partial<TargetRAGParams> = {}): TargetRAGParams {
  return {
    targetFinishDate: "2026-06-01",
    percentiles: { 50: 50, 80: 80 },
    startDate: "2026-01-05",
    greenPct: 80,
    amberPct: 50,
    ...overrides,
  };
}

describe("computeTargetRAGColor", () => {
  it("returns gray when targetFinishDate is null", () => {
    expect(computeTargetRAGColor(makeParams({ targetFinishDate: null }))).toBe("gray");
  });

  it("returns gray when targetFinishDate is undefined", () => {
    expect(computeTargetRAGColor(makeParams({ targetFinishDate: undefined }))).toBe("gray");
  });

  it("returns gray when percentiles is null", () => {
    expect(computeTargetRAGColor(makeParams({ percentiles: null }))).toBe("gray");
  });

  it("returns gray when startDate is null", () => {
    expect(computeTargetRAGColor(makeParams({ startDate: null }))).toBe("gray");
  });

  it("returns gray when green percentile not found", () => {
    expect(computeTargetRAGColor(makeParams({ percentiles: { 50: 50 }, greenPct: 80 }))).toBe("gray");
  });

  it("returns gray when amber percentile not found", () => {
    expect(computeTargetRAGColor(makeParams({ percentiles: { 80: 80 }, amberPct: 50 }))).toBe("gray");
  });

  it("returns green when target is after the green-percentile finish", () => {
    // P80 = 80 working days from 2026-01-05 → approx 2026-04-24 (well before 2026-12-31)
    const result = computeTargetRAGColor(makeParams({
      targetFinishDate: "2026-12-31",
      percentiles: { 50: 50, 80: 80 },
    }));
    expect(result).toBe("green");
  });

  it("returns amber when target is between amber and green finish dates", () => {
    // P80 = 200 days → finishes ~mid-Oct 2026; P50 = 50 days → finishes ~Mar 2026
    // Target 2026-06-01 is after P50 finish but before P80 finish
    const result = computeTargetRAGColor(makeParams({
      targetFinishDate: "2026-06-01",
      percentiles: { 50: 50, 80: 200 },
    }));
    expect(result).toBe("amber");
  });

  it("returns red when target is before both amber and green finish dates", () => {
    // P80 = 200, P50 = 150 → both finish after Feb 2026
    // Target 2026-02-01 is before both
    const result = computeTargetRAGColor(makeParams({
      targetFinishDate: "2026-02-01",
      percentiles: { 50: 150, 80: 200 },
    }));
    expect(result).toBe("red");
  });

  it("returns green when target exactly matches the green-percentile finish date", () => {
    // P80 = 1 working day from 2026-01-06 (Monday) → finish = 2026-01-07 (Tuesday)
    // We need the EXACT date, so use a 1-day duration from a known Monday
    const result = computeTargetRAGColor(makeParams({
      startDate: "2026-01-05",  // Monday
      targetFinishDate: "2026-01-06",  // Tuesday = 1 working day later
      percentiles: { 50: 0, 80: 1 },
    }));
    expect(result).toBe("green");
  });

  it("handles zero-duration percentiles (green when target is on start date)", () => {
    const result = computeTargetRAGColor(makeParams({
      startDate: "2026-01-05",
      targetFinishDate: "2026-01-05",
      percentiles: { 50: 0, 80: 0 },
    }));
    expect(result).toBe("green");
  });
});
