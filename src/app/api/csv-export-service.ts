import type { SimulationRun } from "@domain/models/types";
import { STANDARD_PERCENTILES } from "@domain/models/types";

export function exportSimulationCSV(
  results: SimulationRun,
  scenarioName: string,
  projectName: string
): string {
  const lines: string[] = [];

  // Metadata header
  lines.push("# SPERT Scheduler — Simulation Results");
  lines.push(`# Project,${csvEscape(projectName)}`);
  lines.push(`# Scenario,${csvEscape(scenarioName)}`);
  lines.push(`# Timestamp,${results.timestamp}`);
  lines.push(`# Engine Version,${results.engineVersion}`);
  lines.push(`# Trial Count,${results.trialCount}`);
  lines.push(`# Seed,${results.seed}`);
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

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
