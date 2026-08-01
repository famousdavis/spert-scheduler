// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { CDFPoint } from "@domain/models/types";

/**
 * The two CDF points that straddle `targetValue`: the greatest point at or below it
 * and the least point at or above it.
 *
 * A single scan rather than a sort, and it does not assume the points are ordered —
 * either side may come back null when the target falls outside the sampled range,
 * and both are the same point when the target lands exactly on one.
 */
function bracket(
  points: CDFPoint[],
  targetValue: number
): { lower: CDFPoint | null; upper: CDFPoint | null } {
  let lower: CDFPoint | null = null;
  let upper: CDFPoint | null = null;

  for (const pt of points) {
    if (pt.value <= targetValue) {
      if (!lower || pt.value > lower.value) lower = pt;
    }
    if (pt.value >= targetValue) {
      if (!upper || pt.value < upper.value) upper = pt;
    }
  }

  return { lower, upper };
}

/**
 * Interpolate a probability from CDF points at a given value, linearly between the
 * two adjacent points. Clamps to the nearest endpoint outside the sampled range,
 * and returns 0 when there is nothing to interpolate from.
 */
export function interpolateCDF(points: CDFPoint[], targetValue: number): number {
  if (points.length === 0) return 0;

  const { lower, upper } = bracket(points, targetValue);

  // Outside the sampled range on one side — clamp to the endpoint that exists.
  if (!lower && upper) return upper.probability;
  if (!upper && lower) return lower.probability;
  // Only both-null can reach here: the single-null cases returned above. Written as
  // `||` rather than `&&` so TypeScript narrows both to non-null for the maths below,
  // which is what removes the non-null assertions this function used to carry.
  if (!lower || !upper) return 0;
  // The target landed exactly on a sampled point.
  if (lower === upper) return lower.probability;

  const ratio = (targetValue - lower.value) / (upper.value - lower.value);
  return lower.probability + ratio * (upper.probability - lower.probability);
}
