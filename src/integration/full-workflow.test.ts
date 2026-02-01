import { describe, it, expect, beforeEach } from "vitest";
import {
  createProject,
  createActivity,
  addActivityToScenario,
  updateActivity,
  cloneScenario,
} from "@app/api/project-service";
import { computeSchedule } from "@app/api/schedule-service";
import { runMonteCarloSimulation } from "@core/simulation/monte-carlo";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";

describe("Full workflow integration test", () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  it("create project -> add activities -> simulate -> schedule -> clone -> persist -> reload", () => {
    // 1. Create project (auto-creates Baseline scenario)
    let project = createProject("IT Migration", "2025-02-03");
    expect(project.scenarios).toHaveLength(1);
    expect(project.scenarios[0]!.name).toBe("Baseline");

    // 3. Add activities
    const settings = project.scenarios[0]!.settings;
    const act1 = createActivity("Requirements", settings);
    const act2 = createActivity("Development", settings);
    const act3 = createActivity("Testing", settings);

    let activeScenario = project.scenarios[0]!;
    activeScenario = addActivityToScenario(activeScenario, {
      ...act1,
      min: 3,
      mostLikely: 5,
      max: 10,
    });
    activeScenario = addActivityToScenario(activeScenario, {
      ...act2,
      min: 10,
      mostLikely: 15,
      max: 30,
      confidenceLevel: "lowConfidence",
    });
    activeScenario = addActivityToScenario(activeScenario, {
      ...act3,
      min: 5,
      mostLikely: 8,
      max: 15,
    });

    project = {
      ...project,
      scenarios: [activeScenario],
    };
    expect(activeScenario.activities).toHaveLength(3);
    expect(activeScenario.simulationResults).toBeUndefined();

    // 4. Run Monte Carlo simulation
    const simResult = runMonteCarloSimulation({
      activities: activeScenario.activities,
      trialCount: 10000,
      rngSeed: activeScenario.settings.rngSeed,
    });

    expect(simResult.samples).toHaveLength(10000);
    expect(simResult.mean).toBeGreaterThan(0);
    expect(simResult.percentiles[85]).toBeGreaterThan(simResult.percentiles[50]!);

    // 5. Compute deterministic schedule
    const schedule = computeSchedule(
      activeScenario.activities,
      activeScenario.startDate,
      activeScenario.settings.probabilityTarget
    );
    expect(schedule.activities).toHaveLength(3);
    expect(schedule.totalDurationDays).toBeGreaterThan(0);
    expect(schedule.projectEndDate > activeScenario.startDate).toBe(true);

    // Activities chain: each starts after the previous ends
    for (let i = 1; i < schedule.activities.length; i++) {
      expect(schedule.activities[i]!.startDate > schedule.activities[i - 1]!.endDate).toBe(true);
    }

    // 6. Mark first activity complete
    activeScenario = updateActivity(activeScenario, act1.id, {
      status: "complete",
      actualDuration: 4,
    });
    expect(activeScenario.simulationResults).toBeUndefined(); // Invalidated

    // 7. Clone scenario
    const clone = cloneScenario(activeScenario, "Optimistic", {
      dropCompleted: true,
    });
    expect(clone.activities).toHaveLength(2); // Dropped complete activity
    expect(clone.id).not.toBe(activeScenario.id);
    expect(clone.settings.rngSeed).not.toBe(activeScenario.settings.rngSeed);

    // 8. Persist
    project = {
      ...project,
      scenarios: [
        { ...activeScenario, simulationResults: { ...simResult, id: "sim1" } },
        clone,
      ],
    };
    repo.save(project);

    // 9. Reload
    const loaded = repo.load(project.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.scenarios).toHaveLength(2);
    expect(loaded!.scenarios[0]!.activities).toHaveLength(3);
    expect(loaded!.scenarios[0]!.simulationResults).not.toBeUndefined();
    expect(loaded!.scenarios[0]!.simulationResults!.samples).toHaveLength(10000);
    expect(loaded!.scenarios[1]!.activities).toHaveLength(2);
    expect(loaded!.scenarios[1]!.name).toBe("Optimistic");
  });
});
