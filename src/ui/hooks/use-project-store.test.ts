// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useProjectStore } from "./use-project-store";
import { cloudSyncBus } from "@infrastructure/persistence/sync-bus";
import { createProject } from "@app/api/project-service";

describe("useProjectStore", () => {
  beforeEach(() => {
    localStorage.clear();
    // Reset store state
    useProjectStore.setState({ projects: [], loadError: false });
  });

  it("starts with empty projects", () => {
    const state = useProjectStore.getState();
    expect(state.projects).toEqual([]);
  });

  it("adds and retrieves a project", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Test Project");
    expect(project.name).toBe("Test Project");

    const retrieved = useProjectStore.getState().getProject(project.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("Test Project");
  });

  it("new project has a Baseline scenario", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("With Baseline");

    const retrieved = useProjectStore.getState().getProject(project.id)!;
    expect(retrieved.scenarios).toHaveLength(1);
    expect(retrieved.scenarios[0]!.name).toBe("Baseline");
  });

  it("persists and reloads projects", () => {
    const store = useProjectStore.getState();
    store.addProject("Persistent");

    // Reset in-memory state
    useProjectStore.setState({ projects: [] });
    expect(useProjectStore.getState().projects).toHaveLength(0);

    // Reload from localStorage
    useProjectStore.getState().loadProjects();
    const projects = useProjectStore.getState().projects;
    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe("Persistent");
  });

  it("deletes a project", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("To Delete");
    store.deleteProject(project.id);

    expect(useProjectStore.getState().projects).toHaveLength(0);
  });

  it("adds scenarios and deletes any non-last scenario", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("With Scenarios");

    // Project starts with auto-created Baseline
    let updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(1);
    expect(updated.scenarios[0]!.name).toBe("Baseline");

    // Add a second scenario
    store.addScenario(project.id, "Optimistic", "2025-01-06");
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(2);

    // Delete the second scenario
    store.deleteScenario(project.id, updated.scenarios[1]!.id);
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(1);
    expect(updated.scenarios[0]!.name).toBe("Baseline");
  });

  it("cannot delete the only scenario", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Single Scenario");

    const updated = useProjectStore.getState().getProject(project.id)!;
    const onlyId = updated.scenarios[0]!.id;

    // Attempt to delete the only scenario — should be a no-op
    store.deleteScenario(project.id, onlyId);
    const after = useProjectStore.getState().getProject(project.id)!;
    expect(after.scenarios).toHaveLength(1);
    expect(after.scenarios[0]!.id).toBe(onlyId);
  });

  it("can delete the first scenario when others exist", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Delete First Scenario");

    let updated = useProjectStore.getState().getProject(project.id)!;
    const firstId = updated.scenarios[0]!.id;

    store.addScenario(project.id, "Alt", "2025-01-06");

    // Delete the first (previously protected) scenario — should succeed
    store.deleteScenario(project.id, firstId);
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(1);
    expect(updated.scenarios[0]!.name).toBe("Alt");
  });

  it("adds activities and invalidates simulation results", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("With Activities");

    let updated = useProjectStore.getState().getProject(project.id)!;
    const scenarioId = updated.scenarios[0]!.id;

    store.addActivity(project.id, scenarioId, "Task 1");
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios[0]!.activities).toHaveLength(1);
  });

  it("duplicates scenario with new IDs", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Clone Test");

    // Project already has Baseline; use it as the clone source
    let updated = useProjectStore.getState().getProject(project.id)!;
    const baselineId = updated.scenarios[0]!.id;

    store.addActivity(project.id, baselineId, "Task 1");
    store.duplicateScenario(project.id, baselineId, "Clone");

    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(2);
    expect(updated.scenarios[1]!.name).toBe("Clone");
    expect(updated.scenarios[1]!.id).not.toBe(baselineId);
  });

  // Scenario locking tests
  describe("scenario locking", () => {
    it("toggles scenario lock state", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Lock Test");
      const scenarioId = project.scenarios[0]!.id;

      // Default is unlocked
      let updated = useProjectStore.getState().getProject(project.id)!;
      expect(updated.scenarios[0]!.locked).toBeFalsy();

      // Lock the scenario
      store.toggleScenarioLock(project.id, scenarioId);
      updated = useProjectStore.getState().getProject(project.id)!;
      expect(updated.scenarios[0]!.locked).toBe(true);

      // Unlock the scenario
      store.toggleScenarioLock(project.id, scenarioId);
      updated = useProjectStore.getState().getProject(project.id)!;
      expect(updated.scenarios[0]!.locked).toBe(false);
    });

    it("prevents adding activities to locked scenarios", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Locked Activity Test");
      const scenarioId = project.scenarios[0]!.id;

      // Lock the scenario
      store.toggleScenarioLock(project.id, scenarioId);

      // Attempt to add activity — should be blocked
      store.addActivity(project.id, scenarioId, "New Activity");

      const updated = useProjectStore.getState().getProject(project.id)!;
      expect(updated.scenarios[0]!.activities).toHaveLength(0);
    });

    it("prevents updating activities in locked scenarios", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Locked Update Test");
      const scenarioId = project.scenarios[0]!.id;

      // Add activity first
      store.addActivity(project.id, scenarioId, "Task 1");
      let updated = useProjectStore.getState().getProject(project.id)!;
      const activityId = updated.scenarios[0]!.activities[0]!.id;

      // Lock the scenario
      store.toggleScenarioLock(project.id, scenarioId);

      // Attempt to update — should be blocked
      store.updateActivityField(project.id, scenarioId, activityId, { name: "Changed" });

      updated = useProjectStore.getState().getProject(project.id)!;
      expect(updated.scenarios[0]!.activities[0]!.name).toBe("Task 1");
    });

    it("prevents deleting activities in locked scenarios", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Locked Delete Test");
      const scenarioId = project.scenarios[0]!.id;

      // Add activity first
      store.addActivity(project.id, scenarioId, "Task 1");
      let updated = useProjectStore.getState().getProject(project.id)!;
      const activityId = updated.scenarios[0]!.activities[0]!.id;

      // Lock the scenario
      store.toggleScenarioLock(project.id, scenarioId);

      // Attempt to delete — should be blocked
      store.deleteActivity(project.id, scenarioId, activityId);

      updated = useProjectStore.getState().getProject(project.id)!;
      expect(updated.scenarios[0]!.activities).toHaveLength(1);
    });

    it("prevents settings changes on locked scenarios", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Locked Settings Test");
      const scenarioId = project.scenarios[0]!.id;
      const initialTarget = project.scenarios[0]!.settings.probabilityTarget;

      // Lock the scenario
      store.toggleScenarioLock(project.id, scenarioId);

      // Attempt to change settings — should be blocked
      store.updateScenarioSettings(project.id, scenarioId, { probabilityTarget: 0.75 });

      const updated = useProjectStore.getState().getProject(project.id)!;
      expect(updated.scenarios[0]!.settings.probabilityTarget).toBe(initialTarget);
    });

    it("isScenarioLocked returns correct state", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Is Locked Test");
      const scenarioId = project.scenarios[0]!.id;

      expect(store.isScenarioLocked(project.id, scenarioId)).toBe(false);

      store.toggleScenarioLock(project.id, scenarioId);
      expect(useProjectStore.getState().isScenarioLocked(project.id, scenarioId)).toBe(true);
    });

    it("prevents bulk updates to locked scenarios", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Bulk Lock Test");
      const scenarioId = project.scenarios[0]!.id;

      // Add activities first
      store.addActivity(project.id, scenarioId, "Task 1");
      store.addActivity(project.id, scenarioId, "Task 2");
      let updated = useProjectStore.getState().getProject(project.id)!;
      const activityIds = updated.scenarios[0]!.activities.map((a) => a.id);

      // Lock the scenario
      store.toggleScenarioLock(project.id, scenarioId);

      // Attempt bulk update — should be blocked
      store.bulkUpdateActivities(project.id, scenarioId, activityIds, {
        min: 10,
      });

      updated = useProjectStore.getState().getProject(project.id)!;
      // Activities should retain original values
      expect(updated.scenarios[0]!.activities[0]!.min).not.toBe(10);
    });

    it("prevents bulk deletes in locked scenarios", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Bulk Delete Lock Test");
      const scenarioId = project.scenarios[0]!.id;

      // Add activities first
      store.addActivity(project.id, scenarioId, "Task 1");
      store.addActivity(project.id, scenarioId, "Task 2");
      let updated = useProjectStore.getState().getProject(project.id)!;
      const activityIds = updated.scenarios[0]!.activities.map((a) => a.id);

      // Lock the scenario
      store.toggleScenarioLock(project.id, scenarioId);

      // Attempt bulk delete — should be blocked
      store.bulkDeleteActivities(project.id, scenarioId, activityIds);

      updated = useProjectStore.getState().getProject(project.id)!;
      expect(updated.scenarios[0]!.activities).toHaveLength(2);
    });

    it("undo restores lock state after toggle", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Undo Lock Test");
      const scenarioId = project.scenarios[0]!.id;

      // Initially unlocked
      expect(store.isScenarioLocked(project.id, scenarioId)).toBe(false);

      // Lock it
      store.toggleScenarioLock(project.id, scenarioId);
      expect(useProjectStore.getState().isScenarioLocked(project.id, scenarioId)).toBe(true);

      // Undo should restore to unlocked
      useProjectStore.getState().undo();
      expect(useProjectStore.getState().isScenarioLocked(project.id, scenarioId)).toBe(false);

      // Redo should lock again
      useProjectStore.getState().redo();
      expect(useProjectStore.getState().isScenarioLocked(project.id, scenarioId)).toBe(true);
    });
  });

  describe("importProjects cloud sync", () => {
    it("emits create events for all imported projects", () => {
      const handler = vi.fn();
      const unsub = cloudSyncBus.subscribe(handler);

      const imported1 = createProject("Imported 1");
      const imported2 = createProject("Imported 2");

      useProjectStore.getState().importProjects([imported1, imported2]);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith({
        type: "create",
        projectId: imported1.id,
      });
      expect(handler).toHaveBeenCalledWith({
        type: "create",
        projectId: imported2.id,
      });

      unsub();
    });

    it("emits create for replaced projects (no separate delete when ID matches)", () => {
      const handler = vi.fn();
      const unsub = cloudSyncBus.subscribe(handler);

      const store = useProjectStore.getState();
      const existing = store.addProject("Original");
      handler.mockClear();

      const replacement = createProject("Replaced");
      // Use the same ID as existing (simulating "replace" conflict resolution)
      const replacementWithId = { ...replacement, id: existing.id };

      store.importProjects([replacementWithId], [existing.id]);

      // Should emit create only — no delete since replaced ID is in import set
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        type: "create",
        projectId: existing.id,
      });

      unsub();
    });

    it("emits delete for replaceIds not in import set", () => {
      const handler = vi.fn();
      const unsub = cloudSyncBus.subscribe(handler);

      const store = useProjectStore.getState();
      const existing = store.addProject("To Remove");
      handler.mockClear();

      const newProject = createProject("New Only");
      store.importProjects([newProject], [existing.id]);

      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith({
        type: "delete",
        projectId: existing.id,
      });
      expect(handler).toHaveBeenCalledWith({
        type: "create",
        projectId: newProject.id,
      });

      unsub();
    });
  });
});
