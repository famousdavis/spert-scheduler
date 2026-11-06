// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { applyAiOpToScenario, applyAiOpsToProject, type AiOp, type AiOpOutcome } from "./ai-batch-service";
import { createActivity, createProject, createScenario } from "./project-service";
import { buildRenderList } from "@ui/helpers/band-utils";
import { ActivityBandSchema, ProjectSchema } from "@domain/schemas/project.schema";
import {
  DEFAULT_SCENARIO_SETTINGS,
  PROJECT_TILE_COLORS,
  SECTION_CAP,
  type Activity,
  type ActivityBand,
  type Project,
  type Scenario,
  type SimulationRun,
} from "@domain/models/types";

function act(id: string): Activity {
  return { ...createActivity(id, DEFAULT_SCENARIO_SETTINGS), id, name: id, min: 3, mostLikely: 5, max: 7, distributionType: "triangular" };
}
const band = (id: string, name: string, before: string | null, color?: string): ActivityBand => ({ id, name, insertBeforeActivityId: before, color });
function scen(ids: string[], bands: ActivityBand[] = []): Scenario {
  return { ...createScenario("S1", "2026-11-02"), activities: ids.map(act), bands };
}
/** The grid, top to bottom: `[name]` for a header, the id for an activity. */
const rows = (s: Scenario) =>
  buildRenderList(s.activities, s.bands ?? [])
    .map((r) => (r.kind === "band" ? `[${r.band.name}]` : r.activity.id))
    .join(" ");
const named = (o: AiOpOutcome) => (o.status === "partial" ? o.skippedItems.map((i) => `${i.name}:${i.reason}`) : []);
const fill = (n: number) => Array.from({ length: n }, (_, i) => band(`b${i}`, `B${i}`, "a1"));

const create = (s: Scenario, sections: Array<{ id: string; name: string; beforeActivityId: string | null; color?: string }>) =>
  applyAiOpToScenario(s, { seq: 1, op: "bulk_create_sections", payload: { sections } });
const update = (s: Scenario, updates: Array<{ id: string; name?: string; beforeActivityId?: string | null; color?: string }>) =>
  applyAiOpToScenario(s, { seq: 1, op: "bulk_update_sections", payload: { updates } });
const del = (s: Scenario, ids: string[]) => applyAiOpToScenario(s, { seq: 1, op: "delete_sections", payload: { ids } });

describe("bulk_create_sections: placement", () => {
  it("puts a header directly above the named activity, below any header already there", () => {
    const r = create(scen(["a1", "a2"], [band("h1", "One", "a2")]), [{ id: "h2", name: "Two", beforeActivityId: "a2" }]);
    expect(r.outcome).toEqual({ status: "applied" });
    expect(rows(r.scenario)).toBe("a1 [One] [Two] a2");
  });
  it("entries on one activity read top to bottom in array order", () => {
    const r = create(scen(["a1"]), [
      { id: "h1", name: "One", beforeActivityId: "a1" },
      { id: "h2", name: "Two", beforeActivityId: "a1" },
    ]);
    expect(rows(r.scenario)).toBe("[One] [Two] a1");
  });
  it("null goes after the last activity, and the next activity the AI creates goes UNDER it", () => {
    const made = create(scen(["a1"]), [{ id: "h1", name: "End", beforeActivityId: null }]);
    expect(rows(made.scenario)).toBe("a1 [End]");
    const next = applyAiOpToScenario(made.scenario, { seq: 2, op: "create_activity", payload: { id: "n1", name: "New", min: 1, mostLikely: 2, max: 3 } });
    expect(rows(next.scenario)).toBe("a1 [End] n1");
  });
  it("two headers at the end both move onto the next activity, and the first is left empty", () => {
    const made = create(scen(["a1"]), [
      { id: "h1", name: "One", beforeActivityId: null },
      { id: "h2", name: "Two", beforeActivityId: null },
    ]);
    const next = applyAiOpToScenario(made.scenario, { seq: 2, op: "create_activity", payload: { id: "n1", name: "New", min: 1, mostLikely: 2, max: 3 } });
    expect(rows(next.scenario)).toBe("a1 [One] [Two] n1");
  });
  it("stores a swatch's hex from its name, and no colour when none is sent", () => {
    const made = create(scen(["a1"]), [
      { id: "h1", name: "One", beforeActivityId: "a1", color: "Teal" },
      { id: "h2", name: "Two", beforeActivityId: "a1" },
    ]).scenario.bands!;
    expect(made[0]!.color).toBe("#6bb6b0");
    expect(made[1]!.color).toBeUndefined();
  });
  it('"none" is no colour, on a create as on an update, so what the snapshot shows can be sent back', () => {
    const made = create(scen(["a1"]), [{ id: "h1", name: "One", beforeActivityId: "a1", color: "none" }]);
    expect(made.outcome).toEqual({ status: "applied" });
    expect(made.scenario.bands![0]!.color).toBeUndefined();
    expect(ActivityBandSchema.safeParse(made.scenario.bands![0]).success).toBe(true);
  });
  it("every swatch name works, and each stored Section passes the schema that guards a save", () => {
    for (const { name, hex } of PROJECT_TILE_COLORS) {
      const b = create(scen(["a1"]), [{ id: "h", name, beforeActivityId: "a1", color: name }]).scenario.bands![0]!;
      expect(b.color).toBe(hex);
      expect(ActivityBandSchema.safeParse(b).success).toBe(true);
    }
  });
});

describe("bulk_create_sections: refusals, entry by entry", () => {
  it("skips an id a Section holds, an id an activity holds, and a repeated id; the rest apply", () => {
    const r = create(scen(["a1", "a2"], [band("h1", "One", "a1")]), [
      { id: "h1", name: "Same Section id", beforeActivityId: null },
      { id: "a2", name: "Same activity id", beforeActivityId: null },
      { id: "h2", name: "Fine", beforeActivityId: null },
      { id: "h2", name: "Repeat", beforeActivityId: null },
    ]);
    expect(r.outcome).toMatchObject({ status: "partial", appliedCount: 1 });
    expect(named(r.outcome)).toEqual(["Same Section id:section_exists", "Same activity id:section_exists", "Repeat:section_exists"]);
    expect(rows(r.scenario)).toBe("[One] a1 a2 [Fine]");
  });
  it("skips a header above an activity the scenario does not hold, in its own words: the Section is not what is missing", () => {
    const r = create(scen(["a1"]), [{ id: "h1", name: "Build", beforeActivityId: "gone" }]);
    expect(named(r.outcome)).toEqual(["Build:anchor_not_found"]);
    expect(r.scenario.bands).toEqual([]);
  });
  it("a Section's id is not an activity: a header cannot sit above a header", () => {
    const r = create(scen(["a1"], [band("h1", "One", "a1")]), [{ id: "h2", name: "Two", beforeActivityId: "h1" }]);
    expect(named(r.outcome)).toEqual(["Two:anchor_not_found"]);
  });
  it("skips a blank name, an unknown colour and an over-long name as invalid, named by the id when there is no name", () => {
    const r = create(scen(["a1"]), [
      { id: "h1", name: "   ", beforeActivityId: "a1" },
      { id: "h2", name: "Two", beforeActivityId: "a1", color: "Mauve" },
      { id: "h3", name: "#94a3b8", beforeActivityId: "a1", color: "#94a3b8" },
      { id: "h4", name: "n".repeat(201), beforeActivityId: "a1" },
    ]);
    expect(named(r.outcome)).toEqual(["h1:invalid", "Two:invalid", "#94a3b8:invalid", `${"n".repeat(201)}:invalid`]);
    expect(r.scenario.bands).toEqual([]);
  });
  it("when nothing applies it returns the SAME scenario, so the batch writes nothing and opens no undo frame", () => {
    const s = scen(["a1"]);
    expect(create(s, [{ id: "h1", name: "One", beforeActivityId: "gone" }]).scenario).toBe(s);
  });
});

describe("the cap of 50", () => {
  it("the scenario's cap IS the schema's: 50 saves and 51 does not", () => {
    const project = (n: number): Project => ({ ...createProject("P", "2026-11-02"), scenarios: [{ ...scen(["a1"]), bands: fill(n) }] });
    expect(SECTION_CAP).toBe(50);
    expect(ProjectSchema.safeParse(project(SECTION_CAP)).success).toBe(true);
    expect(ProjectSchema.safeParse(project(SECTION_CAP + 1)).success).toBe(false);
  });
  it("holds across entries: 45 + 6 applies 5", () => {
    const entries = Array.from({ length: 6 }, (_, i) => ({ id: `n${i}`, name: `N${i}`, beforeActivityId: null }));
    const r = create(scen(["a1"], fill(45)), entries);
    expect(r.scenario.bands).toHaveLength(50);
    expect(named(r.outcome)).toEqual(["N5:section_limit"]);
  });
  it("holds across the ops of one batch, and across batches", () => {
    const s = scen(["a1"], fill(49));
    const project: Project = { ...createProject("P", "2026-11-02"), scenarios: [s] };
    const op = (seq: number, id: string): AiOp => ({ seq, op: "bulk_create_sections", payload: { sections: [{ id, name: id, beforeActivityId: null }] } });
    const first = applyAiOpsToProject(project, [op(1, "x1"), op(2, "x2")], s.id);
    expect(first.results.map((r) => r.outcome.status)).toEqual(["applied", "partial"]);
    expect(first.project.scenarios[0]!.bands).toHaveLength(50);
    const second = applyAiOpsToProject(first.project, [op(3, "x3")], s.id);
    expect(second.results[0]!.outcome.status).toBe("partial");
    expect(second.project).toBe(first.project);
  });
  it("a delete makes room in the same batch", () => {
    const s = scen(["a1"], fill(50));
    const project: Project = { ...createProject("P", "2026-11-02"), scenarios: [s] };
    const { project: next, results } = applyAiOpsToProject(project, [
      { seq: 1, op: "delete_sections", payload: { ids: ["b0"] } },
      { seq: 2, op: "bulk_create_sections", payload: { sections: [{ id: "n", name: "N", beforeActivityId: null }] } },
    ], s.id);
    expect(results.map((r) => r.outcome.status)).toEqual(["applied", "applied"]);
    expect(next.scenarios[0]!.bands).toHaveLength(50);
  });
});

describe("bulk_update_sections", () => {
  const base = () => scen(["a1", "a2", "a3"], [band("h1", "One", "a1", "#94a3b8"), band("h2", "Two", "a2")]);

  it("changes only the fields sent", () => {
    const r = update(base(), [{ id: "h1", name: "Renamed" }, { id: "h2", color: "Clay" }]);
    expect(r.outcome).toEqual({ status: "applied" });
    expect(r.scenario.bands).toEqual([band("h1", "Renamed", "a1", "#94a3b8"), band("h2", "Two", "a2", "#c9a38a")]);
  });
  it('color "none" clears the colour', () => {
    const b = update(base(), [{ id: "h1", color: "none" }]).scenario.bands![0]!;
    expect(b.color).toBeUndefined();
    expect(b.name).toBe("One");
  });
  it("moves a header above another activity, below any header there", () => {
    expect(rows(update(base(), [{ id: "h1", beforeActivityId: "a2" }]).scenario)).toBe("a1 [Two] [One] a2 a3");
  });
  it("null moves it after the last activity", () => {
    expect(rows(update(base(), [{ id: "h1", beforeActivityId: null }]).scenario)).toBe("a1 [Two] a2 a3 [One]");
  });
  it("sending the activity a header already sits above moves it below the others there", () => {
    const s = scen(["a1"], [band("h1", "One", "a1"), band("h2", "Two", "a1")]);
    expect(rows(update(s, [{ id: "h1", beforeActivityId: "a1" }]).scenario)).toBe("[Two] [One] a1");
  });
  it("a move that leaves the grid as it was is no change", () => {
    const s = scen(["a1"], [band("h1", "One", "a1"), band("h2", "Two", "a1")]);
    const r = update(s, [{ id: "h2", beforeActivityId: "a1" }]);
    expect(named(r.outcome)).toEqual(["Two:value_unchanged"]);
    expect(r.scenario).toBe(s);
  });
  it("null on a header whose anchor no activity holds is no change: it already renders at the end", () => {
    const s = scen(["a1"], [band("h1", "One", "gone")]);
    expect(named(update(s, [{ id: "h1", beforeActivityId: null }]).outcome)).toEqual(["One:value_unchanged"]);
  });
  it("the same name and the same colour are no change; so is none on a Section with no colour", () => {
    const r = update(base(), [{ id: "h1", name: "One", color: "Slate" }, { id: "h2", color: "none" }]);
    expect(named(r.outcome)).toEqual(["One:value_unchanged", "Two:value_unchanged"]);
  });
  it("skips an id no Section holds by that id, and an activity's id is not a Section's", () => {
    expect(named(update(base(), [{ id: "nope", name: "X" }, { id: "a1", name: "X" }]).outcome)).toEqual(["nope:not_found", "a1:not_found"]);
  });
  it("skips a missing activity in its own words, named by the Section", () => {
    expect(named(update(base(), [{ id: "h1", beforeActivityId: "gone" }]).outcome)).toEqual(["One:anchor_not_found"]);
  });
  it("skips a blank name, an unknown colour and an entry with no field as invalid, and changes nothing else in that entry", () => {
    const r = update(base(), [{ id: "h1", name: " ", color: "Clay" }, { id: "h2", color: "Mauve", name: "Kept out" }, { id: "h2" }]);
    expect(named(r.outcome)).toEqual(["One:invalid", "Two:invalid", "Two:invalid"]);
    expect(rows(r.scenario)).toBe("[One] a1 [Two] a2 a3");
    expect(r.scenario.bands![0]!.color).toBe("#94a3b8");
  });
  it("skips a name past 200 characters as invalid", () => {
    const r = update(base(), [{ id: "h1", name: "n".repeat(201) }]);
    expect(named(r.outcome)).toEqual(["One:invalid"]);
    expect(r.scenario.bands![0]!.name).toBe("One");
  });
  it("names an unnamed Section as the app does on screen", () => {
    const s = scen(["a1"], [band("h1", "", "a1")]);
    expect(named(update(s, [{ id: "h1", beforeActivityId: "gone" }]).outcome)).toEqual(["(unnamed):anchor_not_found"]);
  });
  it("a repeated id sees the earlier entry's result", () => {
    const r = update(base(), [{ id: "h1", name: "First" }, { id: "h1", name: "First" }, { id: "h1", name: "Second" }]);
    expect(named(r.outcome)).toEqual(["First:value_unchanged"]);
    expect(r.scenario.bands![0]!.name).toBe("Second");
  });
  it("a create then an update of the same id in one batch: the update sees the new Section", () => {
    const s = scen(["a1"]);
    const project: Project = { ...createProject("P", "2026-11-02"), scenarios: [s] };
    const { project: next, results } = applyAiOpsToProject(project, [
      { seq: 1, op: "bulk_create_sections", payload: { sections: [{ id: "h1", name: "One", beforeActivityId: null }] } },
      { seq: 2, op: "bulk_update_sections", payload: { updates: [{ id: "h1", name: "Named later", beforeActivityId: "a1" }] } },
    ], s.id);
    expect(results.map((r) => r.outcome.status)).toEqual(["applied", "applied"]);
    expect(rows(next.scenarios[0]!)).toBe("[Named later] a1");
  });
});

describe("delete_sections", () => {
  it("removes the header only: its activities stay and fall under the header above", () => {
    const s = scen(["a1", "a2", "a3"], [band("h1", "One", "a1"), band("h2", "Two", "a2")]);
    const r = del(s, ["h2"]);
    expect(r.outcome).toEqual({ status: "applied", deletedSections: { scenarioName: "S1", names: ["Two"] } });
    expect(rows(r.scenario)).toBe("[One] a1 a2 a3");
    expect(r.scenario.activities).toBe(s.activities);
  });
  it("skips an id no Section holds, and a repeated id, named as the feed names them", () => {
    const s = scen(["a1"], [band("h1", "One", "a1")]);
    const r = del(s, ["h1", "h1", "a1"]);
    expect(named(r.outcome)).toEqual(["h1:not_found", "a1:not_found"]);
    expect(rows(r.scenario)).toBe("a1");
  });
  it("carries the names of what went, in the order sent, and the scenario's name, and no skipped id among them", () => {
    const s = scen(["a1", "a2"], [band("h1", "One", "a1"), band("h2", "", "a2"), band("h3", "Three", "a2")]);
    const r = del(s, ["h3", "gone", "h2", "h1"]);
    expect(r.outcome).toMatchObject({ status: "partial", appliedCount: 3, deletedSections: { scenarioName: "S1", names: ["Three", "(unnamed)", "One"] } });
  });
  it("carries no names when nothing went: the row stays C's, and the scenario is the same one", () => {
    const s = scen(["a1"]);
    const r = del(s, ["gone"]);
    expect(r.outcome).toEqual({ status: "partial", appliedCount: 0, skippedItems: [{ index: 0, id: "gone", name: "gone", reason: "not_found" }] });
    expect(r.scenario).toBe(s);
  });
  it("can empty the list", () => {
    expect(del(scen(["a1"], [band("h1", "One", "a1")]), ["h1"]).scenario.bands).toEqual([]);
  });
});

describe("the id guard, the other way: no path that creates an activity takes a Section's id", () => {
  const s = () => scen(["a1"], [band("h1", "One", "a1")]);
  const item = { id: "h1", name: "Clash", min: 1, mostLikely: 2, max: 3 };
  it("create_activity", () => {
    const r = applyAiOpToScenario(s(), { seq: 1, op: "create_activity", payload: item });
    expect(r.outcome).toEqual({ status: "skipped", reason: "duplicate" });
    expect(r.scenario.activities).toHaveLength(1);
  });
  it("bulk_create_activities", () => {
    const r = applyAiOpToScenario(s(), { seq: 1, op: "bulk_create_activities", payload: { activities: [item, { ...item, id: "ok" }] } });
    expect(r.outcome).toEqual({ status: "partial", appliedCount: 1, skippedItems: [{ index: 0, id: "h1", reason: "duplicate" }] });
  });
  it("bulk_import_schedule", () => {
    const r = applyAiOpToScenario(s(), { seq: 1, op: "bulk_import_schedule", payload: { activities: [item] } });
    expect(r.outcome.status).toBe("partial");
    expect(r.scenario.activities).toHaveLength(1);
  });
});

describe("where a new activity lands, as the prompt and the create tool say", () => {
  it("always at the end of the list, under the last Section, by each path that creates one", () => {
    const s = scen(["a1", "a2", "a3"], [band("h1", "Design", "a1"), band("h2", "Build", "a3")]);
    const item = (id: string) => ({ id, name: id, min: 1, mostLikely: 2, max: 3 });
    const one = applyAiOpToScenario(s, { seq: 1, op: "create_activity", payload: item("n1") });
    expect(rows(one.scenario)).toBe("[Design] a1 a2 [Build] a3 n1");
    const bulk = applyAiOpToScenario(s, { seq: 1, op: "bulk_create_activities", payload: { activities: [item("n2")] } });
    expect(rows(bulk.scenario)).toBe("[Design] a1 a2 [Build] a3 n2");
    const imported = applyAiOpToScenario(s, { seq: 1, op: "bulk_import_schedule", payload: { activities: [item("n3")] } });
    expect(rows(imported.scenario)).toBe("[Design] a1 a2 [Build] a3 n3");
  });
  it("a reorder afterwards puts it in another Section", () => {
    const s = scen(["a1", "a2", "a3", "n1"], [band("h1", "Design", "a1"), band("h2", "Build", "a3")]);
    const r = applyAiOpToScenario(s, { seq: 1, op: "reorder_activities", payload: { orderedActivityIds: ["a1", "a2", "n1", "a3"] } });
    expect(rows(r.scenario)).toBe("[Design] a1 a2 n1 [Build] a3");
  });
});

describe("what a Section write leaves alone", () => {
  const run = { id: "r1", timestamp: "2026-11-05T12:00:00.000Z" } as unknown as SimulationRun;
  const ops: AiOp[] = [
    { seq: 1, op: "bulk_create_sections", payload: { sections: [{ id: "h9", name: "New", beforeActivityId: "a1" }] } },
    { seq: 2, op: "bulk_update_sections", payload: { updates: [{ id: "h1", name: "Renamed", beforeActivityId: "a1" }] } },
    { seq: 3, op: "delete_sections", payload: { ids: ["h1"] } },
  ];
  it.each(ops.map((op) => [op.op, op] as const))("%s keeps the simulation results and the activities, by reference", (_name, op) => {
    const s: Scenario = { ...scen(["a1", "a2"], [band("h1", "One", "a2")]), simulationResults: run };
    const r = applyAiOpToScenario(s, op);
    expect(r.outcome.status).toBe("applied");
    expect(r.scenario.simulationResults).toBe(run);
    expect(r.scenario.activities).toBe(s.activities);
    expect(r.scenario.dependencies).toBe(s.dependencies);
  });
  it("a locked scenario skips each of the three whole", () => {
    const s: Scenario = { ...scen(["a1", "a2"], [band("h1", "One", "a2")]), locked: true };
    const project: Project = { ...createProject("P", "2026-11-02"), scenarios: [s] };
    const { project: next, results } = applyAiOpsToProject(project, ops, s.id);
    expect(results.map((r) => r.outcome)).toEqual(ops.map(() => ({ status: "skipped", reason: "locked" })));
    expect(next).toBe(project);
  });
  it("reaches the scenario the op names, not the open one", () => {
    const open = scen(["a1"]);
    const other = { ...scen(["a1"]), id: "other" };
    const project: Project = { ...createProject("P", "2026-11-02"), scenarios: [open, other] };
    const { project: next } = applyAiOpsToProject(project, [
      { seq: 1, op: "bulk_create_sections", payload: { scenarioId: "other", sections: [{ id: "h1", name: "One", beforeActivityId: "a1" }] } },
    ], open.id);
    expect(next.scenarios[0]!.bands).toEqual([]);
    expect(next.scenarios[1]!.bands).toHaveLength(1);
  });
});

describe("the dispatcher's route: a shape the client schema refuses is a whole-op invalid", () => {
  it.each([
    ["bulk_create_sections", { sections: [] }],
    ["bulk_update_sections", { updates: [{ name: "no id" }] }],
    ["delete_sections", { ids: [1] }],
  ])("%s", (op, payload) => {
    const s = scen(["a1"]);
    const raw = { seq: 1, op, payload } as unknown as AiOp;
    expect(applyAiOpToScenario(s, raw).outcome).toEqual({ status: "skipped", reason: "invalid" });
  });
  it("a create entry must say where: beforeActivityId is required, and null is a value", () => {
    const s = scen(["a1"]);
    const missing = { seq: 1, op: "bulk_create_sections", payload: { sections: [{ id: "h", name: "N" }] } } as unknown as AiOp;
    expect(applyAiOpToScenario(s, missing).outcome).toEqual({ status: "skipped", reason: "invalid" });
  });
});

describe("the AI's reorder: a header travels with the activity it starts at", () => {
  it("is the anchor rule, unlike the grid's drag", () => {
    const s = scen(["a1", "a2", "a3", "a4"], [band("p1", "P1", "a1"), band("p2", "P2", "a3")]);
    const r = applyAiOpToScenario(s, { seq: 1, op: "reorder_activities", payload: { orderedActivityIds: ["a1", "a2", "a4", "a3"] } });
    expect(rows(r.scenario)).toBe("[P1] a1 a2 a4 [P2] a3");
  });
});
