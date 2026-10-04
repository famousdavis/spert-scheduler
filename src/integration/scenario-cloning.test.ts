// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  createScenario,
  createActivity,
  addActivityToScenario,
  addDependency,
  updateActivity,
  cloneScenario,
} from "@app/api/project-service";
import { runSimulationSync } from "@app/api/simulation-service";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import type { Scenario, SimulationRun } from "@domain/models/types";

describe("Scenario cloning", () => {
  function buildScenario() {
    const scenario = createScenario("Original", "2025-01-06");
    const settings = scenario.settings;
    const a1 = { ...createActivity("Design", settings), min: 3, mostLikely: 5, max: 10 };
    const a2 = { ...createActivity("Build", settings), min: 10, mostLikely: 15, max: 25 };
    const a3 = { ...createActivity("Test", settings), min: 5, mostLikely: 7, max: 12 };

    let s = addActivityToScenario(scenario, a1);
    s = addActivityToScenario(s, a2);
    s = addActivityToScenario(s, a3);

    // Mark first as complete
    s = updateActivity(s, a1.id, {
      status: "complete",
      actualDuration: 4,
    });

    // Add fake simulation results
    s = {
      ...s,
      simulationResults: {
        id: "sim1",
        mean: 30,
        samples: [],
      } as unknown as SimulationRun,
    };

    return { scenario: s, activityIds: [a1.id, a2.id, a3.id] };
  }

  it("clone preserves activity count without dropCompleted", () => {
    const { scenario } = buildScenario();
    const clone = cloneScenario(scenario, "Clone");

    expect(clone.activities).toHaveLength(3);
    expect(clone.activities[0]!.status).toBe("complete");
  });

  it("clone with dropCompleted removes complete activities", () => {
    const { scenario } = buildScenario();
    const clone = cloneScenario(scenario, "Reforecast", {
      dropCompleted: true,
    });

    expect(clone.activities).toHaveLength(2);
    expect(clone.activities.every((a) => a.status === "planned")).toBe(true);
    expect(clone.activities.every((a) => a.actualDuration === undefined)).toBe(
      true
    );
  });

  it("clone generates new IDs for everything", () => {
    const { scenario, activityIds } = buildScenario();
    const clone = cloneScenario(scenario, "Clone");

    expect(clone.id).not.toBe(scenario.id);
    // Since v0.76.0 (2026-10-04): a copy keeps its source's seed, so an unchanged copy reproduces its source.
    expect(clone.settings.rngSeed).toBe(scenario.settings.rngSeed);

    for (let i = 0; i < clone.activities.length; i++) {
      expect(clone.activities[i]!.id).not.toBe(activityIds[i]);
    }
  });

  it("clone does not carry simulation results", () => {
    const { scenario } = buildScenario();
    expect(scenario.simulationResults).toBeDefined();

    const clone = cloneScenario(scenario, "Clone");
    expect(clone.simulationResults).toBeUndefined();
  });

  it("clone preserves start date and settings (except seed)", () => {
    const { scenario } = buildScenario();
    const clone = cloneScenario(scenario, "Clone");

    expect(clone.startDate).toBe(scenario.startDate);
    expect(clone.settings.trialCount).toBe(scenario.settings.trialCount);
    expect(clone.settings.probabilityTarget).toBe(
      scenario.settings.probabilityTarget
    );
    expect(clone.settings.defaultConfidenceLevel).toBe(
      scenario.settings.defaultConfidenceLevel
    );
  });

  it("clone remaps dependency IDs to new activity IDs", () => {
    const { scenario, activityIds } = buildScenario();

    // Add a dependency: a1 → a2
    const withDep = addDependency(scenario, activityIds[0]!, activityIds[1]!);
    const clone = cloneScenario(withDep, "Clone with deps");

    expect(clone.dependencies).toHaveLength(1);
    const dep = clone.dependencies[0]!;
    // Dep should reference new IDs, not old ones
    expect(dep.fromActivityId).not.toBe(activityIds[0]);
    expect(dep.toActivityId).not.toBe(activityIds[1]);
    // Dep should reference the cloned activity IDs
    expect(dep.fromActivityId).toBe(clone.activities[0]!.id);
    expect(dep.toActivityId).toBe(clone.activities[1]!.id);
  });

  it("clone with dropCompleted drops deps referencing removed activities", () => {
    const { scenario, activityIds } = buildScenario();

    // a1 is already complete. Add deps: a1→a2, a2→a3
    const withDeps = addDependency(
      addDependency(scenario, activityIds[0]!, activityIds[1]!),
      activityIds[1]!,
      activityIds[2]!
    );

    const clone = cloneScenario(withDeps, "Reforecast", { dropCompleted: true });

    // a1 dropped → a1→a2 dep removed, only a2→a3 remains
    expect(clone.dependencies).toHaveLength(1);
    expect(clone.dependencies[0]!.fromActivityId).toBe(clone.activities[0]!.id);
    expect(clone.dependencies[0]!.toActivityId).toBe(clone.activities[1]!.id);
  });
});

describe("An unchanged copy simulates exactly like its source", () => {
  function buildSpreadScenario(dependencyMode: boolean): Scenario {
    let s = createScenario("Source", "2025-01-06", { dependencyMode });
    // Every estimate has spread: createActivity's default 1/1/1 is a point mass whose every
    // percentile is 1.0 whatever the seed, and would let the control below pass vacuously.
    const a1 = { ...createActivity("Design", s.settings), min: 3, mostLikely: 5, max: 9 };
    const a2 = { ...createActivity("Build", s.settings), min: 8, mostLikely: 12, max: 20 };
    const a3 = { ...createActivity("Test", s.settings), min: 2, mostLikely: 4, max: 7 };
    for (const a of [a1, a2, a3]) s = addActivityToScenario(s, a);
    if (dependencyMode) {
      s = addDependency(addDependency(s, a1.id, a2.id), a1.id, a3.id);
    }
    return s;
  }

  function simulate(s: Scenario): SimulationRun {
    const p = buildSimulationParams(
      s.activities, s.settings.dependencyMode, s.settings.probabilityTarget,
      s.dependencies, s.milestones, s.startDate, undefined, s.settings.parkinsonsLawEnabled,
    );
    return runSimulationSync(
      s.activities, s.settings.trialCount, s.settings.rngSeed,
      p.deterministicDurations, p.dependencyParams, p.sequentialConstraints,
    );
  }

  it.each([
    ["sequential", false],
    ["dependency", true],
  ])("%s mode: the copy's percentiles and mean equal its source's; a fresh seed changes them", (_mode, dependencyMode) => {
    const source = buildSpreadScenario(dependencyMode);
    const copy = cloneScenario(source, "Copy");
    // The copy has new ids in the same order, and its dependencies follow them.
    expect(copy.activities.map((a) => a.id)).not.toEqual(source.activities.map((a) => a.id));
    expect(copy.dependencies).toHaveLength(dependencyMode ? 2 : 0);

    const fromSource = simulate(source);
    const fromCopy = simulate(copy);
    expect(fromCopy.percentiles).toEqual(fromSource.percentiles);
    expect(fromCopy.mean).toBe(fromSource.mean);

    // Control: the same copy given a fresh seed, as the scenario card's New button does.
    const reseeded = simulate({ ...copy, settings: { ...copy.settings, rngSeed: crypto.randomUUID() } });
    expect(reseeded.percentiles).not.toEqual(fromSource.percentiles);
    expect(reseeded.mean).not.toBe(fromSource.mean);
  });
});
