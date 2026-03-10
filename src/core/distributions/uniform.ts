// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { SeededRng } from "@infrastructure/rng";
import type { Distribution } from "./distribution";

/**
 * Continuous Uniform distribution over [a, b].
 * All values in the range are equally probable.
 */
export class UniformDistribution implements Distribution {
  constructor(
    private readonly a: number,
    private readonly b: number
  ) {
    if (a > b) {
      throw new Error(
        `UniformDistribution: must have a <= b, got a=${a}, b=${b}`
      );
    }
  }

  sample(rng: SeededRng): number {
    return this.a + rng.next() * (this.b - this.a);
  }

  mean(): number {
    return (this.a + this.b) / 2;
  }

  variance(): number {
    const range = this.b - this.a;
    return (range * range) / 12;
  }

  parameters(): Record<string, number> {
    return { a: this.a, b: this.b };
  }

  inverseCDF(p: number): number {
    if (p < 0 || p > 1) {
      throw new Error(`inverseCDF: p must be in [0, 1], got ${p}`);
    }
    return this.a + p * (this.b - this.a);
  }
}
