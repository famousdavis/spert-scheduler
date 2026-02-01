import type { RSMLevel, DistributionType } from "@domain/models/types";
import { computePertMean, computeSpertSD, computeSkewIndicator, computeCV } from "@core/estimation/spert";

const SKEW_THRESHOLD = 0.1;
const CV_THRESHOLD = 0.3;

export interface DistributionRecommendation {
  recommended: DistributionType;
  rationale: string;
}

/**
 * Recommend a distribution type based on the activity's statistical properties.
 *
 * Rules:
 * - ml === min or ml === max (no distinct mode) --> Uniform
 * - |skew| < SKEW_THRESHOLD and CV < CV_THRESHOLD --> Normal
 * - skew > SKEW_THRESHOLD and CV > CV_THRESHOLD --> LogNormal
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

  // Uniform when ML offers no distinct mode (equals min, max, or both)
  if (ml === min || ml === max) {
    return {
      recommended: "uniform",
      rationale:
        ml === min && ml === max
          ? "All estimates equal; Uniform is appropriate for a point estimate."
          : "No distinct most-likely value; Uniform distribution treats all values in range as equally probable.",
    };
  }

  if (sd === 0 || mean === 0) {
    return {
      recommended: "normal",
      rationale: "No variance in estimates; Normal is a safe default.",
    };
  }

  const skew = computeSkewIndicator(min, ml, max, rsmLevel);
  const cv = computeCV(mean, sd);

  if (Math.abs(skew) < SKEW_THRESHOLD && cv < CV_THRESHOLD) {
    return {
      recommended: "normal",
      rationale: "Low skew and low coefficient of variation indicate a symmetric distribution.",
    };
  }

  if (skew > SKEW_THRESHOLD && cv > CV_THRESHOLD) {
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
