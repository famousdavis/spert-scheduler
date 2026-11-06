// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import type { AiOp } from "@app/api/ai-batch-service";
import { createActivity, createProject, createScenario } from "@app/api/project-service";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { buildRenderList } from "@ui/helpers/band-utils";
import { DEFAULT_SCENARIO_SETTINGS, type Activity, type ActivityBand, type Project, type Scenario, type SimulationRun } from "@domain/models/types";

/**
 * WI-162 — the Section writes through the REAL store action, `applyAiBatch`, as the Connect AI drain
 * calls it: the batch saves, keeps the simulation run, and sits in the one AI undo frame.
 */
const TODAY = { today: "2026-11-05" };
const RUN = { id: "r1", timestamp: "2026-11-05T12:00:00.000Z", trialCount: 1000, seed: "x", engineVersion: "1.1.1", percentiles: { 50: 10, 95: 14 }, histogramBins: [], mean: 10, standardDeviation: 2, minSample: 5, maxSample: 20, samples: [] } as unknown as SimulationRun;

function activity(id: string): Activity {
  return { ...createActivity(id, DEFAULT_SCENARIO_SETTINGS), id, name: id, min: 3, mostLikely: 5, max: 7, distributionType: "triangular" };
}

function seed(bands: ActivityBand[] = []): { projectId: string; scenarioId: string } {
  const scenario: Scenario = { ...createScenario("S1", "2026-11-02"), activities: [activity("a1"), activity("a2")], bands, simulationResults: RUN };
  const project: Project = { ...createProject("Sections", "2026-11-02"), scenarios: [scenario] };
  useProjectStore.setState({ projects: [project], undoStack: [], redoStack: [] });
  return { projectId: project.id, scenarioId: scenario.id };
}

const s = useProjectStore.getState;
const scenarioOf = (projectId: string): Scenario => s().projects.find((p) => p.id === projectId)!.scenarios[0]!;
const rows = (scenario: Scenario) =>
  buildRenderList(scenario.activities, scenario.bands ?? []).map((r) => (r.kind === "band" ? `[${r.band.name}]` : r.activity.id)).join(" ");

const addOne = (seq: number, id: string, before: string | null): AiOp => ({ seq, op: "bulk_create_sections", payload: { sections: [{ id, name: id, beforeActivityId: before }] } });

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], undoStack: [], redoStack: [] });
});

describe("the real applyAiBatch writes Sections", () => {
  it("saves them, and keeps the simulation run", () => {
    const { projectId, scenarioId } = seed();
    const results = s().applyAiBatch(projectId, [addOne(1, "Phase 1", "a1"), addOne(2, "Phase 2", "a2")], scenarioId, TODAY);
    expect(results.map((r) => r.outcome.status)).toEqual(["applied", "applied"]);
    expect(rows(scenarioOf(projectId))).toBe("[Phase 1] a1 [Phase 2] a2");
    expect(scenarioOf(projectId).simulationResults).toBe(RUN);
    const saved = new LocalStorageRepository().load(projectId);
    expect(saved!.scenarios[0]!.bands!.map((b) => b.name)).toEqual(["Phase 1", "Phase 2"]);
  });

  it("is one undo frame with the rest of the AI's burst, and redo brings it back", () => {
    const { projectId, scenarioId } = seed();
    s().applyAiBatch(projectId, [addOne(1, "One", "a1")], scenarioId, TODAY);
    s().applyAiBatch(projectId, [{ seq: 2, op: "bulk_update_sections", payload: { updates: [{ id: "One", name: "Renamed" }] } }], scenarioId, TODAY);
    s().applyAiBatch(projectId, [addOne(3, "Two", "a2")], scenarioId, TODAY);
    expect(rows(scenarioOf(projectId))).toBe("[Renamed] a1 [Two] a2");
    expect(s().undoStack).toHaveLength(1);
    s().undo();
    expect(rows(scenarioOf(projectId))).toBe("a1 a2");
    s().redo();
    expect(rows(scenarioOf(projectId))).toBe("[Renamed] a1 [Two] a2");
  });

  it("KNOWN LIMIT, not this release's: Undo installs a snapshot without results, so it clears the run even after a Section-only batch", () => {
    const { projectId, scenarioId } = seed();
    s().applyAiBatch(projectId, [addOne(1, "One", "a1")], scenarioId, TODAY);
    expect(scenarioOf(projectId).simulationResults).toBe(RUN);
    s().undo();
    expect(scenarioOf(projectId).simulationResults).toBeUndefined();
  });

  it("a batch that applies nothing writes nothing and opens no undo frame", () => {
    const { projectId, scenarioId } = seed();
    const before = s().projects;
    const results = s().applyAiBatch(projectId, [addOne(1, "One", "gone")], scenarioId, TODAY);
    expect(results[0]!.outcome.status).toBe("partial");
    expect(s().projects).toBe(before);
    expect(s().undoStack).toHaveLength(0);
  });

  it("a delete takes the header off and leaves every activity, and Undo puts it back where it was", () => {
    const { projectId, scenarioId } = seed([
      { id: "h1", name: "One", insertBeforeActivityId: "a1" },
      { id: "h2", name: "Two", insertBeforeActivityId: "a2", color: "#7dd3fc" },
    ]);
    s().applyAiBatch(projectId, [{ seq: 1, op: "delete_sections", payload: { ids: ["h2"] } }], scenarioId, TODAY);
    expect(rows(scenarioOf(projectId))).toBe("[One] a1 a2");
    expect(scenarioOf(projectId).simulationResults).toBe(RUN);
    s().undo();
    expect(rows(scenarioOf(projectId))).toBe("[One] a1 [Two] a2");
    expect(scenarioOf(projectId).bands![1]!.color).toBe("#7dd3fc");
  });

  it("fills to 50 and every later AI Section write still saves", () => {
    const { projectId, scenarioId } = seed();
    const ops: AiOp[] = [{
      seq: 1,
      op: "bulk_create_sections",
      payload: { sections: Array.from({ length: 50 }, (_, i) => ({ id: `h${i}`, name: `H${i}`, beforeActivityId: "a1" })) },
    }];
    s().applyAiBatch(projectId, ops, scenarioId, TODAY);
    expect(scenarioOf(projectId).bands).toHaveLength(50);
    const refused = s().applyAiBatch(projectId, [addOne(2, "h50", "a1")], scenarioId, TODAY);
    expect(refused[0]!.outcome.status).toBe("partial");
    s().applyAiBatch(projectId, [{ seq: 3, op: "bulk_update_sections", payload: { updates: [{ id: "h0", name: "Renamed at 50" }] } }], scenarioId, TODAY);
    const saved = new LocalStorageRepository().load(projectId);
    expect(saved!.scenarios[0]!.bands).toHaveLength(50);
    expect(saved!.scenarios[0]!.bands![0]!.name).toBe("Renamed at 50");
  });
});
