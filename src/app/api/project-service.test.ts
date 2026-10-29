// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
  insertActivityAfter,
  insertActivityAfterBand,
  patchActivityQualitative,
  reforecastCloneName,
  type CloneOptions,
} from "./project-service";
import type { Activity, Project, Scenario, SimulationRun } from "@domain/models/types";
import { createDistributionForActivity } from "@core/distributions/factory";
import { estimateOrderIssues, logNormalHasNoMean } from "@domain/helpers/estimate-rules";
import * as fc from "fast-check";
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

describe("patchActivityQualitative", () => {
  // createActivity omits notes/checklist/deliverables → all undefined. These
  // ops target ANY activity by id, so the common case is a human-created
  // activity with all three fields undefined; the transform must coalesce, not
  // assume the arrays/string are present.
  function humanActivityScenario() {
    const scenario = createScenario("Test", "2025-01-06");
    const a = createActivity("Task 1", scenario.settings);
    return { scenario: addActivityToScenario(scenario, a), id: a.id };
  }

  it("createActivity omits notes/checklist/deliverables (fixture premise)", () => {
    const { scenario, id } = humanActivityScenario();
    const a = scenario.activities.find((x) => x.id === id)!;
    expect(a.notes).toBeUndefined();
    expect(a.checklist).toBeUndefined();
    expect(a.deliverables).toBeUndefined();
  });

  it("appendNote on undefined notes yields exactly the new text (no 'undefined' prefix)", () => {
    const { scenario, id } = humanActivityScenario();
    const updated = patchActivityQualitative(scenario, id, { op: "appendNote", text: "First note" });
    expect(updated.activities.find((a) => a.id === id)!.notes).toBe("First note");
  });

  it("appendNote separates from existing notes with a blank line", () => {
    const { scenario, id } = humanActivityScenario();
    let s = patchActivityQualitative(scenario, id, { op: "appendNote", text: "First" });
    s = patchActivityQualitative(s, id, { op: "appendNote", text: "Second" });
    expect(s.activities.find((a) => a.id === id)!.notes).toBe("First\n\nSecond");
  });

  it("addChecklistItems on undefined checklist starts a fresh array (no throw)", () => {
    const { scenario, id } = humanActivityScenario();
    const updated = patchActivityQualitative(scenario, id, {
      op: "addChecklistItems",
      items: [{ id: "c1", text: "Do X", completed: false }],
    });
    expect(updated.activities.find((a) => a.id === id)!.checklist).toEqual([
      { id: "c1", text: "Do X", completed: false },
    ]);
  });

  it("addDeliverableItems on undefined deliverables starts a fresh array (no throw)", () => {
    const { scenario, id } = humanActivityScenario();
    const updated = patchActivityQualitative(scenario, id, {
      op: "addDeliverableItems",
      items: [{ id: "d1", text: "Ship Y", completed: false }],
    });
    expect(updated.activities.find((a) => a.id === id)!.deliverables).toEqual([
      { id: "d1", text: "Ship Y", completed: false },
    ]);
  });

  it("toggleChecklistItem flips completed on the matching item", () => {
    const { scenario, id } = humanActivityScenario();
    let s = patchActivityQualitative(scenario, id, {
      op: "addChecklistItems",
      items: [{ id: "c1", text: "Do X", completed: false }],
    });
    s = patchActivityQualitative(s, id, { op: "toggleChecklistItem", itemId: "c1", completed: true });
    expect(s.activities.find((a) => a.id === id)!.checklist![0]!.completed).toBe(true);
  });

  it("toggleDeliverableItem against an undefined array does not throw (coalesces to [])", () => {
    const { scenario, id } = humanActivityScenario();
    const updated = patchActivityQualitative(scenario, id, {
      op: "toggleDeliverableItem",
      itemId: "missing",
      completed: true,
    });
    expect(updated.activities.find((a) => a.id === id)!.deliverables).toEqual([]);
  });

  it("is non-invalidating: preserves simulationResults", () => {
    const { scenario, id } = humanActivityScenario();
    const fakeResults = { id: "sim1" } as unknown as SimulationRun;
    const withResults = { ...scenario, simulationResults: fakeResults };
    const updated = patchActivityQualitative(withResults, id, { op: "appendNote", text: "note" });
    expect(updated.simulationResults).toBe(fakeResults);
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
    // Since v0.76.0 (2026-10-04): a copy keeps its source's seed, so an unchanged copy reproduces its source.
    expect(clone.settings.rngSeed).toBe(original.settings.rngSeed);
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
      showTargetOnGantt: true,
      showActivityIds: true,
      archived: true,
      convertedWorkDays: ["2025-07-04"],
      forcedWorkDays: ["2025-11-27"],
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
          targetFinishDate: "2025-12-31",
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
    expect(clone.scenarios[0]!.targetFinishDate).toBe(source.scenarios[0]!.targetFinishDate);
    expect(clone.showTargetOnGantt).toBe(source.showTargetOnGantt);
    expect(clone.showActivityIds).toBe(source.showActivityIds);
    expect(clone.ganttAppearance).toEqual(source.ganttAppearance);
    expect(clone.globalCalendarOverride).toEqual(source.globalCalendarOverride);
  });

  it("copies array refs (convertedWorkDays, forcedWorkDays, holidays) instead of aliasing", () => {
    const source = makeProject();
    const clone = cloneProject(source, "Source (Copy)");
    expect(clone.convertedWorkDays).not.toBe(source.convertedWorkDays);
    expect(clone.convertedWorkDays).toEqual(source.convertedWorkDays);
    expect(clone.forcedWorkDays).not.toBe(source.forcedWorkDays);
    expect(clone.forcedWorkDays).toEqual(source.forcedWorkDays);
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

  it("keeps every scenario's seed, while every id is new", () => {
    const base = createProject("Source", "2025-01-06");
    const source = addScenarioToProject(base, createScenario("Optimistic", "2025-01-06"));
    const sourceSeeds = source.scenarios.map((s) => s.settings.rngSeed);
    // Two different seeds, so a shared or swapped seed in the copy would show.
    expect(sourceSeeds).toHaveLength(2);
    expect(sourceSeeds[0]).not.toBe(sourceSeeds[1]);

    const clone = cloneProject(source, "Source (Copy)");

    expect(clone.scenarios.map((s) => s.settings.rngSeed)).toEqual(sourceSeeds);
    // Control: the copy is still a new project of new scenarios.
    const sourceIds = new Set([source.id, ...source.scenarios.map((s) => s.id)]);
    expect(sourceIds.has(clone.id)).toBe(false);
    for (const s of clone.scenarios) expect(sourceIds.has(s.id)).toBe(false);
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

describe("insertActivityAfter", () => {
  it("splices the new activity directly after the target index; does not mutate bands; clears simulationResults", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const a2 = createActivity("Second", scenario.settings);
    const a3 = createActivity("Third", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1, a2, a3],
      bands: [
        { id: "b1", name: "Phase 1", insertBeforeActivityId: a1.id },
        { id: "b2", name: "Phase 2", insertBeforeActivityId: a3.id },
      ],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const inserted = createActivity("Mid", scenario.settings);
    const updated = insertActivityAfter(base, inserted, a2.id);
    expect(updated.activities.map((a) => a.id)).toEqual([a1.id, a2.id, inserted.id, a3.id]);
    expect(updated.bands).toBe(base.bands); // band reference unchanged
    expect(updated.simulationResults).toBeUndefined();
  });

  it("falls back to addActivityToScenario semantics on stale afterActivityId: appends AND re-anchors trailing bands", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1],
      bands: [
        { id: "b-anchored", name: "Phase 1", insertBeforeActivityId: a1.id },
        { id: "b-trailing", name: "Phase 2", insertBeforeActivityId: null },
      ],
    };
    const inserted = createActivity("New", scenario.settings);
    const updated = insertActivityAfter(base, inserted, "nonexistent-id");
    // Appended at end
    expect(updated.activities.map((a) => a.id)).toEqual([a1.id, inserted.id]);
    // Anchored band unchanged
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(a1.id);
    // Trailing band re-anchored onto the new activity (load-bearing for the delegation)
    expect(updated.bands![1]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.simulationResults).toBeUndefined();
  });
});

describe("insertActivityAfterBand", () => {
  it("returns null when bandId is not found", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1],
      bands: [{ id: "b1", name: "Phase 1", insertBeforeActivityId: a1.id }],
    };
    const inserted = createActivity("New", scenario.settings);
    expect(insertActivityAfterBand(base, inserted, "unknown")).toBeNull();
  });

  it("anchored path, single band: splices before anchor, re-anchors band onto new activity, clears simulationResults", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const a2 = createActivity("Second", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1, a2],
      bands: [{ id: "b1", name: "Phase 2", insertBeforeActivityId: a2.id }],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const inserted = createActivity("Mid", scenario.settings);
    const updated = insertActivityAfterBand(base, inserted, "b1")!;
    expect(updated.activities.map((a) => a.id)).toEqual([a1.id, inserted.id, a2.id]);
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.simulationResults).toBeUndefined();
  });

  it("anchored multi-band shared anchor, B is first: only B is re-anchored", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const a2 = createActivity("Second", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1, a2],
      bands: [
        { id: "b1", name: "B1", insertBeforeActivityId: a2.id },
        { id: "b2", name: "B2", insertBeforeActivityId: a2.id },
        { id: "b3", name: "B3", insertBeforeActivityId: a2.id },
      ],
    };
    const inserted = createActivity("Mid", scenario.settings);
    const updated = insertActivityAfterBand(base, inserted, "b1")!;
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.bands![1]!.insertBeforeActivityId).toBe(a2.id);
    expect(updated.bands![2]!.insertBeforeActivityId).toBe(a2.id);
  });

  it("anchored multi-band shared anchor, B is middle: only B1 and B are re-anchored", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const a2 = createActivity("Second", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1, a2],
      bands: [
        { id: "b1", name: "B1", insertBeforeActivityId: a2.id },
        { id: "b2", name: "B2", insertBeforeActivityId: a2.id },
        { id: "b3", name: "B3", insertBeforeActivityId: a2.id },
      ],
    };
    const inserted = createActivity("Mid", scenario.settings);
    const updated = insertActivityAfterBand(base, inserted, "b2")!;
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.bands![1]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.bands![2]!.insertBeforeActivityId).toBe(a2.id);
  });

  it("anchored multi-band shared anchor, B is last: all bands in the group are re-anchored", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const a2 = createActivity("Second", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1, a2],
      bands: [
        { id: "b1", name: "B1", insertBeforeActivityId: a2.id },
        { id: "b2", name: "B2", insertBeforeActivityId: a2.id },
        { id: "b3", name: "B3", insertBeforeActivityId: a2.id },
      ],
    };
    const inserted = createActivity("Mid", scenario.settings);
    const updated = insertActivityAfterBand(base, inserted, "b3")!;
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.bands![1]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.bands![2]!.insertBeforeActivityId).toBe(inserted.id);
  });

  it("trailing path, single trailing band: appends activity, re-anchors band, clears simulationResults", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1],
      bands: [{ id: "b1", name: "Trailing", insertBeforeActivityId: null }],
      simulationResults: { id: "sim1" } as SimulationRun,
    };
    const inserted = createActivity("New", scenario.settings);
    const updated = insertActivityAfterBand(base, inserted, "b1")!;
    expect(updated.activities.map((a) => a.id)).toEqual([a1.id, inserted.id]);
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.simulationResults).toBeUndefined();
  });

  it("trailing path, multiple trailing bands, B is not last: only B and bands before it are re-anchored", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1],
      bands: [
        { id: "b1", name: "T1", insertBeforeActivityId: null },
        { id: "b2", name: "T2", insertBeforeActivityId: null },
        { id: "b3", name: "T3", insertBeforeActivityId: null },
      ],
    };
    const inserted = createActivity("New", scenario.settings);
    // Click insert after b2 (index 1)
    const updated = insertActivityAfterBand(base, inserted, "b2")!;
    expect(updated.activities.map((a) => a.id)).toEqual([a1.id, inserted.id]);
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.bands![1]!.insertBeforeActivityId).toBe(inserted.id);
    expect(updated.bands![2]!.insertBeforeActivityId).toBeNull(); // remains trailing
  });

  it("trailing path treats orphan-anchor band identically to null-anchor trailing", () => {
    const scenario = createScenario("Test", "2025-01-06");
    const a1 = createActivity("First", scenario.settings);
    const base: Scenario = {
      ...scenario,
      activities: [a1],
      bands: [{ id: "b1", name: "Orphan", insertBeforeActivityId: "deleted-id" }],
    };
    const inserted = createActivity("New", scenario.settings);
    const updated = insertActivityAfterBand(base, inserted, "b1")!;
    expect(updated.activities.map((a) => a.id)).toEqual([a1.id, inserted.id]);
    expect(updated.bands![0]!.insertBeforeActivityId).toBe(inserted.id);
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

// -- A reforecast copy (WI-139) -----------------------------------------------

/**
 * WI-139 (owner, R601, R605 and R608): Clone Scenario's "Drop completed activities (reforecast)"
 * replans the copy from a "Reforecast from" date, and carries each In Progress activity over as its
 * remaining work — its estimates reduced by the days in its Actual cell (Min never below 1, kept in
 * order), still In Progress, its Actual emptied so the count restarts on the copy's Start Date. With
 * nothing in its Actual cell, its estimates are carried over exactly as they were (R608).
 * Every expected value is written out by hand.
 */
describe("cloneScenario — a reforecast carries In Progress work over as what remains (WI-139)", () => {
  const REFORECAST: CloneOptions = { dropCompleted: true, reforecastFrom: "2026-10-29" };

  /** One scenario starting 2026-09-14; each row 20–30–40 Triangular unless the patch says otherwise. */
  function source(...rows: Partial<Activity>[]): Scenario {
    const s = createScenario("Source", "2026-09-14");
    return {
      ...s,
      activities: rows.map((patch, i) => ({
        ...createActivity(`Row ${i + 1}`, s.settings),
        min: 20, mostLikely: 30, max: 40, ...patch,
      })),
    };
  }
  const inProgress = (done: number | undefined, more: Partial<Activity> = {}): Partial<Activity> => ({
    status: "inProgress", actualDuration: done, ...more,
  });
  const estimate = (a: Activity) => [a.min, a.mostLikely, a.max];
  const firstOf = (s: Scenario) => s.activities[0]!;

  it("case A — 20–30–40 with 10 days done: 10–20–30, still In Progress, its Actual emptied", () => {
    const copy = firstOf(cloneScenario(source(inProgress(10)), "Copy", REFORECAST));
    expect(estimate(copy)).toEqual([10, 20, 30]);
    expect(copy.status).toBe("inProgress");
    expect(copy.actualDuration).toBeUndefined();
  });

  it("case B — 25 days done: 1–5–15, Min held at 1", () => {
    const copy = firstOf(cloneScenario(source(inProgress(25)), "Copy", REFORECAST));
    expect(estimate(copy)).toEqual([1, 5, 15]);
    expect(copy.status).toBe("inProgress");
    expect(copy.actualDuration).toBeUndefined();
  });

  it("case C — 35 days done: 1–1–5, Min held at 1 and Most Likely at Min", () => {
    const copy = firstOf(cloneScenario(source(inProgress(35)), "Copy", REFORECAST));
    expect(estimate(copy)).toEqual([1, 1, 5]);
    expect(copy.status).toBe("inProgress");
  });

  it("an empty Actual cell: nothing to take off, so 20–30–40 is carried over unchanged, still In Progress", () => {
    const copy = firstOf(cloneScenario(source(inProgress(undefined)), "Copy", REFORECAST));
    expect(estimate(copy)).toEqual([20, 30, 40]);
    expect(copy.status).toBe("inProgress");
    expect(copy.actualDuration).toBeUndefined();
  });

  it("an Actual unset or 0: 0–2–5 stays 0–2–5 and an out-of-order 30–20–40 stays 30–20–40 — no clamp acts (R608)", () => {
    for (const done of [undefined, 0]) {
      const s = source(inProgress(done, { min: 0, mostLikely: 2, max: 5 }), inProgress(done, { min: 30, mostLikely: 20, max: 40 }));
      const copy = cloneScenario(s, "Copy", REFORECAST);
      expect(copy.activities.map((a) => [...estimate(a), a.status, a.actualDuration]), String(done)).toEqual([
        [0, 2, 5, "inProgress", undefined],
        [30, 20, 40, "inProgress", undefined],
      ]);
    }
  });

  it("an Actual of 1 on the same two rows: the clamps act — 1–1–4 and 29–29–39", () => {
    const s = source(inProgress(1, { min: 0, mostLikely: 2, max: 5 }), inProgress(1, { min: 30, mostLikely: 20, max: 40 }));
    expect(cloneScenario(s, "Copy", REFORECAST).activities.map(estimate)).toEqual([
      [1, 1, 4],
      [29, 29, 39],
    ]);
  });

  it("done past Max (45 of 20–30–40): 1–1–1, a point mass at 1 for every distribution type, Beta-PERT's Min = Max included", () => {
    for (const distributionType of ["normal", "logNormal", "betaPert", "triangular", "uniform"] as const) {
      const copy = firstOf(cloneScenario(source(inProgress(45, { distributionType })), "Copy", REFORECAST));
      expect(estimate(copy), distributionType).toEqual([1, 1, 1]);
      const dist = createDistributionForActivity(copy);
      expect([dist.inverseCDF(0.05), dist.inverseCDF(0.5), dist.inverseCDF(0.95)], distributionType).toEqual([1, 1, 1]);
    }
  });

  it("Uniform — 25 days done: 1–5–15, and its distribution runs from 1 to 15 (median 8)", () => {
    const copy = firstOf(cloneScenario(source(inProgress(25, { distributionType: "uniform" })), "Copy", REFORECAST));
    expect(estimate(copy)).toEqual([1, 5, 15]);
    const dist = createDistributionForActivity(copy);
    expect([dist.inverseCDF(0), dist.inverseCDF(0.5), dist.inverseCDF(1)]).toEqual([1, 8, 15]);
  });

  it("an sdOverride is carried over as it was (owner, R608: kept)", () => {
    const copy = firstOf(cloneScenario(source(inProgress(25, { distributionType: "normal", sdOverride: 6 })), "Copy", REFORECAST));
    expect(estimate(copy)).toEqual([1, 5, 15]);
    expect(copy.sdOverride).toBe(6);
  });

  it("fractions pass through: 22.5–30–60 with 7 days done is 15.5–23–53", () => {
    const copy = firstOf(cloneScenario(source(inProgress(7, { min: 22.5, mostLikely: 30, max: 60 })), "Copy", REFORECAST));
    expect(estimate(copy)).toEqual([15.5, 23, 53]);
  });

  it("no converted estimate is flagged — in order, Min at least 1, and a LogNormal above zero — and every type takes it", () => {
    const point = fc.integer({ min: 0, max: 200 });
    fc.assert(
      // An Actual of at least 1: with none, the estimate is carried over as it was, flags included (R608).
      fc.property(point, point, point, fc.integer({ min: 1, max: 400 }),
        fc.constantFrom("normal", "logNormal", "betaPert", "triangular", "uniform"),
        (p, q, r, done, distributionType) => {
          const [min, mostLikely, max] = [p, q, r].sort((x, y) => x - y) as [number, number, number];
          const row = inProgress(done, { min, mostLikely, max, distributionType });
          const copy = firstOf(cloneScenario(source(row), "Copy", REFORECAST));
          expect(estimateOrderIssues(copy.min, copy.mostLikely, copy.max)).toEqual([]);
          expect(logNormalHasNoMean(copy.distributionType, copy.min, copy.mostLikely, copy.max)).toBe(false);
          expect(copy.min).toBeGreaterThanOrEqual(1);
          expect(() => createDistributionForActivity(copy)).not.toThrow();
        }),
    );
  });

  it("the copy starts on the reforecast date only with dropCompleted; otherwise, or with no date, on its source's", () => {
    const s = source(inProgress(10));
    expect(cloneScenario(s, "Copy", REFORECAST).startDate).toBe("2026-10-29");
    expect(cloneScenario(s, "Copy", { reforecastFrom: "2026-10-29" }).startDate).toBe("2026-09-14");
    expect(cloneScenario(s, "Copy", { dropCompleted: true }).startDate).toBe("2026-09-14");
    expect(cloneScenario(s, "Copy").startDate).toBe("2026-09-14");
  });

  it("without dropCompleted a copy is exactly as before: an In Progress row keeps its estimate, status and Actual", () => {
    const copy = firstOf(cloneScenario(source(inProgress(25)), "Copy", { reforecastFrom: "2026-10-29" }));
    expect(estimate(copy)).toEqual([20, 30, 40]);
    expect(copy.status).toBe("inProgress");
    expect(copy.actualDuration).toBe(25);
  });

  it("a Complete row is still dropped, and a Planned row keeps its estimate, Planned, with its Actual emptied", () => {
    const s = source({ status: "complete", actualDuration: 12 }, { status: "planned", actualDuration: 3 }, inProgress(10));
    const copy = cloneScenario(s, "Copy", REFORECAST);
    expect(copy.activities.map((a) => a.name)).toEqual(["Row 2", "Row 3"]);
    expect(estimate(copy.activities[0]!)).toEqual([20, 30, 40]);
    expect(copy.activities[0]!.status).toBe("planned");
    expect(copy.activities[0]!.actualDuration).toBeUndefined();
    expect(estimate(copy.activities[1]!)).toEqual([10, 20, 30]);
  });

  it("the proposed name: the day and month of the date in each Date Format, numbered when taken (R608)", () => {
    expect(reforecastCloneName("Baseline", "2026-10-30", ["Baseline"], "MM/DD/YYYY")).toBe("Baseline (Reforecast Oct 30)");
    expect(reforecastCloneName("Baseline", "2026-10-30", ["Baseline"], "DD/MM/YYYY")).toBe("Baseline (Reforecast 30 Oct)");
    expect(reforecastCloneName("Baseline", "2026-10-30", ["Baseline"], "YYYY/MM/DD")).toBe("Baseline (Reforecast Oct 30)");
    expect(reforecastCloneName("Baseline", "2026-11-03", [], "MM/DD/YYYY")).toBe("Baseline (Reforecast Nov 3)");
    expect(reforecastCloneName("Baseline", "2027-01-01", [], "DD/MM/YYYY")).toBe("Baseline (Reforecast 1 Jan)");
    expect(reforecastCloneName("Baseline", "2026-10-30", ["Baseline (Reforecast Oct 30)"], "MM/DD/YYYY")).toBe(
      "Baseline (Reforecast Oct 30 2)"
    );
  });
});
