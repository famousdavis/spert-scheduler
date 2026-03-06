/**
 * Round to at most 2 decimal places, avoiding floating-point artifacts.
 */
function roundTo2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Heuristic 3-point estimate calculation.
 * Computes min and max from most-likely using percentage multipliers.
 */
export function computeHeuristic(
  mostLikely: number,
  minPercent: number,
  maxPercent: number
): { min: number; max: number } {
  return {
    min: roundTo2((mostLikely * minPercent) / 100),
    max: roundTo2((mostLikely * maxPercent) / 100),
  };
}
