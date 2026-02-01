import type { Activity } from "@domain/models/types";
import { computePertMean, resolveSD } from "@core/estimation/spert";
import type { Distribution } from "./distribution";
import { NormalDistribution } from "./normal";
import { LogNormalDistribution } from "./log-normal";
import { TriangularDistribution } from "./triangular";
import { UniformDistribution } from "./uniform";

/**
 * Creates a Distribution instance for the given activity using its
 * PERT mean, resolved SD, and chosen distribution type.
 */
export function createDistributionForActivity(activity: Activity): Distribution {
  const mean = computePertMean(activity.min, activity.mostLikely, activity.max);
  const sd = resolveSD(
    activity.min,
    activity.max,
    activity.confidenceLevel,
    activity.sdOverride
  );

  switch (activity.distributionType) {
    case "normal":
      return new NormalDistribution(mean, sd);

    case "logNormal":
      if (mean <= 0) {
        throw new Error(
          `Cannot create LogNormal distribution for activity "${activity.name}": PERT mean must be > 0, got ${mean}`
        );
      }
      return new LogNormalDistribution(mean, sd);

    case "triangular":
      return new TriangularDistribution(
        activity.min,
        activity.mostLikely,
        activity.max
      );

    case "uniform":
      return new UniformDistribution(activity.min, activity.max);

    default: {
      const _exhaustive: never = activity.distributionType;
      throw new Error(`Unknown distribution type: ${_exhaustive}`);
    }
  }
}
