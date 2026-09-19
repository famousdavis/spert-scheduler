// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import { createProject, createActivity, addActivityToScenario } from "@app/api/project-service";
import { ActivitySchema, ProjectSchema, StoredActivitySchema } from "@domain/schemas/project.schema";
import { serializeExport, validateImport } from "@app/api/export-import-service";
import { parseFlatActivityTable } from "@core/import/flat-activity-parser";
import type { Activity, Project, Scenario } from "@domain/models/types";

/**
 * An out-of-order three-point estimate must never make a project unloadable (WI-49, v0.69.0).
 *
 * The grid commits each estimate cell as it is typed, so 9 → 14 in Min over a Most Likely of 13
 * STORES 14/13/22 — and until v0.69.0 `ScenarioSchema` nested the strict `ActivitySchema`, so the
 * next load rejected the whole project: "This project is no longer available". The owner's
 * ruling (2026-09-17): relax the LOAD-time ordering check, save and flag instead.
 *
 * ⚠️ The pair is the point: the tolerant schema every load gate uses and the strict one every
 * input boundary and on-screen flag uses must DISAGREE on an out-of-order triple — and AGREE on
 * everything else. Fixtures are built through the app's own constructors, never hand-written.
 */
function projectWithEstimate(patch: Partial<Activity>): Project {
  const project = createProject("Out Of Order Fixture", "2026-09-18");
  const scenario = project.scenarios[0]!;
  const activity: Activity = { ...createActivity("Design", scenario.settings), min: 9, mostLikely: 13, max: 22, ...patch };
  const withActivity: Scenario = addActivityToScenario(scenario, activity);
  return { ...project, scenarios: [withActivity] };
}

const OUT_OF_ORDER: Array<[string, Partial<Activity>, Array<[string, string]>]> = [
  ["min above Most Likely", { min: 14 }, [["min", "Min must be <= Most Likely"]]],
  ["Most Likely above max", { mostLikely: 30 }, [["mostLikely", "Most Likely must be <= Max"]]],
  ["both halves", { min: 30, mostLikely: 20, max: 10 }, [
    ["min", "Min must be <= Most Likely"],
    ["mostLikely", "Most Likely must be <= Max"],
  ]],
  ["a half-typed fresh row", { min: 5, mostLikely: 1, max: 1 }, [["min", "Min must be <= Most Likely"]]],
];

describe("an out-of-order estimate does not brick a project", () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  it("the control fixture is valid, so a difference below means the estimates", () => {
    expect(ProjectSchema.safeParse(projectWithEstimate({})).success).toBe(true);
    expect(ActivitySchema.safeParse(projectWithEstimate({}).scenarios[0]!.activities[0]).success).toBe(true);
  });

  describe.each(OUT_OF_ORDER)("%s", (_label, patch, expectedIssues) => {
    it("the tolerant schema and ProjectSchema ACCEPT it; the strict schema still REJECTS it, on the same cells", () => {
      const project = projectWithEstimate(patch);
      const activity = project.scenarios[0]!.activities[0]!;
      expect(ProjectSchema.safeParse(project).success).toBe(true);
      expect(StoredActivitySchema.safeParse(activity).success).toBe(true);
      // The side that must NOT move: the input rule, its paths and its words.
      const strict = ActivitySchema.safeParse(activity);
      expect(strict.success).toBe(false);
      expect(strict.error!.issues.map((i) => [i.path.join("."), i.message])).toEqual(expectedIssues);
    });

    it("loads from local storage, and reads back verbatim — nothing repairs it on load", () => {
      const project = projectWithEstimate(patch);
      repo.save(project);
      const result = repo.loadWithDiagnostics(project.id);
      expect(result.success ? null : result.error.details).toBeNull();
      const loaded = repo.load(project.id)!.scenarios[0]!.activities[0]!;
      expect(loaded).toMatchObject(patch);
    });
  });

  it("an exported project holding one re-imports, beside a healthy one", () => {
    const flagged = projectWithEstimate({ min: 14 });
    const healthy = projectWithEstimate({});
    const result = validateImport(serializeExport([flagged, healthy]), []);
    expect(result.success ? null : result.error).toBeNull();
    if (!result.success) return;
    expect(result.projects).toHaveLength(2);
  });
});

describe("the tolerance is for ORDERING only", () => {
  it.each([
    ["a negative estimate", { min: -1 }, "scenarios.0.activities.0.min"],
    ["an activity name over 200 characters", { name: "x".repeat(201) }, "scenarios.0.activities.0.name"],
    ["a half-set constraint", { constraintType: "SNET" as const }, "scenarios.0.activities.0.constraintType"],
  ])("%s is still refused at load — for that reason, on that path", (_label, patch, path) => {
    const result = ProjectSchema.safeParse(projectWithEstimate(patch));
    expect(result.success).toBe(false);
    expect(result.error!.issues.map((i) => i.path.join("."))).toEqual([path]);
  });

  it("a LogNormal activity at zero LOADS (it is flagged, not refused) — and the strict schema rejects it on Max", () => {
    const project = projectWithEstimate({ min: 0, mostLikely: 0, max: 0, distributionType: "logNormal" });
    expect(ProjectSchema.safeParse(project).success).toBe(true);
    const strict = ActivitySchema.safeParse(project.scenarios[0]!.activities[0]);
    expect(strict.error!.issues.map((i) => [i.path.join("."), i.message])).toEqual([
      ["max", "A LogNormal activity needs an estimate above zero"],
    ]);
  });
});

describe("CSV import keeps refusing what the strict schema refuses", () => {
  const HEADER = ["Activity ID", "Activity Name", "Optimistic (Min)", "Most Likely", "Pessimistic (Max)", "Confidence Level", "Distribution"];
  const row = (id: string, min: string, ml: string, max: string, distribution: string) =>
    [id, `Task ${id}`, min, ml, max, "Medium", distribution];

  it("still reports an out-of-order row", () => {
    const result = parseFlatActivityTable([HEADER, row("A1", "14", "13", "22", "triangular")]);
    expect(result.activities).toHaveLength(0);
    expect(result.errors.some((e) => e.message.includes("Min must be <= Most Likely"))).toBe(true);
  });

  it("now refuses a LogNormal 0/0/0 row on Max, and still imports a Triangular 0/0/0 and a LogNormal 0/0/1", () => {
    const result = parseFlatActivityTable([
      HEADER,
      row("L0", "0", "0", "0", "logNormal"),
      row("T0", "0", "0", "0", "triangular"),
      row("L1", "0", "0", "1", "logNormal"),
    ]);
    expect(result.activities.map((a) => a.name)).toEqual(["Task T0", "Task L1"]);
    const refused = result.errors.filter((e) => e.severity === "error");
    expect(refused).toHaveLength(1);
    expect(refused[0]).toMatchObject({ row: 2, column: "max" });
    expect(refused[0]!.message).toContain("A LogNormal activity needs an estimate above zero");
  });
});
