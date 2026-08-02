// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.63.0 — import-time detection of broken dependency graphs.
//
// The behaviour under test is REPORT, NEVER MODIFY. The "imports unmodified" half is pinned
// by src/integration/import-cycle-characterisation.test.ts, whose assertions must keep
// passing; this file covers the detection and its shape.

import { describe, it, expect } from "vitest";
import {
  createProject,
  createActivity,
  addActivityToScenario,
} from "@app/api/project-service";
import { findDependencyIssues, validateImport, serializeExport } from "@app/api/export-import-service";
import type { Project, ActivityDependency, Scenario } from "@domain/models/types";

function projectWith(
  name: string,
  build: (a: string, b: string) => ActivityDependency[],
  dependencyMode = true
): Project {
  const base = createProject(name, "2026-03-02");
  const s0 = base.scenarios[0]!;
  const a = createActivity("A", s0.settings);
  const b = createActivity("B", s0.settings);
  const withActs = addActivityToScenario(addActivityToScenario(s0, a), b);
  const scenario: Scenario = {
    ...withActs,
    dependencies: build(a.id, b.id),
    settings: { ...withActs.settings, dependencyMode },
  };
  return { ...base, scenarios: [scenario] };
}

const cycle = (a: string, b: string): ActivityDependency[] => [
  { fromActivityId: a, toActivityId: b, type: "FS", lagDays: 0 },
  { fromActivityId: b, toActivityId: a, type: "FS", lagDays: 0 },
];
const dangling = (a: string): ActivityDependency[] => [
  { fromActivityId: a, toActivityId: "ghost", type: "FS", lagDays: 0 },
];
const healthy = (a: string, b: string): ActivityDependency[] => [
  { fromActivityId: a, toActivityId: b, type: "FS", lagDays: 0 },
];

describe("findDependencyIssues", () => {
  it("reports a cycle, naming the project and the scenario", () => {
    const issues = findDependencyIssues([projectWith("Cyclic", cycle)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.projectName).toBe("Cyclic");
    expect(issues[0]!.scenarios).toHaveLength(1);
    expect(issues[0]!.scenarios[0]!.errors.map((e) => e.type)).toContain("cycle");
  });

  it("reports a dangling reference — which detectCycle structurally cannot see", () => {
    // ⚠️ The reason two detections are needed rather than one. populateAdjacency skips an
    // edge whose endpoints do not resolve, exactly as it skips a self-edge, so an
    // unresolvable id never reaches the cycle detector at all.
    const issues = findDependencyIssues([projectWith("Dangling", dangling)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.scenarios[0]!.errors.map((e) => e.type)).toContain("missing-ref");
  });

  it("reports a self-loop", () => {
    const issues = findDependencyIssues([
      projectWith("Selfie", (a) => [{ fromActivityId: a, toActivityId: a, type: "FS", lagDays: 0 }]),
    ]);
    expect(issues[0]!.scenarios[0]!.errors.map((e) => e.type)).toContain("self-loop");
  });

  it("says nothing about a well-formed graph, or about a scenario with no dependencies", () => {
    expect(findDependencyIssues([projectWith("Fine", healthy)])).toEqual([]);
    expect(findDependencyIssues([projectWith("Empty", () => [])])).toEqual([]);
  });

  it("checks scenarios REGARDLESS of dependencyMode", () => {
    // A cycle in a mode-off scenario is inert today and breaks the moment the mode is
    // switched on. The file is what is being reported on, not the current render.
    const issues = findDependencyIssues([projectWith("ModeOff", cycle, false)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.scenarios[0]!.errors.map((e) => e.type)).toContain("cycle");
  });

  it("reports per project — one bad project among good ones does not hide the others", () => {
    const issues = findDependencyIssues([
      projectWith("Good", healthy),
      projectWith("Bad", cycle),
      projectWith("AlsoGood", healthy),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.projectName).toBe("Bad");
  });
});

describe("validateImport surfaces the issues without changing the projects", () => {
  it("reports the cycle AND imports both edges intact", () => {
    const result = validateImport(serializeExport([projectWith("Cyclic", cycle)]), []);
    expect(result.success).toBe(true);
    if (!result.success) return;

    // Reported...
    expect(result.dependencyIssues).toHaveLength(1);
    expect(result.dependencyIssues[0]!.projectName).toBe("Cyclic");

    // ...and NOT repaired. This is the whole decision: warn, keep the data intact.
    expect(result.projects[0]!.scenarios[0]!.dependencies).toHaveLength(2);
  });

  it("is an empty array for a clean file, not undefined", () => {
    const result = validateImport(serializeExport([projectWith("Fine", healthy)]), []);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.dependencyIssues).toEqual([]);
  });
});
