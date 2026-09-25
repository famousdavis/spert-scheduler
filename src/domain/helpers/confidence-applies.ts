// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { DistributionType } from "@domain/models/types";
import { logNormalHasNoMean } from "@domain/helpers/estimate-rules";

/**
 * Does the confidence level affect this distribution's spread?
 *
 * It does for three. For T-Normal and LogNormal, the two distributions defined by a mean and an
 * SD, Confidence feeds the Ratio Scale Modifier, which sets that SD. For Beta-PERT (v0.72.0) it
 * picks the SD from the Statistical PERT® Beta Edition scale, and the shape is solved from it.
 * Triangular and Uniform take their shape from min/most-likely/max alone, so a confidence level
 * is inert for them — which is why the control is disabled rather than merely ignored.
 *
 * ⚠️ **This rule was written out FOUR separate times before v0.67.0**, once as a negation,
 * and the divergence was the actual defect: the activity-edit modal was the only surface
 * that never got it, because there was no single place to get it from. The copies were
 * `UnifiedActivityRow` (twice, one negated), `schedule-export-service` (as
 * `usesConfidence`) and `print-sections`. **Call this; do not restate it.**
 *
 * ⚠️ **A fifth copy survives, left unfixed on purpose:** `flat-activity-parser.ts:360`
 * (`=== "triangular" || === "uniform"`, the negated form — so a Beta-PERT row without a level
 * is refused, correctly). It sits inside the importer's protected cognitive-complexity-106
 * function (110 until v0.72.0, which named the distribution in its message with
 * `distributionLabel`), whose decline is recorded at that site.
 *
 * Deliberately a function of the distribution type alone — not of an `Activity` — so the
 * modal can ask about a type held in local state that has not been saved yet.
 */
export function confidenceApplies(distributionType: DistributionType): boolean {
  return (
    distributionType === "normal" ||
    distributionType === "logNormal" ||
    distributionType === "betaPert"
  );
}

/**
 * Shown on the disabled control. Single source, so the grid's popover and the modal's
 * native `<select>` explain themselves identically.
 */
export const CONFIDENCE_NA_TITLE =
  "Confidence only applies to T-Normal, LogNormal, and Beta-PERT distributions";

/**
 * A three-point value as a surface holds it: the grid always has a number, and the Edit
 * Activity dialog holds `""` while a field is blank. The two predicates below take these
 * PRIMITIVES, not an `Activity`, for the same reason `confidenceApplies` takes a type: the
 * dialog asks about drafts that have not been saved.
 */
export type EstimateValue = number | "";

/** Why a Confidence level has no effect on an activity. */
export type ConfidenceInertReason = "distribution" | "sdOverride" | "zeroRange";

/**
 * Why the Confidence level cannot change this activity's spread — or `null` when it can.
 * Where it cannot, the grid and the Edit Activity dialog show a dash in place of the level
 * (owner ruling, 2026-09-17), and the control is disabled and out of the tab order.
 *
 * - `distribution`: Triangular or Uniform take their shape from the three points alone.
 * - `sdOverride`: the standard deviation was set directly, and `resolveSD` returns it ahead of
 *   range × RSM, so the level is bypassed. Reachable only by import or cloud, and only for
 *   T-Normal and LogNormal: Beta-PERT takes its spread from its level and ignores an
 *   `sdOverride` (v0.72.0), so on a Beta-PERT row the level still applies.
 * - `zeroRange`: Min equals Max, so the spread is zero at every level.
 *
 * ⚠️ Only two NUMBERS can be equal: a blank draft (`""`) is not a zero range, or a half-filled
 * dialog would show a dash.
 *
 * Print and export still use `confidenceApplies` alone, so for a zero-range or `sdOverride`
 * T-Normal/LogNormal activity they print and export the level while the grid and the dialog
 * show a dash. That is ruled (2026-09-17). ⚠️ The reason once given here — that a blank would
 * break the export's round trip — does not hold: the schedule export is for sharing a schedule
 * with people who use Excel, and was never meant to be re-imported (owner ruling, 2026-09-19).
 */
export function confidenceInertReason(
  distributionType: DistributionType,
  min: EstimateValue,
  max: EstimateValue,
  sdOverride?: number
): ConfidenceInertReason | null {
  if (!confidenceApplies(distributionType)) return "distribution";
  if (sdOverride != null && spreadIsResolvedSd(distributionType)) return "sdOverride";
  if (typeof min === "number" && min === max) return "zeroRange";
  return null;
}

/**
 * Is this distribution's spread the standard deviation `resolveSD` returns — so one an
 * `sdOverride` can replace? Only T-Normal's and LogNormal's. Beta-PERT's spread comes from its
 * Confidence level, and Triangular and Uniform have none to replace.
 */
function spreadIsResolvedSd(distributionType: DistributionType): boolean {
  return distributionType === "normal" || distributionType === "logNormal";
}

/** The dash's `title`, one sentence per reason — only the first is about the distribution. */
export const CONFIDENCE_INERT_TITLES: Record<ConfidenceInertReason, string> = {
  distribution: CONFIDENCE_NA_TITLE,
  sdOverride:
    "This activity's standard deviation was set directly, so the confidence level does not change it.",
  zeroRange: "Min and Max are equal, so the spread is zero at every confidence level.",
};

/**
 * Can this activity's distribution change its duration? Not when Min, Most Likely and Max are
 * the same number, and the grid then shows the Distribution in grey text (owner ruling,
 * 2026-09-17) — while keeping the control ENABLED, because it is the only way out of the
 * broken LogNormal state below.
 *
 * Two exceptions keep a point estimate live:
 * - an `sdOverride` gives it real spread under T-Normal or LogNormal — and only there. Until
 *   v0.72.0 this check ignored the distribution, so a Triangular or Uniform point estimate
 *   carrying an `sdOverride`, which neither uses, was left live;
 * - LogNormal at zero cannot be built at all (the distribution factory throws for a PERT mean
 *   of 0 or less), so greying that row would dress a broken state as a settled one. The test is
 *   `logNormalHasNoMean`, the same predicate that makes `ActivitySchema` flag the row (v0.69.0);
 *   for a point estimate it reduces to the value being 0.
 *
 * ⚠️ Switching between distributions on such a row still re-deals every OTHER activity's random
 * draws (T-Normal and LogNormal take two per sample; Beta-PERT, Triangular and Uniform one, from
 * one shared stream), so its title says the distribution does not change THIS activity's
 * duration — never that it has no effect.
 */
export function distributionIsInert(
  min: EstimateValue,
  mostLikely: EstimateValue,
  max: EstimateValue,
  distributionType: DistributionType,
  sdOverride?: number
): boolean {
  if (typeof min !== "number" || min !== mostLikely || mostLikely !== max) return false;
  const overrideGivesSpread = sdOverride != null && spreadIsResolvedSd(distributionType);
  return !overrideGivesSpread && !logNormalHasNoMean(distributionType, min, mostLikely, max);
}

/** The greyed Distribution control's `title`. */
export const DISTRIBUTION_INERT_TITLE =
  "Min, Most Likely and Max are equal, so this activity has no uncertainty and its distribution does not change its duration.";
