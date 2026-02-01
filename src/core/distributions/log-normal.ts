import type { SeededRng } from "@infrastructure/rng";
import type { Distribution } from "./distribution";
import { NormalDistribution, normalQuantile } from "./normal";

/**
 * LogNormal distribution parameterized by natural-scale mean and SD.
 * Internally converts to log-scale mu and sigma.
 */
export class LogNormalDistribution implements Distribution {
  private readonly muLog: number;
  private readonly sigmaLog: number;
  private readonly normalDist: NormalDistribution;

  constructor(
    private readonly naturalMean: number,
    private readonly naturalSD: number
  ) {
    if (naturalMean <= 0) {
      throw new Error(
        `LogNormalDistribution: naturalMean must be > 0, got ${naturalMean}`
      );
    }
    if (naturalSD < 0) {
      throw new Error(
        `LogNormalDistribution: naturalSD must be >= 0, got ${naturalSD}`
      );
    }

    // Convert natural-scale parameters to log-scale
    const variance = naturalSD * naturalSD;
    const sigmaLogSquared = Math.log(variance / (naturalMean * naturalMean) + 1);
    this.sigmaLog = Math.sqrt(sigmaLogSquared);
    this.muLog = Math.log(naturalMean) - sigmaLogSquared / 2;

    // Internal normal distribution for sampling
    this.normalDist = new NormalDistribution(this.muLog, this.sigmaLog);
  }

  sample(rng: SeededRng): number {
    return Math.exp(this.normalDist.sample(rng));
  }

  mean(): number {
    return this.naturalMean;
  }

  variance(): number {
    return this.naturalSD * this.naturalSD;
  }

  parameters(): Record<string, number> {
    return {
      naturalMean: this.naturalMean,
      naturalSD: this.naturalSD,
      muLog: this.muLog,
      sigmaLog: this.sigmaLog,
    };
  }

  inverseCDF(p: number): number {
    if (this.sigmaLog === 0) return this.naturalMean;
    return Math.exp(this.muLog + this.sigmaLog * normalQuantile(p));
  }
}
