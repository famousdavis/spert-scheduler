import type { SeededRng } from "@infrastructure/rng";
import type { Distribution } from "./distribution";

/**
 * Acklam's rational approximation for the standard normal inverse CDF.
 * Accurate to ~1.15e-9 across the full (0,1) range.
 */
function normalQuantile(p: number): number {
  if (p <= 0 || p >= 1) {
    throw new Error(`normalQuantile: p must be in (0, 1), got ${p}`);
  }

  // Coefficients for rational approximation
  const a1 = -3.969683028665376e1;
  const a2 = 2.209460984245205e2;
  const a3 = -2.759285104469687e2;
  const a4 = 1.383577518672690e2;
  const a5 = -3.066479806614716e1;
  const a6 = 2.506628277459239e0;

  const b1 = -5.447609879822406e1;
  const b2 = 1.615858368580409e2;
  const b3 = -1.556989798598866e2;
  const b4 = 6.680131188771972e1;
  const b5 = -1.328068155288572e1;

  const c1 = -7.784894002430293e-3;
  const c2 = -3.223964580411365e-1;
  const c3 = -2.400758277161838e0;
  const c4 = -2.549732539343734e0;
  const c5 = 4.374664141464968e0;
  const c6 = 2.938163982698783e0;

  const d1 = 7.784695709041462e-3;
  const d2 = 3.224671290700398e-1;
  const d3 = 2.445134137142996e0;
  const d4 = 3.754408661907416e0;

  const pLow = 0.02425;
  const pHigh = 1 - pLow;

  let q: number;
  let r: number;

  if (p < pLow) {
    // Rational approximation for lower region
    q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  } else if (p <= pHigh) {
    // Rational approximation for central region
    q = p - 0.5;
    r = q * q;
    return (
      ((((((a1 * r + a2) * r + a3) * r + a4) * r + a5) * r + a6) * q) /
      (((((b1 * r + b2) * r + b3) * r + b4) * r + b5) * r + 1)
    );
  } else {
    // Rational approximation for upper region
    q = Math.sqrt(-2 * Math.log(1 - p));
    return (
      -(((((c1 * q + c2) * q + c3) * q + c4) * q + c5) * q + c6) /
      ((((d1 * q + d2) * q + d3) * q + d4) * q + 1)
    );
  }
}

export { normalQuantile };

export class NormalDistribution implements Distribution {
  constructor(
    private readonly mu: number,
    private readonly sigma: number
  ) {
    if (sigma < 0) {
      throw new Error(`NormalDistribution: sigma must be >= 0, got ${sigma}`);
    }
  }

  /** Box-Muller transform */
  sample(rng: SeededRng): number {
    const u1 = rng.next();
    const u2 = rng.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return this.mu + this.sigma * z;
  }

  mean(): number {
    return this.mu;
  }

  variance(): number {
    return this.sigma * this.sigma;
  }

  parameters(): Record<string, number> {
    return { mu: this.mu, sigma: this.sigma };
  }

  inverseCDF(p: number): number {
    if (this.sigma === 0) return this.mu;
    return this.mu + this.sigma * normalQuantile(p);
  }
}
