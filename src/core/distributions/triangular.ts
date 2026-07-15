// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { SeededRng } from "@infrastructure/rng";
import type { Distribution } from "./distribution";

/**
 * Triangular distribution with parameters a (min), c (mode), b (max).
 */
export class TriangularDistribution implements Distribution {
  private readonly fc: number;
  /** True iff a === b, which — given the a <= c <= b invariant enforced below —
   *  forces c === a === b too. A degenerate Triangular is a point mass: the limit
   *  of the triangular family as its range collapses to zero width. */
  private readonly degenerate: boolean;

  constructor(
    private readonly a: number,
    private readonly c: number,
    private readonly b: number
  ) {
    if (a > c || c > b) {
      throw new Error(
        `TriangularDistribution: must have a <= c <= b, got a=${a}, c=${c}, b=${b}`
      );
    }
    this.degenerate = a === b;
    // fc is unused on the degenerate path (inverseCDF/cdf short-circuit before
    // reading it, and parameters() never exposes fc at all) — this is purely to
    // avoid storing a stray NaN in a private field ((c - a) / (b - a) would be
    // 0/0 when a === b === c). Nothing downstream reads this value when
    // degenerate; it's assigned only for hygiene, not because anything consumes it.
    this.fc = this.degenerate ? 0 : (c - a) / (b - a);
  }

  sample(rng: SeededRng): number {
    // Always draw, even when degenerate. Every Distribution implementation
    // consumes a fixed number of RNG draws per sample regardless of its
    // parameters: 1 draw each for Triangular (via this.inverseCDF(u), below)
    // and Uniform (via its own direct linear transform, a + u*(b-a) — not a
    // call through inverseCDF, but the same one-draw cost); 2 draws for
    // Normal/LogNormal via Box-Muller. Do NOT special-case this to skip
    // rng.next() when degenerate — doing so would desync the seeded RNG
    // stream relative to every other activity's draws whenever one activity
    // happens to be a point mass, silently changing Monte Carlo samples for
    // OTHER, unrelated activities depending on which distribution type a
    // constant activity happens to use. (This is the single easiest mistake
    // to make implementing this fix — watch for a well-intentioned
    // `if (this.degenerate) return this.a;` added directly inside `sample`.)
    const u = rng.next();
    return this.inverseCDF(u);
  }

  mean(): number {
    // Already reduces correctly to `a` when a === b === c. No change needed.
    return (this.a + this.b + this.c) / 3;
  }

  variance(): number {
    // Already reduces correctly to 0 when a === b === c. No change needed.
    const { a, b, c } = this;
    return (a * a + b * b + c * c - a * b - a * c - b * c) / 18;
  }

  parameters(): Record<string, number> {
    return { a: this.a, c: this.c, b: this.b };
  }

  inverseCDF(p: number): number {
    if (p < 0 || p > 1) {
      throw new Error(`inverseCDF: p must be in [0, 1], got ${p}`);
    }
    if (this.degenerate) return this.a;
    if (p === 0) return this.a;
    if (p === 1) return this.b;

    const { a, b, c, fc } = this;
    if (p < fc) {
      return a + Math.sqrt(p * (b - a) * (c - a));
    } else if (p === fc) {
      return c;
    } else {
      return b - Math.sqrt((1 - p) * (b - a) * (b - c));
    }
  }

  cdf(x: number): number {
    // Degenerate case is a point mass, not a continuous distribution:
    // P(X <= a) = 1 for all x >= a. This matches the convention already used
    // by NormalDistribution.cdf and LogNormalDistribution.cdf in their own
    // sigma===0 branches, and by UniformDistribution.cdf's "zero-width point
    // mass" branch: `x < value ? 0 : 1`.
    //
    // IMPORTANT: do not fall through to the non-degenerate branches below.
    // The existing `x <= this.a` guard returns 0 at x === a, which is CORRECT
    // for a proper (non-degenerate) Triangular's true minimum — a continuous
    // distribution has P(X <= a) = 0 in the limit at its infimum — but would be
    // WRONG here: for a point mass at a, P(X <= a) = 1. Reusing that guard for
    // the degenerate case is a one-line trap that would make cdf(a) silently
    // return 0 instead of 1.
    if (this.degenerate) return x < this.a ? 0 : 1;
    // Non-degenerate case unchanged. Constructor now guarantees a <= c <= b
    // and (once we reach here) a < b; (c - a) and (b - c) zero-denominators
    // remain unreachable for the same reason as before this change.
    if (x <= this.a) return 0;
    if (x >= this.b) return 1;
    if (x <= this.c) {
      return (x - this.a) ** 2 / ((this.b - this.a) * (this.c - this.a));
    }
    return 1 - (this.b - x) ** 2 / ((this.b - this.a) * (this.b - this.c));
  }
}
