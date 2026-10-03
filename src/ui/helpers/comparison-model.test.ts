// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildComparisonModel, type ComparisonModel, type ComparisonModelInput } from "./comparison-model";
import { mergeCdfDatasets } from "@ui/charts/cdf-comparison-data";
import { createProject, createScenario, createActivity } from "@app/api/project-service";
import { stripSimulationSamples } from "@infrastructure/persistence/local-storage-repository";
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

  it("paper, no gate: the saved plan can run, so it asks for Plan B", () => {
    // Named since v0.75.0 (2026-10-03): "all scenarios" needs every compared scenario to need a run, and Baseline has results.
    expect(model([baseline, clone], { runGate: null }).runNote).toBe(
      "Run simulation on Plan B to add its results to the comparison."
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

// ── v0.75.0: the Run row's offer, the grey note, and the curve after a reload ─────────────────

/** A run scenario as a reload returns it: the save path's own stripper keeps the percentiles and
 *  leaves `samples: []` (unless "store full simulation data" is on, which is off by default). */
function reloaded(s: Scenario): Scenario {
  return stripSimulationSamples({ ...createProject("Reload", START), scenarios: [s] }).scenarios[0]!;
}

/** Two activities that depend on each other: a cycle, which the UI refuses and an import can carry. */
function cyclicScenario(name: string): Scenario {
  const loop = scenarioOf(name, [VALID, VALID], { dependencyMode: true });
  const [x, y] = loop.activities as [Activity, Activity];
  return {
    ...loop,
    dependencies: [
      { fromActivityId: x.id, toActivityId: y.id, type: "FS", lagDays: 0 },
      { fromActivityId: y.id, toActivityId: x.id, type: "FS", lagDays: 0 },
    ],
  };
}

const offers = (m: ComparisonModel) => m.columns.map((c) => [c.name, c.offerRun]);

describe("offerRun, column by column — each test holds a true beside its false", () => {
  it("run → no; unrun and runnable → yes; flagged, empty and cyclic → no", () => {
    const m = model([
      run(scenarioOf("Baseline", [VALID]), EARLY),
      scenarioOf("Plan B", [VALID]),
      scenarioOf("Fast-track", [VALID, OUT_OF_ORDER_NORMAL]),
      createScenario("Empty", START),
      cyclicScenario("Cyclic"),
    ]);
    expect(offers(m)).toEqual([
      ["Baseline", false],
      ["Plan B", true],
      ["Fast-track", false],
      ["Empty", false],
      ["Cyclic", false],
    ]);
  });

  it("the on-screen gate refusing → no Run there; a gate on another scenario changes nothing", () => {
    const base = run(scenarioOf("Baseline", [VALID]), EARLY);
    const planB = scenarioOf("Plan B", [VALID]);
    expect(offers(model([base, planB], { runGate: { scenarioId: planB.id, runBlocked: true } }))).toEqual([
      ["Baseline", false],
      ["Plan B", false],
    ]);
    expect(offers(model([base, planB], { runGate: { scenarioId: base.id, runBlocked: true } }))).toEqual([
      ["Baseline", false],
      ["Plan B", true],
    ]);
  });

  it("results without samples: runnable → yes; flagged → no; with samples → no", () => {
    const m = model([
      reloaded(run(scenarioOf("Lean", [VALID]), LATE)),
      reloaded(run(scenarioOf("Fast-track", [VALID, OUT_OF_ORDER_NORMAL]), EARLY)),
      run(scenarioOf("Baseline", [VALID]), EARLY),
    ]);
    expect(offers(m)).toEqual([
      ["Lean", true],
      ["Fast-track", false],
      ["Baseline", false],
    ]);
  });
});

/**
 * THE PROPERTY, as literals per case: the columns offered a Run are exactly the runnable scenarios
 * without results plus the runnable ones whose results lost their samples; the note's first sentence
 * names the former — or says "all scenarios" exactly when they are every compared scenario — and its
 * second sentence names the latter. Every case pins both, written out, never computed.
 */
describe("the Run row and the grey note agree in every state", () => {
  const ASK_ALL = "Run simulation on all scenarios for complete comparison data.";

  it("one run + one unrun → the unrun one by name (the corrected state: never 'all' beside results)", () => {
    const m = model([run(scenarioOf("Baseline", [VALID]), EARLY), scenarioOf("Plan B", [VALID])]);
    expect(offers(m)).toEqual([["Baseline", false], ["Plan B", true]]);
    expect(m.runNote).toBe("Run simulation on Plan B to add its results to the comparison.");
  });

  it("two unrun → 'all scenarios', and a Run under each", () => {
    const m = model([scenarioOf("Baseline", [VALID]), scenarioOf("Plan B", [VALID])]);
    expect(offers(m)).toEqual([["Baseline", true], ["Plan B", true]]);
    expect(m.runNote).toBe(ASK_ALL);
  });

  it("two unrun beside a flagged one → both by name, not 'all': the flagged one needs a fix, not a run", () => {
    const m = model([
      scenarioOf("Baseline", [VALID]),
      scenarioOf("Fast-track", [VALID, OUT_OF_ORDER_NORMAL]),
      scenarioOf("Plan B", [VALID]),
    ]);
    expect(offers(m)).toEqual([["Baseline", true], ["Fast-track", false], ["Plan B", true]]);
    expect(m.runNote).toBe("Run simulation on Baseline and Plan B to add their results to the comparison.");
  });

  it("one stripped beside two run → two datasets, a Run under the stripped one, and the curve sentence", () => {
    const a = run(scenarioOf("Baseline", [VALID]), EARLY);
    const lean = reloaded(run(scenarioOf("Lean", [VALID]), LATE));
    const c = run(scenarioOf("Plan C", [VALID]), LATE);
    const m = model([a, lean, c]);
    expect(offers(m)).toEqual([["Baseline", false], ["Lean", true], ["Plan C", false]]);
    expect(m.runNote).toBe(
      "Lean has no curve because its sample data was not stored. Run simulation on Lean again to restore it."
    );
    expect(m.cdf!.datasets.map((d) => d.id)).toEqual([a.id, c.id]);
  });

  it("one stripped beside one run → no S-curves (a single curve is not a comparison)", () => {
    const base = run(scenarioOf("Baseline", [VALID]), EARLY);
    const lean = run(scenarioOf("Lean", [VALID]), LATE);
    // Control: with its samples, the same pair draws two curves.
    expect(model([base, lean]).cdf!.datasets).toHaveLength(2);
    const m = model([base, reloaded(lean)]);
    expect(m.cdf).toBeNull();
    expect(offers(m)).toEqual([["Baseline", false], ["Lean", true]]);
  });

  it("both stripped — the reload → the curve sentence ALONE, no leading space, and no S-curves", () => {
    const m = model([reloaded(run(scenarioOf("Baseline", [VALID]), EARLY)), reloaded(run(scenarioOf("Plan B", [VALID]), LATE))]);
    expect(offers(m)).toEqual([["Baseline", true], ["Plan B", true]]);
    expect(m.runNote).toBe(
      "Baseline and Plan B have no curves because their sample data was not stored. Run simulation on them again to restore it."
    );
    expect(m.cdf).toBeNull();
  });

  it("three stripped → 'A, B and C'", () => {
    const m = model(["Baseline", "Plan B", "Fast-track"].map((n) => reloaded(run(scenarioOf(n, [VALID]), EARLY))));
    expect(offers(m)).toEqual([["Baseline", true], ["Plan B", true], ["Fast-track", true]]);
    expect(m.runNote).toBe(
      "Baseline, Plan B and Fast-track have no curves because their sample data was not stored. Run simulation on them again to restore it."
    );
  });

  it("an unrun AND a stripped one → both sentences, joined by ONE space", () => {
    const m = model([
      scenarioOf("Plan B", [VALID]),
      reloaded(run(scenarioOf("Lean", [VALID]), LATE)),
      run(scenarioOf("Baseline", [VALID]), EARLY),
    ]);
    expect(offers(m)).toEqual([["Plan B", true], ["Lean", true], ["Baseline", false]]);
    expect(m.runNote).toBe(
      "Run simulation on Plan B to add its results to the comparison. Lean has no curve because its sample data was not stored. Run simulation on Lean again to restore it."
    );
  });

  it("a stripped scenario that cannot run — flagged, or refused on screen — is neither offered nor named", () => {
    const leanFlagged = reloaded(run(scenarioOf("Lean", [VALID, OUT_OF_ORDER_NORMAL]), LATE));
    const stretch = reloaded(run(scenarioOf("Stretch", [VALID]), EARLY));
    const flaggedBeside = model([leanFlagged, stretch]);
    expect(offers(flaggedBeside)).toEqual([["Lean", false], ["Stretch", true]]);
    expect(flaggedBeside.runNote).toBe(
      "Stretch has no curve because its sample data was not stored. Run simulation on Stretch again to restore it."
    );
    const refused = model([stretch, run(scenarioOf("Baseline", [VALID]), EARLY)], {
      runGate: { scenarioId: stretch.id, runBlocked: true },
    });
    expect(offers(refused)).toEqual([["Stretch", false], ["Baseline", false]]);
    expect(refused.runNote).toBeNull();
  });

  it("paper passes no gate: a scenario refused on screen is still offered in the model and named", () => {
    const stretch = reloaded(run(scenarioOf("Stretch", [VALID]), EARLY));
    const m = model([stretch, run(scenarioOf("Baseline", [VALID]), EARLY)], { runGate: null });
    expect(offers(m)).toEqual([["Stretch", true], ["Baseline", false]]);
    expect(m.runNote).toBe(
      "Stretch has no curve because its sample data was not stored. Run simulation on Stretch again to restore it."
    );
  });
});
