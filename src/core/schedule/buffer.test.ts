import { describe, it, expect } from "vitest";
import { computeScheduleBuffer } from "./buffer";

describe("computeScheduleBuffer", () => {
  const percentiles: Record<number, number> = {
    5: 150,
    10: 160,
    25: 175,
    50: 200,
    75: 220,
    85: 235,
    90: 245,
    95: 260,
  };

  it("computes positive buffer when MC percentile > deterministic total", () => {
    const result = computeScheduleBuffer(200, percentiles, 0.5, 0.95);
    expect(result).not.toBeNull();
    expect(result!.deterministicTotal).toBe(200);
    expect(result!.projectTargetDuration).toBe(260);
    expect(result!.bufferDays).toBe(60);
    expect(result!.activityProbabilityTarget).toBe(0.5);
    expect(result!.projectProbabilityTarget).toBe(0.95);
  });

  it("computes zero buffer when targets match", () => {
    // If deterministic at P50 = 200, and MC P50 = 200
    const result = computeScheduleBuffer(200, percentiles, 0.5, 0.5);
    expect(result).not.toBeNull();
    expect(result!.bufferDays).toBe(0);
  });

  it("computes negative buffer when deterministic exceeds MC percentile", () => {
    // Deterministic at a high P-target might exceed a lower MC percentile
    const result = computeScheduleBuffer(250, percentiles, 0.85, 0.5);
    expect(result).not.toBeNull();
    expect(result!.bufferDays).toBe(-50);
  });

  it("returns null when required percentile is not available", () => {
    const result = computeScheduleBuffer(200, percentiles, 0.5, 0.99);
    expect(result).toBeNull();
  });

  it("uses the correct percentile key (rounded)", () => {
    const result = computeScheduleBuffer(200, percentiles, 0.5, 0.85);
    expect(result).not.toBeNull();
    expect(result!.projectTargetDuration).toBe(235);
    expect(result!.bufferDays).toBe(35);
  });

  it("handles typical P50 activity / P95 project scenario", () => {
    // Simulating the user's example: 200 day schedule at P50, P95 = 232
    const simPercentiles: Record<number, number> = {
      50: 198,
      85: 220,
      95: 232,
    };
    const result = computeScheduleBuffer(200, simPercentiles, 0.5, 0.95);
    expect(result).not.toBeNull();
    expect(result!.bufferDays).toBe(32);
  });

  it("rounds buffer to whole number", () => {
    const simPercentiles: Record<number, number> = {
      95: 232.7777,
    };
    const result = computeScheduleBuffer(200, simPercentiles, 0.5, 0.95);
    expect(result).not.toBeNull();
    expect(result!.bufferDays).toBe(33);
  });
});
