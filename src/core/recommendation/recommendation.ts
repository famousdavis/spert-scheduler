import type { RSMLevel, DistributionType } from "@domain/models/types";
import { computePertMean, computeSpertSD, computeSkewIndicator, computeCV } from "@core/estimation/spert";

export interface DistributionRecommendation {
  recommended: DistributionType;
  rationale: string;
}

/**
 * Recommend a distribution type based on the activity's statistical properties.
 *
 * Rules:
 * - |skew| < 0.1 and CV < 0.3 --> Normal
 * - skew > 0.1 and CV > 0.3 --> LogNormal
 * - Otherwise --> Triangular
 */
export function recommendDistribution(
  min: number,
  ml: number,
  max: number,
  rsmLevel: RSMLevel
): DistributionRecommendation {
  const mean = computePertMean(min, ml, max);
  const sd = computeSpertSD(min, max, rsmLevel);

  if (sd === 0 || mean === 0) {
    return {
      recommended: "normal",
      rationale: "No variance in estimates; Normal is a safe default.",
    };
  }

  const skew = computeSkewIndicator(min, ml, max, rsmLevel);
  const cv = computeCV(mean, sd);

  if (Math.abs(skew) < 0.1 && cv < 0.3) {
    return {
      recommended: "normal",
      rationale: "Low skew and low coefficient of variation indicate a symmetric distribution.",
    };
  }

  if (skew > 0.1 && cv > 0.3) {
    return {
      recommended: "logNormal",
      rationale: "Right skew with high variability suggests a LogNormal distribution.",
    };
  }

  return {
    recommended: "triangular",
    rationale: "Moderate asymmetry best modeled with a Triangular distribution.",
  };
}
