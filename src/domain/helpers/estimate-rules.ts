// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { DistributionType } from "@domain/models/types";

/** The three estimate fields, by their `Activity` keys. */
export type EstimateKey = "min" | "mostLikely" | "max";

/** One broken half of Min ≤ Most Likely ≤ Max, on the field that carries its message. */
export interface EstimateOrderIssue {
  field: "min" | "mostLikely";
  message: string;
}

export const MIN_ABOVE_MOST_LIKELY = "Min is above Most Likely";
export const MOST_LIKELY_ABOVE_MAX = "Most Likely is above Max";

const MIN_ISSUE: EstimateOrderIssue = { field: "min", message: MIN_ABOVE_MOST_LIKELY };
const MOST_LIKELY_ISSUE: EstimateOrderIssue = { field: "mostLikely", message: MOST_LIKELY_ABOVE_MAX };

/**
 * THE ordering rule for a three-point estimate: which halves of Min ≤ Most Likely ≤ Max this
 * triple breaks, empty when it is in order. `ActivitySchema` adds exactly these as its issues,
 * and every other caller asks this function rather than restating the comparison (v0.69.0).
 *
 * ⚠️ WRITTEN POSITIVELY, `a > b`. `sonarjs/no-inverted-boolean-check` rejects `!(a <= b)`. The
 * two forms differ only for `NaN`, which `z.number()` rejects before any refinement runs, and
 * which no writer stores.
 *
 * ⚠️ The ordering half of `ActivitySchema` ONLY. The tolerant `StoredActivitySchema` that every
 * load gate uses does not apply it, so a project holding an out-of-order triple still loads —
 * and is flagged on screen, from this same rule, rather than refused.
 */
export function estimateOrderIssues(
  min: number,
  mostLikely: number,
  max: number
): EstimateOrderIssue[] {
  const issues: EstimateOrderIssue[] = [];
  if (min > mostLikely) issues.push(MIN_ISSUE);
  if (mostLikely > max) issues.push(MOST_LIKELY_ISSUE);
  return issues;
}

export const LOGNORMAL_NEEDS_ESTIMATE_ABOVE_ZERO = "A LogNormal activity needs an estimate above zero";

/**
 * Can this activity's distribution not be built because it is LogNormal and its PERT mean is
 * zero? The distribution factory throws for a LogNormal PERT mean of 0 or less
 * (`factory.ts:40`), which blanks the whole schedule. `ActivitySchema` flags the row from this
 * predicate, and `distributionIsInert` keeps such a row's Distribution control live from it.
 *
 * ⚠️ EXACT ONLY BECAUSE THE ESTIMATES ARE NONNEGATIVE. With all three ≥ 0, the PERT mean
 * (min + 4·ML + max) / 6 is ≤ 0 exactly when min + ML + max ≤ 0 — measured equal to the
 * factory's `computePertMean(...) > 0` on every integer triple 0–40. It is NOT exact at denormal
 * scale: a Max of 5e-324 gives a positive sum and a mean that underflows to 0. The grid stores
 * whole numbers and the dialog steps by 0.5, so neither can reach it.
 */
export function logNormalHasNoMean(
  distributionType: DistributionType,
  min: number,
  mostLikely: number,
  max: number
): boolean {
  return distributionType === "logNormal" && min + mostLikely + max <= 0;
}
