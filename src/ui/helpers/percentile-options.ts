// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { STANDARD_PERCENTILES } from "@domain/models/types";

export interface PercentileOption {
  value: number;
  label: string;
}

function buildOptions(percentiles: readonly number[]): PercentileOption[] {
  return percentiles.map((p) => ({ value: p / 100, label: `P${p}` }));
}

function standardRange(minPct: number, maxPct: number): number[] {
  return STANDARD_PERCENTILES.filter((p) => p >= minPct && p <= maxPct);
}

/**
 * Activity Target dropdown: P30, P40, then P50–P95.
 *
 * P30 and P40 are deliberately NOT added to STANDARD_PERCENTILES. That list defines
 * the Monte Carlo percentile record, and every surface that renders it — the
 * percentile table, the CSV/XLSX exports, the print report — would gain two columns
 * if it were widened. The activity target needs no entry there: it is resolved per
 * activity through the distribution's `inverseCDF` at an arbitrary probability
 * (`resolveActivityDuration`), and `probabilityTarget` is bounded 0.01–0.99 by
 * `project.schema.ts`, so any value in that range is already legal.
 */
export const ACTIVITY_PERCENTILE_OPTIONS = buildOptions([
  30,
  40,
  ...standardRange(50, 95),
]);

/** Project Target dropdown: P50–P99 */
export const PROJECT_PERCENTILE_OPTIONS = buildOptions(standardRange(50, 99));
