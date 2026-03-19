// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  createProject,
  createScenario,
  createActivity,
  addActivityToScenario,
  addDependency,
  removeDependency,
  updateDependencyLag,
  updateDependencyType,
  removeActivityFromScenario,
  removeActivitiesDeps,
  cloneScenario,
} from "@app/api/project-service";
import {
  computeDependencySchedule,
  computeDependencyDurations,
} from "@core/schedule/deterministic";
import { runDependencyTrials, computeSimulationStats } from "@core/simulation/monte-carlo";
import {
  serializeExport,
  validateImport,
} from "@app/api/export-import-service";
import type { Project, Scenario } from "@domain/models/types";

/**
 * Integration test: full dependency lifecycle.
 *  create → add deps → schedule → simulate → save → reload → verify
 */
describe("Dependency round-trip integration", () => {
  function buildScenarioWithDeps(): {
    scenario: Scenario;
    a1Id: string;
    a2Id: string;
    a3Id: string;
  } {
    let scenario = createScenario("Test", "2025-01-06", { dependencyMode: true });
    const settings = scenario.settings;

    const a1 = { ...createActivity("Design", settings), min: 3, mostLikely: 5, max: 10 };
    const a2 = { ...createActivity("Build", settings), min: 5, mostLikely: 8, max: 15 };
    const a3 = { ...createActivity("Test", settings), min: 2, mostLikely: 3, max: 5 };

    scenario = addActivityToScenario(scenario, a1);
    scenario = addActivityToScenario(scenario, a2);
    scenario = addActivityToScenario(scenario, a3);

    // A1 → A2 (FS), A2 → A3 (FS, +2 lag)
    scenario = addDependency(scenario, a1.id, a2.id, "FS", 0);
    scenario = addDependency(scenario, a2.id, a3.id, "FS", 2);

    return { scenario, a1Id: a1.id, a2Id: a2.id, a3Id: a3.id };
  }

  it("creates dependencies and schedules with them", () => {
    const { scenario } = buildScenarioWithDeps();

    expect(scenario.dependencies).toHaveLength(2);
    expect(scenario.settings.dependencyMode).toBe(true);

    const schedule = computeDependencySchedule(
      scenario.activities,
      scenario.dependencies,
      scenario.startDate,
      scenario.settings.probabilityTarget,
    );

    expect(schedule.activities).toHaveLength(3);
    // Activities should be sequentially chained
    const [s1, s2, s3] = schedule.activities;
    expect(s2!.startDate > s1!.endDate).toBe(true);
    expect(s3!.startDate > s2!.endDate).toBe(true);
  });

  it("runs dependency-aware simulation", () => {
    const { scenario } = buildScenarioWithDeps();

    const durationMap = computeDependencyDurations(
      scenario.activities,
      scenario.settings.probabilityTarget,
    );

    const samples = runDependencyTrials({
      activities: scenario.activities,
      dependencies: scenario.dependencies,
      trialCount: 1000,
      rngSeed: scenario.settings.rngSeed,
      deterministicDurationMap: durationMap,
    });

    const stats = computeSimulationStats(samples.samples, 1000, scenario.settings.rngSeed);
    expect(stats.mean).toBeGreaterThan(0);
    expect(stats.trialCount).toBe(1000);
    // Sequential chain with lag, mean should be well above 10
    expect(stats.mean).toBeGreaterThan(10);
  });

  it("removing a dependency adjusts the schedule", () => {
    const { scenario, a2Id, a3Id } = buildScenarioWithDeps();

    // Remove the A2→A3 dependency
    const updated = removeDependency(scenario, a2Id, a3Id);
    expect(updated.dependencies).toHaveLength(1);

    // Now A3 runs in parallel with A1, so it starts on project start date
    const schedule = computeDependencySchedule(
      updated.activities,
      updated.dependencies,
      updated.startDate,
      updated.settings.probabilityTarget,
    );

    const a3Schedule = schedule.activities.find((s) => s.activityId === a3Id)!;
    const a1Schedule = schedule.activities.find((s) => s.activityId === updated.activities[0]!.id)!;
    expect(a3Schedule.startDate).toBe(a1Schedule.startDate); // Both start at project start
  });

  it("updating lag changes the schedule", () => {
    const { scenario, a2Id, a3Id } = buildScenarioWithDeps();

    const noLag = updateDependencyLag(scenario, a2Id, a3Id, 0);
    const bigLag = updateDependencyLag(scenario, a2Id, a3Id, 10);

    const scheduleNoLag = computeDependencySchedule(
      noLag.activities,
      noLag.dependencies,
      noLag.startDate,
      noLag.settings.probabilityTarget,
    );
    const scheduleBigLag = computeDependencySchedule(
      bigLag.activities,
      bigLag.dependencies,
      bigLag.startDate,
      bigLag.settings.probabilityTarget,
    );

    // More lag → later end date
    expect(scheduleBigLag.totalDurationDays).toBeGreaterThan(
      scheduleNoLag.totalDurationDays,
    );
  });

  it("deleting an activity cleans up its dependencies", () => {
    const { scenario, a2Id } = buildScenarioWithDeps();

    // Delete A2 which is referenced by both deps
    const updated = removeActivityFromScenario(scenario, a2Id);
    expect(updated.activities).toHaveLength(2);
    expect(updated.dependencies).toHaveLength(0); // Both deps referenced A2
  });

  it("bulk deleting activities cleans up dependencies", () => {
    const { scenario, a1Id, a3Id } = buildScenarioWithDeps();

    // Remove deps for A1 and A3 (simulating bulk delete cleanup)
    const cleaned = removeActivitiesDeps(scenario, [a1Id, a3Id]);
    // A1→A2 references A1, A2→A3 references A3 — both should be removed
    expect(cleaned.dependencies).toHaveLength(0);
  });

  it("export/import round-trip preserves dependencies", () => {
    const { scenario } = buildScenarioWithDeps();
    const project = createProject("Dep Test", "2025-01-06");
    const fullProject: Project = {
      ...project,
      scenarios: [scenario],
    };

    const json = serializeExport([fullProject]);
    const result = validateImport(json, []);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const imported = result.projects[0]!;
    const importedScenario = imported.scenarios[0]!;
    expect(importedScenario.dependencies).toHaveLength(2);
    expect(importedScenario.settings.dependencyMode).toBe(true);

    // Verify dep structure
    expect(importedScenario.dependencies[0]!.type).toBe("FS");
    expect(importedScenario.dependencies[1]!.lagDays).toBe(2);
  });

  it("cloning a scenario remaps dependency IDs", () => {
    const { scenario, a1Id, a2Id, a3Id } = buildScenarioWithDeps();

    const clone = cloneScenario(scenario, "Clone");

    // Clone should have new activity IDs
    expect(clone.activities).toHaveLength(3);
    const cloneIds = clone.activities.map((a) => a.id);
    expect(cloneIds).not.toContain(a1Id);
    expect(cloneIds).not.toContain(a2Id);
    expect(cloneIds).not.toContain(a3Id);

    // Dependencies should be remapped to new IDs
    expect(clone.dependencies).toHaveLength(2);
    for (const dep of clone.dependencies) {
      expect(cloneIds).toContain(dep.fromActivityId);
      expect(cloneIds).toContain(dep.toActivityId);
    }

    // Verify dep relationships are preserved (same order/structure)
    // First dep: first activity → second activity (FS, lag 0)
    expect(clone.dependencies[0]!.fromActivityId).toBe(clone.activities[0]!.id);
    expect(clone.dependencies[0]!.toActivityId).toBe(clone.activities[1]!.id);
    expect(clone.dependencies[0]!.lagDays).toBe(0);

    // Second dep: second activity → third activity (FS, lag 2)
    expect(clone.dependencies[1]!.fromActivityId).toBe(clone.activities[1]!.id);
    expect(clone.dependencies[1]!.toActivityId).toBe(clone.activities[2]!.id);
    expect(clone.dependencies[1]!.lagDays).toBe(2);
  });

  it("cloning with dropCompleted removes deps referencing completed activities", () => {
    const { scenario, a1Id } = buildScenarioWithDeps();

    // Mark A1 as complete
    const withComplete = {
      ...scenario,
      activities: scenario.activities.map((a) =>
        a.id === a1Id
          ? { ...a, status: "complete" as const, actualDuration: 4 }
          : a
      ),
    };

    const clone = cloneScenario(withComplete, "Reforecast", {
      dropCompleted: true,
    });

    // A1 dropped → only A2 and A3 remain
    expect(clone.activities).toHaveLength(2);
    // A1→A2 dep removed (references dropped A1), only A2→A3 remains
    expect(clone.dependencies).toHaveLength(1);
    expect(clone.dependencies[0]!.fromActivityId).toBe(clone.activities[0]!.id);
    expect(clone.dependencies[0]!.toActivityId).toBe(clone.activities[1]!.id);
  });

  it("updateDependencyType changes type and invalidates simulation results", () => {
    const { scenario, a1Id, a2Id } = buildScenarioWithDeps();
    // Simulate having results
    const withResults = { ...scenario, simulationResults: { id: "fake" } as never };
    const updated = updateDependencyType(withResults, a1Id, a2Id, "SS");
    expect(updated.dependencies[0]!.type).toBe("SS");
    expect(updated.simulationResults).toBeUndefined();
  });

  it("export/import round-trip preserves SS and FF dependency types", () => {
    let scenario = createScenario("Mixed Types", "2025-01-06", { dependencyMode: true });
    const settings = scenario.settings;

    const a1 = { ...createActivity("Design", settings), min: 3, mostLikely: 5, max: 10 };
    const a2 = { ...createActivity("Build", settings), min: 5, mostLikely: 8, max: 15 };
    const a3 = { ...createActivity("Test", settings), min: 2, mostLikely: 3, max: 5 };

    scenario = addActivityToScenario(scenario, a1);
    scenario = addActivityToScenario(scenario, a2);
    scenario = addActivityToScenario(scenario, a3);

    scenario = addDependency(scenario, a1.id, a2.id, "SS", 1);
    scenario = addDependency(scenario, a2.id, a3.id, "FF", 0);

    const project = createProject("SS/FF Test", "2025-01-06");
    const fullProject: Project = { ...project, scenarios: [scenario] };

    const json = serializeExport([fullProject]);
    const result = validateImport(json, []);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const imported = result.projects[0]!;
    const importedScenario = imported.scenarios[0]!;
    expect(importedScenario.dependencies).toHaveLength(2);
    expect(importedScenario.dependencies[0]!.type).toBe("SS");
    expect(importedScenario.dependencies[0]!.lagDays).toBe(1);
    expect(importedScenario.dependencies[1]!.type).toBe("FF");
    expect(importedScenario.dependencies[1]!.lagDays).toBe(0);
  });

  it("cloning preserves SS and FF dependency types", () => {
    let scenario = createScenario("Mixed Types", "2025-01-06", { dependencyMode: true });
    const settings = scenario.settings;

    const a1 = { ...createActivity("A", settings), min: 3, mostLikely: 5, max: 10 };
    const a2 = { ...createActivity("B", settings), min: 5, mostLikely: 8, max: 15 };

    scenario = addActivityToScenario(scenario, a1);
    scenario = addActivityToScenario(scenario, a2);
    scenario = addDependency(scenario, a1.id, a2.id, "FF", 3);

    const clone = cloneScenario(scenario, "Clone");
    expect(clone.dependencies).toHaveLength(1);
    expect(clone.dependencies[0]!.type).toBe("FF");
    expect(clone.dependencies[0]!.lagDays).toBe(3);
  });

  it("Monte Carlo runs correctly with SS/FF dependencies", () => {
    let scenario = createScenario("MC Mixed", "2025-01-06", { dependencyMode: true });
    const settings = scenario.settings;

    const a1 = { ...createActivity("A", settings), min: 3, mostLikely: 5, max: 10 };
    const a2 = { ...createActivity("B", settings), min: 2, mostLikely: 3, max: 5 };
    const a3 = { ...createActivity("C", settings), min: 1, mostLikely: 2, max: 4 };

    scenario = addActivityToScenario(scenario, a1);
    scenario = addActivityToScenario(scenario, a2);
    scenario = addActivityToScenario(scenario, a3);

    // A SS→ B, B FF→ C
    scenario = addDependency(scenario, a1.id, a2.id, "SS", 1);
    scenario = addDependency(scenario, a2.id, a3.id, "FF", 0);

    const durationMap = computeDependencyDurations(
      scenario.activities,
      scenario.settings.probabilityTarget,
    );

    const samples = runDependencyTrials({
      activities: scenario.activities,
      dependencies: scenario.dependencies,
      trialCount: 500,
      rngSeed: scenario.settings.rngSeed,
      deterministicDurationMap: durationMap,
    });

    const stats = computeSimulationStats(samples.samples, 500, scenario.settings.rngSeed);
    expect(stats.mean).toBeGreaterThan(0);
    expect(stats.trialCount).toBe(500);
  });
});
