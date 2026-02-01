import type { SeededRng } from "@infrastructure/rng";
import type { Distribution } from "./distribution";

/**
 * Triangular distribution with parameters a (min), c (mode), b (max).
 */
export class TriangularDistribution implements Distribution {
  private readonly fc: number; // threshold for CDF inversion: (c - a) / (b - a)

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
    if (a === b) {
      throw new Error(
        `TriangularDistribution: a must be < b for a valid distribution, got a=b=${a}`
      );
    }
    this.fc = (c - a) / (b - a);
  }

  /** Inverse CDF sampling method */
  sample(rng: SeededRng): number {
    const u = rng.next();
    return this.inverseCDF(u);
  }

  mean(): number {
    return (this.a + this.b + this.c) / 3;
  }

  variance(): number {
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
}
