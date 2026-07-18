// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { applyAiOpsToProject, type AiOp, type AiOpOutcome } from "./ai-batch-service";
import { createProject, createScenario, createActivity, addActivityToScenario } from "./project-service";
import type { Project, Scenario } from "@domain/models/types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function baseProject(
  opts: { dependencyMode?: boolean; activityIds?: string[] } = {}
): { project: Project; scenarioId: string } {
  let scenario = createScenario("S1", "2025-01-06");
  for (const id of opts.activityIds ?? []) {
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

function scenarioOf(project: Project, scenarioId: string): Scenario {
  return project.scenarios.find((s) => s.id === scenarioId)!;
}

function one(project: Project, op: AiOp, openScenarioId: string) {
  return applyAiOpsToProject(project, [op], openScenarioId);
}

function outcomeOf(project: Project, op: AiOp, openScenarioId: string) {
  return one(project, op, openScenarioId).results[0]!.outcome;
}

function withScenarioPatch(project: Project, scenarioId: string, patch: Partial<Scenario>): Project {
  return {
    ...project,
    scenarios: project.scenarios.map((s) => (s.id === scenarioId ? { ...s, ...patch } : s)),
  };
}

// ---------------------------------------------------------------------------
// Criterion 1 — Equivalence: bulk build == singular build, keyed by entity ids
// ---------------------------------------------------------------------------

interface BuildSpec {
  activities: Array<{
    id: string;
    name: string;
    min: number;
    mostLikely: number;
    max: number;
    description: string;
    note: string;
  }>;
  dependencies: Array<{ fromActivityId: string; toActivityId: string }>;
  milestones: Array<{ id: string; name: string; targetDate: string }>;
  assignments: Array<{ activityId: string; milestoneId: string }>;
}

// The motivating build: 27 activities (with descriptions + notes), 34
// dependencies (all forward → acyclic), 5 milestones, 10 assignments. Notes are
// edge-whitespace-free (F3-9): the bulk path trims notes, the singular append
// path does not, so any edge whitespace would fail equivalence by design.
function motivatingSpec(): BuildSpec {
  const activities = Array.from({ length: 27 }, (_, i) => ({
    id: `a${i}`,
    name: `Activity ${i}`,
    min: 1 + (i % 3),
    mostLikely: 3 + (i % 4),
    max: 6 + (i % 5),
    description: `Scope for activity ${i}`,
    note: `Note ${i}`,
  }));
  const dependencies: Array<{ fromActivityId: string; toActivityId: string }> = [];
  for (let i = 0; i < 26; i++) dependencies.push({ fromActivityId: `a${i}`, toActivityId: `a${i + 1}` });
  for (let i = 0; i < 8; i++) dependencies.push({ fromActivityId: `a${i}`, toActivityId: `a${i + 2}` });
  const milestones = Array.from({ length: 5 }, (_, k) => ({
    id: `m${k}`,
    name: `Milestone ${k}`,
    targetDate: `2025-0${k + 1}-15`,
  }));
  const assignments = Array.from({ length: 10 }, (_, i) => ({ activityId: `a${i}`, milestoneId: `m${i % 5}` }));
  return { activities, dependencies, milestones, assignments };
}

function singularOps(spec: BuildSpec): AiOp[] {
  const ops: AiOp[] = [];
  let seq = 1;
  for (const a of spec.activities) {
    ops.push({
      seq: seq++,
      op: "create_activity",
      payload: { id: a.id, name: a.name, min: a.min, mostLikely: a.mostLikely, max: a.max, description: a.description },
    });
  }
  for (const a of spec.activities) {
    ops.push({ seq: seq++, op: "append_activity_note", payload: { id: a.id, text: a.note } });
  }
  for (const d of spec.dependencies) {
    ops.push({ seq: seq++, op: "create_dependency", payload: { fromActivityId: d.fromActivityId, toActivityId: d.toActivityId } });
  }
  for (const m of spec.milestones) {
    ops.push({ seq: seq++, op: "create_milestone", payload: { id: m.id, name: m.name, targetDate: m.targetDate } });
  }
  for (const as of spec.assignments) {
    ops.push({ seq: seq++, op: "assign_milestone", payload: { activityId: as.activityId, milestoneId: as.milestoneId } });
  }
  return ops;
}

function bulkOps(spec: BuildSpec): AiOp[] {
  return [
    { seq: 1, op: "bulk_create_activities", payload: { activities: spec.activities } },
    { seq: 2, op: "bulk_create_dependencies", payload: { dependencies: spec.dependencies } },
    { seq: 3, op: "bulk_create_milestones", payload: { milestones: spec.milestones } },
    { seq: 4, op: "bulk_assign_milestones", payload: { assignments: spec.assignments } },
  ];
}

describe("Phase 1 criterion 1 — equivalence", () => {
  it("the four bulk ops produce the same scenario content as the singular build", () => {
    const { project, scenarioId } = baseProject({ dependencyMode: true });
    const spec = motivatingSpec();

    const singular = applyAiOpsToProject(project, singularOps(spec), scenarioId);
    const bulk = applyAiOpsToProject(project, bulkOps(spec), scenarioId);

    const sa = scenarioOf(singular.project, scenarioId);
    const sb = scenarioOf(bulk.project, scenarioId);

    // Compared by AI-supplied entity ids; the base scenario is shared, so the
    // content arrays are directly comparable.
    expect(sb.activities).toEqual(sa.activities);
    expect(sb.dependencies).toEqual(sa.dependencies);
    expect(sb.milestones).toEqual(sa.milestones);

    expect(sa.activities).toHaveLength(27);
    expect(sa.dependencies).toHaveLength(34);
    expect(sa.milestones).toHaveLength(5);
    expect(sa.activities.filter((a) => a.milestoneId).length).toBe(10);

    // Every op applied cleanly on both paths.
    expect(singular.results.every((r) => r.outcome.status === "applied")).toBe(true);
    expect(bulk.results.every((r) => r.outcome.status === "applied")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Criterion 2 — Mixed validity: valid subset applies, one partial outcome
// ---------------------------------------------------------------------------

describe("Phase 1 criterion 2 — mixed validity", () => {
  it("bulk_create_activities applies the valid subset with a correct partial", () => {
    const { project, scenarioId } = baseProject();
    const op: AiOp = {
      seq: 1,
      op: "bulk_create_activities",
      payload: {
        activities: [
          { id: "ok1", name: "Ok1", min: 1, mostLikely: 2, max: 3 },
          { id: "bad_order", name: "Bad", min: 10, mostLikely: 5, max: 20 }, // min > ml
          { id: "bad_ln", name: "LN", min: 0, mostLikely: 0, max: 0, distributionType: "logNormal" }, // PERT ≤ 0
          { id: "ok1", name: "Dup", min: 1, mostLikely: 2, max: 3 }, // duplicate of item 0
          { id: "ok2", name: "Ok2", min: 2, mostLikely: 3, max: 4 },
        ],
      },
    };
    const res = one(project, op, scenarioId);
    expect(res.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 2,
      skippedItems: [
        { index: 1, id: "bad_order", reason: "invalid" },
        { index: 2, id: "bad_ln", reason: "invalid" },
        { index: 3, id: "ok1", reason: "duplicate" },
      ],
    });
    expect(scenarioOf(res.project, scenarioId).activities.map((a) => a.id)).toEqual(["ok1", "ok2"]);
  });

  it("bulk_create_dependencies reports unknown endpoint (not_found) and cycle", () => {
    const { project, scenarioId } = baseProject({ dependencyMode: true, activityIds: ["a0", "a1", "a2"] });
    const op: AiOp = {
      seq: 1,
      op: "bulk_create_dependencies",
      payload: {
        dependencies: [
          { fromActivityId: "a0", toActivityId: "a1" },
          { fromActivityId: "a1", toActivityId: "a2" },
          { fromActivityId: "a0", toActivityId: "zzz" }, // unknown endpoint
          { fromActivityId: "a2", toActivityId: "a0" }, // closes a0→a1→a2→a0
        ],
      },
    };
    const res = one(project, op, scenarioId);
    expect(res.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 2,
      skippedItems: [
        { index: 2, id: "a0->zzz", reason: "not_found" },
        { index: 3, id: "a2->a0", reason: "cycle" },
      ],
    });
    expect(scenarioOf(res.project, scenarioId).dependencies).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// Criterion 3 — Idempotency
// ---------------------------------------------------------------------------

describe("Phase 1 criterion 3 — idempotency", () => {
  it("re-running a clean bulk_create is a 100% duplicate skip with zero state change", () => {
    const { project, scenarioId } = baseProject();
    const op: AiOp = {
      seq: 1,
      op: "bulk_create_activities",
      payload: {
        activities: [
          { id: "x", name: "X", min: 1, mostLikely: 2, max: 3 },
          { id: "y", name: "Y", min: 1, mostLikely: 2, max: 3 },
        ],
      },
    };
    const first = one(project, op, scenarioId);
    expect(first.results[0]!.outcome).toEqual({ status: "applied" });

    const second = applyAiOpsToProject(first.project, [op], scenarioId);
    expect(second.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 0,
      skippedItems: [
        { index: 0, id: "x", reason: "duplicate" },
        { index: 1, id: "y", reason: "duplicate" },
      ],
    });
    // Zero state change → same project reference.
    expect(second.project).toBe(first.project);
  });

  it("re-running bulk_assign_milestones is a 100% value_unchanged skip", () => {
    const { project, scenarioId } = baseProject({ activityIds: ["a0", "a1"] });
    const withMilestone = applyAiOpsToProject(
      project,
      [{ seq: 1, op: "create_milestone", payload: { id: "m0", name: "M0", targetDate: "2025-03-01" } }],
      scenarioId
    ).project;
    const assign: AiOp = {
      seq: 2,
      op: "bulk_assign_milestones",
      payload: { assignments: [{ activityId: "a0", milestoneId: "m0" }, { activityId: "a1", milestoneId: "m0" }] },
    };
    const first = applyAiOpsToProject(withMilestone, [assign], scenarioId);
    expect(first.results[0]!.outcome).toEqual({ status: "applied" });

    const second = applyAiOpsToProject(first.project, [assign], scenarioId);
    expect(second.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 0,
      skippedItems: [
        { index: 0, id: "a0", reason: "value_unchanged" },
        { index: 1, id: "a1", reason: "value_unchanged" },
      ],
    });
    expect(second.project).toBe(first.project);
  });
});

// ---------------------------------------------------------------------------
// Zero-skip collapses to `applied` (F3-3) + whole-op structural invalid
// ---------------------------------------------------------------------------

describe("bulk outcome shape", () => {
  it("a fully-clean bulk op is `applied`, not a partial with an empty skip list", () => {
    const { project, scenarioId } = baseProject();
    const op: AiOp = {
      seq: 1,
      op: "bulk_create_milestones",
      payload: { milestones: [{ id: "m0", name: "M0", targetDate: "2025-03-01" }] },
    };
    expect(outcomeOf(project, op, scenarioId)).toEqual({ status: "applied" });
  });

  it("a structurally-corrupt payload is a whole-op invalid (decision 9)", () => {
    const { project, scenarioId } = baseProject();
    const corrupt = { seq: 1, op: "bulk_create_activities", payload: { activities: "nope" } } as unknown as AiOp;
    expect(outcomeOf(project, corrupt, scenarioId)).toEqual({ status: "skipped", reason: "invalid" });
  });

  it("an empty item array fails the .min(1) structural cap → whole-op invalid", () => {
    const { project, scenarioId } = baseProject();
    const empty: AiOp = { seq: 1, op: "bulk_create_milestones", payload: { milestones: [] } };
    expect(outcomeOf(project, empty, scenarioId)).toEqual({ status: "skipped", reason: "invalid" });
  });
});

// ---------------------------------------------------------------------------
// Drain-time dependency-mode guard (decision 12 / P0.0)
// ---------------------------------------------------------------------------

describe("bulk_create_dependencies mode guard", () => {
  it("whole-op dependency_mode_off when the scenario has dependency mode off", () => {
    const { project, scenarioId } = baseProject({ dependencyMode: false, activityIds: ["a0", "a1"] });
    const op: AiOp = {
      seq: 1,
      op: "bulk_create_dependencies",
      payload: { dependencies: [{ fromActivityId: "a0", toActivityId: "a1" }] },
    };
    const res = one(project, op, scenarioId);
    expect(res.results[0]!.outcome).toEqual({ status: "skipped", reason: "dependency_mode_off" });
    expect(res.project).toBe(project); // nothing queued to state
  });
});

// ---------------------------------------------------------------------------
// Note seeding (1A): trim, drop whitespace-only, suppress on create skip
// ---------------------------------------------------------------------------

describe("bulk_create_activities note seeding", () => {
  it("trims a note, drops a whitespace-only note, leaves noteless activities empty", () => {
    const { project, scenarioId } = baseProject();
    const op: AiOp = {
      seq: 1,
      op: "bulk_create_activities",
      payload: {
        activities: [
          { id: "n1", name: "N1", min: 1, mostLikely: 2, max: 3, note: "  hello  " },
          { id: "n2", name: "N2", min: 1, mostLikely: 2, max: 3, note: "   " },
          { id: "n3", name: "N3", min: 1, mostLikely: 2, max: 3 },
        ],
      },
    };
    const scn = scenarioOf(one(project, op, scenarioId).project, scenarioId);
    expect(scn.activities.find((a) => a.id === "n1")!.notes).toBe("hello");
    expect(scn.activities.find((a) => a.id === "n2")!.notes).toBeUndefined();
    expect(scn.activities.find((a) => a.id === "n3")!.notes).toBeUndefined();
  });

  it("suppresses the note when the create itself is skipped", () => {
    const { project, scenarioId } = baseProject();
    const op: AiOp = {
      seq: 1,
      op: "bulk_create_activities",
      payload: {
        activities: [
          { id: "x", name: "First", min: 1, mostLikely: 2, max: 3 },
          { id: "x", name: "Dup", min: 1, mostLikely: 2, max: 3, note: "should not apply" },
        ],
      },
    };
    const res = one(project, op, scenarioId);
    expect(res.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 1,
      skippedItems: [{ index: 1, id: "x", reason: "duplicate" }],
    });
    // The surviving activity keeps its noteless state; the dup's note was suppressed.
    expect(scenarioOf(res.project, scenarioId).activities.find((a) => a.id === "x")!.notes).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// P0.4 — DEPENDENCY_CAP guard (the only sanctioned singular-path change)
// ---------------------------------------------------------------------------

describe("P0.4 — DEPENDENCY_CAP", () => {
  function scenarioAtDepCap(dependencyMode: boolean) {
    const { project, scenarioId } = baseProject({ dependencyMode, activityIds: ["a0", "a1"] });
    // 2000 placeholder edges. The cap is checked before endpoint validation, so
    // the edges need not reference real activities.
    const deps = Array.from({ length: 2000 }, (_, i) => ({
      fromActivityId: `p${i}`,
      toActivityId: `q${i}`,
      type: "FS" as const,
      lagDays: 0,
    }));
    return { project: withScenarioPatch(project, scenarioId, { dependencies: deps }), scenarioId };
  }

  it("singular create_dependency past 2000 edges → cap_exceeded", () => {
    const { project, scenarioId } = scenarioAtDepCap(true);
    const op: AiOp = {
      seq: 1,
      op: "create_dependency",
      payload: { scenarioId, fromActivityId: "a0", toActivityId: "a1" },
    };
    expect(outcomeOf(project, op, scenarioId)).toEqual({ status: "skipped", reason: "cap_exceeded" });
  });

  it("bulk_create_dependencies past the cap skips each over-limit item as cap_exceeded", () => {
    const { project, scenarioId } = scenarioAtDepCap(true);
    const op: AiOp = {
      seq: 1,
      op: "bulk_create_dependencies",
      payload: { dependencies: [{ fromActivityId: "a0", toActivityId: "a1" }] },
    };
    expect(outcomeOf(project, op, scenarioId)).toEqual({
      status: "partial",
      appliedCount: 0,
      skippedItems: [{ index: 0, id: "a0->a1", reason: "cap_exceeded" }],
    });
  });
});

// ===========================================================================
// Phase 2 — bulk_update_activities (2A) + bulk_import_schedule (2B)
// ===========================================================================

function compositeOp(spec: BuildSpec): AiOp {
  return {
    seq: 1,
    op: "bulk_import_schedule",
    payload: {
      activities: spec.activities,
      milestones: spec.milestones,
      assignments: spec.assignments,
      dependencies: spec.dependencies,
    },
  };
}

function seedActivities(
  project: Project,
  scenarioId: string,
  activities: Array<Record<string, unknown>>
): Project {
  const op = { seq: 1, op: "bulk_create_activities", payload: { activities } } as unknown as AiOp;
  return applyAiOpsToProject(project, [op], scenarioId).project;
}

function partialOf(outcome: AiOpOutcome): Extract<AiOpOutcome, { status: "partial" }> {
  expect(outcome.status).toBe("partial");
  return outcome as Extract<AiOpOutcome, { status: "partial" }>;
}

// ---------------------------------------------------------------------------
// Criterion 1 — Composite equivalence: one import op == four Phase-1 bulk ops
// ---------------------------------------------------------------------------

describe("Phase 2 criterion 1 — composite equivalence", () => {
  it("one bulk_import_schedule op equals the four Phase-1 bulk ops (by entity id)", () => {
    const { project, scenarioId } = baseProject({ dependencyMode: true });
    const spec = motivatingSpec();

    const composite = applyAiOpsToProject(project, [compositeOp(spec)], scenarioId);
    const fourBulk = applyAiOpsToProject(project, bulkOps(spec), scenarioId);

    const sc = scenarioOf(composite.project, scenarioId);
    const sb = scenarioOf(fourBulk.project, scenarioId);

    expect(sc.activities).toEqual(sb.activities);
    expect(sc.dependencies).toEqual(sb.dependencies);
    expect(sc.milestones).toEqual(sb.milestones);

    expect(sc.activities).toHaveLength(27);
    expect(sc.dependencies).toHaveLength(34);
    expect(sc.milestones).toHaveLength(5);
    expect(sc.activities.filter((a) => a.milestoneId).length).toBe(10);

    // The whole clean import is one applied op — no sections map on a zero-skip.
    expect(composite.results[0]!.outcome).toEqual({ status: "applied" });
  });
});

// ---------------------------------------------------------------------------
// Criterion 2 — 2A mixed validity + sequential merge + merge-then-validate
// ---------------------------------------------------------------------------

describe("Phase 2 criterion 2 — bulk_update_activities mixed validity", () => {
  it("applies the valid subset; repeated ids merge sequentially; correct partial", () => {
    const { project, scenarioId } = baseProject();
    const seeded = seedActivities(project, scenarioId, [
      { id: "a0", name: "A0", min: 1, mostLikely: 2, max: 3 },
      { id: "a1", name: "A1", min: 1, mostLikely: 2, max: 3, description: "orig" },
    ]);
    const op: AiOp = {
      seq: 2,
      op: "bulk_update_activities",
      payload: {
        updates: [
          { id: "a0", max: 10 }, // {1,2,3} → {1,2,10}, applied
          { id: "a0", mostLikely: 8 }, // merges post-first {1,2,10} → {1,8,10}; INVALID vs original max 3
          { id: "nope", name: "X" }, // unknown id → not_found
          { id: "a1" }, // no updatable field → invalid (disposition 2)
          { id: "a1", description: "orig" }, // identical → value_unchanged
        ],
      },
    };
    const res = one(seeded, op, scenarioId);
    expect(res.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 2,
      skippedItems: [
        { index: 2, id: "nope", reason: "not_found" },
        { index: 3, id: "a1", reason: "invalid" },
        { index: 4, id: "a1", reason: "value_unchanged" },
      ],
    });
    const a0 = scenarioOf(res.project, scenarioId).activities.find((a) => a.id === "a0")!;
    expect([a0.min, a0.mostLikely, a0.max]).toEqual([1, 8, 10]);
  });

  it("validates the MERGED estimate triple, not the provided fragment", () => {
    const { project, scenarioId } = baseProject();
    const seeded = seedActivities(project, scenarioId, [
      { id: "a0", name: "A0", min: 2, mostLikely: 5, max: 9 },
    ]);
    // {max:4} alone is a fine number, but merged {2,5,4} violates ml<=max.
    const op: AiOp = {
      seq: 2,
      op: "bulk_update_activities",
      payload: { updates: [{ id: "a0", max: 4 }] },
    };
    expect(one(seeded, op, scenarioId).results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 0,
      skippedItems: [{ index: 0, id: "a0", reason: "invalid" }],
    });
  });

  it("empty-string / whitespace description clears and stores undefined, not \"\"", () => {
    const { project, scenarioId } = baseProject();
    const seeded = seedActivities(project, scenarioId, [
      { id: "a0", name: "A0", min: 1, mostLikely: 2, max: 3, description: "orig" },
      { id: "a1", name: "A1", min: 1, mostLikely: 2, max: 3, description: "keep" },
    ]);
    const op: AiOp = {
      seq: 2,
      op: "bulk_update_activities",
      payload: {
        updates: [
          { id: "a0", description: "" }, // clear
          { id: "a1", description: "   " }, // whitespace-only clears too
        ],
      },
    };
    const res = one(seeded, op, scenarioId);
    expect(res.results[0]!.outcome).toEqual({ status: "applied" });
    const acts = scenarioOf(res.project, scenarioId).activities;
    const a0 = acts.find((a) => a.id === "a0")!;
    const a1 = acts.find((a) => a.id === "a1")!;
    expect(a0.description).toBeUndefined();
    expect(a1.description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Criterion 4 — Composite drain-time whole-op discards
// ---------------------------------------------------------------------------

describe("Phase 2 criterion 4 — composite drain-time discards", () => {
  it("dependencies present + mode off → whole-op dependency_mode_off, zero mutations", () => {
    const { project, scenarioId } = baseProject({ dependencyMode: false });
    const op: AiOp = {
      seq: 1,
      op: "bulk_import_schedule",
      payload: {
        activities: [{ id: "a0", name: "A0", min: 1, mostLikely: 2, max: 3 }],
        milestones: [{ id: "m0", name: "M0", targetDate: "2025-03-01" }],
        dependencies: [{ fromActivityId: "a0", toActivityId: "a1" }],
      },
    };
    const res = one(project, op, scenarioId);
    // ALL sections discarded — not even the activities/milestones applied.
    expect(res.results[0]!.outcome).toEqual({ status: "skipped", reason: "dependency_mode_off" });
    expect(res.project).toBe(project);
  });

  it("all-empty sections → whole-op invalid (drain-time defensive floor)", () => {
    const { project, scenarioId } = baseProject();
    const op = { seq: 1, op: "bulk_import_schedule", payload: {} } as unknown as AiOp;
    expect(outcomeOf(project, op, scenarioId)).toEqual({ status: "skipped", reason: "invalid" });
    // An explicitly-empty section array is also floored.
    const emptyArrays = {
      seq: 1,
      op: "bulk_import_schedule",
      payload: { activities: [], dependencies: [] },
    } as unknown as AiOp;
    expect(outcomeOf(project, emptyArrays, scenarioId)).toEqual({ status: "skipped", reason: "invalid" });
  });
});

// ---------------------------------------------------------------------------
// Criterion 5 — Composite cascades (absence cascades; duplicate does not)
// ---------------------------------------------------------------------------

describe("Phase 2 criterion 5 — composite cascades", () => {
  it("an invalid activity cascades its assignments and edges to not_found", () => {
    const { project, scenarioId } = baseProject({ dependencyMode: true });
    const op: AiOp = {
      seq: 1,
      op: "bulk_import_schedule",
      payload: {
        activities: [
          { id: "a_bad", name: "Bad", min: 10, mostLikely: 5, max: 20 }, // min>ml → invalid, never enters scn
          { id: "a_ok", name: "Ok", min: 1, mostLikely: 2, max: 3 },
        ],
        milestones: [{ id: "m0", name: "M0", targetDate: "2025-03-01" }],
        assignments: [
          { activityId: "a_bad", milestoneId: "m0" }, // cascades → not_found
          { activityId: "a_ok", milestoneId: "m0" },
        ],
        dependencies: [
          { fromActivityId: "a_bad", toActivityId: "a_ok" }, // cascades → not_found
          { fromActivityId: "a_ok", toActivityId: "a_bad" }, // cascades → not_found
        ],
      },
    };
    const res = one(project, op, scenarioId);
    expect(res.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 3, // a_ok + m0 + a_ok→m0 assignment
      skippedItems: [
        { index: 0, section: "activities", id: "a_bad", reason: "invalid" },
        { index: 0, section: "assignments", id: "a_bad", reason: "not_found" },
        { index: 0, section: "dependencies", id: "a_bad->a_ok", reason: "not_found" },
        { index: 1, section: "dependencies", id: "a_ok->a_bad", reason: "not_found" },
      ],
      sections: {
        activities: { applied: 1, skipped: 1 },
        milestones: { applied: 1, skipped: 0 },
        assignments: { applied: 1, skipped: 1 },
        dependencies: { applied: 0, skipped: 2 },
      },
    });
  });

  it("an invalid milestone (impossible date, server-passing) cascades its assignments", () => {
    const { project, scenarioId } = baseProject();
    const op: AiOp = {
      seq: 1,
      op: "bulk_import_schedule",
      payload: {
        activities: [{ id: "a0", name: "A0", min: 1, mostLikely: 2, max: 3 }],
        // 2026-02-31 passes the server's YYYY-MM-DD regex but fails the client's
        // real-calendar-date refine → invalid → cascades.
        milestones: [{ id: "m_bad", name: "Bad", targetDate: "2026-02-31" }],
        assignments: [{ activityId: "a0", milestoneId: "m_bad" }],
      },
    };
    expect(one(project, op, scenarioId).results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 1,
      skippedItems: [
        { index: 0, section: "milestones", id: "m_bad", reason: "invalid" },
        { index: 0, section: "assignments", id: "a0", reason: "not_found" },
      ],
      sections: {
        activities: { applied: 1, skipped: 0 },
        milestones: { applied: 0, skipped: 1 },
        assignments: { applied: 0, skipped: 1 },
      },
    });
  });

  it("re-importing a completed import is 100% duplicate/value_unchanged — no cascade, zero state change", () => {
    const { project, scenarioId } = baseProject({ dependencyMode: true });
    const spec = motivatingSpec();
    const first = applyAiOpsToProject(project, [compositeOp(spec)], scenarioId);
    expect(first.results[0]!.outcome).toEqual({ status: "applied" });

    const second = applyAiOpsToProject(first.project, [compositeOp(spec)], scenarioId);
    const outcome = partialOf(second.results[0]!.outcome);
    expect(outcome.appliedCount).toBe(0);
    // Every skip is a presence-preserving reason — NO not_found cascades.
    const reasons = [...new Set(outcome.skippedItems.map((s) => s.reason))].sort();
    expect(reasons).toEqual(["duplicate", "value_unchanged"]);
    expect(outcome.sections).toEqual({
      activities: { applied: 0, skipped: 27 },
      milestones: { applied: 0, skipped: 5 },
      assignments: { applied: 0, skipped: 10 },
      dependencies: { applied: 0, skipped: 34 },
    });
    // Idempotent: zero state change → same project reference.
    expect(second.project).toBe(first.project);
  });
});

// ---------------------------------------------------------------------------
// Criterion 6 — 2A idempotency (all-valid vehicle, disposition 8)
// ---------------------------------------------------------------------------

describe("Phase 2 criterion 6 — bulk_update_activities idempotency", () => {
  it("re-running an all-valid 2A call is 100% value_unchanged, zero state change", () => {
    const { project, scenarioId } = baseProject();
    const seeded = seedActivities(project, scenarioId, [
      { id: "a0", name: "A0", min: 1, mostLikely: 2, max: 3 },
      { id: "a1", name: "A1", min: 1, mostLikely: 2, max: 3 },
    ]);
    const op: AiOp = {
      seq: 2,
      op: "bulk_update_activities",
      payload: { updates: [{ id: "a0", max: 10 }, { id: "a1", name: "Renamed" }] },
    };
    const first = one(seeded, op, scenarioId);
    expect(first.results[0]!.outcome).toEqual({ status: "applied" });

    const second = applyAiOpsToProject(first.project, [op], scenarioId);
    expect(second.results[0]!.outcome).toEqual({
      status: "partial",
      appliedCount: 0,
      skippedItems: [
        { index: 0, id: "a0", reason: "value_unchanged" },
        { index: 1, id: "a1", reason: "value_unchanged" },
      ],
    });
    expect(second.project).toBe(first.project);
  });
});
