import type { Activity } from "@domain/models/types";
import { computePertMean, resolveSD } from "@core/estimation/spert";

/**
 * Result of sensitivity analysis for a single activity.
 */
export interface SensitivityResult {
  activityId: string;
  activityName: string;
  /**
   * Impact score: how much the project P95 changes when this activity's
   * estimates are increased by 10%. Higher = more sensitive.
   */
  impactScore: number;
  /**
   * Variance contribution: this activity's variance / total project variance.
   * Higher = contributes more to project uncertainty.
   */
  varianceContribution: number;
  /**
   * Activity's standard deviation (spread of uncertainty).
   */
  standardDeviation: number;
  /**
   * Activity's mean duration.
   */
  meanDuration: number;
  /**
   * Coefficient of variation (SD / mean). Higher = more uncertain relative to size.
   */
  coefficientOfVariation: number;
}

/**
 * Compute sensitivity analysis for all activities.
 * Ranks activities by their contribution to project uncertainty.
 *
 * @param activities - List of activities to analyze
 * @returns Array sorted by impact score (descending)
 */
export function computeSensitivityAnalysis(
  activities: Activity[]
): SensitivityResult[] {
  if (activities.length === 0) return [];

  // Compute variance and mean for each activity
  const activityStats = activities.map((activity) => {
    const mean = computePertMean(
      activity.min,
      activity.mostLikely,
      activity.max
    );
    const sd = resolveSD(
      activity.min,
      activity.max,
      activity.confidenceLevel,
      activity.sdOverride
    );
    const variance = sd * sd;
    return { activity, mean, sd, variance };
  });

  // Total project variance (sum of individual variances, assuming independence)
  const totalVariance = activityStats.reduce((sum, s) => sum + s.variance, 0);

  // Compute impact scores by simulating a 10% increase in estimates
  const results: SensitivityResult[] = activityStats.map((stats) => {
    const { activity, mean, sd, variance } = stats;

    // Variance contribution as a percentage of total
    const varianceContribution =
      totalVariance > 0 ? variance / totalVariance : 0;

    // Impact score: simulate 10% increase in all estimates
    const scaledMin = activity.min * 1.1;
    const scaledMostLikely = activity.mostLikely * 1.1;
    const scaledMax = activity.max * 1.1;

    const scaledMean = computePertMean(scaledMin, scaledMostLikely, scaledMax);
    const scaledSd = resolveSD(
      scaledMin,
      scaledMax,
      activity.confidenceLevel,
      activity.sdOverride ? activity.sdOverride * 1.1 : undefined
    );

    // Impact = change in (mean + 1.645 * sd) when scaled by 10%
    // 1.645 is the z-score for 95th percentile in normal distribution
    const baseline95 = mean + 1.645 * sd;
    const scaled95 = scaledMean + 1.645 * scaledSd;
    const impactScore = scaled95 - baseline95;

    // Coefficient of variation (relative uncertainty)
    const coefficientOfVariation = mean > 0 ? sd / mean : 0;

    return {
      activityId: activity.id,
      activityName: activity.name,
      impactScore,
      varianceContribution,
      standardDeviation: sd,
      meanDuration: mean,
      coefficientOfVariation,
    };
  });

  // Sort by impact score descending (most sensitive first)
  results.sort((a, b) => b.impactScore - a.impactScore);

  return results;
}

/**
 * Get the top N activities by impact.
 */
export function getTopSensitiveActivities(
  activities: Activity[],
  topN: number = 5
): SensitivityResult[] {
  const all = computeSensitivityAnalysis(activities);
  return all.slice(0, Math.min(topN, all.length));
}
