// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  createProject,
  createScenario,
  cloneScenario,
  cloneProject,
  createActivity,
  addActivityToScenario,
  addScenarioToProject,
  updateActivity,
  reorderActivities,
  removeActivityFromScenario,
} from "./project-service";
import type { Project, Scenario, SimulationRun } from "@domain/models/types";
import { DEFAULT_SCENARIO_SETTINGS, SCHEMA_VERSION } from "@domain/models/types";

describe("createProject", () => {
  it("creates a project with a unique ID", () => {
    const p1 = createProject("Project A");
    const p2 = createProject("Project B");
    expect(p1.id).toBeTruthy();
    expect(p1.id).not.toBe(p2.id);
  });

  it("auto-creates a Baseline scenario", () => {
    const project = createProject("Test");
    expect(project.scenarios).toHaveLength(1);
    expect(project.scenarios[0]!.name).toBe("Baseline");
    expect(project.scenarios[0]!.activities).toEqual([]);
  });

  it("uses provided startDate for Baseline", () => {
    const project = createProject("Test", "2025-06-01");
    expect(project.scenarios[0]!.startDate).toBe("2025-06-01");
  });
});

describe("createScenario", () => {
  it("generates a fresh seed", () => {
    const s1 = createScenario("Baseline", "2025-01-06");
    const s2 = createScenario("Optimistic", "2025-01-06");
    expect(s1.settings.rngSeed).not.toBe("placeholder");
    expect(s1.settings.rngSeed).not.toBe(s2.settings.rngSeed);
  });

  it("applies settings overrides", () => {
    const s = createScenario("Test", "2025-01-06", { trialCount: 10000 });
    expect(s.settings.trialCount).toBe(10000);
    expect(s.settings.probabilityTarget).toBe(0.5); // default preserved
    expect(s.settings.projectProbabilityTarget).toBe(0.95); // default preserved
  });
});

describe("cloneScenario", () => {
  function makeScenario(): Scenario {
    const scenario = createScenario("Original", "2025-01-06");
    const a1 = createActivity("Task 1", scenario.settings);
    const a2 = createActivity("Task 2", scenario.settings);
    return {
      ...scenario,
      activities: [
        { ...a1, status: "complete", actualDuration: 5 },
        { ...a2, status: "planned" },
      ],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
  }

  it("produces new IDs for clone and activities", () => {
    const original = makeScenario();
    const clone = cloneScenario(original, "Clone");

    expect(clone.id).not.toBe(original.id);
    expect(clone.settings.rngSeed).not.toBe(original.settings.rngSeed);
    for (let i = 0; i < clone.activities.length; i++) {
      expect(clone.activities[i]!.id).not.toBe(original.activities[i]!.id);
    }
  });

  it("does not carry simulationResults", () => {
    const original = makeScenario();
    const clone = cloneScenario(original, "Clone");
    expect(clone.simulationResults).toBeUndefined();
  });

  it("drops completed activities when option set", () => {
    const original = makeScenario();
    const clone = cloneScenario(original, "Clone", { dropCompleted: true });
    expect(clone.activities).toHaveLength(1);
    expect(clone.activities[0]!.status).toBe("planned");
    expect(clone.activities[0]!.actualDuration).toBeUndefined();
  });

  it("preserves all activities without dropCompleted", () => {
    const original = makeScenario();
    const clone = cloneScenario(original, "Clone");
    expect(clone.activities).toHaveLength(2);
  });
});

describe("cloneProject", () => {
  function makeProject(): Project {
    const base = createProject("Source", "2025-01-06");
    const scenario = base.scenarios[0]!;
    const a1 = createActivity("Task 1", scenario.settings);
    const a2 = createActivity("Task 2", scenario.settings);
    return {
      ...base,
      tileColor: "#94a3b8",
      targetFinishDate: "2025-12-31",
      showTargetOnGantt: true,
      showActivityIds: true,
      archived: true,
      convertedWorkDays: ["2025-07-04"],
      globalCalendarOverride: {
        holidays: [
          {
            id: "h1",
            name: "Christmas",
            startDate: "2025-12-25",
            endDate: "2025-12-25",
          },
        ],
      },
      ganttAppearance: {
        nameColumnWidth: "normal",
        activityFontSize: "normal",
        rowDensity: "compact",
        barLabel: "duration",
        colorPreset: "classic",
        weekendShading: true,
        fitToWindow: false,
        timelineDensity: "normal",
        rowGuideLines: true,
      },
      scenarios: [
        {
          ...scenario,
          activities: [
            { ...a1, status: "complete", actualDuration: 5 },
            { ...a2 },
          ],
          dependencies: [
            { fromActivityId: a1.id, toActivityId: a2.id, type: "FS", lagDays: 0 },
          ],
          simulationResults: { id: "sim1" } as SimulationRun,
        },
      ],
    };
  }

  it("mints a new project id distinct from source", () => {
    const source = makeProject();
    const clone = cloneProject(source, "Source (Copy)");
    expect(clone.id).not.toBe(source.id);
    expect(clone.name).toBe("Source (Copy)");
    expect(clone.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it("re-IDs every scenario and every activity", () => {
    const source = makeProject();
    const clone = cloneProject(source, "Source (Copy)");
    const sourceScenario = source.scenarios[0]!;
    const cloneScenario_ = clone.scenarios[0]!;

    expect(cloneScenario_.id).not.toBe(sourceScenario.id);
    for (let i = 0; i < cloneScenario_.activities.length; i++) {
      expect(cloneScenario_.activities[i]!.id).not.toBe(
        sourceScenario.activities[i]!.id
      );
    }
  });

  it("strips simulationResults from every cloned scenario", () => {
    const source = makeProject();
    const clone = cloneProject(source, "Source (Copy)");
    for (const scenario of clone.scenarios) {
      expect(scenario.simulationResults).toBeUndefined();
    }
  });

  it("does not carry the archived flag (clone is unarchived)", () => {
    const source = makeProject();
    expect(source.archived).toBe(true);
    const clone = cloneProject(source, "Source (Copy)");
    expect(clone.archived).toBeUndefined();
  });

  it("preserves cosmetic state (tileColor, target, gantt, calendar)", () => {
    const source = makeProject();
    const clone = cloneProject(source, "Source (Copy)");
    expect(clone.tileColor).toBe(source.tileColor);
    expect(clone.targetFinishDate).toBe(source.targetFinishDate);
    expect(clone.showTargetOnGantt).toBe(source.showTargetOnGantt);
    expect(clone.showActivityIds).toBe(source.showActivityIds);
    expect(clone.ganttAppearance).toEqual(source.ganttAppearance);
    expect(clone.globalCalendarOverride).toEqual(source.globalCalendarOverride);
  });

  it("copies array refs (convertedWorkDays, holidays) instead of aliasing", () => {
    const source = makeProject();
    const clone = cloneProject(source, "Source (Copy)");
    expect(clone.convertedWorkDays).not.toBe(source.convertedWorkDays);
    expect(clone.convertedWorkDays).toEqual(source.convertedWorkDays);
    expect(clone.globalCalendarOverride!.holidays).not.toBe(
      source.globalCalendarOverride!.holidays
    );
  });

  it("remaps dependency endpoints to new activity ids", () => {
    const source = makeProject();
    const clone = cloneProject(source, "Source (Copy)");
    const cloneScenario_ = clone.scenarios[0]!;
    const cloneActivityIds = new Set(cloneScenario_.activities.map((a) => a.id));
    expect(cloneScenario_.dependencies).toHaveLength(1);
    for (const dep of cloneScenario_.dependencies) {
      expect(cloneActivityIds.has(dep.fromActivityId)).toBe(true);
      expect(cloneActivityIds.has(dep.toActivityId)).toBe(true);
    }
  });

  it("does not mutate source", () => {
    const source = makeProject();
    const sourceIdsBefore = source.scenarios[0]!.activities.map((a) => a.id);
    cloneProject(source, "Source (Copy)");
    const sourceIdsAfter = source.scenarios[0]!.activities.map((a) => a.id);
    expect(sourceIdsAfter).toEqual(sourceIdsBefore);
    expect(source.archived).toBe(true);
    expect(source.scenarios[0]!.simulationResults).toBeDefined();
  });
});

describe("addScenarioToProject", () => {
  function buildProjectWith3Scenarios() {
    const project = createProject("Test", "2025-01-06");
    const s2 = createScenario("B", "2025-01-06");
    const s3 = createScenario("C", "2025-01-06");
    return {
      ...project,
      scenarios: [...project.scenarios, s2, s3],
    };
  }

  it("appends to end when insertAtIndex is undefined", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[3]!.id).toBe(newScenario.id);
  });

  it("prepends when insertAtIndex=0", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, 0);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[0]!.id).toBe(newScenario.id);
    expect(updated.scenarios[1]!.name).toBe("Baseline");
    expect(updated.scenarios[2]!.name).toBe("B");
    expect(updated.scenarios[3]!.name).toBe("C");
  });

  it("inserts mid-array at insertAtIndex=middle, preserving neighbors", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, 1);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[0]!.name).toBe("Baseline");
    expect(updated.scenarios[1]!.id).toBe(newScenario.id);
    expect(updated.scenarios[2]!.name).toBe("B");
    expect(updated.scenarios[3]!.name).toBe("C");
  });

  it("appends when insertAtIndex=length", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, project.scenarios.length);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[3]!.id).toBe(newScenario.id);
  });

  it("clamps insertAtIndex=-1 to 0", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, -1);
    expect(updated.scenarios[0]!.id).toBe(newScenario.id);
  });

  it("clamps insertAtIndex>length to length", () => {
    const project = buildProjectWith3Scenarios();
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, project.scenarios.length + 5);
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios[3]!.id).toBe(newScenario.id);
  });

  it("does not mutate the input project's scenarios array", () => {
    const project = buildProjectWith3Scenarios();
    const originalScenariosRef = project.scenarios;
    const originalLength = project.scenarios.length;
    const newScenario = createScenario("New", "2025-01-06");
    const updated = addScenarioToProject(project, newScenario, 1);
    expect(project.scenarios).toBe(originalScenariosRef);
    expect(project.scenarios).toHaveLength(originalLength);
    expect(updated.scenarios).not.toBe(originalScenariosRef);
  });
});

describe("activity mutations", () => {
  it("addActivityToScenario clears simulationResults", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const withResults: Scenario = {
      ...scenario,
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const activity = createActivity("New Task", DEFAULT_SCENARIO_SETTINGS);
    const updated = addActivityToScenario(withResults, activity);
    expect(updated.simulationResults).toBeUndefined();
    expect(updated.activities).toHaveLength(1);
  });

  it("addActivityToScenario re-anchors trailing bands (null anchor) onto the new activity", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", DEFAULT_SCENARIO_SETTINGS);
    const withA1AndTrailingBand: Scenario = {
      ...scenario,
      activities: [a1],
      bands: [
        { id: "b1", name: "Phase 1", insertBeforeActivityId: a1.id },
        { id: "b2", name: "Phase 2", insertBeforeActivityId: null },
      ],
    };
    const a2 = createActivity("Second", DEFAULT_SCENARIO_SETTINGS);
    const updated = addActivityToScenario(withA1AndTrailingBand, a2);
    expect(updated.activities).toEqual([a1, a2]);
    // Existing anchored band unchanged
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(a1.id);
    // Trailing band now anchored to the new activity
    expect(updated.bands![1]!.insertBeforeActivityId).toBe(a2.id);
  });

  it("addActivityToScenario re-anchors orphaned bands (anchor points to non-existent activity) onto the new activity", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", DEFAULT_SCENARIO_SETTINGS);
    const withOrphanBand: Scenario = {
      ...scenario,
      activities: [a1],
      bands: [
        { id: "b1", name: "Stale", insertBeforeActivityId: "deleted-activity-id" },
      ],
    };
    const a2 = createActivity("Second", DEFAULT_SCENARIO_SETTINGS);
    const updated = addActivityToScenario(withOrphanBand, a2);
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(a2.id);
  });

  it("addActivityToScenario does not re-anchor bands already anchored to existing activities", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", DEFAULT_SCENARIO_SETTINGS);
    const a2 = createActivity("Second", DEFAULT_SCENARIO_SETTINGS);
    const withBoth: Scenario = {
      ...scenario,
      activities: [a1, a2],
      bands: [
        { id: "b1", name: "Phase 1", insertBeforeActivityId: a1.id },
        { id: "b2", name: "Phase 2", insertBeforeActivityId: a2.id },
      ],
    };
    const a3 = createActivity("Third", DEFAULT_SCENARIO_SETTINGS);
    const updated = addActivityToScenario(withBoth, a3);
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(a1.id);
    expect(updated.bands![1]!.insertBeforeActivityId).toBe(a2.id);
  });

  it("addActivityToScenario with no bands works unchanged", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const activity = createActivity("Task", DEFAULT_SCENARIO_SETTINGS);
    const updated = addActivityToScenario(scenario, activity);
    expect(updated.activities).toEqual([activity]);
    expect(updated.bands).toEqual([]);
  });

  it("updateActivity clears simulationResults", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const activity = createActivity("Task", scenario.settings);
    const withActivity: Scenario = {
      ...scenario,
      activities: [activity],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const updated = updateActivity(withActivity, activity.id, {
      min: 5,
    });
    expect(updated.simulationResults).toBeUndefined();
    expect(updated.activities[0]!.min).toBe(5);
  });

  it("removeActivityFromScenario clears simulationResults", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const activity = createActivity("Task", scenario.settings);
    const withActivity: Scenario = {
      ...scenario,
      activities: [activity],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const updated = removeActivityFromScenario(withActivity, activity.id);
    expect(updated.simulationResults).toBeUndefined();
    expect(updated.activities).toHaveLength(0);
  });

  it("reorderActivities swaps positions", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const a2 = createActivity("Second", scenario.settings);
    const withActivities: Scenario = {
      ...scenario,
      activities: [a1, a2],
    };
    const reordered = reorderActivities(withActivities, 0, 1);
    expect(reordered.activities[0]!.name).toBe("Second");
    expect(reordered.activities[1]!.name).toBe("First");
  });
});

describe("cloneScenario with bands", () => {
  function makeWithBands(): Scenario {
    const scenario = createScenario("Original", "2025-01-06");
    const a1 = createActivity("Task 1", scenario.settings);
    const a2 = createActivity("Task 2", scenario.settings);
    return {
      ...scenario,
      activities: [a1, a2],
      bands: [
        { id: "b1", name: "Discovery", insertBeforeActivityId: a1.id },
        { id: "b2", name: "Trailing", insertBeforeActivityId: null },
      ],
    };
  }

  it("clones bands with fresh IDs", () => {
    const original = makeWithBands();
    const clone = cloneScenario(original, "Clone");
    expect(clone.bands).toHaveLength(2);
    expect(clone.bands?.[0]?.id).not.toBe(original.bands?.[0]?.id);
    expect(clone.bands?.[1]?.id).not.toBe(original.bands?.[1]?.id);
  });

  it("remaps insertBeforeActivityId through oldToNewId", () => {
    const original = makeWithBands();
    const clone = cloneScenario(original, "Clone");
    const anchoredBand = clone.bands?.find((b) => b.name === "Discovery");
    expect(anchoredBand?.insertBeforeActivityId).toBe(clone.activities[0]!.id);
    expect(anchoredBand?.insertBeforeActivityId).not.toBe(original.activities[0]!.id);
  });

  it("sets insertBeforeActivityId to null when anchor was dropped (dropCompleted)", () => {
    const scenario = createScenario("Original", "2025-01-06");
    const completed = createActivity("Done", scenario.settings);
    const planned = createActivity("Upcoming", scenario.settings);
    const original: Scenario = {
      ...scenario,
      activities: [
        { ...completed, status: "complete", actualDuration: 5 },
        { ...planned, status: "planned" },
      ],
      bands: [
        { id: "b1", name: "Anchored to completed", insertBeforeActivityId: completed.id },
      ],
    };
    const clone = cloneScenario(original, "Clone", { dropCompleted: true });
    expect(clone.activities).toHaveLength(1);
    expect(clone.bands?.[0]?.insertBeforeActivityId).toBeNull();
  });

  it("leaves null anchor as null", () => {
    const original = makeWithBands();
    const clone = cloneScenario(original, "Clone");
    const trailing = clone.bands?.find((b) => b.name === "Trailing");
    expect(trailing?.insertBeforeActivityId).toBeNull();
  });

  it("clones a scenario without bands without error", () => {
    const scenario = createScenario("Original", "2025-01-06");
    const a1 = createActivity("Task 1", scenario.settings);
    const original: Scenario = { ...scenario, activities: [a1] };
    const clone = cloneScenario(original, "Clone");
    expect(clone.bands).toEqual([]);
  });
});

describe("removeActivityFromScenario with bands", () => {
  function setup(): { scenario: Scenario; a1: ReturnType<typeof createActivity>; a2: ReturnType<typeof createActivity>; a3: ReturnType<typeof createActivity> } {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("A1", scenario.settings);
    const a2 = createActivity("A2", scenario.settings);
    const a3 = createActivity("A3", scenario.settings);
    return { scenario, a1, a2, a3 };
  }

  it("re-anchors a band to the next activity after removal", () => {
    const { scenario, a1, a2, a3 } = setup();
    const withBands: Scenario = {
      ...scenario,
      activities: [a1, a2, a3],
      bands: [{ id: "b1", name: "X", insertBeforeActivityId: a2.id }],
    };
    const updated = removeActivityFromScenario(withBands, a2.id);
    expect(updated.bands?.[0]?.insertBeforeActivityId).toBe(a3.id);
  });

  it("returns null anchor when the removed activity was the last", () => {
    const { scenario, a1, a2, a3 } = setup();
    const withBands: Scenario = {
      ...scenario,
      activities: [a1, a2, a3],
      bands: [{ id: "b1", name: "X", insertBeforeActivityId: a3.id }],
    };
    const updated = removeActivityFromScenario(withBands, a3.id);
    expect(updated.bands?.[0]?.insertBeforeActivityId).toBeNull();
  });

  it("returns null anchor when the list becomes empty after removal", () => {
    const { scenario, a1 } = setup();
    const withBands: Scenario = {
      ...scenario,
      activities: [a1],
      bands: [{ id: "b1", name: "X", insertBeforeActivityId: a1.id }],
    };
    const updated = removeActivityFromScenario(withBands, a1.id);
    expect(updated.bands?.[0]?.insertBeforeActivityId).toBeNull();
  });

  it("leaves bands anchored to other activities unaffected", () => {
    const { scenario, a1, a2, a3 } = setup();
    const withBands: Scenario = {
      ...scenario,
      activities: [a1, a2, a3],
      bands: [
        { id: "b1", name: "Anchored to a3", insertBeforeActivityId: a3.id },
        { id: "b2", name: "Trailing", insertBeforeActivityId: null },
      ],
    };
    const updated = removeActivityFromScenario(withBands, a2.id);
    expect(updated.bands?.[0]?.insertBeforeActivityId).toBe(a3.id);
    expect(updated.bands?.[1]?.insertBeforeActivityId).toBeNull();
  });

  it("returns same reference when activity ID not found", () => {
    const { scenario, a1 } = setup();
    const withBands: Scenario = {
      ...scenario,
      activities: [a1],
      bands: [{ id: "b1", name: "X", insertBeforeActivityId: a1.id }],
    };
    const result = removeActivityFromScenario(withBands, "missing");
    expect(result).toBe(withBands);
  });

  it("preserves existing behavior: removes dependencies referencing the activity", () => {
    const { scenario, a1, a2 } = setup();
    const withDeps: Scenario = {
      ...scenario,
      activities: [a1, a2],
      dependencies: [
        { fromActivityId: a1.id, toActivityId: a2.id, type: "FS", lagDays: 0 },
      ],
    };
    const updated = removeActivityFromScenario(withDeps, a2.id);
    expect(updated.dependencies).toEqual([]);
  });

  it("preserves existing behavior: sets simulationResults to undefined", () => {
    const { scenario, a1, a2 } = setup();
    const withResults: Scenario = {
      ...scenario,
      activities: [a1, a2],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const updated = removeActivityFromScenario(withResults, a2.id);
    expect(updated.simulationResults).toBeUndefined();
  });
});
