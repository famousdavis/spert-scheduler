// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { applyAiOpsToProject, type AiOp } from "./ai-batch-service";
import { createProject, createScenario, createActivity, addActivityToScenario } from "./project-service";
import { buildRenderList } from "@ui/helpers/band-utils";
import type { Project, Scenario, SimulationRun, ActivityBand } from "@domain/models/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseProject(
  opts: { dependencyMode?: boolean; activityIds?: string[] } = {}
): { project: Project; scenarioId: string } {
  let scenario = createScenario("S1", "2025-01-06");
  for (const id of opts.activityIds ?? ["a", "b", "c"]) {
    const a = createActivity(id, scenario.settings);
    scenario = addActivityToScenario(scenario, { ...a, id });
  }
  scenario = {
    ...scenario,
    settings: { ...scenario.settings, dependencyMode: opts.dependencyMode ?? false },
  };
  const base = createProject("P", "2025-01-06");
  return { project: { ...base, scenarios: [scenario] }, scenarioId: scenario.id };
}

const SIM = { id: "sim1" } as SimulationRun; // truthy sentinel for invalidation checks

function scenarioOf(project: Project, scenarioId: string): Scenario {
  return project.scenarios.find((s) => s.id === scenarioId)!;
}

function withScenarioPatch(project: Project, scenarioId: string, patch: Partial<Scenario>): Project {
  return {
    ...project,
    scenarios: project.scenarios.map((s) => (s.id === scenarioId ? { ...s, ...patch } : s)),
  };
}

function reorderOp(orderedActivityIds: string[], scenarioId?: string): AiOp {
  return { seq: 1, op: "reorder_activities", payload: { scenarioId, orderedActivityIds } };
}

function run(project: Project, op: AiOp, scenarioId: string) {
  const { project: next, results } = applyAiOpsToProject(project, [op], scenarioId);
  return { next, outcome: results[0]!.outcome, ids: scenarioOf(next, scenarioId).activities.map((a) => a.id) };
}

// ---------------------------------------------------------------------------
// Apply path — both modes rebuild the array and invalidate results
// ---------------------------------------------------------------------------

describe("reorder_activities — apply", () => {
  it("reorders the array in dependency mode and clears simulationResults", () => {
    const { project, scenarioId } = baseProject({ dependencyMode: true, activityIds: ["a", "b", "c"] });
    const seeded = withScenarioPatch(project, scenarioId, { simulationResults: SIM });
    const { next, outcome, ids } = run(seeded, reorderOp(["c", "a", "b"], scenarioId), scenarioId);

    expect(outcome).toEqual({ status: "applied" });
    expect(ids).toEqual(["c", "a", "b"]);
    expect(scenarioOf(next, scenarioId).simulationResults).toBeUndefined();
  });

  it("reorders the array in sequential mode and clears simulationResults", () => {
    const { project, scenarioId } = baseProject({ dependencyMode: false, activityIds: ["a", "b", "c"] });
    const seeded = withScenarioPatch(project, scenarioId, { simulationResults: SIM });
    const { next, outcome, ids } = run(seeded, reorderOp(["b", "c", "a"], scenarioId), scenarioId);

    expect(outcome).toEqual({ status: "applied" });
    expect(ids).toEqual(["b", "c", "a"]);
    expect(scenarioOf(next, scenarioId).simulationResults).toBeUndefined();
  });

  it("preserves every activity object under reorder (identity by id, no data loss)", () => {
    const { project, scenarioId } = baseProject({ activityIds: ["a", "b", "c"] });
    const before = scenarioOf(project, scenarioId).activities;
    const { next } = run(project, reorderOp(["c", "b", "a"], scenarioId), scenarioId);
    const after = scenarioOf(next, scenarioId).activities;
    // Same set of activity objects, just permuted — reorder never mints or drops.
    expect(new Set(after)).toEqual(new Set(before));
    expect(after.map((a) => a.id)).toEqual(["c", "b", "a"]);
  });
});

// ---------------------------------------------------------------------------
// Skip paths — no mutation, correct reason
// ---------------------------------------------------------------------------

describe("reorder_activities — skips (no mutation)", () => {
  it("identical order → value_unchanged, simulationResults untouched", () => {
    const { project, scenarioId } = baseProject({ activityIds: ["a", "b", "c"] });
    const seeded = withScenarioPatch(project, scenarioId, { simulationResults: SIM });
    const { next, outcome, ids } = run(seeded, reorderOp(["a", "b", "c"], scenarioId), scenarioId);

    expect(outcome).toEqual({ status: "skipped", reason: "value_unchanged" });
    expect(ids).toEqual(["a", "b", "c"]);
    expect(scenarioOf(next, scenarioId).simulationResults).toBe(SIM); // NOT cleared
  });

  it("duplicate id in the requested order → invalid_order (checked before staleness)", () => {
    const { project, scenarioId } = baseProject({ activityIds: ["a", "b", "c"] });
    const seeded = withScenarioPatch(project, scenarioId, { simulationResults: SIM });
    // ["a","b","a"] both duplicates AND drops "c"; the duplicate must win.
    const { next, outcome, ids } = run(seeded, reorderOp(["a", "b", "a"], scenarioId), scenarioId);

    expect(outcome).toEqual({ status: "skipped", reason: "invalid_order" });
    expect(ids).toEqual(["a", "b", "c"]);
    expect(scenarioOf(next, scenarioId).simulationResults).toBe(SIM);
  });

  it("an id not in the live scenario (equal length) → stale_order", () => {
    const { project, scenarioId } = baseProject({ activityIds: ["a", "b", "c"] });
    const { outcome, ids } = run(project, reorderOp(["a", "b", "x"], scenarioId), scenarioId);
    expect(outcome).toEqual({ status: "skipped", reason: "stale_order" });
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("drift after queue: an activity added before drain → stale_order, zero mutation", () => {
    // The op is authored against {a,b,c}; before it drains, the user (or a
    // collaborator) adds "d". The drain-time set-equality check is authoritative:
    // {a,b,c} ≠ {a,b,c,d} → the whole op is refused, nothing moves.
    const { project, scenarioId } = baseProject({ activityIds: ["a", "b", "c"] });
    const op = reorderOp(["c", "b", "a"], scenarioId); // built against the 3-id snapshot
    const scenario = scenarioOf(project, scenarioId);
    const d = createActivity("d", scenario.settings);
    const drifted = withScenarioPatch(project, scenarioId, {
      activities: [...scenario.activities, { ...d, id: "d" }],
    });

    const { outcome, ids } = run(drifted, op, scenarioId);
    expect(outcome).toEqual({ status: "skipped", reason: "stale_order" });
    expect(ids).toEqual(["a", "b", "c", "d"]); // unchanged
  });

  it("locked scenario → locked (batch-level guard, before the reorder handler)", () => {
    const { project, scenarioId } = baseProject({ activityIds: ["a", "b", "c"] });
    const locked = withScenarioPatch(project, scenarioId, { locked: true });
    const { outcome, ids } = run(locked, reorderOp(["c", "b", "a"], scenarioId), scenarioId);
    expect(outcome).toEqual({ status: "skipped", reason: "locked" });
    expect(ids).toEqual(["a", "b", "c"]);
  });
});

// ---------------------------------------------------------------------------
// Structural parse → whole-op invalid (the only path to `invalid` here)
// ---------------------------------------------------------------------------

describe("reorder_activities — structural invalid", () => {
  it("fewer than 2 ids → invalid", () => {
    const { project, scenarioId } = baseProject({ activityIds: ["a", "b", "c"] });
    expect(run(project, reorderOp(["a"], scenarioId), scenarioId).outcome).toEqual({
      status: "skipped",
      reason: "invalid",
    });
    expect(run(project, reorderOp([], scenarioId), scenarioId).outcome).toEqual({
      status: "skipped",
      reason: "invalid",
    });
  });

  it("a non-string element → invalid (structural primitive-type check)", () => {
    const { project, scenarioId } = baseProject({ activityIds: ["a", "b", "c"] });
    const op: AiOp = {
      seq: 1,
      op: "reorder_activities",
      payload: { scenarioId, orderedActivityIds: [1, 2] as unknown as string[] },
    };
    expect(run(project, op, scenarioId).outcome).toEqual({ status: "skipped", reason: "invalid" });
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 — bands travel with their anchor activity (no band mutation)
// ---------------------------------------------------------------------------

describe("reorder_activities — bands follow their anchor", () => {
  it("buildRenderList re-anchors each band immediately before its moved activity", () => {
    const { project, scenarioId } = baseProject({ activityIds: ["a", "b", "c"] });
    const bands: ActivityBand[] = [
      { id: "band1", name: "Phase 1", insertBeforeActivityId: "b" }, // anchored to b
      { id: "band2", name: "Tail", insertBeforeActivityId: null }, // trailing
    ];
    const withBands = withScenarioPatch(project, scenarioId, { bands });

    const { next, outcome } = run(withBands, reorderOp(["c", "b", "a"], scenarioId), scenarioId);
    expect(outcome).toEqual({ status: "applied" });

    const scenario = scenarioOf(next, scenarioId);
    // Bands array itself is untouched — the reorder mutates only `activities`.
    expect(scenario.bands).toEqual(bands);

    const render = buildRenderList(scenario.activities, scenario.bands ?? []);
    const shape = render.map((item) =>
      item.kind === "band" ? `band:${item.band.id}` : `act:${item.activity.id}`,
    );
    // New activity order c,b,a → band1 renders immediately before b; band2 trails.
    expect(shape).toEqual(["act:c", "band:band1", "act:b", "act:a", "band:band2"]);
  });
});
