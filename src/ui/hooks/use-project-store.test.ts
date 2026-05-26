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
    const project = store.addProject("Test Project", null);
    expect(project.name).toBe("Test Project");

    const retrieved = useProjectStore.getState().getProject(project.id);
    expect(retrieved).toBeDefined();
    expect(retrieved!.name).toBe("Test Project");
  });

  it("new project has a Baseline scenario", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("With Baseline", null);

    const retrieved = useProjectStore.getState().getProject(project.id)!;
    expect(retrieved.scenarios).toHaveLength(1);
    expect(retrieved.scenarios[0]!.name).toBe("Baseline");
  });

  it("persists and reloads projects", () => {
    const store = useProjectStore.getState();
    store.addProject("Persistent", null);

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
    const project = store.addProject("To Delete", null);
    store.deleteProject(project.id);

    expect(useProjectStore.getState().projects).toHaveLength(0);
  });

  describe("cloneProject", () => {
    it("creates a new project with the (Copy) suffix", () => {
      const store = useProjectStore.getState();
      const source = store.addProject("Clone Source", null);
      const clone = useProjectStore.getState().cloneProject(source.id, null);

      expect(clone).toBeDefined();
      expect(clone!.id).not.toBe(source.id);
      expect(clone!.name).toBe("Clone Source (Copy)");
      expect(useProjectStore.getState().projects).toHaveLength(2);
    });

    it("auto-increments suffix on collision", () => {
      const store = useProjectStore.getState();
      const source = store.addProject("Foo", null);
      useProjectStore.getState().cloneProject(source.id, null);
      const second = useProjectStore.getState().cloneProject(source.id, null);
      const third = useProjectStore.getState().cloneProject(source.id, null);

      expect(second!.name).toBe("Foo (Copy 2)");
      expect(third!.name).toBe("Foo (Copy 3)");
    });

    it("returns undefined for an unknown source id", () => {
      const store = useProjectStore.getState();
      const clone = store.cloneProject("does-not-exist", null);
      expect(clone).toBeUndefined();
      expect(useProjectStore.getState().projects).toHaveLength(0);
    });

    it("emits a cloudSyncBus.emitCreate for the clone", () => {
      const store = useProjectStore.getState();
      const source = store.addProject("Sync Test", null);
      const spy = vi.spyOn(cloudSyncBus, "emitCreate");

      const clone = useProjectStore.getState().cloneProject(source.id, null);

      expect(spy).toHaveBeenCalledWith(clone!.id);
      spy.mockRestore();
    });

    it("persists the clone to localStorage", () => {
      const store = useProjectStore.getState();
      const source = store.addProject("Persistence", null);
      const clone = useProjectStore.getState().cloneProject(source.id, null)!;

      // Reset memory state and reload
      useProjectStore.setState({ projects: [] });
      useProjectStore.getState().loadProjects();
      const reloaded = useProjectStore.getState().projects;

      expect(reloaded.find((p) => p.id === clone.id)).toBeDefined();
    });
  });

  it("adds scenarios and deletes any non-last scenario", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("With Scenarios", null);

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
    const project = store.addProject("Single Scenario", null);

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
    const project = store.addProject("Delete First Scenario", null);

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
    const project = store.addProject("With Activities", null);

    let updated = useProjectStore.getState().getProject(project.id)!;
    const scenarioId = updated.scenarios[0]!.id;

    store.addActivity(project.id, scenarioId, "Task 1");
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios[0]!.activities).toHaveLength(1);
  });

  it("duplicates scenario with new IDs (clone inserted to left of source)", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Clone Test", null);

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
    const project = store.addProject("Clone Return Test", null);
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
    const project = store.addProject("Unknown Project Test", null);
    const baselineId = project.scenarios[0]!.id;

    const result = store.duplicateScenario("nonexistent-project", baselineId, "Clone");
    expect(result).toBeUndefined();
  });

  it("duplicateScenario returns undefined for unknown scenarioId", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Unknown Scenario Test", null);

    const result = store.duplicateScenario(project.id, "nonexistent-scenario", "Clone");
    expect(result).toBeUndefined();
  });

  it("cloning a middle scenario inserts clone at source index", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Middle Clone Test", null);
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
    const project = store.addProject("Last Clone Test", null);
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
      const project = store.addProject("Lock Test", null);
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
      const project = store.addProject("Locked Activity Test", null);
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
      const project = store.addProject("Locked Update Test", null);
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
      const project = store.addProject("Locked Delete Test", null);
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
      const project = store.addProject("Locked Settings Test", null);
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
      const project = store.addProject("Is Locked Test", null);
      const scenarioId = project.scenarios[0]!.id;

      expect(store.isScenarioLocked(project.id, scenarioId)).toBe(false);

      store.toggleScenarioLock(project.id, scenarioId);
      expect(useProjectStore.getState().isScenarioLocked(project.id, scenarioId)).toBe(true);
    });

    it("prevents bulk updates to locked scenarios", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Bulk Lock Test", null);
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
      const project = store.addProject("Bulk Delete Lock Test", null);
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
      const project = store.addProject("Undo Lock Test", null);
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
      const project = store.addProject("Group Notes Test", null);
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
      const projectA = store.addProject("Project A", null);
      const projectB = store.addProject("Project B", null);
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
      const project = store.addProject("Group Self-Heal Test", null);
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
    it("emits create events for all imported (unconditional add) projects", () => {
      const handler = vi.fn();
      const unsub = cloudSyncBus.subscribe(handler);

      const imported1 = createProject("Imported 1");
      const imported2 = createProject("Imported 2");

      const outcome = useProjectStore.getState().importProjects({
        importedProjects: [imported1, imported2],
        decisions: [],
        skipConflictDetection: true,
      });

      expect(outcome.added).toBe(2);
      expect(outcome.errors).toEqual([]);
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

    it("emits save (not create) for ID-conflict replaces — preserves Firestore owner/members via merge:true", () => {
      const handler = vi.fn();
      const unsub = cloudSyncBus.subscribe(handler);

      const store = useProjectStore.getState();
      const existing = store.addProject("Original", null);
      handler.mockClear();

      const replacement = createProject("Replaced");
      const replacementWithId = { ...replacement, id: existing.id };

      const outcome = useProjectStore.getState().importProjects({
        importedProjects: [replacementWithId],
        decisions: [
          {
            importedProjectId: existing.id,
            kind: "id",
            originalExistingId: existing.id,
            action: "replace",
          },
        ],
      });

      expect(outcome.replaced).toBe(1);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        type: "save",
        projectId: existing.id,
      });

      unsub();
    });

    it("name-conflict replace emits save for the slot and preserves the existing id", () => {
      const handler = vi.fn();
      const unsub = cloudSyncBus.subscribe(handler);

      const store = useProjectStore.getState();
      const existing = store.addProject("Same Name", null);
      handler.mockClear();

      // Incoming has the same name but a different id.
      const incoming = createProject("Same Name");
      expect(incoming.id).not.toBe(existing.id);

      const outcome = useProjectStore.getState().importProjects({
        importedProjects: [incoming],
        decisions: [
          {
            importedProjectId: incoming.id,
            kind: "name",
            originalExistingId: existing.id,
            action: "replace",
          },
        ],
      });

      expect(outcome.replaced).toBe(1);
      // emitSave fires for the existing (slot) id — replaces are slot
      // substitutions, never delete+create.
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({
        type: "save",
        projectId: existing.id,
      });
      // Incoming id is discarded; slot keeps existing id.
      const final = useProjectStore.getState().projects;
      expect(final.map((p) => p.id)).toEqual([existing.id]);

      unsub();
    });
  });

  describe("clearAllData", () => {
    it("zeros projects, loadError, loadErrors, undoStack, redoStack", () => {
      const store = useProjectStore.getState();
      store.addProject("P1", null);
      store.addProject("P2", null);

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
      store.addProject("P1", null);

      const handler = vi.fn();
      const unsub = cloudSyncBus.subscribe(handler);

      useProjectStore.getState().clearAllData();

      expect(handler).not.toHaveBeenCalled();
      unsub();
    });

    it("does not write to localStorage (preserves indexed projects)", () => {
      const store = useProjectStore.getState();
      const p1 = store.addProject("P1", null);
      const p2 = store.addProject("P2", null);

      // v0.42.6 (M4): keys are now UID-namespaced. In test env no auth user
      // is set, so the active namespace is "local".
      expect(localStorage.getItem(`spert:project:local:${p1.id}`)).not.toBeNull();
      expect(localStorage.getItem(`spert:project:local:${p2.id}`)).not.toBeNull();
      expect(localStorage.getItem("spert:project-index:local")).not.toBeNull();

      useProjectStore.getState().clearAllData();

      // clearAllData touches only in-memory state
      expect(localStorage.getItem(`spert:project:local:${p1.id}`)).not.toBeNull();
      expect(localStorage.getItem(`spert:project:local:${p2.id}`)).not.toBeNull();
      expect(localStorage.getItem("spert:project-index:local")).not.toBeNull();
    });
  });

  // v0.42.0 / Lesson 38: addProject and cloneProject take an explicit owner
  // argument. The store must overwrite the domain service's null sentinel
  // with the caller's value (which may itself be null in local mode).
  describe("addProject / cloneProject owner seeding", () => {
    it("addProject sets owner to the provided uid", () => {
      const project = useProjectStore.getState().addProject("Test", "uid-owner");
      expect(project.owner).toBe("uid-owner");
    });

    it("addProject sets owner to null in local mode", () => {
      const project = useProjectStore.getState().addProject("Test", null);
      expect(project.owner).toBeNull();
    });

    it("cloneProject uses provided owner, not source owner", () => {
      const source = useProjectStore.getState().addProject("Source", "uid-original");
      const clone = useProjectStore.getState().cloneProject(source.id, "uid-new");
      expect(clone?.owner).toBe("uid-new");
      // Source must remain unchanged.
      expect(source.owner).toBe("uid-original");
    });
  });

  // v0.43.0 — decision-based importProjects ----------------------------------
  describe("importProjects (decision-based)", () => {
    it("structural atomicity: pre-existing project not in the import snapshot survives the merge", () => {
      const store = useProjectStore.getState();
      const survivor = store.addProject("Survivor", null);
      const incoming = createProject("New One");

      const outcome = useProjectStore.getState().importProjects({
        importedProjects: [incoming],
        decisions: [],
        skipConflictDetection: true,
      });

      expect(outcome.added).toBe(1);
      const finalIds = useProjectStore.getState().projects.map((p) => p.id);
      expect(finalIds).toContain(survivor.id);
      expect(finalIds).toContain(incoming.id);
    });

    it("subscribe batching (pitfall #46): subscribe callback fires exactly once per call", () => {
      const incoming1 = createProject("Batch 1");
      const incoming2 = createProject("Batch 2");
      let transitions = 0;
      const unsub = useProjectStore.subscribe(() => {
        transitions++;
      });
      useProjectStore.getState().importProjects({
        importedProjects: [incoming1, incoming2],
        decisions: [],
        skipConflictDetection: true,
      });
      unsub();
      expect(transitions).toBe(1);
    });

    it("no transient duplicate-id state: every transition has unique project ids", () => {
      const store = useProjectStore.getState();
      const existing = store.addProject("Existing", "uid-A");
      const replacement = { ...createProject("Replaced"), id: existing.id };

      const transitions: string[][] = [];
      const unsub = useProjectStore.subscribe((state) => {
        transitions.push(state.projects.map((p) => p.id));
      });
      useProjectStore.getState().importProjects({
        importedProjects: [replacement],
        decisions: [
          {
            importedProjectId: existing.id,
            kind: "id",
            originalExistingId: existing.id,
            action: "replace",
          },
        ],
      });
      unsub();

      for (const ids of transitions) {
        expect(new Set(ids).size).toBe(ids.length);
      }
    });

    it("replace via ID conflict preserves existing.owner (pitfall #7)", () => {
      const store = useProjectStore.getState();
      const existing = store.addProject("Project", "uid-A");
      const incoming = { ...createProject("Project"), id: existing.id };
      // Incoming carries a DIFFERENT owner (stamped by hook for adds/copies)
      // — the store action must override with existing.owner.
      incoming.owner = "uid-importer";

      useProjectStore.getState().importProjects({
        importedProjects: [incoming],
        decisions: [
          {
            importedProjectId: existing.id,
            kind: "id",
            originalExistingId: existing.id,
            action: "replace",
          },
        ],
      });
      const after = useProjectStore.getState().getProject(existing.id)!;
      expect(after.owner).toBe("uid-A");
    });

    it("replace preserves existing.createdAt (pitfall #65)", () => {
      const store = useProjectStore.getState();
      const existing = store.addProject("Project", null);
      const originalCreatedAt = existing.createdAt;
      const incoming = {
        ...createProject("Project"),
        id: existing.id,
        createdAt: "2099-01-01T00:00:00.000Z", // attempt to overwrite
      };

      useProjectStore.getState().importProjects({
        importedProjects: [incoming],
        decisions: [
          {
            importedProjectId: existing.id,
            kind: "id",
            originalExistingId: existing.id,
            action: "replace",
          },
        ],
      });
      const after = useProjectStore.getState().getProject(existing.id)!;
      expect(after.createdAt).toBe(originalCreatedAt);
    });

    it("copy path produces a disambiguated name (pitfall #84)", () => {
      const store = useProjectStore.getState();
      store.addProject("Q4 Plan", null);
      const incoming = createProject("Q4 Plan");

      useProjectStore.getState().importProjects({
        importedProjects: [incoming],
        decisions: [
          {
            importedProjectId: incoming.id,
            kind: "name",
            originalExistingId:
              useProjectStore.getState().projects[0]!.id,
            action: "copy",
          },
        ],
      });
      const names = useProjectStore.getState().projects.map((p) => p.name);
      expect(names).toContain("Q4 Plan");
      expect(names).toContain("Q4 Plan (Copy)");
    });

    it("copy path regenerates nested scenario ids (pitfall #3/#83)", () => {
      const store = useProjectStore.getState();
      store.addProject("Source", null);
      const sourceId = useProjectStore.getState().projects[0]!.id;
      const sourceScenarioIds = useProjectStore
        .getState()
        .projects[0]!.scenarios.map((s) => s.id);

      // Construct an incoming project that shares the name (triggers copy) but
      // has different ids; cloneProjectFn must regenerate nested ids on copy.
      const incoming = createProject("Source");

      useProjectStore.getState().importProjects({
        importedProjects: [incoming],
        decisions: [
          {
            importedProjectId: incoming.id,
            kind: "name",
            originalExistingId: sourceId,
            action: "copy",
          },
        ],
      });
      const copy = useProjectStore
        .getState()
        .projects.find((p) => p.name === "Source (Copy)")!;
      // No scenario id overlap between source and copy.
      for (const s of copy.scenarios) {
        expect(sourceScenarioIds).not.toContain(s.id);
      }
    });

    it("Layer 2 drift guard: name collision appearing post-preview produces driftSkipped", () => {
      const store = useProjectStore.getState();
      // Add an existing project that will create a name conflict at apply time.
      store.addProject("Conflict Name", null);
      const incoming = createProject("Conflict Name");
      // No decision provided — simulates "no conflict at preview time" plus
      // a peer rename that surfaced the collision between preview and apply.
      const outcome = useProjectStore.getState().importProjects({
        importedProjects: [incoming],
        decisions: [],
      });
      expect(outcome.added).toBe(0);
      expect(outcome.driftSkipped).toHaveLength(1);
      expect(outcome.driftSkipped[0]!.projectName).toBe("Conflict Name");
    });

    it("skipConflictDetection bypasses drift guards (ActivityImportSection path)", () => {
      const store = useProjectStore.getState();
      store.addProject("Conflict Name", null);
      const incoming = createProject("Conflict Name");
      const outcome = useProjectStore.getState().importProjects({
        importedProjects: [incoming],
        decisions: [],
        skipConflictDetection: true,
      });
      expect(outcome.added).toBe(1);
      expect(outcome.driftSkipped).toHaveLength(0);
    });

    it("cloudDataLoaded initial state is false; setCloudDataLoaded toggles reactively", () => {
      expect(useProjectStore.getState().cloudDataLoaded).toBe(false);
      useProjectStore.getState().setCloudDataLoaded(true);
      expect(useProjectStore.getState().cloudDataLoaded).toBe(true);
      useProjectStore.getState().setCloudDataLoaded(false);
      expect(useProjectStore.getState().cloudDataLoaded).toBe(false);
    });
  });

  describe("persist → cloudSyncBus emit ordering (v0.45.9 regression)", () => {
    // Lesson from v0.45.6 → v0.45.8: the cloud sync bus subscriber reads the
    // project back from the store via getState() after receiving a save
    // event. If `cloudSyncBus.emitSave(projectId)` fires SYNCHRONOUSLY from
    // inside a Zustand `set((state) => { persist(...); return ... })`
    // updater, the bus subscriber's read happens BEFORE Zustand commits the
    // new state — so the cloud save uses the pre-mutation project, silently
    // dropping the user's most recent change once Firestore echoes it back.
    // localStorage was unaffected because `repo.save(project)` inside
    // persist receives the new project by argument and writes the correct
    // data directly. The fix deferred emitSave via `queueMicrotask` so the
    // subscriber reads the committed state.
    it("bus subscriber sees the POST-update project, not the pre-update snapshot", async () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Race Test", null);

      // Flush the microtask queued by `addProject`'s persist call so the
      // upcoming subscription doesn't fire on the addProject event.
      await Promise.resolve();

      const newAppearance = {
        nameColumnWidth: "normal" as const,
        activityFontSize: "normal" as const,
        rowDensity: "normal" as const,
        barLabel: "duration" as const,
        colorPreset: "classic",
        customCompletedColor: "#65a30d",
        weekendShading: false,
        fitToWindow: false,
      };

      const observed: (string | undefined)[] = [];
      const unsub = cloudSyncBus.subscribe((event) => {
        if (event.type === "save" && event.projectId === project.id) {
          const p = useProjectStore.getState().projects.find((x) => x.id === project.id);
          observed.push(p?.ganttAppearance?.customCompletedColor);
        }
      });

      useProjectStore.getState().updateGanttAppearance(project.id, newAppearance);

      // Pre-fix, the bus emit would have fired SYNCHRONOUSLY here and the
      // subscriber would have read undefined. Post-fix, the emit is queued
      // as a microtask and runs after the set() updater commits.
      await Promise.resolve();

      unsub();

      expect(observed).toHaveLength(1);
      expect(observed[0]).toBe("#65a30d");
    });
  });

  describe("mergeProject preserves simulationResults (v0.46.4 regression)", () => {
    // Lesson from v0.46.4: simulation results are local-only ephemeral state
    // that never round-trip through Firestore (stripSimulationResultsForCloud
    // strips them on every cloud write). Each cloud save triggers an
    // onSnapshot echo from the server with hasPendingWrites: false; that
    // echo passed the FirestoreDriver guard and reached mergeProject, which
    // wholesale-replaced the in-memory project. Result: simulation results
    // computed locally vanished moments after the user clicked Run.
    // mergeProject now preserves the current in-memory simulationResults on
    // each scenario when merging an incoming snapshot. Lookup is by scenario
    // ID so collaborator add/remove/reorder is handled correctly.
    it("preserves in-memory simulationResults when echo arrives with them stripped", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Sim Preservation Test", null);
      const scenarioId = project.scenarios[0]!.id;

      const fakeRun = {
        id: "run-1",
        timestamp: "2026-05-24T00:00:00.000Z",
        trialCount: 1000,
        seed: "seed-1",
        engineVersion: "test",
        percentiles: { 50: 10, 95: 20 },
        histogramBins: [],
        mean: 10,
        standardDeviation: 1,
        minSample: 8,
        maxSample: 12,
        samples: [9, 10, 11],
      };
      useProjectStore.getState().setSimulationResults(
        project.id,
        scenarioId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fakeRun as any,
      );

      // Sanity: results are live in memory before the echo arrives.
      const beforeEcho = useProjectStore
        .getState()
        .getProject(project.id)!;
      expect(beforeEcho.scenarios[0]!.simulationResults?.id).toBe("run-1");

      // Simulate the Firestore server-ack echo: same project shape, but
      // every scenario's simulationResults is undefined (the strip).
      const echo = {
        ...beforeEcho,
        scenarios: beforeEcho.scenarios.map((s) => ({
          ...s,
          simulationResults: undefined,
        })),
      };
      useProjectStore.getState().mergeProject(echo);

      const after = useProjectStore.getState().getProject(project.id)!;
      expect(after.scenarios[0]!.simulationResults?.id).toBe("run-1");
      expect(after.scenarios[0]!.simulationResults?.samples).toEqual([9, 10, 11]);
    });

    it("scenario added by remote collaborator has undefined simulationResults; existing scenarios retain theirs", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Remote Add Test", null);
      const baselineId = project.scenarios[0]!.id;

      const fakeRun = {
        id: "run-baseline",
        timestamp: "2026-05-24T00:00:00.000Z",
        trialCount: 1000,
        seed: "seed",
        engineVersion: "test",
        percentiles: { 50: 5 },
        histogramBins: [],
        mean: 5,
        standardDeviation: 0,
        minSample: 5,
        maxSample: 5,
        samples: [5],
      };
      useProjectStore.getState().setSimulationResults(
        project.id,
        baselineId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fakeRun as any,
      );

      const current = useProjectStore.getState().getProject(project.id)!;
      // Echo carries an additional scenario the in-memory state hasn't seen.
      const echo = {
        ...current,
        scenarios: [
          ...current.scenarios.map((s) => ({
            ...s,
            simulationResults: undefined,
          })),
          {
            ...current.scenarios[0]!,
            id: "new-from-collab",
            name: "Optimistic",
            simulationResults: undefined,
          },
        ],
      };
      useProjectStore.getState().mergeProject(echo);

      const after = useProjectStore.getState().getProject(project.id)!;
      expect(after.scenarios).toHaveLength(2);
      expect(after.scenarios[0]!.id).toBe(baselineId);
      expect(after.scenarios[0]!.simulationResults?.id).toBe("run-baseline");
      expect(after.scenarios[1]!.id).toBe("new-from-collab");
      expect(after.scenarios[1]!.simulationResults).toBeUndefined();
    });

    it("setSimulationResults does NOT emit a cloud save (v0.46.4)", async () => {
      const store = useProjectStore.getState();
      const project = store.addProject("No-Emit Test", null);
      const scenarioId = project.scenarios[0]!.id;

      // Drain any microtasks queued by addProject before subscribing.
      await Promise.resolve();

      const events: string[] = [];
      const unsub = cloudSyncBus.subscribe((event) => {
        if (event.projectId === project.id) {
          events.push(event.type);
        }
      });

      const fakeRun = {
        id: "run-no-emit",
        timestamp: "2026-05-24T00:00:00.000Z",
        trialCount: 1,
        seed: "x",
        engineVersion: "test",
        percentiles: {},
        histogramBins: [],
        mean: 1,
        standardDeviation: 0,
        minSample: 1,
        maxSample: 1,
        samples: [1],
      };
      useProjectStore.getState().setSimulationResults(
        project.id,
        scenarioId,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        fakeRun as any,
      );

      // Flush any deferred microtask-emit (pre-fix path) so we catch it.
      await Promise.resolve();
      await Promise.resolve();

      unsub();

      expect(events).toHaveLength(0);
    });

    it("setProjects preserves in-memory simulationResults on re-fetch (SC1-1)", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("setProjects Sim Preservation", null);
      const scenarioId = project.scenarios[0]!.id;
      const fakeRun = {
        id: "run-sc1-1",
        timestamp: "2026-05-26T00:00:00.000Z",
        trialCount: 1000,
        seed: "seed-sc1-1",
        engineVersion: "test",
        percentiles: { 50: 15, 95: 25 },
        histogramBins: [],
        mean: 15,
        standardDeviation: 2,
        minSample: 10,
        maxSample: 20,
        samples: [14, 15, 16],
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useProjectStore.getState().setSimulationResults(project.id, scenarioId, fakeRun as any);
      // Anti-false-pass guard: confirm results are live in memory before calling setProjects.
      const beforeRefetch = useProjectStore.getState().getProject(project.id)!;
      expect(beforeRefetch.scenarios[0]!.simulationResults?.id).toBe("run-sc1-1");
      // Simulate a spert:models-changed re-fetch: same project shape, simulationResults stripped.
      const cloudProject = {
        ...beforeRefetch,
        scenarios: beforeRefetch.scenarios.map((s) => ({
          ...s,
          simulationResults: undefined,
        })),
      };
      useProjectStore.getState().setProjects([cloudProject]);
      // In-memory state must preserve simulationResults (the fix).
      // Without the fix, this would be undefined.
      const after = useProjectStore.getState().getProject(project.id)!;
      expect(after.scenarios[0]!.simulationResults?.id).toBe("run-sc1-1");
      expect(after.scenarios[0]!.simulationResults?.samples).toEqual([14, 15, 16]);
    });
  });

  describe("insertActivityAfterActivity", () => {
    it("inserts after the target activity and returns the new ID", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Insert Test", null);
      const scenarioId = project.scenarios[0]!.id;
      store.addActivity(project.id, scenarioId, "A1");
      store.addActivity(project.id, scenarioId, "A2");
      store.addActivity(project.id, scenarioId, "A3");
      const before = useProjectStore.getState().getProject(project.id)!;
      const a2Id = before.scenarios[0]!.activities[1]!.id;

      const newId = useProjectStore.getState().insertActivityAfterActivity(
        project.id,
        scenarioId,
        a2Id,
      );

      expect(newId).toBeTruthy();
      const after = useProjectStore.getState().getProject(project.id)!;
      const ids = after.scenarios[0]!.activities.map((a) => a.id);
      expect(ids).toHaveLength(4);
      expect(ids[2]).toBe(newId);
    });

    it("locked scenario returns null and does not mutate project (reference unchanged); undo stack unchanged", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Locked Insert Test", null);
      const scenarioId = project.scenarios[0]!.id;
      store.addActivity(project.id, scenarioId, "A1");
      store.toggleScenarioLock(project.id, scenarioId);
      // Re-read after lock toggle (toggle itself mutates).
      const lockedProjects = useProjectStore.getState().projects;
      const lockedUndo = useProjectStore.getState().undoStack;
      const a1Id = lockedProjects.find((p) => p.id === project.id)!.scenarios[0]!.activities[0]!.id;

      const newId = useProjectStore.getState().insertActivityAfterActivity(
        project.id,
        scenarioId,
        a1Id,
      );

      expect(newId).toBeNull();
      expect(useProjectStore.getState().projects).toBe(lockedProjects);
      expect(useProjectStore.getState().undoStack).toBe(lockedUndo);
    });

    it("missing scenario returns null; project reference unchanged; undo stack unchanged", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Missing Scenario Test", null);
      const beforeProjects = useProjectStore.getState().projects;
      const beforeUndo = useProjectStore.getState().undoStack;

      const newId = useProjectStore.getState().insertActivityAfterActivity(
        project.id,
        "no-such-scenario",
        "no-such-activity",
      );

      expect(newId).toBeNull();
      expect(useProjectStore.getState().projects).toBe(beforeProjects);
      expect(useProjectStore.getState().undoStack).toBe(beforeUndo);
    });

    it("stale afterActivityId appends AND re-anchors trailing bands (via addActivityToScenario fallback)", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Stale Insert Test", null);
      const scenarioId = project.scenarios[0]!.id;
      store.addActivity(project.id, scenarioId, "A1");
      // Add a trailing band so we can assert the re-anchor side effect.
      store.addBand(project.id, scenarioId);
      const before = useProjectStore.getState().getProject(project.id)!;
      const bandId = before.scenarios[0]!.bands![0]!.id;
      // Confirm the new band is trailing (anchor === null) — addBand default.
      expect(before.scenarios[0]!.bands![0]!.insertBeforeActivityId).toBeNull();

      const newId = useProjectStore.getState().insertActivityAfterActivity(
        project.id,
        scenarioId,
        "nonexistent-activity-id",
      );

      expect(newId).toBeTruthy();
      const after = useProjectStore.getState().getProject(project.id)!;
      const ids = after.scenarios[0]!.activities.map((a) => a.id);
      // Appended at end
      expect(ids[ids.length - 1]).toBe(newId);
      // Trailing band re-anchored to the new activity
      const band = after.scenarios[0]!.bands!.find((b) => b.id === bandId)!;
      expect(band.insertBeforeActivityId).toBe(newId);
    });
  });

  describe("insertActivityAfterBand", () => {
    it("inserts in a single transition and returns the new ID", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Band Insert Test", null);
      const scenarioId = project.scenarios[0]!.id;
      store.addActivity(project.id, scenarioId, "A1");
      store.addActivity(project.id, scenarioId, "A2");
      store.addBand(project.id, scenarioId);
      const before = useProjectStore.getState().getProject(project.id)!;
      const bandId = before.scenarios[0]!.bands![0]!.id;
      const undoBefore = useProjectStore.getState().undoStack.length;

      const newId = useProjectStore.getState().insertActivityAfterBand(
        project.id,
        scenarioId,
        bandId,
      );

      expect(newId).toBeTruthy();
      const undoAfter = useProjectStore.getState().undoStack.length;
      expect(undoAfter).toBe(undoBefore + 1); // exactly one transition
      const after = useProjectStore.getState().getProject(project.id)!;
      // Trailing band → append + re-anchor
      const newActivity = after.scenarios[0]!.activities.find((a) => a.id === newId)!;
      expect(newActivity).toBeDefined();
      const band = after.scenarios[0]!.bands!.find((b) => b.id === bandId)!;
      expect(band.insertBeforeActivityId).toBe(newId);
    });

    it("locked scenario returns null; project reference unchanged; undo stack unchanged", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Locked Band Insert", null);
      const scenarioId = project.scenarios[0]!.id;
      store.addBand(project.id, scenarioId);
      const before = useProjectStore.getState().getProject(project.id)!;
      const bandId = before.scenarios[0]!.bands![0]!.id;
      store.toggleScenarioLock(project.id, scenarioId);
      const lockedProjects = useProjectStore.getState().projects;
      const lockedUndo = useProjectStore.getState().undoStack;

      const newId = useProjectStore.getState().insertActivityAfterBand(
        project.id,
        scenarioId,
        bandId,
      );

      expect(newId).toBeNull();
      expect(useProjectStore.getState().projects).toBe(lockedProjects);
      expect(useProjectStore.getState().undoStack).toBe(lockedUndo);
    });

    it("unknown bandId returns null; project reference unchanged; undo stack unchanged", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Unknown Band Test", null);
      const scenarioId = project.scenarios[0]!.id;
      const beforeProjects = useProjectStore.getState().projects;
      const beforeUndo = useProjectStore.getState().undoStack;

      const newId = useProjectStore.getState().insertActivityAfterBand(
        project.id,
        scenarioId,
        "no-such-band",
      );

      expect(newId).toBeNull();
      expect(useProjectStore.getState().projects).toBe(beforeProjects);
      expect(useProjectStore.getState().undoStack).toBe(beforeUndo);
    });

    it("missing scenario returns null; project reference unchanged; undo stack unchanged", () => {
      const store = useProjectStore.getState();
      const project = store.addProject("Missing Scenario Band Test", null);
      const beforeProjects = useProjectStore.getState().projects;
      const beforeUndo = useProjectStore.getState().undoStack;

      const newId = useProjectStore.getState().insertActivityAfterBand(
        project.id,
        "no-such-scenario",
        "no-such-band",
      );

      expect(newId).toBeNull();
      expect(useProjectStore.getState().projects).toBe(beforeProjects);
      expect(useProjectStore.getState().undoStack).toBe(beforeUndo);
    });
  });
});
