// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { CDFPoint } from "@domain/models/types";
import { interpolateCDF } from "@ui/helpers/cdf-interpolate";

/** One scenario's S-curve: keyed by its scenario ID, labelled by its name. */
export interface CDFDataset {
  /** The scenario's ID — the chart's data key, so two scenarios with one name draw two curves (WI-61). */
  id: string;
  /** The scenario's name, as the legend, the key and the tooltip show it. */
  label: string;
  points: CDFPoint[];
  color: string;
}

/** The dashed target line's look, on screen and on paper. */
export const CDF_TARGET_STROKE = "#6b7280";
export const CDF_TARGET_DASH = "5 5";

/**
 * The S-curves as one data array for Recharts: the union of every dataset's durations, each row holding
 * every dataset's cumulative probability (%) at that duration, KEYED BY SCENARIO ID. Shared by the
 * screen's chart and the printed one, so the two draw the same curves (WI-61).
 *
 * ⚠️ Keyed by ID, not by name. Keyed by name, two scenarios called the same — one click away, since the
 * clone dialog offers "<name> (Copy)" — wrote one column, the second overwriting the first, and both
 * lines drew the second scenario's curve.
 */
export function mergeCdfDatasets(datasets: readonly CDFDataset[]): Record<string, number>[] {
  const allValues = new Set<number>();
  for (const dataset of datasets) {
    for (const pt of dataset.points) {
      if (Number.isFinite(pt.value)) allValues.add(Number(pt.value.toFixed(2)));
    }
  }
  const sortedValues = Array.from(allValues).sort((a, b) => a - b);
  return sortedValues.map((value) => {
    const row: Record<string, number> = { value };
    for (const dataset of datasets) {
      row[dataset.id] = Number((interpolateCDF(dataset.points, value) * 100).toFixed(1));
    }
    return row;
  });
}
