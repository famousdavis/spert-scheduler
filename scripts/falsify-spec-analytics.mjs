// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

const F = new URL("../src/core/analytics/analytics.ts", import.meta.url).pathname;
export const testFile = "src/core/analytics/analytics.test.ts";
export const mutations = [
  {
    id: "N1  empty-samples branch removed (n === 0 falls through)",
    file: F,
    find: `  const result: Record<number, PercentileCI> = {};\n\n  if (n === 0) {`,
    replace: `  const result: Record<number, PercentileCI> = {};\n\n  if (false) {`,
    expectFailing: /empty samples yield zeroed/,
  },
  {
    id: "N2  ciLevel hardcoded to 0.95 in the empty branch",
    find: `      result[p] = { percentile: p, point: 0, lower: 0, upper: 0, confidence: ciLevel };`,
    replace: `      result[p] = { percentile: p, point: 0, lower: 0, upper: 0, confidence: 0.95 };`,
    file: F,
    expectFailing: /empty samples yield zeroed/,
  },
  {
    id: "N3  ciLevel ignored on the normal path",
    file: F,
    find: `      confidence: ciLevel,`,
    replace: `      confidence: 0.95,`,
    expectFailing: /reports the confidence level it was given/,
  },
  {
    id: "N4  point estimate taken from the resample instead of the sorted originals",
    file: F,
    find: `    const point = pointEstimates[p]!;`,
    replace: `    const point = estimates[0] ?? pointEstimates[p]!;`,
    expectFailing: /pinned to index 0|pinned to the last index|point estimates rise/,
  },
  {
    id: "N5  samples no longer sorted before the point estimates",
    file: F,
    find: `  const sortedOriginal = Float64Array.from(samples).sort();\n  const pointEstimates`,
    replace: `  const sortedOriginal = Float64Array.from(samples);\n  const pointEstimates`,
    expectFailing: /pinned to index 0|point estimates rise/,
  },
  {
    id: "N6  CI bounds no longer sorted, so lower/upper are arbitrary",
    file: F,
    find: `    estimates.sort((a, b) => a - b);`,
    replace: `    // estimates left unsorted`,
    expectFailing: /brackets every point estimate|pinned/,
  },
  {
    id: "N7  lowerIdx clamp removed (negative index -> undefined bound)",
    file: F,
    find: `  // Compute CI bounds for each percentile\n  const alpha = (1 - ciLevel) / 2;\n  const lowerIdx = Math.max(0, Math.floor(alpha * bootstrapIterations));`,
    replace: `  // Compute CI bounds for each percentile\n  const alpha = (1 - ciLevel) / 2;\n  const lowerIdx = Math.floor(alpha * bootstrapIterations) - 1;`,
    expectFailing: /single bootstrap iteration|brackets every point|single sample collapses/,
  },
  {
    id: "N8  bootstrap resample draws from a fixed index instead of a random one",
    file: F,
    find: `      resample[i] = samples[Math.floor(Math.random() * n)]!;`,
    replace: `      resample[i] = samples[0]!;`,
    expectFailing: /pinned to the last index/,
  },
  {
    id: "N9  computeStandardPercentileCIs no longer passes STANDARD_PERCENTILES",
    file: F,
    find: `  return computeBatchPercentileCIs(samples, STANDARD_PERCENTILES, bootstrapIterations);`,
    replace: `  return computeBatchPercentileCIs(samples, [50], bootstrapIterations);`,
    expectFailing: /covers every standard percentile/,
  },
];
