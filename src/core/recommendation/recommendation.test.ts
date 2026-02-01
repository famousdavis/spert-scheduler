import { describe, it, expect } from "vitest";
import { recommendDistribution } from "./recommendation";

describe("recommendDistribution", () => {
  it("recommends Normal for symmetric low-variance estimates", () => {
    // Symmetric: min=8, ml=10, max=12 -> mean=10, skew=0
    const result = recommendDistribution(8, 10, 12, "mediumConfidence");
    expect(result.recommended).toBe("normal");
  });

  it("recommends LogNormal for right-skewed high-variance estimates", () => {
    // Right-skewed: min=2, ml=5, max=30 -> mean=(2+20+30)/6=8.67, skew > 0.1, CV > 0.3
    const result = recommendDistribution(2, 5, 30, "mediumConfidence");
    expect(result.recommended).toBe("logNormal");
  });

  it("recommends Triangular for moderate asymmetry", () => {
    // Moderate: min=3, ml=5, max=10 -> some skew, moderate CV
    const result = recommendDistribution(3, 5, 10, "nearCertainty");
    expect(result.recommended).toBe("triangular");
  });

  it("returns Normal for zero-variance (min == max)", () => {
    const result = recommendDistribution(5, 5, 5, "mediumConfidence");
    expect(result.recommended).toBe("normal");
  });

  it("always includes a rationale string", () => {
    const result = recommendDistribution(2, 5, 10, "mediumConfidence");
    expect(result.rationale).toBeTruthy();
    expect(typeof result.rationale).toBe("string");
  });
});
