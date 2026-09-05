// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { DistributionType } from "@domain/models/types";

/**
 * Does the confidence level affect this distribution's spread?
 *
 * Confidence feeds the Ratio Scale Modifier, which sets the standard deviation for the
 * two distributions defined by a mean and an SD. Triangular and Uniform take their shape
 * from min/most-likely/max alone, so a confidence level is inert for them — which is why
 * the control is disabled rather than merely ignored.
 *
 * ⚠️ **This rule was written out FOUR separate times before v0.67.0**, once as a negation,
 * and the divergence was the actual defect: the activity-edit modal was the only surface
 * that never got it, because there was no single place to get it from. The copies were
 * `UnifiedActivityRow` (twice, one negated), `schedule-export-service` (as
 * `usesConfidence`) and `print-sections`. **Call this; do not restate it.**
 *
 * Deliberately a function of the distribution type alone — not of an `Activity` — so the
 * modal can ask about a type held in local state that has not been saved yet.
 */
export function confidenceApplies(distributionType: DistributionType): boolean {
  return distributionType === "normal" || distributionType === "logNormal";
}

/**
 * Shown on the disabled control. Single source, so the grid's popover and the modal's
 * native `<select>` explain themselves identically.
 */
export const CONFIDENCE_NA_TITLE =
  "Confidence only applies to T-Normal and LogNormal distributions";
