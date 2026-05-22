// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "@ui/hooks/use-project-store";
import type {
  ActivityBand,
  Project,
  SimulationRun,
} from "@domain/models/types";

function setupProjectWithActivities(activityNames: string[]): {
  projectId: string;
  scenarioId: string;
  activityIds: string[];
} {
  const store = useProjectStore.getState();
  const project = store.addProject("Bands Test", null);
  const scenarioId = useProjectStore
    .getState()
    .getProject(project.id)!.scenarios[0]!.id;
  for (const name of activityNames) {
    useProjectStore.getState().addActivity(project.id, scenarioId, name);
  }
  const refreshed = useProjectStore.getState().getProject(project.id)!;
  const scenario = refreshed.scenarios.find((s) => s.id === scenarioId)!;
  return {
    projectId: project.id,
    scenarioId,
    activityIds: scenario.activities.map((a) => a.id),
  };
}

function getScenario(projectId: string, scenarioId: string) {
  const project = useProjectStore.getState().getProject(projectId)!;
  return project.scenarios.find((s) => s.id === scenarioId)!;
}

function seedSimulationResults(projectId: string, scenarioId: string) {
  // Directly mutate via setState so we don't go through clearing actions.
  const fake = {
    id: "sim-fake",
    mean: 42,
    samples: [],
  } as unknown as SimulationRun;
  useProjectStore.setState((state) => ({
    projects: state.projects.map((p) =>
      p.id !== projectId
        ? p
        : {
            ...p,
            scenarios: p.scenarios.map((s) =>
              s.id !== scenarioId ? s : { ...s, simulationResults: fake },
            ),
          },
    ),
  }));
}

beforeEach(() => {
  localStorage.clear();
  useProjectStore.setState({ projects: [], loadError: false, undoStack: [], redoStack: [] });
});

describe("addBand", () => {
  it("appends band with empty name, null anchor, undefined color", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A", "B"]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.bands).toHaveLength(1);
    expect(scenario.bands![0]!.name).toBe("");
    expect(scenario.bands![0]!.insertBeforeActivityId).toBeNull();
    expect(scenario.bands![0]!.color).toBeUndefined();
    expect(scenario.bands![0]!.id).toBeTruthy();
  });

  it("does not clear simulationResults", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    seedSimulationResults(projectId, scenarioId);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.simulationResults).toBeDefined();
    expect(scenario.simulationResults!.mean).toBe(42);
  });

  it("is a no-op when scenario is locked", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    useProjectStore.getState().toggleScenarioLock(projectId, scenarioId);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.bands ?? []).toHaveLength(0);
  });
});

describe("deleteBand", () => {
  it("removes the correct band; others unaffected", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    const store = useProjectStore.getState();
    store.addBand(projectId, scenarioId);
    store.addBand(projectId, scenarioId);
    store.addBand(projectId, scenarioId);
    const firstScenario = getScenario(projectId, scenarioId);
    const targetId = firstScenario.bands![1]!.id;
    useProjectStore.getState().deleteBand(projectId, scenarioId, targetId);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.bands).toHaveLength(2);
    expect(scenario.bands!.find((b) => b.id === targetId)).toBeUndefined();
  });

  it("does not clear simulationResults", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    seedSimulationResults(projectId, scenarioId);
    useProjectStore.getState().deleteBand(projectId, scenarioId, bandId);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.simulationResults).toBeDefined();
  });

  it("is a no-op when scenario is locked", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    useProjectStore.getState().toggleScenarioLock(projectId, scenarioId);
    useProjectStore.getState().deleteBand(projectId, scenarioId, bandId);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.bands!.find((b) => b.id === bandId)).toBeDefined();
  });
});

describe("updateBand", () => {
  it("updates name", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, { name: "Phase 1" });
    expect(getScenario(projectId, scenarioId).bands![0]!.name).toBe("Phase 1");
  });

  it("updates color", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, { color: "#86b49a" });
    expect(getScenario(projectId, scenarioId).bands![0]!.color).toBe("#86b49a");
  });

  it("clears color to undefined", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, { color: "#86b49a" });
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, { color: undefined });
    expect(getScenario(projectId, scenarioId).bands![0]!.color).toBeUndefined();
  });

  it("does not clear simulationResults", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    seedSimulationResults(projectId, scenarioId);
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, { name: "New" });
    expect(getScenario(projectId, scenarioId).simulationResults).toBeDefined();
  });

  it("is a no-op when scenario is locked", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    useProjectStore.getState().toggleScenarioLock(projectId, scenarioId);
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, { name: "Should not stick" });
    expect(getScenario(projectId, scenarioId).bands![0]!.name).toBe("");
  });
});

describe("reorderWithBands", () => {
  it("updates activity order and band anchors atomically", () => {
    const { projectId, scenarioId, activityIds } = setupProjectWithActivities([
      "A",
      "B",
      "C",
    ]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    const scenario = getScenario(projectId, scenarioId);
    // New order: C, A, B with band anchored to A
    const reorderedActivities = [
      scenario.activities.find((a) => a.id === activityIds[2])!,
      scenario.activities.find((a) => a.id === activityIds[0])!,
      scenario.activities.find((a) => a.id === activityIds[1])!,
    ];
    const newBands: ActivityBand[] = [
      {
        id: bandId,
        name: "",
        insertBeforeActivityId: activityIds[0]!,
        color: undefined,
      },
    ];
    useProjectStore
      .getState()
      .reorderWithBands(projectId, scenarioId, reorderedActivities, newBands);
    const after = getScenario(projectId, scenarioId);
    expect(after.activities.map((a) => a.id)).toEqual([
      activityIds[2],
      activityIds[0],
      activityIds[1],
    ]);
    expect(after.bands![0]!.insertBeforeActivityId).toBe(activityIds[0]);
  });

  it("clears simulationResults (matches reorderActivities convention)", () => {
    const { projectId, scenarioId, activityIds } = setupProjectWithActivities([
      "A",
      "B",
    ]);
    const scenario = getScenario(projectId, scenarioId);
    seedSimulationResults(projectId, scenarioId);
    const reorderedActivities = [
      scenario.activities.find((a) => a.id === activityIds[1])!,
      scenario.activities.find((a) => a.id === activityIds[0])!,
    ];
    useProjectStore
      .getState()
      .reorderWithBands(projectId, scenarioId, reorderedActivities, []);
    expect(getScenario(projectId, scenarioId).simulationResults).toBeUndefined();
  });

  it("is a no-op when scenario is locked", () => {
    const { projectId, scenarioId, activityIds } = setupProjectWithActivities([
      "A",
      "B",
    ]);
    const scenario = getScenario(projectId, scenarioId);
    useProjectStore.getState().toggleScenarioLock(projectId, scenarioId);
    const reorderedActivities = [
      scenario.activities.find((a) => a.id === activityIds[1])!,
      scenario.activities.find((a) => a.id === activityIds[0])!,
    ];
    useProjectStore
      .getState()
      .reorderWithBands(projectId, scenarioId, reorderedActivities, []);
    expect(
      getScenario(projectId, scenarioId).activities.map((a) => a.id),
    ).toEqual(activityIds);
  });
});

describe("bulkDeleteActivities with bands", () => {
  it("re-anchors band to first survivor when its anchor is deleted", () => {
    const { projectId, scenarioId, activityIds } = setupProjectWithActivities([
      "A",
      "B",
      "C",
    ]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    // Anchor band to B (middle activity)
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, {
        insertBeforeActivityId: activityIds[1]!,
      });
    // Delete A and B → band should re-anchor to C
    useProjectStore
      .getState()
      .bulkDeleteActivities(projectId, scenarioId, [
        activityIds[0]!,
        activityIds[1]!,
      ]);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.activities.map((a) => a.id)).toEqual([activityIds[2]]);
    expect(scenario.bands![0]!.insertBeforeActivityId).toBe(activityIds[2]);
  });

  it("sets band to null anchor when all activities deleted", () => {
    const { projectId, scenarioId, activityIds } = setupProjectWithActivities([
      "A",
      "B",
    ]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, {
        insertBeforeActivityId: activityIds[0]!,
      });
    useProjectStore
      .getState()
      .bulkDeleteActivities(projectId, scenarioId, activityIds);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.bands![0]!.insertBeforeActivityId).toBeNull();
  });

  it("leaves bands anchored to survivors unaffected", () => {
    const { projectId, scenarioId, activityIds } = setupProjectWithActivities([
      "A",
      "B",
      "C",
    ]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    // Anchor to C (survivor)
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, {
        insertBeforeActivityId: activityIds[2]!,
      });
    useProjectStore
      .getState()
      .bulkDeleteActivities(projectId, scenarioId, [activityIds[0]!]);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.bands![0]!.insertBeforeActivityId).toBe(activityIds[2]);
  });

  it("still removes dependencies referencing deleted activities", () => {
    const { projectId, scenarioId, activityIds } = setupProjectWithActivities([
      "A",
      "B",
    ]);
    useProjectStore
      .getState()
      .addDependency(projectId, scenarioId, activityIds[0]!, activityIds[1]!);
    useProjectStore
      .getState()
      .bulkDeleteActivities(projectId, scenarioId, [activityIds[0]!]);
    const scenario = getScenario(projectId, scenarioId);
    expect(scenario.dependencies).toEqual([]);
  });
});

describe("Color-clear round-trip regression", () => {
  it("survives persist+reload with color cleared back to undefined", () => {
    const { projectId, scenarioId } = setupProjectWithActivities(["A"]);
    useProjectStore.getState().addBand(projectId, scenarioId);
    const bandId = getScenario(projectId, scenarioId).bands![0]!.id;
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, { color: "#86b49a" });
    expect(getScenario(projectId, scenarioId).bands![0]!.color).toBe("#86b49a");
    useProjectStore
      .getState()
      .updateBand(projectId, scenarioId, bandId, { color: undefined });

    // Drop in-memory state and force reload from localStorage
    const snapshot = useProjectStore.getState().projects as Project[];
    expect(snapshot[0]!.scenarios[0]!.bands![0]!.color).toBeUndefined();
    useProjectStore.setState({ projects: [] });
    useProjectStore.getState().loadProjects();
    const reloaded = getScenario(projectId, scenarioId);
    expect(reloaded.bands![0]!.color).toBeUndefined();
  });
});
