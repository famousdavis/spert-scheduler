// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { DistributionType, RSMLevel } from "@domain/models/types";
import { computePertMean, computeSpertSD, computeSkewIndicator, computeCV } from "@core/estimation/spert";

const SKEW_THRESHOLD = 0.1;
const CV_THRESHOLD = 0.3;

/**
 * The Confidence level the rules are calibrated at — a CONSTANT, not the activity's own
 * level (owner ruling, 2026-09-17). Until v0.68.0 the suggestion took the row's level, so
 * the same three numbers could flip between T-Normal and Triangular as Confidence alone
 * changed, including on Triangular and Uniform rows where Confidence is "not applicable".
 * Medium keeps the pre-v0.68.0 calibration exactly.
 *
 * ⚠️ PASS THE LEVEL KEY TO THE `spert.ts` HELPERS; NEVER INLINE THEIR ARITHMETIC WITH THE
 * NUMBER 0.2. Written out as `sd = (max − min) × 0.2`, it loses the helpers' zero guards
 * (`sd === 0 → skew 0`, `mean === 0 → cv 0`), which moves 420 out-of-order triples (0..20)
 * from T-Normal to Triangular while every valid triple still agrees — so a check over
 * valid estimates alone passes. Out-of-order values do reach this function: the AI create
 * path calls it before its schema check.
 */
const CALIBRATION: RSMLevel = "mediumConfidence";

/** A distribution the rules can suggest. Uniform is never one of them (see below). */
export type SuggestedDistribution = Exclude<DistributionType, "uniform">;

/**
 * The distribution three numbers suggest — or `null`, which means "no suggestion". Each
 * caller decides what `null` means: the grid shows no dot, and an AI-created activity with
 * no distribution named takes the scenario's default.
 *
 * DESCRIPTION of the rules, with `range = max − min`, `mean = (min + 4·ml + max) / 6` and
 * `p = (ml − min) / range`:
 * - min = Most Likely = max (a point mass) → no suggestion: every distribution gives that
 *   same value, except LogNormal at zero, which cannot be built at all;
 * - Most Likely equals Min or Max → Triangular (owner ruling, 2026-09-17): the user has put
 *   the peak at the end of the range, and neither T-Normal nor LogNormal can peak there.
 *   With the app's own distributions at Medium, LogNormal puts 19.5 % of outcomes below
 *   Min on 5/5/20 and 20.6 % on 5/5/10; Triangular puts none. It is exact equality, so
 *   5 / 5.1 / 20 still takes the tests below;
 * - |p − 0.5| < 0.06 and range / mean < 1.5 → T-Normal;
 * - p < 0.44 and range / mean > 1.5 → LogNormal;
 * - anything else → Triangular. Comparisons are strict, so a boundary falls through here.
 *
 * Uniform is never suggested (owner ruling, 2026-09-17): three numbers cannot tell whether
 * a most-likely value is known, so Uniform is the user's call in both directions.
 *
 * ⚠️ THE IMPLEMENTATION IS NOT THAT TABLE. It is the pre-v0.68.0 arithmetic — skew =
 * (mean − ml) / SD and CV = SD / mean with SD = range × RSM — at the Medium RSM of 0.2,
 * where the table's thresholds map exactly (skew = (1 − 2p) / (6 · 0.2)). Do not
 * "simplify" it into the table: the two differ in floating point. At range / mean exactly
 * 1.5, where Most Likely lies inside the range and below 44 % of it, the answer depends on
 * floating-point rounding — LogNormal where CV computes just above 0.3 (2/5/10),
 * Triangular where it computes exactly 0.3 (10/25/50). Elsewhere on that lattice the
 * answer is Triangular whatever the rounding (measured on every lattice point to 200), and
 * Most Likely at an end returns Triangular before any rounding is reached. v0.68.0
 * DELIBERATELY preserves the pre-v0.68.0 answer on every such triple; changing either half
 * is a behaviour change nobody has ruled. `recommendation.test.ts` pins both halves.
 */
export function recommendDistribution(
  min: number,
  ml: number,
  max: number
): SuggestedDistribution | null {
  if (ml === min && ml === max) return null;

  // Most Likely at an end. Before v0.68.0 this line returned Uniform.
  if (ml === min || ml === max) return "triangular";

  const { skew, cv } = shapeOf(min, ml, max);

  if (Math.abs(skew) < SKEW_THRESHOLD && cv < CV_THRESHOLD) return "normal";
  if (skew > SKEW_THRESHOLD && cv > CV_THRESHOLD) return "logNormal";
  return "triangular";
}

/** The rules' two measures, at the calibration level. */
function shapeOf(min: number, ml: number, max: number): { skew: number; cv: number } {
  const mean = computePertMean(min, ml, max);
  const sd = computeSpertSD(min, max, CALIBRATION);
  return {
    skew: computeSkewIndicator(min, ml, max, CALIBRATION),
    cv: computeCV(mean, sd),
  };
}

/** What the grid's suggestion dot applies when clicked, and why — its `title`. */
export interface DistributionSuggestion {
  suggested: SuggestedDistribution;
  reason: string;
}

const CURVE_FITS: Record<"normal" | "logNormal", string> = {
  normal:
    "Most Likely is near the middle of a relatively narrow range. T-Normal may suit this roughly symmetric estimate.",
  logNormal:
    "The range is relatively wide and extends much farther above Most Likely than below it. LogNormal may suit this pattern, with more room for longer durations.",
};

const T_NORMAL_OFF_CENTRE =
  "Most Likely is away from the middle of the range. Triangular puts the peak at Most Likely and keeps durations between Min and Max.";

const LOGNORMAL_NOT_RIGHT_SKEWED =
  "These estimates suggest little or no right skew. Triangular keeps Min and Max as bounds and puts the peak at Most Likely.";

const mostLikelyAtEnd = (end: "Min" | "Max") =>
  `Most Likely equals ${end}. Triangular places the peak at ${end} and keeps durations within your range.`;

/**
 * Whether an activity's row shows the suggestion dot, and with what text — the whole
 * decision, in one place, so the row only renders it. `null` means no dot.
 *
 * The dot either points to a CURVE THAT FITS or corrects a CONTRADICTION, and does nothing
 * else (owner ruling, 2026-09-17):
 * - (a) the numbers fit T-Normal or LogNormal and the row uses something else; or
 * - (b) the row's T-Normal or LogNormal contradicts the numbers, and the suggestion is
 *   Triangular. T-Normal contradicts an off-centre estimate (|skew| ≥ 0.1, Most Likely more
 *   than 6 % from the middle); LogNormal contradicts one that is not right-skewed
 *   (skew ≤ 0.1), or whose Most Likely equals Min.
 *
 * Never on a Uniform row: Uniform is the user's call (2026-09-17, as above). A LogNormal row
 * whose estimate is right-skewed with Most Likely inside the range gets NO dot although the
 * suggestion is Triangular: both curves fit, and which is better depends on the nature of
 * the uncertainty, which three numbers cannot show (2026-09-17). Triangular rows keep their
 * curve-fit dots: Triangular is the default for a new activity, so on most rows nobody
 * chose it, and the dot is the only place the app says the numbers fit a curve.
 *
 * No dot for an estimate that is not a valid one (a negative value, or min ≤ Most Likely ≤
 * max broken): no curve fits it, and every sentence below describes a valid estimate. The
 * grid commits each cell as it is typed, so such values do reach here.
 *
 * `recommendDistribution` stays the AI's automatic pick and does not know the row's
 * current distribution; this function is the grid's.
 */
export function suggestDistributionChange(
  min: number,
  ml: number,
  max: number,
  current: DistributionType
): DistributionSuggestion | null {
  if (current === "uniform" || !(0 <= min && min <= ml && ml <= max)) return null;
  const suggested = recommendDistribution(min, ml, max);

  if ((suggested === "normal" || suggested === "logNormal") && suggested !== current) {
    return { suggested, reason: CURVE_FITS[suggested] };
  }

  if (suggested === "triangular" && (current === "normal" || current === "logNormal")) {
    const reason = contradiction(min, ml, max, current);
    if (reason !== null) return { suggested, reason };
  }

  return null;
}

/** Why the row's own curve cannot follow these three points — or `null` when it can. */
function contradiction(
  min: number,
  ml: number,
  max: number,
  current: "normal" | "logNormal"
): string | null {
  // First, and for both curves: the LogNormal sentence below is FALSE when Most Likely
  // equals Min, because that estimate IS right-skewed.
  if (ml === min) return mostLikelyAtEnd("Min");
  if (ml === max) return mostLikelyAtEnd("Max");

  const { skew } = shapeOf(min, ml, max);
  if (current === "normal") return Math.abs(skew) >= SKEW_THRESHOLD ? T_NORMAL_OFF_CENTRE : null;
  return skew <= SKEW_THRESHOLD ? LOGNORMAL_NOT_RIGHT_SKEWED : null;
}
