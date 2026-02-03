import type { HistogramBin, CDFPoint } from "@domain/models/types";
import { STANDARD_PERCENTILES } from "@domain/models/types";

/**
 * Sort samples in-place using Float64Array.sort().
 */
export function sortSamples(samples: Float64Array): Float64Array {
  samples.sort();
  return samples;
}

/**
 * Compute a single percentile from pre-sorted samples using linear interpolation.
 * @param p - Percentile as a fraction in (0, 1).
 */
export function percentile(sortedSamples: Float64Array, p: number): number {
  const n = sortedSamples.length;
  if (n === 0) throw new Error("Cannot compute percentile of empty array");
  if (p <= 0) return sortedSamples[0]!;
  if (p >= 1) return sortedSamples[n - 1]!;

  const index = p * (n - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const fraction = index - lower;

  if (lower === upper) return sortedSamples[lower]!;
  return sortedSamples[lower]! * (1 - fraction) + sortedSamples[upper]! * fraction;
}

/**
 * Compute standard percentiles: P5, P10, P25, P50, P75, P85, P90, P95, P96, P97, P98, P99.
 */
export function computeStandardPercentiles(
  sortedSamples: Float64Array
): Record<number, number> {
  const result: Record<number, number> = {};
  for (const p of STANDARD_PERCENTILES) {
    result[p] = percentile(sortedSamples, p / 100);
  }
  return result;
}

/**
 * Compute the arithmetic mean of samples.
 */
export function mean(samples: Float64Array | number[]): number {
  const n = samples.length;
  if (n === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += samples[i]!;
  }
  return sum / n;
}

/**
 * Compute population standard deviation.
 */
export function standardDeviation(samples: Float64Array | number[]): number {
  const n = samples.length;
  if (n === 0) return 0;
  const m = mean(samples);
  let sumSq = 0;
  for (let i = 0; i < n; i++) {
    const diff = samples[i]! - m;
    sumSq += diff * diff;
  }
  return Math.sqrt(sumSq / n);
}

/**
 * Generate equal-width histogram bins.
 */
export function histogram(
  samples: Float64Array | number[],
  binCount: number
): HistogramBin[] {
  const n = samples.length;
  if (n === 0) return [];

  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < n; i++) {
    const v = samples[i]!;
    if (v < min) min = v;
    if (v > max) max = v;
  }

  if (min === max) {
    return [{ binStart: min, binEnd: max, count: n }];
  }

  const binWidth = (max - min) / binCount;
  const bins: HistogramBin[] = [];
  for (let i = 0; i < binCount; i++) {
    bins.push({
      binStart: min + i * binWidth,
      binEnd: min + (i + 1) * binWidth,
      count: 0,
    });
  }

  for (let i = 0; i < n; i++) {
    const v = samples[i]!;
    let idx = Math.floor((v - min) / binWidth);
    if (idx >= binCount) idx = binCount - 1; // clamp max value into last bin
    bins[idx]!.count++;
  }

  return bins;
}

/**
 * Compute empirical CDF from pre-sorted samples.
 * Optionally downsample to maxPoints for rendering performance.
 */
export function cdf(
  sortedSamples: Float64Array,
  maxPoints?: number
): CDFPoint[] {
  const n = sortedSamples.length;
  if (n === 0) return [];

  const step = maxPoints && maxPoints < n ? Math.ceil(n / maxPoints) : 1;
  const points: CDFPoint[] = [];

  for (let i = 0; i < n; i += step) {
    points.push({
      value: sortedSamples[i]!,
      probability: (i + 1) / n,
    });
  }

  // Always include the last point
  if (points.length > 0 && points[points.length - 1]!.probability < 1) {
    points.push({
      value: sortedSamples[n - 1]!,
      probability: 1,
    });
  }

  return points;
}

/**
 * Confidence interval for a percentile.
 */
export interface PercentileCI {
  percentile: number; // e.g., 95 for P95
  point: number; // point estimate
  lower: number; // lower bound of CI
  upper: number; // upper bound of CI
  confidence: number; // e.g., 0.95 for 95% CI
}

/**
 * Compute bootstrap confidence interval for a percentile.
 * Uses simple percentile bootstrap method for efficiency.
 *
 * @param samples - Raw (unsorted) samples
 * @param p - Percentile as integer (e.g., 95 for P95)
 * @param bootstrapIterations - Number of bootstrap resamples (default 1000)
 * @param ciLevel - Confidence level (default 0.95 for 95% CI)
 */
export function bootstrapPercentileCI(
  samples: Float64Array | number[],
  p: number,
  bootstrapIterations: number = 1000,
  ciLevel: number = 0.95
): PercentileCI {
  const n = samples.length;
  if (n === 0) {
    return { percentile: p, point: 0, lower: 0, upper: 0, confidence: ciLevel };
  }

  // Sort samples for the point estimate
  const sortedOriginal = Float64Array.from(samples).sort();
  const pointEstimate = percentile(sortedOriginal, p / 100);

  // Bootstrap resampling
  const bootstrapEstimates: number[] = [];
  for (let b = 0; b < bootstrapIterations; b++) {
    // Resample with replacement
    const resample = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(Math.random() * n);
      resample[i] = samples[idx]!;
    }
    resample.sort();
    bootstrapEstimates.push(percentile(resample, p / 100));
  }

  // Sort bootstrap estimates
  bootstrapEstimates.sort((a, b) => a - b);

  // Compute CI bounds using percentile method
  // Clamp indices to valid range to handle edge cases (very few iterations)
  const alpha = (1 - ciLevel) / 2;
  const lowerIdx = Math.max(0, Math.floor(alpha * bootstrapIterations));
  const upperIdx = Math.min(
    bootstrapIterations - 1,
    Math.floor((1 - alpha) * bootstrapIterations) - 1
  );

  return {
    percentile: p,
    point: pointEstimate,
    lower: bootstrapEstimates[Math.max(0, lowerIdx)] ?? pointEstimate,
    upper: bootstrapEstimates[Math.max(0, upperIdx)] ?? pointEstimate,
    confidence: ciLevel,
  };
}

/**
 * Compute bootstrap CIs for all standard percentiles.
 * Note: This is computationally expensive. Use sparingly.
 */
export function computeStandardPercentileCIs(
  samples: Float64Array | number[],
  bootstrapIterations: number = 500 // Lower default for batch
): Record<number, PercentileCI> {
  const result: Record<number, PercentileCI> = {};
  for (const p of STANDARD_PERCENTILES) {
    result[p] = bootstrapPercentileCI(samples, p, bootstrapIterations);
  }
  return result;
}
