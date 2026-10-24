// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { SimulationRun } from "@domain/models/types";
import { STANDARD_PERCENTILES } from "@domain/models/types";
import { escapeCsvField } from "./csv-escape";

export function exportSimulationCSV(
  results: SimulationRun,
  scenarioName: string,
  projectName: string
): string {
  const lines: string[] = [];

  // Metadata header
  lines.push("# SPERT Scheduler — Simulation Results");
  lines.push(`# Project,${escapeCsvField(projectName)}`);
  lines.push(`# Scenario,${escapeCsvField(scenarioName)}`);
  // BR-1 (v0.79.x audit): escape every interpolated metadata cell. The seed is user-set
  // (settings.rngSeed), so a `=HYPERLINK(...)` seed would otherwise execute when a member opens
  // this CSV; timestamp/engineVersion are engine-set but escaped too, for uniformity.
  lines.push(`# Timestamp,${escapeCsvField(results.timestamp)}`);
  lines.push(`# Engine Version,${escapeCsvField(results.engineVersion)}`);
  lines.push(`# Trial Count,${escapeCsvField(results.trialCount)}`);
  lines.push(`# Seed,${escapeCsvField(results.seed)}`);
  lines.push("");

  // Summary statistics
  lines.push("Statistic,Value");
  lines.push(`Mean,${results.mean.toFixed(2)}`);
  lines.push(`Standard Deviation,${results.standardDeviation.toFixed(2)}`);
  lines.push(`Min Sample,${results.minSample.toFixed(2)}`);
  lines.push(`Max Sample,${results.maxSample.toFixed(2)}`);
  lines.push("");

  // Percentile table
  lines.push("Percentile,Duration (days)");
  for (const pct of STANDARD_PERCENTILES) {
    const value = results.percentiles[pct];
    if (value !== undefined) {
      lines.push(`P${pct},${value.toFixed(2)}`);
    }
  }

  return lines.join("\n");
}
