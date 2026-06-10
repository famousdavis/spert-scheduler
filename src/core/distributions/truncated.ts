// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { SeededRng } from "@infrastructure/rng";
import type { Activity, DistributionType } from "@domain/models/types";
import type { Distribution } from "./distribution";

/**
 * Conditional (left-truncated) sampling for in-progress activities.
 *
 * When an activity is in progress with actualDuration = t, we have observed X > t.
 * The correct operator is conditioning, not clamping: sample from X | X > t.
 *
 * Asymmetry note: TruncatedDistribution.mean/variance/parameters THROW, while
 * DegenerateDistribution implements them. Degenerate moments are trivially correct
 * (mean = t, variance = 0). Truncated moments require nontrivial integration and have
 * zero production consumers (the MC path reads only sample/inverseCDF/cdf), so they
 * throw rather than ship silently-wrong values.
 */

/**
 * Beyond p0 = 0.9999 the planning-time estimate carries essentially no usable
 * information about the remaining duration (< 0.01% of the modeled probability mass
 * remains). The breach flag — not the degenerate contribution — is the signal. This is
 * a model-honesty cutoff, not a statistical-sufficiency threshold; the inverse-CDF
 * sampler produces valid conditional draws at any p0 < 1.
 */
export const UNBOUNDED_BREACH_THRESHOLD = 0.9999;

/**
 * Left-truncated distribution: X | X > t, where lowerP = F(t).
 * Inverse-transform: draw u ~ Uniform(lowerP, 1), return base.inverseCDF(u).
 */
export class TruncatedDistribution implements Distribution {
  constructor(
    private readonly base: Distribution,
    private readonly lowerP: number, // p0 = F(t), in (0, 1)
    private readonly actualT: number // t, for defensive round-trip clamp
  ) {}

  sample(rng: SeededRng): number {
    // For Normal/LogNormal this switches from Box-Muller (2 RNG draws) to inverse-CDF
    // (1 RNG draw), shifting the stream for downstream activities. Distributional
    // correctness is unaffected; seed-for-seed comparisons are not.
    //
    // 1 - Number.EPSILON is two ULPs below 1.0 — finite under Acklam's probit — so a
    // p0 arbitrarily close to 1 cannot drive inverseCDF(1) to throw; the actualT clamp
    // covers the residual case where the clamped u maps below t.
    const u = Math.min(
      this.lowerP + rng.next() * (1 - this.lowerP),
      1 - Number.EPSILON
    );
    return Math.max(this.base.inverseCDF(u), this.actualT);
  }

  inverseCDF(p: number): number {
    const u = Math.min(this.lowerP + p * (1 - this.lowerP), 1 - Number.EPSILON);
    return Math.max(this.base.inverseCDF(u), this.actualT);
  }

  cdf(x: number): number {
    const c = this.base.cdf(x);
    if (c <= this.lowerP) return 0;
    return (c - this.lowerP) / (1 - this.lowerP);
  }

  // See file-header asymmetry note: no production consumers; throw rather than lie.
  mean(): number {
    throw new Error(
      "TruncatedDistribution.mean(): not implemented — re-estimate the activity"
    );
  }
  variance(): number {
    throw new Error("TruncatedDistribution.variance(): not implemented");
  }
  parameters(): Record<string, number> {
    throw new Error("TruncatedDistribution.parameters(): not implemented");
  }
}

/**
 * Degenerate point mass at t. Substituted on model exhaustion (breach), when the
 * planning-time estimate can no longer forecast the remainder. The trial contributes t
 * (Parkinson OFF) or the deterministic floor (Parkinson ON, via Math.max(floor, t)).
 * The modelExhaustedActivityIds flag — not this value — is the actionable signal.
 */
export class DegenerateDistribution implements Distribution {
  constructor(private readonly t: number) {}

  sample(_rng: SeededRng): number {
    return this.t;
  }
  inverseCDF(_p: number): number {
    return this.t;
  }
  cdf(x: number): number {
    return x < this.t ? 0 : 1;
  }
  mean(): number {
    return this.t;
  }
  variance(): number {
    return 0;
  }
  parameters(): Record<string, number> {
    return { t: this.t };
  }
}

/**
 * Boundedness-aware breach predicate. Bounded types (Triangular, Uniform) breach at
 * p0 >= 1.0 exactly (cdf(max) = 1.0); unbounded types (Normal, LogNormal) at the
 * model-honesty threshold. The `never` default makes a fifth DistributionType a compile
 * error (mirrors factory.ts).
 */
export function isBreach(distributionType: DistributionType, p0: number): boolean {
  switch (distributionType) {
    case "triangular":
    case "uniform":
      return p0 >= 1.0;
    case "normal":
    case "logNormal":
      return p0 >= UNBOUNDED_BREACH_THRESHOLD;
    default: {
      const _exhaustive: never = distributionType;
      throw new Error(`isBreach: unhandled distributionType ${_exhaustive}`);
    }
  }
}

/**
 * Build the MC distribution for an activity, conditioning in-progress draws on elapsed
 * time. Called at both MC construction seams. Returns the base distribution unchanged
 * for planned/complete activities, for non-finite p0, and for p0 <= 0 (nothing learned).
 */
export function buildMcDistribution(
  activity: Activity,
  base: Distribution
): { dist: Distribution; isExhausted: boolean } {
  if (activity.status !== "inProgress" || activity.actualDuration == null) {
    return { dist: base, isExhausted: false };
  }
  const t = activity.actualDuration;
  const rawP0 = base.cdf(t);
  // Defense-in-depth: guard NaN from any future unguarded distribution.
  if (!Number.isFinite(rawP0)) {
    return { dist: base, isExhausted: false };
  }
  const p0 = Math.max(0, Math.min(1, rawP0));
  // Breach check must precede wrapper construction (avoids inverseCDF(1) at p0 = 1).
  if (isBreach(activity.distributionType, p0)) {
    return { dist: new DegenerateDistribution(t), isExhausted: true };
  }
  if (p0 <= 0) {
    return { dist: base, isExhausted: false };
  }
  return { dist: new TruncatedDistribution(base, p0, t), isExhausted: false };
}
