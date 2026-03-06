import { describe, it, expect } from "vitest";
import { computeHeuristic } from "./heuristic";

describe("computeHeuristic", () => {
  it("computes min and max from ML using percentages", () => {
    const result = computeHeuristic(12, 50, 200);
    expect(result.min).toBe(6);
    expect(result.max).toBe(24);
  });

  it("returns {0, 0} when ML is 0", () => {
    const result = computeHeuristic(0, 50, 200);
    expect(result.min).toBe(0);
    expect(result.max).toBe(0);
  });

  it("preserves fractional results to 2dp", () => {
    // 7 * 50% = 3.5
    const result = computeHeuristic(7, 50, 200);
    expect(result.min).toBe(3.5);
    expect(result.max).toBe(14);
  });

  it("returns 0.5 for ML=1 with 50%", () => {
    const result = computeHeuristic(1, 50, 200);
    expect(result.min).toBe(0.5);
    expect(result.max).toBe(2);
  });

  it("rounds to 2 decimal places", () => {
    // 7 * 33% = 2.31
    const result = computeHeuristic(7, 33, 200);
    expect(result.min).toBe(2.31);
    expect(result.max).toBe(14);
  });

  it("handles min percent near 100%", () => {
    const result = computeHeuristic(10, 99, 200);
    expect(result.min).toBe(9.9);
    expect(result.max).toBe(20);
  });

  it("handles min percent at 1%", () => {
    const result = computeHeuristic(100, 1, 200);
    expect(result.min).toBe(1);
    expect(result.max).toBe(200);
  });

  it("handles large max percent", () => {
    const result = computeHeuristic(10, 50, 500);
    expect(result.min).toBe(5);
    expect(result.max).toBe(50);
  });

  it("handles small ML value with clean result", () => {
    const result = computeHeuristic(2, 50, 200);
    expect(result.min).toBe(1);
    expect(result.max).toBe(4);
  });
});
