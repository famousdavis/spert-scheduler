import { describe, it, expect } from "vitest";
import { exportSimulationCSV } from "./csv-export-service";
import type { SimulationRun } from "@domain/models/types";

function makeResults(overrides?: Partial<SimulationRun>): SimulationRun {
  return {
    id: "test-run-1",
    timestamp: "2026-01-15T10:00:00.000Z",
    trialCount: 10000,
    seed: "test-seed",
    engineVersion: "1.0.0",
    percentiles: { 5: 18.5, 10: 20.0, 25: 23.0, 50: 26.0, 75: 30.0, 85: 32.5, 90: 34.0, 95: 37.5 },
    histogramBins: [{ binStart: 15, binEnd: 20, count: 1000 }],
    mean: 26.3,
    standardDeviation: 5.2,
    minSample: 12.5,
    maxSample: 48.0,
    samples: [],
    ...overrides,
  };
}

describe("exportSimulationCSV", () => {
  it("includes metadata header with project and scenario names", () => {
    const csv = exportSimulationCSV(makeResults(), "Scenario A", "My Project");
    expect(csv).toContain("# SPERT Scheduler");
    expect(csv).toContain("# Project,My Project");
    expect(csv).toContain("# Scenario,Scenario A");
    expect(csv).toContain("# Trial Count,10000");
    expect(csv).toContain("# Seed,test-seed");
    expect(csv).toContain("# Engine Version,1.0.0");
    expect(csv).toContain("# Timestamp,2026-01-15T10:00:00.000Z");
  });

  it("includes summary statistics", () => {
    const csv = exportSimulationCSV(makeResults(), "S", "P");
    expect(csv).toContain("Mean,26.30");
    expect(csv).toContain("Standard Deviation,5.20");
    expect(csv).toContain("Min Sample,12.50");
    expect(csv).toContain("Max Sample,48.00");
  });

  it("includes percentile table", () => {
    const csv = exportSimulationCSV(makeResults(), "S", "P");
    expect(csv).toContain("Percentile,Duration (days)");
    expect(csv).toContain("P5,18.50");
    expect(csv).toContain("P50,26.00");
    expect(csv).toContain("P95,37.50");
  });

  it("escapes CSV values with commas", () => {
    const csv = exportSimulationCSV(makeResults(), "Scenario, with comma", "P");
    expect(csv).toContain('# Scenario,"Scenario, with comma"');
  });

  it("escapes CSV values with double quotes", () => {
    const csv = exportSimulationCSV(makeResults(), 'Scenario "quoted"', "P");
    expect(csv).toContain('# Scenario,"Scenario ""quoted"""');
  });

  it("only includes percentiles present in results", () => {
    const results = makeResults({ percentiles: { 50: 26.0, 95: 37.5 } });
    const csv = exportSimulationCSV(results, "S", "P");
    expect(csv).toContain("P50,26.00");
    expect(csv).toContain("P95,37.50");
    expect(csv).not.toContain("P5,");
    expect(csv).not.toContain("P75,");
  });

  it("produces valid newline-separated output", () => {
    const csv = exportSimulationCSV(makeResults(), "S", "P");
    const lines = csv.split("\n");
    // At least: 7 metadata lines + 1 blank + header + 4 stats + 1 blank + header + percentiles
    expect(lines.length).toBeGreaterThan(15);
    // No trailing empty lines (just ends with last percentile)
    expect(lines[lines.length - 1]).not.toBe("");
  });
});
