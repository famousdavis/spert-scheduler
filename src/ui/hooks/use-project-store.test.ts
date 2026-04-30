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

  it("duplicates scenario with new IDs (clone inserted to left of source)", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Clone Test");

    // Project already has Baseline; use it as the clone source
    let updated = useProjectStore.getState().getProject(project.id)!;
    const baselineId = updated.scenarios[0]!.id;

    store.addActivity(project.id, baselineId, "Task 1");
    store.duplicateScenario(project.id, baselineId, "Clone");

    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(2);
    // Clone is inserted at the source index (0), pushing original to index 1
    expect(updated.scenarios[0]!.name).toBe("Clone");
    expect(updated.scenarios[0]!.id).not.toBe(baselineId);
    expect(updated.scenarios[1]!.id).toBe(baselineId);
  });

  it("duplicateScenario returns the new clone's ID", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Clone Return Test");
    const updated = useProjectStore.getState().getProject(project.id)!;
    const baselineId = updated.scenarios[0]!.id;

    const newId = store.duplicateScenario(project.id, baselineId, "Clone");

    expect(typeof newId).toBe("string");
    expect(newId).toBeTruthy();
    expect(newId).not.toBe(baselineId);
    const after = useProjectStore.getState().getProject(project.id)!;
    expect(after.scenarios[0]!.id).toBe(newId);
  });

  it("duplicateScenario returns undefined for unknown projectId", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Unknown Project Test");
    const baselineId = project.scenarios[0]!.id;

    const result = store.duplicateScenario("nonexistent-project", baselineId, "Clone");
    expect(result).toBeUndefined();
  });

  it("duplicateScenario returns undefined for unknown scenarioId", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Unknown Scenario Test");

    const result = store.duplicateScenario(project.id, "nonexistent-scenario", "Clone");
    expect(result).toBeUndefined();
  });

  it("cloning a middle scenario inserts clone at source index", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Middle Clone Test");
    // Project starts with Baseline; add A and B
    store.addScenario(project.id, "A", "2025-01-06");
    store.addScenario(project.id, "B", "2025-01-06");

    let updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios.map((s) => s.name)).toEqual(["Baseline", "A", "B"]);
    const aId = updated.scenarios[1]!.id;

    const cloneId = store.duplicateScenario(project.id, aId, "A_clone");
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios.map((s) => s.name)).toEqual([
      "Baseline",
      "A_clone",
      "A",
      "B",
    ]);
    expect(updated.scenarios[1]!.id).toBe(cloneId);
    expect(updated.scenarios[2]!.id).toBe(aId);
  });

  it("cloning the last scenario places clone at length-2", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Last Clone Test");
    store.addScenario(project.id, "A", "2025-01-06");
    store.addScenario(project.id, "B", "2025-01-06");

    let updated = useProjectStore.getState().getProject(project.id)!;
    const bId = updated.scenarios[2]!.id;

    const cloneId = store.duplicateScenario(project.id, bId, "B_clone");
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(4);
    expect(updated.scenarios.map((s) => s.name)).toEqual([
      "Baseline",
      "A",
      "B_clone",
      "B",
    ]);
    expect(updated.scenarios[2]!.id).toBe(cloneId);
    expect(updated.scenarios[3]!.id).toBe(bId);
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

  describe("undo grouping (commit-based)", () => {
    it("collapses repeated scenario notes updates into a single undo entry", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Group Notes Test");
      const scenarioId = project.scenarios[0]!.id;
      const baselineUndoLen = useProjectStore.getState().undoStack.length;

      useProjectStore.getState().beginUndoGroup(project.id);
      // Simulate 5 keystrokes — each calls updateScenarioNotes individually.
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "h");
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "he");
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "hel");
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "hell");
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "hello");
      useProjectStore.getState().endUndoGroup();

      // Exactly one new entry — the pre-edit snapshot pushed by beginUndoGroup.
      expect(useProjectStore.getState().undoStack.length).toBe(baselineUndoLen + 1);

      // Stored notes reflect the final keystroke.
      const stored = useProjectStore.getState().getProject(project.id)!;
      expect(stored.scenarios[0]!.notes).toBe("hello");

      // One undo reverts the entire edit.
      useProjectStore.getState().undo();
      const reverted = useProjectStore.getState().getProject(project.id)!;
      expect(reverted.scenarios[0]!.notes).toBeUndefined();
    });

    it("does not suppress mutations on a different project while a group is active", () => {
      const store = useProjectStore.getState();
      const projectA = store.addProject("Project A");
      const projectB = store.addProject("Project B");
      const baselineLen = useProjectStore.getState().undoStack.length;

      useProjectStore.getState().beginUndoGroup(projectA.id);
      // Mutate A — this should also push (the begin's own pre-edit snapshot).
      useProjectStore
        .getState()
        .updateScenarioNotes(projectA.id, projectA.scenarios[0]!.id, "a-edit");
      // Mutate B — different project, must not be suppressed.
      useProjectStore
        .getState()
        .updateScenarioNotes(projectB.id, projectB.scenarios[0]!.id, "b-edit");
      useProjectStore.getState().endUndoGroup();

      // baseline + 1 (begin pushed for A) + 1 (B's mutation pushed normally).
      expect(useProjectStore.getState().undoStack.length).toBe(baselineLen + 2);

      const top = useProjectStore.getState().undoStack[
        useProjectStore.getState().undoStack.length - 1
      ]!;
      expect(top.projectId).toBe(projectB.id);
    });

    it("re-establishes the group when typing resumes after a mid-edit undo", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Group Self-Heal Test");
      const scenarioId = project.scenarios[0]!.id;
      const baselineLen = useProjectStore.getState().undoStack.length;

      // First group: type "abc".
      useProjectStore.getState().beginUndoGroup(project.id);
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "a");
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "ab");
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "abc");
      // Mid-edit undo (simulates Ctrl+Z while still focused) — closes group + pops.
      useProjectStore.getState().undo();
      // Continued typing — onChange wrapper calls beginUndoGroup before each update.
      useProjectStore.getState().beginUndoGroup(project.id);
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "x");
      useProjectStore.getState().beginUndoGroup(project.id);
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "xy");
      useProjectStore.getState().beginUndoGroup(project.id);
      useProjectStore.getState().updateScenarioNotes(project.id, scenarioId, "xyz");
      useProjectStore.getState().endUndoGroup();

      // After undo: undoStack returned to baselineLen.
      // Second group beginUndoGroup pushed exactly one new snapshot (post-undo state).
      // Subsequent updates suppressed by guard.
      expect(useProjectStore.getState().undoStack.length).toBe(baselineLen + 1);

      const stored = useProjectStore.getState().getProject(project.id)!;
      expect(stored.scenarios[0]!.notes).toBe("xyz");

      // One undo reverts the second batch entirely.
      useProjectStore.getState().undo();
      const reverted = useProjectStore.getState().getProject(project.id)!;
      expect(reverted.scenarios[0]!.notes).toBeUndefined();
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

  describe("clearAllData", () => {
    it("zeros projects, loadError, loadErrors, undoStack, redoStack", () => {
      const store = useProjectStore.getState();
      store.addProject("P1");
      store.addProject("P2");

      // Synthesise undo/redo/error state
      useProjectStore.setState({
        loadError: true,
        loadErrors: [
          {
            projectId: "x",
            type: "validation",
            message: "bad",
          },
        ],
        undoStack: [
          { projectId: "x", snapshot: useProjectStore.getState().projects[0]! },
        ],
        redoStack: [
          { projectId: "x", snapshot: useProjectStore.getState().projects[0]! },
        ],
      });

      useProjectStore.getState().clearAllData();

      const state = useProjectStore.getState();
      expect(state.projects).toEqual([]);
      expect(state.loadError).toBe(false);
      expect(state.loadErrors).toEqual([]);
      expect(state.undoStack).toEqual([]);
      expect(state.redoStack).toEqual([]);
    });

    it("does not emit cloudSyncBus events", () => {
      const store = useProjectStore.getState();
      store.addProject("P1");

      const handler = vi.fn();
      const unsub = cloudSyncBus.subscribe(handler);

      useProjectStore.getState().clearAllData();

      expect(handler).not.toHaveBeenCalled();
      unsub();
    });

    it("does not write to localStorage (preserves indexed projects)", () => {
      const store = useProjectStore.getState();
      const p1 = store.addProject("P1");
      const p2 = store.addProject("P2");

      // Confirm localStorage was populated by addProject
      expect(localStorage.getItem(`spert:project:${p1.id}`)).not.toBeNull();
      expect(localStorage.getItem(`spert:project:${p2.id}`)).not.toBeNull();
      expect(localStorage.getItem("spert:project-index")).not.toBeNull();

      useProjectStore.getState().clearAllData();

      // clearAllData touches only in-memory state
      expect(localStorage.getItem(`spert:project:${p1.id}`)).not.toBeNull();
      expect(localStorage.getItem(`spert:project:${p2.id}`)).not.toBeNull();
      expect(localStorage.getItem("spert:project-index")).not.toBeNull();
    });
  });
});
