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
    // Corrected conversion (start day = day 1): P80 = 5 working days from Mon 2026-01-05
    // finishes Fri 2026-01-09. Hand-derived golden, independent of durationToFinishDateISO.
    const result = computeTargetRAGColor(makeParams({
      startDate: "2026-01-05",  // Monday
      targetFinishDate: "2026-01-09",  // Friday = the P80 finish exactly
      percentiles: { 50: 3, 80: 5 },
    }));
    expect(result).toBe("green");
  });

  it("returns amber one working day inside the green-percentile finish (boundary flip)", () => {
    // Same fixture, target one working day earlier than the P80 finish (Thu 2026-01-08).
    // P50 = 3 → finishes Wed 2026-01-07 ≤ target, so amber. Under the pre-0.54.1
    // (start-day-late) conversion the green finish landed a day later and this read redder.
    const result = computeTargetRAGColor(makeParams({
      startDate: "2026-01-05",
      targetFinishDate: "2026-01-08",  // Thursday
      percentiles: { 50: 3, 80: 5 },
    }));
    expect(result).toBe("amber");
  });

  it("returns gray when a percentile duration rounds to zero or below (null conversion)", () => {
    // durationToFinishDateISO returns null for days <= 0, so the RAG is gray (0.54.1).
    const result = computeTargetRAGColor(makeParams({
      startDate: "2026-01-05",
      targetFinishDate: "2026-01-05",
      percentiles: { 50: 0, 80: 0 },
    }));
    expect(result).toBe("gray");
  });
});
