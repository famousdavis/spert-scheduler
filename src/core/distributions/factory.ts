// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

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
const DISTRIBUTION_LABELS: Record<Activity["distributionType"], string> = {
  normal: "Normal",
  logNormal: "LogNormal",
  triangular: "Triangular",
  uniform: "Uniform",
};

export function createDistributionForActivity(activity: Activity): Distribution {
  const mean = computePertMean(activity.min, activity.mostLikely, activity.max);
  const sd = resolveSD(
    activity.min,
    activity.max,
    activity.confidenceLevel,
    activity.sdOverride
  );

  try {
    switch (activity.distributionType) {
      case "normal":
        return new NormalDistribution(mean, sd);

      case "logNormal":
        if (mean <= 0) {
          throw new Error(`PERT mean must be > 0, got ${mean}`);
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
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // The ?? fallback below is not dead code, despite DISTRIBUTION_LABELS being
    // a total Record over the compile-time DistributionType union (so
    // TypeScript sees this lookup as always a `string`): it exists for the
    // one path the type system can't see — the `default` branch above firing
    // on a runtime value that isn't actually one of the four known types
    // (e.g. malformed data from an older export, a hand-edited project file,
    // or a future schema version read by an older build). In that case
    // DISTRIBUTION_LABELS[...] is genuinely undefined at runtime and this
    // fallback keeps the message from silently becoming "Cannot create
    // undefined distribution for activity...".
    const label = DISTRIBUTION_LABELS[activity.distributionType] ?? activity.distributionType;
    const wrapped = new Error(
      `Cannot create ${label} distribution for activity "${activity.name}": ${message}`
    );
    // Preserve the original error for debugging. The `new Error(msg, { cause })`
    // constructor overload isn't in this module's compile lib (factory.ts also
    // builds under the Web Worker's ES2020 config), so set `cause` as a property.
    (wrapped as { cause?: unknown }).cause = err;
    throw wrapped;
  }
}
