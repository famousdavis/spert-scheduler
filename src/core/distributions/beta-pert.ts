// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { SeededRng } from "@infrastructure/rng";
import type { RSMLevel } from "@domain/models/types";
import {
  estimateOrderIssues,
  isSymmetricEstimate,
} from "@domain/helpers/estimate-rules";
import type { Distribution } from "./distribution";

/**
 * Beta-PERT (WI-64): a beta distribution on [Min, Max] that peaks exactly at Most Likely, with
 * its spread set by the Confidence level on the Statistical PERT® Beta Edition scale.
 *
 * ⚠️ NOT the textbook PERT beta. That one fixes its shape (λ = 4, mean (O + 4M + P) ÷ 6), and no
 * Confidence level here reproduces it. Here the SPREAD is fixed per level and the shape is solved
 * per estimate, so the peak stays at Most Likely while the mean moves with Confidence.
 *
 * - Shape: α = 1 + λp, β = 1 + λ(1 − p), where p = (ML − Min) ÷ (Max − Min).
 * - λ ≥ 0 is solved so the SD equals the level's spread × range. That variance falls strictly as
 *   λ rises, and λ = 0 is the Uniform's range ÷ √12, above every level's spread, so every level
 *   has exactly one solution at every p in [0, 1] — and with λ ≥ 0, α and β are both ≥ 1: never
 *   a U-shape and never an infinite density, only a finite J when Most Likely sits at an end.
 * - A symmetric estimate returns the Beta Edition's own Beta(β, β) for its level, exactly.
 */

/** SD ÷ range of the symmetric Beta(shape, shape). */
export function symmetricBetaSpread(shape: number): number {
  return 1 / (2 * Math.sqrt(2 * shape + 1));
}

/** The inverse of `symmetricBetaSpread`. */
function symmetricBetaShape(spread: number): number {
  return (1 / (4 * spread * spread) - 1) / 2;
}

/**
 * The Beta Edition's shape parameter β for each Confidence level — its symmetric curve is
 * Beta(β, β) — mapped BY NAME, never by position: the Beta Edition has an "Extremely High" level
 * (β = 15) that has no counterpart here, and no "Extremely low".
 *
 * Medium is Beta(4, 4), whose SD is range ÷ 6 — the textbook PERT SD, and the scale's deliberate
 * anchor (owner ruling, 2026-09-19). Extremely low has no Beta Edition level: its SPREAD is
 * defined as the mean of Very low's and Guesstimate's, and its β is derived from that spread
 * here. ⚠️ Store β, derive the spread: typing a rounded spread (0.1091 for Very high) lands on
 * β = 10.0017, not the workbook's 10.
 */
export const BETA_PERT_SHAPE: Readonly<Record<RSMLevel, number>> = {
  nearCertainty: 25,
  veryHighConfidence: 10,
  highConfidence: 7,
  mediumHighConfidence: 5,
  mediumConfidence: 4,
  mediumLowConfidence: 3,
  lowConfidence: 2,
  veryLowConfidence: 1.5,
  extremelyLowConfidence: symmetricBetaShape(
    (symmetricBetaSpread(1.5) + symmetricBetaSpread(1.25)) / 2
  ),
  guesstimate: 1.25,
};

/**
 * The λ ≥ 0 at which Beta(1 + λp, 1 + λ(1 − p)) on the unit range has SD `spread`.
 *
 * With q = p(1 − p), that beta's variance is (1 + λ + qλ²) ÷ ((2 + λ)²(3 + λ)). Setting it to
 * spread² = k² gives the cubic
 *
 *     k²λ³ + (7k² − q)λ² + (16k² − 1)λ + (12k² − 1) = 0,
 *
 * which has exactly one non-negative root on this domain. It is taken in closed form by the
 * TRIGONOMETRIC method, as the largest root: the cubic almost always has three real roots, so
 * Cardano's real-arithmetic form would need the square root of a negative number.
 *
 * ⚠️ THE CLAMP IS LOAD-BEARING. At p = ½ the cubic has a DOUBLE root at λ = −2, so near p = ½ the
 * cosine sits at ±1 and rounding can push it just past 1 — and `Math.acos` then returns NaN,
 * silently. Exactly-symmetric estimates never get here (they take the Beta Edition's own shape),
 * but a Most Likely a hair off-centre (10 / 20.0000001 / 30) does.
 */
export function solveBetaPertLambda(p: number, spread: number): number {
  const k2 = spread * spread;
  const q = p * (1 - p);
  // The monic cubic λ³ + bλ² + cλ + d, depressed by λ = t − b/3 to t³ + Pt + Q.
  const b = 7 - q / k2;
  const c = 16 - 1 / k2;
  const d = 12 - 1 / k2;
  const depressedP = c - (b * b) / 3;
  const depressedQ = (2 * b * b * b) / 27 - (b * c) / 3 + d;
  const amplitude = 2 * Math.sqrt(-depressedP / 3);
  const cosine = Math.min(1, Math.max(-1, (3 * depressedQ) / (depressedP * amplitude)));
  return amplitude * Math.cos(Math.acos(cosine) / 3) - b / 3;
}

/** The beta shape parameters on the unit range. */
export interface BetaShape {
  alpha: number;
  beta: number;
}

/**
 * Beta-PERT's shape for an IN-ORDER estimate with Min < Max. The caller checks the order: an
 * out-of-order p lies outside [0, 1], where the λ family has no meaning.
 */
export function betaPertShape(
  min: number,
  mostLikely: number,
  max: number,
  level: RSMLevel
): BetaShape {
  const levelShape = BETA_PERT_SHAPE[level];
  if (isSymmetricEstimate(min, mostLikely, max)) {
    return { alpha: levelShape, beta: levelShape };
  }
  const p = (mostLikely - min) / (max - min);
  const lambda = solveBetaPertLambda(p, symmetricBetaSpread(levelShape));
  return { alpha: 1 + lambda * p, beta: 1 + lambda * (1 - p) };
}

// -- The regularized incomplete beta function --------------------------------------------------

// Lanczos approximation, g = 7, n = 9. Every argument here is ≥ 1, so no reflection is needed.
const LANCZOS_G = 7;
const LANCZOS_LEAD = 0.99999999999980993;
const LANCZOS_TERMS = [
  676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
];
const HALF_LOG_TWO_PI = 0.5 * Math.log(2 * Math.PI);

function logGamma(z: number): number {
  const x = z - 1;
  let series = LANCZOS_LEAD;
  LANCZOS_TERMS.forEach((coefficient, i) => {
    series += coefficient / (x + i + 1);
  });
  const t = x + LANCZOS_G + 0.5;
  return HALF_LOG_TWO_PI + (x + 0.5) * Math.log(t) - t + Math.log(series);
}

/** ln B(first, second). */
function logBeta(first: number, second: number): number {
  return logGamma(first) + logGamma(second) - logGamma(first + second);
}

const FRACTION_FLOOR = 1e-300;
const FRACTION_TOLERANCE = 1e-16;
const FRACTION_MAX_TERMS = 500;

function awayFromZero(value: number): number {
  return Math.abs(value) < FRACTION_FLOOR ? FRACTION_FLOOR : value;
}

/**
 * The continued fraction for I_y(shapeA, shapeB), by the modified Lentz method — converges fast
 * for y below the mean region, which is the only place it is used.
 */
function incompleteBetaFraction(y: number, shapeA: number, shapeB: number): number {
  const total = shapeA + shapeB;
  let c = 1;
  let d = 1 / awayFromZero(1 - (total * y) / (shapeA + 1));
  let fraction = d;
  for (let m = 1; m <= FRACTION_MAX_TERMS; m++) {
    const twoM = 2 * m;
    const even = (m * (shapeB - m) * y) / ((shapeA - 1 + twoM) * (shapeA + twoM));
    d = 1 / awayFromZero(1 + even * d);
    c = awayFromZero(1 + even / c);
    fraction *= d * c;
    const odd = (-(shapeA + m) * (total + m) * y) / ((shapeA + twoM) * (shapeA + 1 + twoM));
    d = 1 / awayFromZero(1 + odd * d);
    c = awayFromZero(1 + odd / c);
    const step = d * c;
    fraction *= step;
    if (Math.abs(step - 1) <= FRACTION_TOLERANCE) break;
  }
  return fraction;
}

/** y^first · (1 − y)^second ÷ B(first, second), for y strictly inside (0, 1). */
function incompleteBetaFront(
  y: number,
  first: number,
  second: number,
  logBetaValue: number
): number {
  return Math.exp(first * Math.log(y) + second * Math.log1p(-y) - logBetaValue);
}

/** I_y(first, second) from its prefactor, by the continued fraction on the faster side. */
function incompleteBetaFromFront(
  y: number,
  first: number,
  second: number,
  front: number
): number {
  if (y < (first + 1) / (first + second + 2)) {
    return (front * incompleteBetaFraction(y, first, second)) / first;
  }
  return 1 - (front * incompleteBetaFraction(1 - y, second, first)) / second;
}

/**
 * I_y(first, second), the Beta(first, second) CDF on the unit range. `logBetaValue` is
 * ln B(first, second), passed in because every caller already holds it.
 */
function regularizedIncompleteBeta(
  y: number,
  first: number,
  second: number,
  logBetaValue: number
): number {
  if (y <= 0) return 0;
  if (y >= 1) return 1;
  const front = incompleteBetaFront(y, first, second, logBetaValue);
  return incompleteBetaFromFront(y, first, second, front);
}

// -- Its inverse: Halley's method inside a maintained bracket ---------------------------------

/** Relative. The CDF itself carries rounding noise of about this size (its prefactor is an
 *  exp of sums of logs), so a tighter stop is chasing noise and never met. */
const HALLEY_TOLERANCE = 1e-14;
const HALLEY_MAX_STEPS = 100;

/**
 * The starting point for the lower-tail quantile, for u ≤ ½ and shapes ≥ 1: the larger of
 * Numerical Recipes' normal approximation and the tail's own power law.
 *
 * With second ≥ 1, I_y ≤ y^first ÷ (first · B) everywhere, so that power law's root is a LOWER
 * BOUND on the quantile, and nearly exact deep in the tail. Numerical Recipes' approximation is
 * the better start in the body, but far out on a J-shape it sits orders of magnitude below the
 * root (at u = 1e-300 it underflows to 0), and Halley converges only linearly on a power law from
 * that far away — it ran out of steps and returned a wrong value. Taking the larger of the two can
 * only move the start closer. (On a bell, far out, the approximation sits ABOVE the root instead,
 * and Halley walks down to it: measured, at most 6 steps down to u = 1e-20, 21 at 1e-100, ~70
 * at 1e-300.)
 */
function initialQuantileGuess(
  u: number,
  first: number,
  second: number,
  logBetaValue: number
): number {
  const t = Math.sqrt(-2 * Math.log(u));
  const z = t - (2.30753 + 0.27061 * t) / (1 + t * (0.99229 + 0.04481 * t));
  const al = (z * z - 3) / 6;
  const h = 2 / (1 / (2 * first - 1) + 1 / (2 * second - 1));
  const w =
    (z * Math.sqrt(al + h)) / h -
    (1 / (2 * second - 1) - 1 / (2 * first - 1)) * (al + 5 / 6 - 2 / (3 * h));
  const normal = first / (first + second * Math.exp(2 * w));
  const tail = Math.exp((Math.log(u) + Math.log(first) + logBetaValue) / first);
  return Math.max(normal, tail);
}

/** One Halley step on I_y(first, second) − u, from y, given that residual and the density. */
function halleyProposal(
  y: number,
  residual: number,
  density: number,
  first: number,
  second: number
): number {
  const newton = residual / density;
  const curvature = (first - 1) / y - (second - 1) / (1 - y);
  return y - newton / (1 - 0.5 * Math.min(1, newton * curvature));
}

/**
 * The y in (0, 1) with I_y(first, second) = u, for 0 < u ≤ ½ — the SMALLER tail, where the
 * target is exact (the upper tail is solved as this one's reflection).
 *
 * ⚠️ Three traps, each measured, each closed here:
 * - the convergence test comes BEFORE the bracket test. A step that lands on the root can round
 *   onto the bracket end the previous iterate just became; a strict `lo < y < hi` check rejects
 *   it and bisects AWAY from the root.
 * - every result is clamped into the bracket (and so into [0, 1]). An unclamped converged step
 *   returned −4.4e-16 — a sample below Min — on a near-two-point beta. ⚠️ With α, β ≥ 1 this
 *   clamp, and `inverseCDF`'s own clamp into [Min, Max], were reached 0 times in 1.9 million
 *   quantiles searched for them, so no test can fail either; they are kept as guarantees.
 * - the tolerance is the CDF's own noise band (`HALLEY_TOLERANCE`). At 1e-15, 45 draws in a
 *   million never met it: they bisected between two adjacent floats until the step cap.
 *
 * Below u ≈ 1e-50 the CDF's noise grows past the tolerance (its prefactor is the exp of a log of
 * magnitude ~700 at u = 1e-300), so the search there ends at the step cap — inside a bracket that
 * noise-width wide, so the answer is still right to ~1e-13. A draw that small has a probability
 * below 1e-50; from 1e-20 up, every quantile measured converged within 6 steps (4 in the body).
 */
function lowerTailQuantile(
  u: number,
  first: number,
  second: number,
  logBetaValue: number
): number {
  let lo = 0;
  let hi = 1;
  let y = initialQuantileGuess(u, first, second, logBetaValue);
  // Its lower bound underflowed: the quantile is below the smallest positive double.
  if (y === 0) return 0;
  for (let step = 0; step < HALLEY_MAX_STEPS; step++) {
    const front = incompleteBetaFront(y, first, second, logBetaValue);
    const residual = incompleteBetaFromFront(y, first, second, front) - u;
    if (residual < 0) lo = y;
    else hi = y;
    const next = halleyProposal(y, residual, front / (y * (1 - y)), first, second);
    if (Math.abs(next - y) <= HALLEY_TOLERANCE * y) return Math.min(hi, Math.max(lo, next));
    y = next > lo && next < hi ? next : (lo + hi) / 2;
  }
  return y;
}

// -- The distribution --------------------------------------------------------------------------

/**
 * Beta-PERT over [min, max] with its peak at `mostLikely`, spread by `level` (see the file header).
 *
 * ⚠️ ORDER IS CHECKED FIRST, and an out-of-order estimate THROWS, as Triangular does — before the
 * point-mass check, so 5 / 7 / 5 (Min = Max, Most Likely elsewhere) throws rather than becoming a
 * silent point mass. The rule is `estimateOrderIssues`, the one `ActivitySchema` flags from, so
 * every throw here is a row the validation summary already names.
 */
export class BetaPertDistribution implements Distribution {
  private readonly degenerate: boolean;
  private readonly symmetric: boolean;
  private readonly range: number;
  private readonly alpha: number;
  private readonly beta: number;
  private readonly logBetaValue: number;

  constructor(
    private readonly min: number,
    private readonly mostLikely: number,
    private readonly max: number,
    level: RSMLevel
  ) {
    if (estimateOrderIssues(min, mostLikely, max).length > 0) {
      throw new Error(
        `BetaPertDistribution: must have min <= mostLikely <= max, got min=${min}, mostLikely=${mostLikely}, max=${max}`
      );
    }
    // A point mass. Checked before any shape formula: on 5 / 5 / 5, p would be 0 / 0.
    this.degenerate = min === max;
    this.symmetric = isSymmetricEstimate(min, mostLikely, max);
    this.range = max - min;
    const shape = this.degenerate
      ? { alpha: 1, beta: 1 }
      : betaPertShape(min, mostLikely, max, level);
    this.alpha = shape.alpha;
    this.beta = shape.beta;
    this.logBetaValue = logBeta(shape.alpha, shape.beta);
  }

  sample(rng: SeededRng): number {
    // Exactly ONE draw per sample, always — the point mass included. See triangular.ts: a
    // draw count that varied with the parameters would re-deal every other activity's samples.
    const u = rng.next();
    return this.inverseCDF(u);
  }

  mean(): number {
    if (this.degenerate) return this.min;
    return this.min + (this.range * this.alpha) / (this.alpha + this.beta);
  }

  variance(): number {
    if (this.degenerate) return 0;
    const total = this.alpha + this.beta;
    return (this.range * this.range * this.alpha * this.beta) / (total * total * (total + 1));
  }

  parameters(): Record<string, number> {
    return {
      min: this.min,
      mostLikely: this.mostLikely,
      max: this.max,
      alpha: this.alpha,
      beta: this.beta,
    };
  }

  inverseCDF(p: number): number {
    if (p < 0 || p > 1) {
      throw new Error(`inverseCDF: p must be in [0, 1], got ${p}`);
    }
    if (this.degenerate || p === 0) return this.min;
    if (p === 1) return this.max;
    // A symmetric estimate's median is its midpoint EXACTLY. A numerical inverse lands a few
    // ulps high, and the deterministic schedule's Math.ceil would then add a whole day.
    if (this.symmetric && p === 0.5) return (this.min + this.max) / 2;
    if (p < 0.5) {
      const y = lowerTailQuantile(p, this.alpha, this.beta, this.logBetaValue);
      return Math.min(this.max, this.min + this.range * y);
    }
    const z = lowerTailQuantile(1 - p, this.beta, this.alpha, this.logBetaValue);
    return Math.max(this.min, this.max - this.range * z);
  }

  cdf(x: number): number {
    // A point mass: P(X <= min) = 1, as every other distribution's degenerate branch.
    if (this.degenerate) return x < this.min ? 0 : 1;
    if (x <= this.min) return 0;
    if (x >= this.max) return 1;
    return regularizedIncompleteBeta(
      (x - this.min) / this.range,
      this.alpha,
      this.beta,
      this.logBetaValue
    );
  }
}
