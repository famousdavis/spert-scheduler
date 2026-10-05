// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity } from "@domain/models/types";
import { estimateOrderIssues } from "@domain/helpers/estimate-rules";
import { createDistributionForActivity } from "@core/distributions/factory";

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
   * Standard deviation of the activity's own distribution — the one the simulation samples.
   */
  standardDeviation: number;
  /**
   * Mean of the activity's own distribution — the one the simulation samples.
   */
  meanDuration: number;
  /**
   * Coefficient of variation (SD / mean). Higher = more uncertain relative to size.
   */
  coefficientOfVariation: number;
}

/**
 * Are this activity's estimates in order — the rule the grid flags a row by? An activity whose
 * estimates are out of order is left out even where its distribution would build (a Uniform
 * ignores Most Likely), because the grid flags it.
 */
function canAnalyse(activity: Activity): boolean {
  return estimateOrderIssues(activity.min, activity.mostLikely, activity.max).length === 0;
}

/**
 * The mean and standard deviation of the activity's own distribution, or `null` when the
 * distribution factory refuses it. Until v0.76.2 the panel gave every row a T-Normal's figures —
 * the PERT mean and `resolveSD`'s SD — which match its distribution only for T-Normal and LogNormal.
 *
 * ⚠️ The catch is what keeps the page standing. Among in-order estimates the factory refuses a
 * LogNormal at zero — and one whose estimates are positive but so small that its PERT mean
 * underflows to zero, which no grid rule flags and a project file can carry. This panel renders
 * whenever a scenario has two or more activities, so a throw here would stop the project page
 * opening.
 */
function ownMoments(activity: Activity): { mean: number; sd: number } | null {
  try {
    const distribution = createDistributionForActivity(activity);
    return { mean: distribution.mean(), sd: Math.sqrt(distribution.variance()) };
  } catch {
    return null;
  }
}

/** The same activity with every estimate 10% larger — the Impact score's what-if. */
function scaledUp(activity: Activity): Activity {
  return {
    ...activity,
    min: activity.min * 1.1,
    mostLikely: activity.mostLikely * 1.1,
    max: activity.max * 1.1,
    sdOverride: activity.sdOverride ? activity.sdOverride * 1.1 : undefined,
  };
}

/**
 * Compute sensitivity analysis for the activities whose estimates are in order and whose
 * distribution can be built, ranked by their contribution to project uncertainty. Every other
 * activity is left out — the caller can count the difference.
 *
 * @param activities - List of activities to analyze
 * @returns Array sorted by impact score (descending)
 */
export function computeSensitivityAnalysis(
  activities: Activity[]
): SensitivityResult[] {
  // Compute variance and mean for each activity, and the same for its 10% what-if
  const activityStats = activities.filter(canAnalyse).flatMap((activity) => {
    const own = ownMoments(activity);
    const scaled = ownMoments(scaledUp(activity));
    if (own === null || scaled === null) return [];
    return [{ activity, mean: own.mean, sd: own.sd, variance: own.sd * own.sd, scaled }];
  });
  if (activityStats.length === 0) return [];

  // Total project variance (sum of individual variances, assuming independence)
  const totalVariance = activityStats.reduce((sum, s) => sum + s.variance, 0);

  // Compute impact scores by simulating a 10% increase in estimates
  const results: SensitivityResult[] = activityStats.map((stats) => {
    const { activity, mean, sd, variance, scaled } = stats;

    // Variance contribution as a percentage of total
    const varianceContribution =
      totalVariance > 0 ? variance / totalVariance : 0;

    // Impact = change in (mean + 1.645 * sd) when scaled by 10%
    // 1.645 is the z-score for 95th percentile in normal distribution
    const baseline95 = mean + 1.645 * sd;
    const scaled95 = scaled.mean + 1.645 * scaled.sd;
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
