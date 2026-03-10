// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { STANDARD_PERCENTILES } from "@domain/models/types";

export interface PercentileOption {
  value: number;
  label: string;
}

function buildOptions(minPct: number, maxPct: number): PercentileOption[] {
  return STANDARD_PERCENTILES.filter((p) => p >= minPct && p <= maxPct).map(
    (p) => ({ value: p / 100, label: `P${p}` })
  );
}

/** Activity Target dropdown: P50–P95 */
export const ACTIVITY_PERCENTILE_OPTIONS = buildOptions(50, 95);

/** Project Target dropdown: P50–P99 */
export const PROJECT_PERCENTILE_OPTIONS = buildOptions(50, 99);
