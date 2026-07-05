// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { applyAiOpsToProject, type AiOp } from "./ai-batch-service";
import {
  createProject,
  createScenario,
  createActivity,
  addActivityToScenario,
} from "./project-service";
import type { Project, Scenario, Activity } from "@domain/models/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function build(opts: { dependencyMode?: boolean; locked?: boolean; activityCount?: number } = {}) {
  let scenario = createScenario("S1", "2025-01-06");
  const n = opts.activityCount ?? 3;
  const activityIds: string[] = [];
  for (let i = 0; i < n; i++) {
    const a = createActivity(`Task ${i + 1}`, scenario.settings);
    scenario = addActivityToScenario(scenario, a);
    activityIds.push(a.id);
  }
  scenario = {
    ...scenario,
    settings: { ...scenario.settings, dependencyMode: opts.dependencyMode ?? false },
    locked: opts.locked ?? false,
  };
  const base = createProject("P", "2025-01-06");
  const project: Project = { ...base, scenarios: [scenario] };
  return { project, scenarioId: scenario.id, activityIds };
}

function one(project: Project, op: AiOp, openScenarioId: string | null) {
  return applyAiOpsToProject(project, [op], openScenarioId);
}

function outcome(project: Project, op: AiOp, openScenarioId: string) {
  return one(project, op, openScenarioId).results[0]!.outcome;
}

function scenarioOf(project: Project, scenarioId: string): Scenario {
  return project.scenarios.find((s) => s.id === scenarioId)!;
}

function activityOf(project: Project, scenarioId: string, activityId: string): Activity {
  return scenarioOf(project, scenarioId).activities.find((a) => a.id === activityId)!;
}

function withPatch(project: Project, scenarioId: string, patch: Partial<Scenario>): Project {
  return {
    ...project,
    scenarios: project.scenarios.map((s) => (s.id === scenarioId ? { ...s, ...patch } : s)),
  };
}

// ---------------------------------------------------------------------------
// create_activity
// ---------------------------------------------------------------------------

describe("create_activity", () => {
  it("adds a new activity (applied)", () => {
    const { project, scenarioId } = build({ activityCount: 0 });
    const res = one(
      project,
      { seq: 1, op: "create_activity", payload: { id: "new1", name: "New", min: 1, mostLikely: 2, max: 3 } },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    const created = activityOf(res.project, scenarioId, "new1");
    expect(created.status).toBe("planned");
    expect(created.checklist).toEqual([]);
    expect(created.deliverables).toEqual([]);
  });

  it("duplicate id → duplicate", () => {
    const { project, scenarioId, activityIds } = build();
    expect(
      outcome(
        project,
        { seq: 1, op: "create_activity", payload: { id: activityIds[0]!, name: "Dup", min: 1, mostLikely: 2, max: 3 } },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "duplicate" });
  });

  it("min > mostLikely → invalid (schema refine)", () => {
    const { project, scenarioId } = build({ activityCount: 0 });
    expect(
      outcome(
        project,
        { seq: 1, op: "create_activity", payload: { id: "x", name: "X", min: 10, mostLikely: 5, max: 20 } },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "invalid" });
  });

  it("logNormal with non-positive PERT mean → invalid", () => {
    const { project, scenarioId } = build({ activityCount: 0 });
    expect(
      outcome(
        project,
        {
          seq: 1,
          op: "create_activity",
          payload: { id: "x", name: "X", min: 0, mostLikely: 0, max: 0, distributionType: "logNormal" },
        },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "invalid" });
  });

  it("cap_exceeded at 500 activities", () => {
    const { project, scenarioId } = build({ activityCount: 1 });
    const base = scenarioOf(project, scenarioId).activities[0]!;
    const many = Array.from({ length: 500 }, (_, i) => ({ ...base, id: `cap-${i}` }));
    const capped = withPatch(project, scenarioId, { activities: many });
    expect(
      outcome(
        capped,
        { seq: 1, op: "create_activity", payload: { id: "over", name: "O", min: 1, mostLikely: 2, max: 3 } },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "cap_exceeded" });
  });
});

// ---------------------------------------------------------------------------
// update_activity_estimate & rename_activity
// ---------------------------------------------------------------------------

describe("update_activity_estimate", () => {
  it("changes an estimate and invalidates results (applied)", () => {
    const { project, scenarioId, activityIds } = build();
    const a0 = activityOf(project, scenarioId, activityIds[0]!);
    const res = one(
      project,
      { seq: 1, op: "update_activity_estimate", payload: { id: a0.id, max: a0.max + 5 } },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(activityOf(res.project, scenarioId, a0.id).max).toBe(a0.max + 5);
    expect(scenarioOf(res.project, scenarioId).simulationResults).toBeUndefined();
  });

  it("not_found for a missing activity", () => {
    const { project, scenarioId } = build();
    expect(
      outcome(project, { seq: 1, op: "update_activity_estimate", payload: { id: "nope", max: 9 } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "not_found" });
  });

  it("value_unchanged when the provided fields already match", () => {
    const { project, scenarioId, activityIds } = build();
    const a0 = activityOf(project, scenarioId, activityIds[0]!);
    expect(
      outcome(
        project,
        { seq: 1, op: "update_activity_estimate", payload: { id: a0.id, min: a0.min, mostLikely: a0.mostLikely, max: a0.max } },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "value_unchanged" });
  });

  it("invalid when the merged candidate violates min<=ml<=max", () => {
    const { project, scenarioId, activityIds } = build();
    const a0 = activityOf(project, scenarioId, activityIds[0]!);
    expect(
      outcome(
        project,
        { seq: 1, op: "update_activity_estimate", payload: { id: a0.id, min: a0.max + 100 } },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "invalid" });
  });
});

describe("rename_activity", () => {
  it("renames (applied)", () => {
    const { project, scenarioId, activityIds } = build();
    const res = one(
      project,
      { seq: 1, op: "rename_activity", payload: { id: activityIds[0]!, name: "Renamed" } },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(activityOf(res.project, scenarioId, activityIds[0]!).name).toBe("Renamed");
  });

  it("rejects an empty (invalid) name rather than persisting it", () => {
    const { project, scenarioId, activityIds } = build();
    expect(
      outcome(project, { seq: 1, op: "rename_activity", payload: { id: activityIds[0]!, name: "" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "invalid" });
  });

  it("value_unchanged when the name is identical", () => {
    const { project, scenarioId, activityIds } = build();
    const a0 = activityOf(project, scenarioId, activityIds[0]!);
    expect(
      outcome(project, { seq: 1, op: "rename_activity", payload: { id: a0.id, name: a0.name } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "value_unchanged" });
  });
});

// ---------------------------------------------------------------------------
// Qualitative ops (against human-created activities: notes/checklist/deliverables undefined)
// ---------------------------------------------------------------------------

describe("append_activity_note", () => {
  it("appends to an undefined-notes activity (applied, exact text)", () => {
    const { project, scenarioId, activityIds } = build();
    const res = one(
      project,
      { seq: 1, op: "append_activity_note", payload: { id: activityIds[0]!, text: "Hello" } },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(activityOf(res.project, scenarioId, activityIds[0]!).notes).toBe("Hello");
  });

  it("would_exceed_length when the result overflows 2000 chars", () => {
    const { project, scenarioId, activityIds } = build();
    expect(
      outcome(
        project,
        { seq: 1, op: "append_activity_note", payload: { id: activityIds[0]!, text: "x".repeat(2001) } },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "would_exceed_length" });
  });

  it("does not invalidate simulation results (non-invalidating)", () => {
    const { project, scenarioId, activityIds } = build();
    const fake = { id: "sim" } as unknown as NonNullable<Scenario["simulationResults"]>;
    const withResults = withPatch(project, scenarioId, { simulationResults: fake });
    const res = one(
      withResults,
      { seq: 1, op: "append_activity_note", payload: { id: activityIds[0]!, text: "note" } },
      scenarioId
    );
    expect(scenarioOf(res.project, scenarioId).simulationResults).toBe(fake);
  });
});

describe("add_checklist_items / add_deliverable_items", () => {
  it("adds items (applied)", () => {
    const { project, scenarioId, activityIds } = build();
    const res = one(
      project,
      {
        seq: 1,
        op: "add_checklist_items",
        payload: { id: activityIds[0]!, items: [{ id: "c1", text: "Do X" }, { id: "c2", text: "Do Y" }] },
      },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(activityOf(res.project, scenarioId, activityIds[0]!).checklist).toHaveLength(2);
  });

  it("partial application with an AI-supplied duplicate id", () => {
    const { project, scenarioId, activityIds } = build();
    const seeded = withPatch(project, scenarioId, {
      activities: scenarioOf(project, scenarioId).activities.map((a) =>
        a.id === activityIds[0]! ? { ...a, checklist: [{ id: "c1", text: "existing", completed: false }] } : a
      ),
    });
    const res = one(
      seeded,
      {
        seq: 1,
        op: "add_checklist_items",
        payload: { id: activityIds[0]!, items: [{ id: "c1", text: "dup" }, { id: "c2", text: "fresh" }] },
      },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 1,
      skippedItems: [{ index: 0, reason: "duplicate" }],
    });
    expect(activityOf(res.project, scenarioId, activityIds[0]!).checklist).toHaveLength(2);
  });

  it("rejects an invalid (empty-text) item", () => {
    const { project, scenarioId, activityIds } = build();
    const res = one(
      project,
      { seq: 1, op: "add_deliverable_items", payload: { id: activityIds[0]!, items: [{ id: "d1", text: "" }] } },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 0,
      skippedItems: [{ index: 0, reason: "invalid" }],
    });
  });

  it("per-item cap_exceeded at 50", () => {
    const { project, scenarioId, activityIds } = build();
    const full = Array.from({ length: 50 }, (_, i) => ({ id: `d${i}`, text: `t${i}`, completed: false }));
    const seeded = withPatch(project, scenarioId, {
      activities: scenarioOf(project, scenarioId).activities.map((a) =>
        a.id === activityIds[0]! ? { ...a, deliverables: full } : a
      ),
    });
    const res = one(
      seeded,
      { seq: 1, op: "add_deliverable_items", payload: { id: activityIds[0]!, items: [{ id: "over", text: "over" }] } },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 0,
      skippedItems: [{ index: 0, reason: "cap_exceeded" }],
    });
  });
});

describe("toggle_checklist_item / toggle_deliverable_item", () => {
  function seededChecklist() {
    const { project, scenarioId, activityIds } = build();
    const seeded = withPatch(project, scenarioId, {
      activities: scenarioOf(project, scenarioId).activities.map((a) =>
        a.id === activityIds[0]! ? { ...a, checklist: [{ id: "c1", text: "X", completed: false }] } : a
      ),
    });
    return { project: seeded, scenarioId, activityId: activityIds[0]! };
  }

  it("toggles an item (applied)", () => {
    const { project, scenarioId, activityId } = seededChecklist();
    const res = one(
      project,
      { seq: 1, op: "toggle_checklist_item", payload: { id: activityId, itemId: "c1", completed: true } },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(activityOf(res.project, scenarioId, activityId).checklist![0]!.completed).toBe(true);
  });

  it("not_found for a missing item id", () => {
    const { project, scenarioId, activityId } = seededChecklist();
    expect(
      outcome(project, { seq: 1, op: "toggle_checklist_item", payload: { id: activityId, itemId: "missing", completed: true } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "not_found" });
  });

  it("value_unchanged when already in the target state", () => {
    const { project, scenarioId, activityId } = seededChecklist();
    expect(
      outcome(project, { seq: 1, op: "toggle_checklist_item", payload: { id: activityId, itemId: "c1", completed: false } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "value_unchanged" });
  });

  it("not_found for a missing activity (undefined array does not throw)", () => {
    const { project, scenarioId } = build();
    expect(
      outcome(project, { seq: 1, op: "toggle_deliverable_item", payload: { id: "nope", itemId: "x", completed: true } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "not_found" });
  });
});

// ---------------------------------------------------------------------------
// Milestone ops
// ---------------------------------------------------------------------------

describe("create_milestone / update_milestone", () => {
  it("creates a milestone with the AI-supplied id (applied)", () => {
    const { project, scenarioId } = build();
    const res = one(
      project,
      { seq: 1, op: "create_milestone", payload: { id: "ms1", name: "Gate", targetDate: "2025-02-01" } },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(scenarioOf(res.project, scenarioId).milestones[0]!.id).toBe("ms1");
  });

  it("create_milestone duplicate id → duplicate", () => {
    const { project, scenarioId } = build();
    const seeded = withPatch(project, scenarioId, { milestones: [{ id: "ms1", name: "M", targetDate: "2025-02-01" }] });
    expect(
      outcome(seeded, { seq: 1, op: "create_milestone", payload: { id: "ms1", name: "Dup", targetDate: "2025-03-01" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "duplicate" });
  });

  it("create_milestone with a malformed date → invalid", () => {
    const { project, scenarioId } = build();
    expect(
      outcome(project, { seq: 1, op: "create_milestone", payload: { id: "ms1", name: "M", targetDate: "not-a-date" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "invalid" });
  });

  it("update_milestone rejects a malformed merged date rather than persisting it", () => {
    const { project, scenarioId } = build();
    const seeded = withPatch(project, scenarioId, { milestones: [{ id: "ms1", name: "M", targetDate: "2025-02-01" }] });
    expect(
      outcome(seeded, { seq: 1, op: "update_milestone", payload: { id: "ms1", targetDate: "2025-13-40" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "invalid" });
  });

  it("update_milestone value_unchanged when the provided field matches", () => {
    const { project, scenarioId } = build();
    const seeded = withPatch(project, scenarioId, { milestones: [{ id: "ms1", name: "M", targetDate: "2025-02-01" }] });
    expect(
      outcome(seeded, { seq: 1, op: "update_milestone", payload: { id: "ms1", name: "M" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "value_unchanged" });
  });

  it("update_milestone not_found", () => {
    const { project, scenarioId } = build();
    expect(
      outcome(project, { seq: 1, op: "update_milestone", payload: { id: "nope", name: "X" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "not_found" });
  });
});

describe("assign_milestone / unassign_milestone", () => {
  function withMilestone() {
    const { project, scenarioId, activityIds } = build();
    const seeded = withPatch(project, scenarioId, { milestones: [{ id: "ms1", name: "M", targetDate: "2025-02-01" }] });
    return { project: seeded, scenarioId, activityId: activityIds[0]! };
  }

  it("assigns (applied) then reports value_unchanged on repeat", () => {
    const { project, scenarioId, activityId } = withMilestone();
    const res = one(project, { seq: 1, op: "assign_milestone", payload: { activityId, milestoneId: "ms1" } }, scenarioId);
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(activityOf(res.project, scenarioId, activityId).milestoneId).toBe("ms1");
    expect(
      outcome(res.project, { seq: 2, op: "assign_milestone", payload: { activityId, milestoneId: "ms1" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "value_unchanged" });
  });

  it("assign to a missing milestone → not_found", () => {
    const { project, scenarioId, activityId } = withMilestone();
    expect(
      outcome(project, { seq: 1, op: "assign_milestone", payload: { activityId, milestoneId: "ghost" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "not_found" });
  });

  it("assign for a missing activity → not_found", () => {
    const { project, scenarioId } = withMilestone();
    expect(
      outcome(project, { seq: 1, op: "assign_milestone", payload: { activityId: "nope", milestoneId: "ms1" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "not_found" });
  });

  it("unassign (applied) then value_unchanged when already unassigned", () => {
    const { project, scenarioId, activityId } = withMilestone();
    const assigned = one(project, { seq: 1, op: "assign_milestone", payload: { activityId, milestoneId: "ms1" } }, scenarioId).project;
    const res = one(assigned, { seq: 2, op: "unassign_milestone", payload: { activityId } }, scenarioId);
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(activityOf(res.project, scenarioId, activityId).milestoneId).toBeUndefined();
    expect(
      outcome(res.project, { seq: 3, op: "unassign_milestone", payload: { activityId } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "value_unchanged" });
  });
});

// ---------------------------------------------------------------------------
// Dependency ops — dependencyMode re-check fires FIRST
// ---------------------------------------------------------------------------

describe("dependency ops — dependencyMode gate is checked first", () => {
  it("create_dependency → dependency_mode_off even when the activities are missing", () => {
    const { project, scenarioId } = build({ dependencyMode: false });
    expect(
      outcome(
        project,
        { seq: 1, op: "create_dependency", payload: { scenarioId, fromActivityId: "ghost1", toActivityId: "ghost2" } },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "dependency_mode_off" });
  });

  it("remove_dependency → dependency_mode_off when the mode is off", () => {
    const { project, scenarioId } = build({ dependencyMode: false });
    expect(
      outcome(
        project,
        { seq: 1, op: "remove_dependency", payload: { scenarioId, fromActivityId: "a", toActivityId: "b" } },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "dependency_mode_off" });
  });

  it("update_dependency → dependency_mode_off when the mode is off", () => {
    const { project, scenarioId } = build({ dependencyMode: false });
    expect(
      outcome(
        project,
        { seq: 1, op: "update_dependency", payload: { scenarioId, fromActivityId: "a", toActivityId: "b", lagDays: 1 } },
        scenarioId
      )
    ).toEqual({ status: "skipped", reason: "dependency_mode_off" });
  });
});

describe("create_dependency (dependencyMode on)", () => {
  it("creates an edge (applied)", () => {
    const { project, scenarioId, activityIds } = build({ dependencyMode: true });
    const res = one(
      project,
      { seq: 1, op: "create_dependency", payload: { scenarioId, fromActivityId: activityIds[0]!, toActivityId: activityIds[1]! } },
      scenarioId
    );
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(scenarioOf(res.project, scenarioId).dependencies).toHaveLength(1);
  });

  it("missing activity → not_found", () => {
    const { project, scenarioId, activityIds } = build({ dependencyMode: true });
    expect(
      outcome(project, { seq: 1, op: "create_dependency", payload: { scenarioId, fromActivityId: activityIds[0]!, toActivityId: "ghost" } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "not_found" });
  });

  it("self-loop → invalid", () => {
    const { project, scenarioId, activityIds } = build({ dependencyMode: true });
    expect(
      outcome(project, { seq: 1, op: "create_dependency", payload: { scenarioId, fromActivityId: activityIds[0]!, toActivityId: activityIds[0]! } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "invalid" });
  });

  it("duplicate pair → duplicate", () => {
    const { project, scenarioId, activityIds } = build({ dependencyMode: true });
    const first = one(project, { seq: 1, op: "create_dependency", payload: { scenarioId, fromActivityId: activityIds[0]!, toActivityId: activityIds[1]! } }, scenarioId).project;
    expect(
      outcome(first, { seq: 2, op: "create_dependency", payload: { scenarioId, fromActivityId: activityIds[0]!, toActivityId: activityIds[1]! } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "duplicate" });
  });

  it("cycle → cycle (batch applies in seq order)", () => {
    const { project, scenarioId, activityIds } = build({ dependencyMode: true });
    const [a1, a2, a3] = activityIds;
    const { results } = applyAiOpsToProject(
      project,
      [
        { seq: 1, op: "create_dependency", payload: { scenarioId, fromActivityId: a1!, toActivityId: a2! } },
        { seq: 2, op: "create_dependency", payload: { scenarioId, fromActivityId: a2!, toActivityId: a3! } },
        { seq: 3, op: "create_dependency", payload: { scenarioId, fromActivityId: a3!, toActivityId: a1! } },
      ],
      scenarioId
    );
    expect(results[2]!.outcome).toEqual({ status: "skipped", reason: "cycle" });
  });
});

describe("remove_dependency / update_dependency (dependencyMode on)", () => {
  function withEdge() {
    const { project, scenarioId, activityIds } = build({ dependencyMode: true });
    const seeded = one(
      project,
      { seq: 1, op: "create_dependency", payload: { scenarioId, fromActivityId: activityIds[0]!, toActivityId: activityIds[1]!, lagDays: 0 } },
      scenarioId
    ).project;
    return { project: seeded, scenarioId, from: activityIds[0]!, to: activityIds[1]! };
  }

  it("remove_dependency removes an existing edge (applied)", () => {
    const { project, scenarioId, from, to } = withEdge();
    const res = one(project, { seq: 2, op: "remove_dependency", payload: { scenarioId, fromActivityId: from, toActivityId: to } }, scenarioId);
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(scenarioOf(res.project, scenarioId).dependencies).toHaveLength(0);
  });

  it("remove_dependency not_found when the pair is absent", () => {
    const { project, scenarioId, activityIds } = build({ dependencyMode: true });
    expect(
      outcome(project, { seq: 1, op: "remove_dependency", payload: { scenarioId, fromActivityId: activityIds[0]!, toActivityId: activityIds[1]! } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "not_found" });
  });

  it("update_dependency not_found is independent of the sub-transforms' ref-equality", () => {
    const { project, scenarioId, activityIds } = build({ dependencyMode: true });
    // No edge exists — an unchanged-lag update must report not_found, not value_unchanged.
    expect(
      outcome(project, { seq: 1, op: "update_dependency", payload: { scenarioId, fromActivityId: activityIds[0]!, toActivityId: activityIds[1]!, lagDays: 0 } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "not_found" });
  });

  it("update_dependency invalid when neither lag nor type is provided", () => {
    const { project, scenarioId, from, to } = withEdge();
    expect(
      outcome(project, { seq: 2, op: "update_dependency", payload: { scenarioId, fromActivityId: from, toActivityId: to } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "invalid" });
  });

  it("update_dependency applies a lag change and reports value_unchanged on replay", () => {
    const { project, scenarioId, from, to } = withEdge();
    const res = one(project, { seq: 2, op: "update_dependency", payload: { scenarioId, fromActivityId: from, toActivityId: to, lagDays: 5 } }, scenarioId);
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    expect(
      outcome(res.project, { seq: 3, op: "update_dependency", payload: { scenarioId, fromActivityId: from, toActivityId: to, lagDays: 5 } }, scenarioId)
    ).toEqual({ status: "skipped", reason: "value_unchanged" });
  });
});

// ---------------------------------------------------------------------------
// Project-level orchestration
// ---------------------------------------------------------------------------

describe("applyAiOpsToProject — routing, locking, ordering", () => {
  it("records (does not drop) ops for a locked scenario", () => {
    const { project, scenarioId, activityIds } = build({ locked: true });
    const res = one(project, { seq: 1, op: "rename_activity", payload: { id: activityIds[0]!, name: "X" } }, scenarioId);
    expect(res.results[0]!.outcome).toEqual({ status: "skipped", reason: "locked" });
    expect(res.project).toBe(project); // unchanged
  });

  it("no_open_scenario when an op omits scenarioId and there is no open scenario", () => {
    const { project, activityIds } = build();
    const res = one(project, { seq: 1, op: "rename_activity", payload: { id: activityIds[0]!, name: "X" } }, null);
    expect(res.results[0]!.outcome).toEqual({ status: "skipped", reason: "no_open_scenario" });
  });

  it("not_found when the resolved scenario id does not exist", () => {
    const { project, activityIds } = build();
    const res = one(
      project,
      { seq: 1, op: "rename_activity", payload: { scenarioId: "ghost", id: activityIds[0]!, name: "X" } },
      "ghost"
    );
    expect(res.results[0]!.outcome).toEqual({ status: "skipped", reason: "not_found" });
  });

  it("returns the same project reference when nothing changed", () => {
    const { project, scenarioId, activityIds } = build();
    const a0 = activityOf(project, scenarioId, activityIds[0]!);
    const res = one(project, { seq: 1, op: "rename_activity", payload: { id: a0.id, name: a0.name } }, scenarioId);
    expect(res.project).toBe(project);
  });

  it("sorts results by op.seq", () => {
    const { project, scenarioId, activityIds } = build();
    const { results } = applyAiOpsToProject(
      project,
      [
        { seq: 2, op: "rename_activity", payload: { id: activityIds[1]!, name: "Second" } },
        { seq: 1, op: "rename_activity", payload: { id: activityIds[0]!, name: "First" } },
      ],
      scenarioId
    );
    expect(results.map((r) => r.op.seq)).toEqual([1, 2]);
  });

  it("unknown op string → unknown_op (defensive floor)", () => {
    const { project, scenarioId } = build();
    const bogus = { seq: 1, op: "bogus_op", payload: {} } as unknown as AiOp;
    expect(one(project, bogus, scenarioId).results[0]!.outcome).toEqual({
      status: "skipped",
      reason: "unknown_op",
    });
  });
});
