// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildComparisonModel, type ComparisonModelInput } from "./comparison-model";
import { mergeCdfDatasets } from "@ui/charts/cdf-comparison-data";
import { createScenario, createActivity } from "@app/api/project-service";
import type { Activity, Scenario, ScenarioSettings, SimulationRun } from "@domain/models/types";

/**
 * WI-61 — what the comparison SAYS, lifted out of the screen's table so the printed comparison says the
 * same: one model, two renderers. The expected values are written out here, never computed by calling the
 * model again. The screen table's own behaviour stays pinned by ScenarioComparison.test.tsx, unchanged.
 */

const START = "2026-01-05"; // Monday

/** A formatter whose output shows it was the one used: the model formats through its input. */
const formatDate = (iso: string) => `D:${iso}`;

const VALID = { min: 5, mostLikely: 10, max: 20 };
const OUT_OF_ORDER_NORMAL = { min: 12, mostLikely: 10, max: 20, distributionType: "normal" as const };

function scenarioOf(name: string, rows: Partial<Activity>[], settings: Partial<ScenarioSettings> = {}): Scenario {
  const s = createScenario(name, START);
  return {
    ...s,
    settings: { ...s.settings, ...settings },
    activities: rows.map((patch, i) => ({ ...createActivity(`Row ${i + 1}`, s.settings), ...patch })),
  };
}

/** Results with the given samples; every standard percentile present, so a buffer computes. */
function run(s: Scenario, samples: number[]): Scenario {
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
  const results: SimulationRun = {
    id: `run-${s.id}`,
    timestamp: "2026-01-05T00:00:00.000Z",
    trialCount: samples.length,
    seed: "wi61-fixture",
    engineVersion: "1.1.1",
    percentiles: Object.fromEntries([5, 10, 25, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 96, 97, 98, 99].map((p) => [p, at(p)])),
    histogramBins: [],
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    standardDeviation: 1,
    minSample: sorted[0]!,
    maxSample: sorted[sorted.length - 1]!,
    samples,
  };
  return { ...s, simulationResults: results };
}

const EARLY = [20, 22, 24, 26, 28, 30];
const LATE = [30, 33, 36, 39, 42, 45];

function model(scenarios: Scenario[], over: Partial<ComparisonModelInput> = {}) {
  return buildComparisonModel({ scenarios, showActivityNumbers: true, runGate: null, formatDate, ...over });
}

describe("the columns and rows", () => {
  it("lists the columns in the order given, each with its SAVED flagged count", () => {
    const m = model([scenarioOf("Fast-track", [VALID, OUT_OF_ORDER_NORMAL]), scenarioOf("Baseline", [VALID])]);
    expect(m.columns.map((c) => [c.name, c.flaggedCount])).toEqual([["Fast-track", 1], ["Baseline", 0]]);
  });

  it("formats its dates through the formatter it is given — the model stays pure", () => {
    const m = model([scenarioOf("A", [VALID]), scenarioOf("B", [VALID])]);
    expect(m.rows[0]).toEqual({ label: "Start Date", values: ["D:2026-01-05", "D:2026-01-05"] });
  });
});

describe("a flagged scenario's note carries EVERY row, for each renderer to cap or not", () => {
  const rows = [OUT_OF_ORDER_NORMAL, VALID, OUT_OF_ORDER_NORMAL, OUT_OF_ORDER_NORMAL, OUT_OF_ORDER_NORMAL];

  it("four flagged rows → four input rows, numbered in THAT scenario's own order", () => {
    const m = model([scenarioOf("Stretch", rows), scenarioOf("Baseline", [VALID])]);
    expect(m.flagNotes).toHaveLength(1);
    expect(m.flagNotes[0]!.input.scenarioName).toBe("Stretch");
    expect(m.flagNotes[0]!.input.rows.map((r) => r.label)).toEqual(["#1 Row 1", "#3 Row 3", "#4 Row 4", "#5 Row 5"]);
    expect(m.flagNotes[0]!.rowIds).toHaveLength(4);
  });

  it("names the rows without '#n' when the project does not number them", () => {
    const m = model([scenarioOf("Stretch", rows), scenarioOf("Baseline", [VALID])], { showActivityNumbers: false });
    expect(m.flagNotes[0]!.input.rows.map((r) => r.label)).toEqual(["Row 1", "Row 3", "Row 4", "Row 5"]);
  });
});

describe("the grey note follows the Run gate it is given — paper passes none (the SAVED plan)", () => {
  // S4r: Baseline run, an unrun valid clone on screen whose Run a refused cell has blocked.
  const baseline = run(scenarioOf("Baseline", [VALID]), EARLY);
  const clone = scenarioOf("Plan B", [VALID]);
  const gate = { scenarioId: clone.id, runBlocked: true };

  it("the screen's gate: the blocked clone is not asked for, so there is no note at all", () => {
    expect(model([baseline, clone], { runGate: gate }).runNote).toBeNull();
  });

  it("paper, no gate: the saved plan can run, so it asks for every scenario", () => {
    expect(model([baseline, clone], { runGate: null }).runNote).toBe(
      "Run simulation on all scenarios for complete comparison data."
    );
  });
});

describe("the S-curves", () => {
  it("one dataset per compared scenario WITH results, keyed by its ID, labelled by its name, in column order", () => {
    const a = run(scenarioOf("Fast-track", [VALID]), EARLY);
    const unrun = scenarioOf("Plan C", [VALID]);
    const b = run(scenarioOf("Baseline", [VALID]), LATE);
    const cdf = model([a, unrun, b]).cdf!;
    expect(cdf.datasets.map((d) => [d.id, d.label, d.color])).toEqual([
      [a.id, "Fast-track", "#3b82f6"],
      [b.id, "Baseline", "#10b981"],
    ]);
  });

  it("none with fewer than two curves", () => {
    expect(model([run(scenarioOf("A", [VALID]), EARLY), scenarioOf("B", [VALID])]).cdf).toBeNull();
  });

  it("two scenarios with ONE name keep two datasets and two data columns", () => {
    const a = run(scenarioOf("Baseline", [VALID]), EARLY);
    const b = run(scenarioOf("Baseline", [VALID]), LATE);
    const cdf = model([a, b]).cdf!;
    expect(cdf.datasets.map((d) => d.label)).toEqual(["Baseline", "Baseline"]);
    expect(cdf.datasets[0]!.id).not.toBe(cdf.datasets[1]!.id);
    // At 30 days every early sample is done and no late one is: two DIFFERENT curves (keyed by name,
    // one column held both, and both lines drew the second).
    const row = mergeCdfDatasets(cdf.datasets).find((r) => r.value === 30)!;
    expect(row[a.id]).toBeGreaterThan(90);
    expect(row[b.id]).toBeLessThan(40);
  });
});

describe("the dashed line and its caption (owner ruling, 2026-09-28)", () => {
  it("one shared Project target: today's words", () => {
    const cdf = model([run(scenarioOf("Fast-track", [VALID]), EARLY), run(scenarioOf("Baseline", [VALID]), LATE)]).cdf!;
    expect(cdf.target).toBe(0.95);
    expect(cdf.caption).toBe("Duration (days) · Dashed line: P95 target");
  });

  it("targets that differ: the FIRST curve's target, and the caption names whose it is", () => {
    const cdf = model([
      run(scenarioOf("Fast-track", [VALID], { projectProbabilityTarget: 0.9 }), EARLY),
      run(scenarioOf("Baseline", [VALID]), LATE),
    ]).cdf!;
    expect(cdf.target).toBe(0.9);
    expect(cdf.caption).toBe("Duration (days) · Dashed line: Fast-track's P90 target");
  });

  it("an UNRUN first column never owns the line: two P95 curves beside it read as today", () => {
    const cdf = model([
      scenarioOf("Clone", [VALID], { projectProbabilityTarget: 0.9 }),
      run(scenarioOf("Fast-track", [VALID]), EARLY),
      run(scenarioOf("Baseline", [VALID]), LATE),
    ]).cdf!;
    expect(cdf.target).toBe(0.95);
    expect(cdf.caption).toBe("Duration (days) · Dashed line: P95 target");
  });

  it("names the owner literally, whatever its last letter", () => {
    const cdf = model([
      run(scenarioOf("Plans", [VALID], { projectProbabilityTarget: 0.8 }), EARLY),
      run(scenarioOf("Baseline", [VALID]), LATE),
    ]).cdf!;
    expect(cdf.caption).toBe("Duration (days) · Dashed line: Plans's P80 target");
  });
});

describe("the red note", () => {
  it("names each scenario the engine could not schedule, with the engine's own message", () => {
    const base = scenarioOf("Baseline", [VALID], { dependencyMode: true });
    const loop = scenarioOf("Cyclic", [VALID, VALID], { dependencyMode: true });
    const [x, y] = loop.activities as [Activity, Activity];
    const cyclic: Scenario = {
      ...loop,
      dependencies: [
        { fromActivityId: x.id, toActivityId: y.id, type: "FS", lagDays: 0 },
        { fromActivityId: y.id, toActivityId: x.id, type: "FS", lagDays: 0 },
      ],
    };
    expect(model([base, cyclic]).failNote).toBe(
      "Could not compute a schedule for: Cyclic (Dependency cycle detected — cannot compute topological order)"
    );
  });
});
