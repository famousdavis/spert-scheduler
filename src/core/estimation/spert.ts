import type { RSMLevel } from "@domain/models/types";
import { RSM_VALUES } from "@domain/models/types";

/**
 * PERT weighted mean: (min + 4*ml + max) / 6
 */
export function computePertMean(min: number, ml: number, max: number): number {
  return (min + 4 * ml + max) / 6;
}

/**
 * SPERT standard deviation: (max - min) * RSM
 */
export function computeSpertSD(
  min: number,
  max: number,
  rsmLevel: RSMLevel
): number {
  return (max - min) * RSM_VALUES[rsmLevel];
}

/**
 * Resolves the SD to use: sdOverride if provided, otherwise SPERT SD.
 */
export function resolveSD(
  min: number,
  max: number,
  rsmLevel: RSMLevel,
  sdOverride?: number
): number {
  return sdOverride ?? computeSpertSD(min, max, rsmLevel);
}

/**
 * Derive min/max from a most-likely estimate using percentage offsets.
 */
export function deriveMinMaxFromML(
  ml: number,
  minPct: number,
  maxPct: number
): { min: number; max: number } {
  return {
    min: ml * (1 - minPct),
    max: ml * (1 + maxPct),
  };
}

/**
 * Skew indicator: (mean - ml) / sd.
 * Positive = right-skewed, negative = left-skewed.
 */
export function computeSkewIndicator(
  min: number,
  ml: number,
  max: number,
  rsmLevel: RSMLevel,
  sdOverride?: number
): number {
  const mean = computePertMean(min, ml, max);
  const sd = resolveSD(min, max, rsmLevel, sdOverride);
  if (sd === 0) return 0;
  return (mean - ml) / sd;
}

/**
 * Coefficient of variation: sd / mean.
 */
export function computeCV(mean: number, sd: number): number {
  if (mean === 0) return 0;
  return sd / mean;
}
