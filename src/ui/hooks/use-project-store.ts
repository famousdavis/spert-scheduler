// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { create } from "zustand";
import type {
  Project,
  Scenario,
  Activity,
  ActivityBand,
  Calendar,
  ChecklistItem,
  DeliverableItem,
  DependencyType,
  GanttAppearanceSettings,
  Milestone,
  ScenarioSettings,
  SimulationRun,
} from "@domain/models/types";
import {
  createProject,
  cloneProject as cloneProjectFn,
  createScenario,
  addScenarioToProject,
  removeScenarioFromProject,
  updateScenario,
  cloneScenario,
  createActivity,
  addActivityToScenario,
  insertActivityAfter as insertActivityAfterSvc,
  insertActivityAfterBand as insertActivityAfterBandSvc,
  removeActivityFromScenario,
  updateActivity,
  reorderActivities,
  reorderScenarios,
  setGlobalCalendar,
  updateProjectFields as updateProjectFieldsFn,
  renameProject as renameProjectFn,
  renameScenario as renameScenarioFn,
  addDependency as addDependencyFn,
  removeDependency as removeDependencyFn,
  updateDependencyLag as updateDependencyLagFn,
  updateDependencyType as updateDependencyTypeFn,
  removeActivitiesDeps,
  addMilestone as addMilestoneFn,
  removeMilestone as removeMilestoneFn,
  updateMilestone as updateMilestoneFn,
  assignActivityToMilestone as assignActivityToMilestoneFn,
  setActivityStartsAtMilestone as setActivityStartsAtMilestoneFn,
} from "@app/api/project-service";
import {
  addBand as addBandSvc,
  removeBand as removeBandSvc,
  updateBand as updateBandSvc,
  reorderBands as reorderBandsSvc,
  reanchorBandsAfterRemovals,
} from "@app/api/band-service";
import type { CloneOptions } from "@app/api/project-service";
import { generateId } from "@app/api/id";
import {
  LocalStorageRepository,
  type LoadError,
  stripSimulationSamples,
} from "@infrastructure/persistence/local-storage-repository";
import {
  loadPreferences,
} from "@infrastructure/persistence/preferences-repository";
import { cloudSyncBus } from "@infrastructure/persistence/sync-bus";
import { removeLastScenarioId } from "@infrastructure/persistence/scenario-memory";
import {
  normalizeProjectName,
  type ConflictDecision,
  type ImportOutcome,
} from "@app/api/export-import-service";
import { UNDO_STACK_LIMIT } from "@ui/constants";

/**
 * Arguments for the decision-based importProjects store action.
 *
 * Pattern A (decision-based): callers provide imported projects PLUS decisions
 * for any conflicting projects detected at preview time. The store re-detects
 * conflicts at write time (Layer 2) against `state.projects` for drift defense.
 *
 * Pattern B (unconditional add): callers that construct genuinely-new projects
 * with fresh IDs (e.g., ActivityImportSection) pass `skipConflictDetection: true`
 * to bypass the Layer 2 drift guards in the no-decision branch. Pitfall #82.
 *
 * Callers passing both `decisions[]` and `skipConflictDetection: true`
 * simultaneously is unsupported.
 */
export interface ImportApplyParams {
  importedProjects: Project[];
  decisions: ConflictDecision[];
  skipConflictDetection?: boolean;
}

const repo = new LocalStorageRepository();

export type { LoadError };

interface UndoEntry {
  projectId: string;
  snapshot: Project;
}

// Module-scoped commit-based undo grouping. While a group is active for a given
// projectId, repeated pushUndo calls for the same project collapse into one
// snapshot — letting per-keystroke notes edits become a single undo entry.
// Intentionally outside the Zustand store: focus/blur should not trigger
// React re-renders, and group state has no reactive consumers.
let activeUndoGroup: { projectId: string } | null = null;

/**
 * Compute a collision-safe clone name. Returns "{base} (Copy)" if available,
 * otherwise increments to "{base} (Copy 2)", "(Copy 3)", up to 99.
 */
function nextCloneName(base: string, existing: string[]): string {
  const candidate = `${base} (Copy)`;
  if (!existing.includes(candidate)) return candidate;
  for (let i = 2; i <= 99; i++) {
    const c = `${base} (Copy ${i})`;
    if (!existing.includes(c)) return c;
  }
  return `${base} (Copy ${Date.now()})`;
}

/**
 * Helper to find a scenario within the project store.
 * Returns undefined if project or scenario not found.
 */
function findScenario(
  projects: Project[],
  projectId: string,
  scenarioId: string
): Scenario | undefined {
  return projects
    .find((p) => p.id === projectId)
    ?.scenarios.find((s) => s.id === scenarioId);
}

/**
 * Check if a scenario is locked. Used as a guard before mutations.
 * Returns true if the scenario is locked or doesn't exist.
 */
function isLocked(
  projects: Project[],
  projectId: string,
  scenarioId: string
): boolean {
  const scenario = findScenario(projects, projectId, scenarioId);
  return scenario?.locked ?? false;
}

/** Strip simulationResults to save memory in undo snapshots */
function snapshotProject(project: Project): Project {
  return {
    ...project,
    scenarios: project.scenarios.map((s) => ({
      ...s,
      simulationResults: undefined,
    })),
  };
}

/**
 * Build a merged project where each incoming scenario carries over the
 * current in-memory `simulationResults` (matched by scenario ID). Used by
 * `mergeProject` to defend against the cloud-echo race (v0.46.4): Firestore
 * strips simulation results on every write, so every server-ack snapshot
 * delivers `simulationResults: undefined` and would otherwise wipe freshly-
 * computed runs. Pulled out as a module-level helper to keep `mergeProject`'s
 * nested-function depth within lint limits.
 */
function mergeWithLocalSimulationResults(
  incoming: Project,
  current: Project
): Project {
  const priorById = new Map(current.scenarios.map((s) => [s.id, s]));
  return {
    ...incoming,
    scenarios: incoming.scenarios.map((s) => {
      const prior = priorById.get(s.id);
      return prior
        ? { ...s, simulationResults: prior.simulationResults }
        : s;
    }),
  };
}

/** Map over a project list, transforming only the project whose id matches `projectId`. */
function updateProjectInList(
  projects: Project[],
  projectId: string,
  transform: (p: Project) => Project
): Project[] {
  return projects.map((p) => (p.id === projectId ? transform(p) : p));
}

/** Map over a project list, applying a scenario mutation to the matching scenario in the matching project. */
function updateScenarioInList(
  projects: Project[],
  projectId: string,
  scenarioId: string,
  mutation: (s: Scenario) => Scenario
): Project[] {
  return updateProjectInList(projects, projectId, (p) =>
    updateScenario(p, scenarioId, mutation)
  );
}

/** Patch a single activity (by id) within an activities array. */
function patchActivityInList(
  activities: Activity[],
  activityId: string,
  patch: Partial<Activity>
): Activity[] {
  return activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a));
}

/** Remove every occurrence of `value` from an array (undefined → []). */
function filterOut<T>(arr: T[] | undefined, value: T): T[] {
  return (arr ?? []).filter((v) => v !== value);
}

export interface ProjectStore {
  // State
  projects: Project[];
  loadError: boolean;
  loadErrors: LoadError[];

  // Undo/Redo
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  beginUndoGroup: (projectId: string) => void;
  endUndoGroup: () => void;

  // Project CRUD
  loadProjects: () => void;
  /**
   * Create a new project and add it to the store.
   *
   * @param name    Display name.
   * @param owner   Cloud-mode owner uid (current user) or `null` for local
   *                mode. Required so callers must make the local/cloud
   *                decision explicitly — Lesson 38.
   */
  addProject: (name: string, owner: string | null) => Project;
  /**
   * Clone an existing project by id, returning the new project (or undefined
   * if the source id is not found). The new project's `owner` is the
   * caller-supplied value — never copied from source — so a clone in cloud
   * mode is owned by the current user, regardless of who owned the source.
   */
  cloneProject: (sourceId: string, owner: string | null) => Project | undefined;
  deleteProject: (id: string) => void;
  reorderProjects: (fromIndex: number, toIndex: number) => void;
  getProject: (id: string) => Project | undefined;

  // Project fields
  updateProjectField: (
    projectId: string,
    updates: Partial<Pick<Project, "targetFinishDate" | "showTargetOnGantt" | "showActivityIds" | "tileColor">>
  ) => void;
  updateGanttAppearance: (projectId: string, appearance: GanttAppearanceSettings) => void;

  // Rename
  renameProject: (projectId: string, name: string) => void;
  renameScenario: (
    projectId: string,
    scenarioId: string,
    name: string
  ) => void;

  // Bulk
  bulkUpdateActivities: (
    projectId: string,
    scenarioId: string,
    activityIds: string[],
    updates: Partial<Activity>
  ) => void;
  bulkDeleteActivities: (
    projectId: string,
    scenarioId: string,
    activityIds: string[]
  ) => void;

  // Scenario CRUD
  addScenario: (
    projectId: string,
    name: string,
    startDate: string,
    settingsOverrides?: Partial<ScenarioSettings>
  ) => void;
  deleteScenario: (projectId: string, scenarioId: string) => void;
  reorderScenarios: (projectId: string, fromIndex: number, toIndex: number) => void;
  duplicateScenario: (
    projectId: string,
    scenarioId: string,
    newName: string,
    options?: CloneOptions
  ) => string | undefined;
  updateScenarioStartDate: (
    projectId: string,
    scenarioId: string,
    startDate: string
  ) => void;
  updateScenarioSettings: (
    projectId: string,
    scenarioId: string,
    settings: Partial<ScenarioSettings>
  ) => void;

  // Activity CRUD
  addActivity: (projectId: string, scenarioId: string, name: string) => void;
  insertActivityAfterActivity: (
    projectId: string,
    scenarioId: string,
    afterActivityId: string
  ) => string | null;
  insertActivityAfterBand: (
    projectId: string,
    scenarioId: string,
    bandId: string
  ) => string | null;
  duplicateActivity: (
    projectId: string,
    scenarioId: string,
    activityId: string
  ) => void;
  deleteActivity: (
    projectId: string,
    scenarioId: string,
    activityId: string
  ) => void;
  updateActivityField: (
    projectId: string,
    scenarioId: string,
    activityId: string,
    updates: Partial<Activity>
  ) => void;
  updateActivityChecklist: (
    projectId: string,
    scenarioId: string,
    activityId: string,
    checklist: ChecklistItem[] | undefined
  ) => void;
  updateActivityDeliverables: (
    projectId: string,
    scenarioId: string,
    activityId: string,
    deliverables: DeliverableItem[] | undefined
  ) => void;
  updateActivityNotes: (
    projectId: string,
    scenarioId: string,
    activityId: string,
    notes: string | undefined
  ) => void;
  updateScenarioNotes: (
    projectId: string,
    scenarioId: string,
    notes: string | undefined
  ) => void;
  moveActivity: (
    projectId: string,
    scenarioId: string,
    fromIndex: number,
    toIndex: number
  ) => void;

  // Bands (Activity Bands / Section Headers)
  addBand: (projectId: string, scenarioId: string) => void;
  deleteBand: (projectId: string, scenarioId: string, bandId: string) => void;
  updateBand: (
    projectId: string,
    scenarioId: string,
    bandId: string,
    updates: Partial<ActivityBand>
  ) => void;
  reorderWithBands: (
    projectId: string,
    scenarioId: string,
    activities: Activity[],
    bands: ActivityBand[]
  ) => void;

  // Simulation
  setSimulationResults: (
    projectId: string,
    scenarioId: string,
    results: SimulationRun
  ) => void;

  // Calendar
  setProjectCalendar: (
    projectId: string,
    calendar: Calendar | undefined
  ) => void;

  // Converted Work Days
  setConvertedWorkDays: (projectId: string, dates: string[]) => void;
  addConvertedWorkDay: (projectId: string, date: string) => void;
  removeConvertedWorkDay: (projectId: string, date: string) => void;

  // Forced Work Days (global-holiday overrides)
  setForcedWorkDays: (projectId: string, dates: string[]) => void;
  addForcedWorkDay: (projectId: string, date: string) => void;
  removeForcedWorkDay: (projectId: string, date: string) => void;
  removeWorkDayOverride: (projectId: string, date: string) => void;
  upgradeToForcedWorkDay: (projectId: string, date: string) => void;

  // Import
  importProjects: (params: ImportApplyParams) => ImportOutcome;
  importScenarioToProject: (projectId: string, scenario: Scenario) => void;

  // Cloud-data readiness (v0.43.0).
  // True after Firestore's loadAll() completes — distinct from auth-only
  // storageReady. Gates the import file picker and confirm-time check.
  // Pitfalls #88, #89.
  cloudDataLoaded: boolean;
  setCloudDataLoaded: (loaded: boolean) => void;

  // Archive
  archiveProject: (id: string) => void;
  unarchiveProject: (id: string) => void;

  // Dependencies
  addDependency: (
    projectId: string,
    scenarioId: string,
    fromActivityId: string,
    toActivityId: string,
    type?: DependencyType,
    lagDays?: number
  ) => void;
  removeDependency: (
    projectId: string,
    scenarioId: string,
    fromActivityId: string,
    toActivityId: string
  ) => void;
  updateDependencyLag: (
    projectId: string,
    scenarioId: string,
    fromActivityId: string,
    toActivityId: string,
    lagDays: number
  ) => void;
  updateDependencyType: (
    projectId: string,
    scenarioId: string,
    fromActivityId: string,
    toActivityId: string,
    type: DependencyType
  ) => void;

  // Milestones
  addMilestone: (
    projectId: string,
    scenarioId: string,
    name: string,
    targetDate: string
  ) => void;
  removeMilestone: (
    projectId: string,
    scenarioId: string,
    milestoneId: string
  ) => void;
  updateMilestone: (
    projectId: string,
    scenarioId: string,
    milestoneId: string,
    updates: Partial<Omit<Milestone, "id">>
  ) => void;
  assignActivityToMilestone: (
    projectId: string,
    scenarioId: string,
    activityId: string,
    milestoneId: string | null
  ) => void;
  setActivityStartsAtMilestone: (
    projectId: string,
    scenarioId: string,
    activityId: string,
    milestoneId: string | null
  ) => void;

  // Scenario Lock
  toggleScenarioLock: (projectId: string, scenarioId: string) => void;
  isScenarioLocked: (projectId: string, scenarioId: string) => boolean;

  // Cloud sync
  setProjects: (projects: Project[]) => void;
  mergeProject: (project: Project) => void;
  /**
   * Remove a project from the in-memory store and local cache WITHOUT
   * emitting a cloud-sync delete. Used when a Firestore snapshot listener
   * fails with `permission-denied` — the user has lost access on the
   * server side, so we evict the local mirror without trying to write the
   * delete back (which would itself be denied). Strictly analogous to
   * `deleteProject` minus `cloudSyncBus.emitDelete`. (v0.45.3)
   */
  removeProjectLocally: (id: string) => void;
  clearAllData: () => void;

  // Error recovery
  getCorruptedProjectRawData: (id: string) => string | null;
  removeCorruptedProject: (id: string) => void;
}

function persist(projects: Project[], projectId?: string) {
  if (projectId) {
    let project = projects.find((p) => p.id === projectId);
    if (project) {
      // Check if we should strip samples to save storage
      const prefs = loadPreferences();
      if (!prefs.storeFullSimulationData) {
        project = stripSimulationSamples(project);
      }
      repo.save(project);
      // Defer the cloud emit until after the surrounding Zustand `set()`
      // updater returns and commits state. This is load-bearing: the bus
      // subscriber in `use-cloud-sync.ts` reads the project back via
      // `getProject(event.projectId)` → `useProjectStore.getState()` →
      // the CURRENTLY COMMITTED snapshot. If the emit fires synchronously
      // (as it did pre-v0.45.9), it runs while the updater is still
      // executing, so the bus handler reads the PRE-update project and
      // hands that stale snapshot to `driver.save()`. The 200 ms debounce
      // then writes the stale state to Firestore, and the onSnapshot
      // listener echoes that stale state back into local store — silently
      // dropping whatever the user just changed.
      //
      // `queueMicrotask` defers to after the current synchronous run, by
      // which time Zustand has committed; the imperceptible extra tick is
      // immediately consumed by the existing debounce window. `repo.save`
      // above receives `project` by argument, so localStorage stays
      // correct regardless — this is why local-mode never showed the bug.
      queueMicrotask(() => cloudSyncBus.emitSave(projectId));
    }
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  /** Push current project state to undo stack before mutating */
  function pushUndo(projectId: string) {
    // Suppress repeated pushes from the same project while a commit-based
    // group is active — collapses a notes-editing session into one entry.
    if (activeUndoGroup?.projectId === projectId) return;
    const project = get().projects.find((p) => p.id === projectId);
    if (!project) return;
    set((state) => ({
      undoStack: [
        ...state.undoStack.slice(-(UNDO_STACK_LIMIT - 1)),
        { projectId, snapshot: snapshotProject(project) },
      ],
      redoStack: [],
    }));
  }

  /** Lock-guard + undo + set + persist in one call. Used by most scenario mutations. */
  function mutateScenario(
    projectId: string,
    scenarioId: string,
    mutation: (s: Scenario) => Scenario
  ) {
    if (isLocked(get().projects, projectId, scenarioId)) return;
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId
          ? updateScenario(p, scenarioId, mutation)
          : p
      );
      persist(projects, projectId);
      return { projects };
    });
  }

  return {
  projects: [],
  loadError: false,
  loadErrors: [],
  undoStack: [],
  redoStack: [],
  // In-memory only — must reset to false on every page load. Driven by
  // use-cloud-sync.ts; never persisted to localStorage. (Pitfall #88/#89)
  cloudDataLoaded: false,

  setCloudDataLoaded: (loaded) => set({ cloudDataLoaded: loaded }),

  undo: () => {
    // Close any active group before popping so subsequent edits in the same
    // textarea start a fresh group via the defensive onChange wiring.
    activeUndoGroup = null;
    const { undoStack, projects } = get();
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1]!;
    const currentProject = projects.find((p) => p.id === entry.projectId);
    if (!currentProject) return;

    set((state) => ({
      undoStack: state.undoStack.slice(0, -1),
      redoStack: [
        ...state.redoStack,
        { projectId: entry.projectId, snapshot: snapshotProject(currentProject) },
      ],
      projects: state.projects.map((p) =>
        p.id === entry.projectId ? entry.snapshot : p
      ),
    }));
    persist(
      get().projects,
      entry.projectId
    );
  },

  redo: () => {
    activeUndoGroup = null;
    const { redoStack, projects } = get();
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1]!;
    const currentProject = projects.find((p) => p.id === entry.projectId);
    if (!currentProject) return;

    set((state) => ({
      redoStack: state.redoStack.slice(0, -1),
      undoStack: [
        ...state.undoStack,
        { projectId: entry.projectId, snapshot: snapshotProject(currentProject) },
      ],
      projects: state.projects.map((p) =>
        p.id === entry.projectId ? entry.snapshot : p
      ),
    }));
    persist(
      get().projects,
      entry.projectId
    );
  },

  canUndo: () => get().undoStack.length > 0,
  canRedo: () => get().redoStack.length > 0,

  beginUndoGroup: (projectId: string) => {
    if (activeUndoGroup) return;
    pushUndo(projectId);
    activeUndoGroup = { projectId };
  },

  endUndoGroup: () => {
    activeUndoGroup = null;
  },

  loadProjects: () => {
    const ids = repo.list();
    const projects: Project[] = [];
    const errors: LoadError[] = [];

    for (const id of ids) {
      const result = repo.loadWithDiagnostics(id);
      if (result.success) {
        projects.push(result.data);
      } else {
        errors.push(result.error);
      }
    }

    set({ projects, loadError: errors.length > 0, loadErrors: errors });
  },

  addProject: (name, owner) => {
    const prefs = loadPreferences();
    const project = createProject(name, undefined, {
      trialCount: prefs.defaultTrialCount,
      defaultDistributionType: prefs.defaultDistributionType,
      defaultConfidenceLevel: prefs.defaultConfidenceLevel,
      probabilityTarget: prefs.defaultActivityTarget,
      projectProbabilityTarget: prefs.defaultProjectTarget,
      heuristicEnabled: prefs.defaultHeuristicEnabled,
      heuristicMinPercent: prefs.defaultHeuristicMinPercent,
      heuristicMaxPercent: prefs.defaultHeuristicMaxPercent,
      dependencyMode: prefs.defaultDependencyMode,
      parkinsonsLawEnabled: prefs.defaultParkinsonsLawEnabled ?? true,
    });
    project.owner = owner; // null in local mode, current uid in cloud mode (Lesson 38)
    repo.save(project);
    set((state) => ({ projects: [...state.projects, project] }));
    cloudSyncBus.emitCreate(project.id);
    return project;
  },

  cloneProject: (sourceId, owner) => {
    const source = get().projects.find((p) => p.id === sourceId);
    if (!source) return undefined;
    const existingNames = get().projects.map((p) => p.name);
    const newName = nextCloneName(source.name, existingNames);
    const clone = cloneProjectFn(source, newName);
    clone.owner = owner; // never copy source.owner — caller decides (Lesson 38)
    repo.save(clone);
    set((state) => ({ projects: [...state.projects, clone] }));
    cloudSyncBus.emitCreate(clone.id);
    return clone;
  },

  deleteProject: (id: string) => {
    repo.remove(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));
    cloudSyncBus.emitDelete(id);
  },

  reorderProjects: (fromIndex: number, toIndex: number) => {
    set((state) => {
      const projects = [...state.projects];
      const [moved] = projects.splice(fromIndex, 1);
      if (!moved) return state;
      projects.splice(toIndex, 0, moved);
      repo.reorderIndex(projects.map((p) => p.id));
      return { projects };
    });
  },

  getProject: (id: string) => {
    return get().projects.find((p) => p.id === id);
  },

  addScenario: (projectId, name, startDate, settingsOverrides) => {
    pushUndo(projectId);
    const scenario = createScenario(name, startDate, settingsOverrides);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? addScenarioToProject(p, scenario) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  deleteScenario: (projectId, scenarioId) => {
    pushUndo(projectId);
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      // Protect last remaining scenario from deletion
      if ((project?.scenarios.length ?? 0) <= 1) return state;

      const projects = state.projects.map((p) =>
        p.id === projectId ? removeScenarioFromProject(p, scenarioId) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  reorderScenarios: (projectId, fromIndex, toIndex) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? reorderScenarios(p, fromIndex, toIndex) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  duplicateScenario: (projectId, scenarioId, newName, options) => {
    pushUndo(projectId);
    let newCloneId: string | undefined;
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;
      const scenario = project.scenarios.find((s) => s.id === scenarioId);
      if (!scenario) return state;

      const sourceIndex = project.scenarios.findIndex((s) => s.id === scenarioId);
      const clone = cloneScenario(scenario, newName, options);
      newCloneId = clone.id;
      const projects = state.projects.map((p) =>
        p.id === projectId ? addScenarioToProject(p, clone, sourceIndex) : p
      );
      persist(projects, projectId);
      return { projects };
    });
    return newCloneId;
  },

  updateScenarioStartDate: (projectId, scenarioId, startDate) =>
    mutateScenario(projectId, scenarioId, (s) => ({
      ...s,
      startDate,
      simulationResults: undefined,
    })),

  updateScenarioSettings: (projectId, scenarioId, settings) =>
    mutateScenario(projectId, scenarioId, (s) => ({
      ...s,
      settings: { ...s.settings, ...settings },
      simulationResults: undefined,
    })),

  addActivity: (projectId, scenarioId, name) => {
    if (isLocked(get().projects, projectId, scenarioId)) return;
    pushUndo(projectId);
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;
      const scen = project.scenarios.find((s) => s.id === scenarioId);
      if (!scen) return state;

      const activity = createActivity(name, scen.settings);
      const projects = updateScenarioInList(state.projects, projectId, scenarioId, (s) =>
        addActivityToScenario(s, activity)
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  insertActivityAfterActivity: (projectId, scenarioId, afterActivityId) => {
    if (isLocked(get().projects, projectId, scenarioId)) return null;
    // Pre-check scenario existence: `isLocked` returns false for a missing
    // scenario (no `.locked` field), so without this guard mutateScenario would
    // push a phantom undo entry + persist + cloud emit for a no-op.
    if (!findScenario(get().projects, projectId, scenarioId)) return null;
    // `newActivityId` is assigned inside the updater and captured into outer
    // scope so the action can return it. Safe because Zustand invokes the
    // updater synchronously exactly once per `set` call. Reading settings from
    // inside the updater (against fresh `s`) avoids snapshot drift —
    // analogous to how `addActivity` above reads the scenario inside `set`.
    let newActivityId: string | null = null;
    mutateScenario(projectId, scenarioId, (s) => {
      const newActivity = createActivity("", s.settings);
      newActivityId = newActivity.id;
      return insertActivityAfterSvc(s, newActivity, afterActivityId);
    });
    return newActivityId;
  },

  insertActivityAfterBand: (projectId, scenarioId, bandId) => {
    if (isLocked(get().projects, projectId, scenarioId)) return null;
    // Pre-check scenario AND band existence on the current snapshot for an
    // early null return. The updater re-checks against fresh state `s` per the
    // v0.45.9 stale-emit lesson — always recompute inside the updater, not
    // against a captured snapshot.
    const snap = findScenario(get().projects, projectId, scenarioId);
    if (!snap) return null;
    if (!(snap.bands ?? []).some((b) => b.id === bandId)) return null;
    let newActivityId: string | null = null;
    let didInsert = false;
    mutateScenario(projectId, scenarioId, (s) => {
      const newActivity = createActivity("", s.settings);
      const result = insertActivityAfterBandSvc(s, newActivity, bandId);
      if (result === null) return s;
      // If bandId disappeared between the pre-check and this commit (vanishing
      // race), mutateScenario has already pushed an undo entry. The artifact
      // is a stale undo entry restoring identical state; one extra Cmd-Z is
      // required to undo into earlier history. The race window is tiny.
      newActivityId = newActivity.id;
      didInsert = true;
      return result;
    });
    return didInsert ? newActivityId : null;
  },

  duplicateActivity: (projectId, scenarioId, activityId) => {
    if (isLocked(get().projects, projectId, scenarioId)) return;
    pushUndo(projectId);
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;
      const scen = project.scenarios.find((s) => s.id === scenarioId);
      if (!scen) return state;
      const activity = scen.activities.find((a) => a.id === activityId);
      if (!activity) return state;

      // Clone the activity with a new ID and "(copy)" suffix
      const clone: Activity = {
        ...activity,
        id: generateId(),
        name: `${activity.name} (copy)`,
        status: "planned",
        actualDuration: undefined,
        checklist: activity.checklist?.map((item) => ({
          ...item,
          id: generateId(),
        })),
        deliverables: activity.deliverables?.map((item) => ({
          ...item,
          id: generateId(),
        })),
      };

      const projects = updateScenarioInList(state.projects, projectId, scenarioId, (s) =>
        addActivityToScenario(s, clone)
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  deleteActivity: (projectId, scenarioId, activityId) =>
    mutateScenario(projectId, scenarioId, (s) =>
      removeActivityFromScenario(s, activityId)
    ),

  updateActivityField: (projectId, scenarioId, activityId, updates) =>
    mutateScenario(projectId, scenarioId, (s) =>
      updateActivity(s, activityId, updates)
    ),

  updateActivityChecklist: (projectId, scenarioId, activityId, checklist) => {
    if (isLocked(get().projects, projectId, scenarioId)) return;
    pushUndo(projectId);
    set((state) => {
      const projects = updateScenarioInList(state.projects, projectId, scenarioId, (s) => ({
        ...s,
        activities: patchActivityInList(s.activities, activityId, { checklist }),
        // NOTE: simulationResults NOT cleared — checklist is qualitative only
      }));
      persist(projects, projectId);
      return { projects };
    });
  },

  updateActivityDeliverables: (projectId, scenarioId, activityId, deliverables) => {
    if (isLocked(get().projects, projectId, scenarioId)) return;
    pushUndo(projectId);
    set((state) => {
      const projects = updateScenarioInList(state.projects, projectId, scenarioId, (s) => ({
        ...s,
        activities: patchActivityInList(s.activities, activityId, { deliverables }),
        // NOTE: simulationResults NOT cleared — deliverables are qualitative only
      }));
      persist(projects, projectId);
      return { projects };
    });
  },

  updateActivityNotes: (projectId, scenarioId, activityId, notes) => {
    if (isLocked(get().projects, projectId, scenarioId)) return;
    pushUndo(projectId);
    set((state) => {
      const projects = updateScenarioInList(state.projects, projectId, scenarioId, (s) => ({
        ...s,
        activities: patchActivityInList(s.activities, activityId, { notes }),
        // NOTE: simulationResults NOT cleared — notes are qualitative only
      }));
      persist(projects, projectId);
      return { projects };
    });
  },

  updateScenarioNotes: (projectId, scenarioId, notes) => {
    if (isLocked(get().projects, projectId, scenarioId)) return;
    pushUndo(projectId);
    set((state) => {
      const projects = updateScenarioInList(state.projects, projectId, scenarioId, (s) => ({
        ...s,
        notes,
        // NOTE: simulationResults NOT cleared — notes are qualitative only
      }));
      persist(projects, projectId);
      return { projects };
    });
  },

  moveActivity: (projectId, scenarioId, fromIndex, toIndex) =>
    mutateScenario(projectId, scenarioId, (s) =>
      reorderActivities(s, fromIndex, toIndex)
    ),

  addBand: (projectId, scenarioId) =>
    mutateScenario(projectId, scenarioId, (s) => {
      const band: ActivityBand = {
        id: generateId(),
        name: "",
        insertBeforeActivityId: null,
        color: undefined,
      };
      // NOTE: simulationResults NOT cleared — bands are display only.
      return addBandSvc(s, band);
    }),

  deleteBand: (projectId, scenarioId, bandId) =>
    mutateScenario(projectId, scenarioId, (s) =>
      // NOTE: simulationResults NOT cleared — bands are display only.
      removeBandSvc(s, bandId)
    ),

  updateBand: (projectId, scenarioId, bandId, updates) =>
    mutateScenario(projectId, scenarioId, (s) =>
      // NOTE: simulationResults NOT cleared — bands are display only.
      updateBandSvc(s, bandId, updates)
    ),

  reorderWithBands: (projectId, scenarioId, activities, bands) =>
    mutateScenario(projectId, scenarioId, (s) => ({
      ...reorderBandsSvc(s, bands),
      activities,
      // Activity reorder changes schedule order in non-dependency mode.
      // Matches reorderActivities convention — invalidate stale results.
      simulationResults: undefined,
    })),

  setSimulationResults: (projectId, scenarioId, results) => {
    set((state) => {
      const projects = updateScenarioInList(state.projects, projectId, scenarioId, (s) => ({
        ...s,
        simulationResults: results,
      }));
      // Save to localStorage but DO NOT emit a cloud-sync save. Simulation
      // results are stripped on write (stripSimulationResultsForCloud) and
      // never round-trip through Firestore, so a cloud emit here would
      // produce a no-op delta on the server but still trigger an onSnapshot
      // echo that delivers a stripped-results project back to mergeProject
      // — the very race v0.46.4 closes. (mergeProject also defends against
      // this for echoes triggered by other mutations; suppressing the emit
      // here removes the most common trigger.)
      let toCache = projects.find((p) => p.id === projectId);
      if (toCache) {
        const prefs = loadPreferences();
        if (!prefs.storeFullSimulationData) {
          toCache = stripSimulationSamples(toCache);
        }
        repo.save(toCache);
      }
      return { projects };
    });
  },

  setProjectCalendar: (projectId, calendar) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? setGlobalCalendar(p, calendar) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  setConvertedWorkDays: (projectId, dates) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? { ...p, convertedWorkDays: dates } : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  addConvertedWorkDay: (projectId, date) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const existing = p.convertedWorkDays ?? [];
        if (existing.includes(date)) return p;
        return { ...p, convertedWorkDays: [...existing, date].sort() };
      });
      persist(projects, projectId);
      return { projects };
    });
  },

  removeConvertedWorkDay: (projectId, date) => {
    pushUndo(projectId);
    set((state) => {
      const projects = updateProjectInList(state.projects, projectId, (p) => ({
        ...p,
        convertedWorkDays: filterOut(p.convertedWorkDays, date),
      }));
      persist(projects, projectId);
      return { projects };
    });
  },

  setForcedWorkDays: (projectId, dates) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? { ...p, forcedWorkDays: dates } : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  addForcedWorkDay: (projectId, date) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const existing = p.forcedWorkDays ?? [];
        if (existing.includes(date)) return p;
        return { ...p, forcedWorkDays: [...existing, date].sort() };
      });
      persist(projects, projectId);
      return { projects };
    });
  },

  removeForcedWorkDay: (projectId, date) => {
    pushUndo(projectId);
    set((state) => {
      const projects = updateProjectInList(state.projects, projectId, (p) => ({
        ...p,
        forcedWorkDays: filterOut(p.forcedWorkDays, date),
      }));
      persist(projects, projectId);
      return { projects };
    });
  },

  /**
   * Removes a date from both convertedWorkDays and forcedWorkDays in one
   * operation. Used by the unified editor's chip-remove action, which doesn't
   * know or care which array a given chip's date lives in (and, rarely, a
   * hand-edited/imported project could have the same date in both).
   */
  removeWorkDayOverride: (projectId, date) => {
    pushUndo(projectId);
    set((state) => {
      const projects = updateProjectInList(state.projects, projectId, (p) => ({
        ...p,
        convertedWorkDays: filterOut(p.convertedWorkDays, date),
        forcedWorkDays: filterOut(p.forcedWorkDays, date),
      }));
      persist(projects, projectId);
      return { projects };
    });
  },

  /**
   * Moves a date from convertedWorkDays to forcedWorkDays in one operation
   * (one undo frame, one persist). Used only by the chip-level "Convert to
   * forced override" recovery action — the case where a date already in
   * convertedWorkDays later became a global holiday.
   */
  upgradeToForcedWorkDay: (projectId, date) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        const forced = p.forcedWorkDays ?? [];
        return {
          ...p,
          convertedWorkDays: filterOut(p.convertedWorkDays, date),
          forcedWorkDays: forced.includes(date)
            ? forced
            : [...forced, date].sort(),
        };
      });
      persist(projects, projectId);
      return { projects };
    });
  },

  updateProjectField: (projectId, updates) => {
    pushUndo(projectId);
    set((state) => {
      const resolved = { ...updates };
      // Auto-disable Gantt toggle when target date is cleared
      if (resolved.targetFinishDate === null || resolved.targetFinishDate === undefined) {
        if ("targetFinishDate" in resolved) {
          resolved.showTargetOnGantt = false;
        }
      }
      const projects = state.projects.map((p) =>
        p.id === projectId ? updateProjectFieldsFn(p, resolved) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  updateGanttAppearance: (projectId, appearance) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? { ...p, ganttAppearance: appearance } : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  renameProject: (projectId, name) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? renameProjectFn(p, name) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  renameScenario: (projectId, scenarioId, name) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? renameScenarioFn(p, scenarioId, name) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  bulkUpdateActivities: (projectId, scenarioId, activityIds, updates) =>
    mutateScenario(projectId, scenarioId, (s) => ({
      ...s,
      activities: s.activities.map((a) =>
        activityIds.includes(a.id) ? { ...a, ...updates } : a
      ),
      simulationResults: undefined,
    })),

  bulkDeleteActivities: (projectId, scenarioId, activityIds) =>
    mutateScenario(projectId, scenarioId, (s) => {
      const cleaned = removeActivitiesDeps(s, activityIds);
      const survivors = s.activities.filter((a) => !activityIds.includes(a.id));
      const newBands = reanchorBandsAfterRemovals(
        s.bands ?? [],
        new Set(activityIds),
        s.activities, // original list, before filter
        survivors,
      );
      return {
        ...cleaned,
        activities: survivors,
        bands: newBands,
        simulationResults: undefined,
      };
    }),

  importProjects: (params: ImportApplyParams): ImportOutcome => {
    const { importedProjects, decisions, skipConflictDetection = false } = params;

    // Collected inside set() for atomicity; consumed by post-set side effects.
    // Reset at updater entry — React StrictMode invokes the updater twice in dev,
    // so the reset is essential for the second pass to produce a clean outcome.
    let toAdd: Project[] = [];
    let toReplace: Array<{ oldId: string; replacement: Project }> = [];
    let toCopy: Project[] = [];
    const outcome: ImportOutcome = {
      added: 0,
      replaced: 0,
      copied: 0,
      skipped: 0,
      driftSkipped: [],
      errors: [],
    };

    // Build decisions lookup once — O(N) not O(N²).
    const decisionsById = new Map(
      decisions.map((d) => [d.importedProjectId, d])
    );

    set((state) => {
      // SD-1: merge logic inlined here, not extracted as a pure function. See docs/SPEC_DEVIATIONS.md.
      toAdd = [];
      toReplace = [];
      toCopy = [];
      outcome.added = 0;
      outcome.replaced = 0;
      outcome.copied = 0;
      outcome.skipped = 0;
      outcome.driftSkipped = [];
      outcome.errors = [];

      // Layer 2 stale-data guard: read CURRENT state, not preview-time state (pitfall #39).
      const currentById = new Map(state.projects.map((p) => [p.id, p]));
      const currentByNorm = new Map<string, string>(); // normalized name → existing id
      for (const p of state.projects) {
        const norm = normalizeProjectName(p.name);
        if (norm !== "" && !currentByNorm.has(norm)) {
          currentByNorm.set(norm, p.id);
        }
      }

      for (const proj of importedProjects) {
        const decision = decisionsById.get(proj.id);

        if (!decision) {
          // No conflict at preview time. Layer 2 drift guards:
          if (!skipConflictDetection) {
            if (currentById.has(proj.id)) {
              outcome.driftSkipped.push({
                projectName: proj.name,
                reason: "ID conflict appeared after preview opened.",
              });
              continue;
            }
            const nameMatchId = currentByNorm.get(
              normalizeProjectName(proj.name)
            );
            if (nameMatchId) {
              outcome.driftSkipped.push({
                projectName: proj.name,
                reason: "Name conflict appeared after preview opened.",
              });
              continue;
            }
          }
          toAdd.push(proj); // owner already stamped by hook for adds
        } else if (decision.action === "skip") {
          outcome.skipped++;
        } else if (decision.action === "replace") {
          if (decision.kind === "id") {
            const existing = currentById.get(proj.id);
            if (!existing) {
              // ID target deleted. Symmetric SD-2 guard: check for new name collision (pitfall #85).
              const nameMatchId = currentByNorm.get(
                normalizeProjectName(proj.name)
              );
              if (nameMatchId && !skipConflictDetection) {
                outcome.driftSkipped.push({
                  projectName: proj.name,
                  reason:
                    "ID target deleted and name collision appeared — skipped to avoid clobber.",
                });
              } else {
                toAdd.push(proj);
              }
            } else {
              toReplace.push({
                oldId: existing.id,
                replacement: {
                  ...proj,
                  id: existing.id,
                  owner: existing.owner, // preserve identity (pitfall #7)
                  createdAt: existing.createdAt, // preserve identity (pitfall #65)
                  archived: existing.archived ?? false,
                },
              });
            }
          } else {
            // kind === 'name' — pitfall #77 + symmetric pitfall #85
            const nameMatchId = currentByNorm.get(
              normalizeProjectName(proj.name)
            );
            if (!nameMatchId || nameMatchId !== decision.originalExistingId) {
              // Name target gone or changed. Symmetric guard: check for new ID collision.
              if (currentById.has(proj.id) && !skipConflictDetection) {
                outcome.driftSkipped.push({
                  projectName: proj.name,
                  reason:
                    "Name target gone and ID collision appeared — skipped to avoid duplicate.",
                });
              } else {
                toAdd.push(proj);
              }
            } else {
              const existing = currentById.get(nameMatchId)!;
              toReplace.push({
                oldId: existing.id,
                replacement: {
                  ...proj,
                  id: existing.id,
                  owner: existing.owner, // preserve identity (pitfall #7)
                  createdAt: existing.createdAt, // preserve identity (pitfall #65)
                  archived: existing.archived ?? false,
                },
              });
            }
          }
        } else {
          // action === 'copy'
          // Use cloneProjectFn (pitfall #83) — handles all nested ID regeneration via
          // cloneScenario, archived reset, simulationResults drop. Pair with nextCloneName
          // (pitfall #84) for collision-safe naming against CURRENT state.
          const existingNames = state.projects.map((p) => p.name);
          const copyName = nextCloneName(proj.name, existingNames);
          const copy = cloneProjectFn(proj, copyName);
          copy.owner = proj.owner; // copy carries importer-stamped owner from the hook
          toCopy.push(copy);
        }
      }

      const replaceIdSet = new Set(toReplace.map((r) => r.oldId));
      const allNew = [
        ...toAdd,
        ...toReplace.map((r) => r.replacement),
        ...toCopy,
      ];

      return {
        projects: [
          ...state.projects.filter((p) => !replaceIdSet.has(p.id)),
          ...allNew,
        ],
        // Clear undo/redo entries that reference replaced ids — they snapshot stale
        // state that no longer corresponds to a live project (G12).
        undoStack: state.undoStack.filter((e) => !replaceIdSet.has(e.projectId)),
        redoStack: state.redoStack.filter((e) => !replaceIdSet.has(e.projectId)),
      };
    });

    // Side effects (post-set).
    // Zombie session-data defense (pitfall #24): clear stale scenario-memory for ALL paths.
    for (const { oldId } of toReplace) {
      repo.remove(oldId);
      removeLastScenarioId(oldId);
    }
    for (const proj of toAdd) removeLastScenarioId(proj.id);
    for (const proj of toCopy) removeLastScenarioId(proj.id);

    // Save — success counters incremented on actual save, not on intent (pitfall #41).
    for (const proj of toAdd) {
      try {
        repo.save(proj);
        outcome.added++;
      } catch (err) {
        outcome.errors.push({
          projectName: proj.name,
          reason: err instanceof Error ? err.message : "Storage error",
        });
      }
    }
    for (const { replacement } of toReplace) {
      try {
        repo.save(replacement);
        outcome.replaced++;
      } catch (err) {
        outcome.errors.push({
          projectName: replacement.name,
          reason: err instanceof Error ? err.message : "Storage error",
        });
      }
    }
    for (const proj of toCopy) {
      try {
        repo.save(proj);
        outcome.copied++;
      } catch (err) {
        outcome.errors.push({
          projectName: proj.name,
          reason: err instanceof Error ? err.message : "Storage error",
        });
      }
    }

    // Cloud sync routing:
    //   add/copy → emitCreate (driver.create sets owner/members from uid).
    //   replace  → emitSave   (driver.save merge:true preserves Firestore owner/members — pitfall #7).
    // Fire-and-forget; driver.onSaveError surfaces failures via toast.
    for (const proj of toAdd) cloudSyncBus.emitCreate(proj.id);
    for (const { replacement } of toReplace) {
      cloudSyncBus.emitSave(replacement.id);
    }
    for (const proj of toCopy) cloudSyncBus.emitCreate(proj.id);

    return outcome;
  },

  importScenarioToProject: (projectId, scenario) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? addScenarioToProject(p, scenario) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  archiveProject: (id: string) => {
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === id ? { ...p, archived: true } : p
      );
      persist(projects, id);
      return { projects };
    });
  },

  unarchiveProject: (id: string) => {
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === id ? { ...p, archived: false } : p
      );
      persist(projects, id);
      return { projects };
    });
  },

  setProjects: (projects: Project[]) => {
    activeUndoGroup = null;
    // Sync to localStorage. Intentionally uses the Firestore-delivered `projects`
    // (simulationResults stripped), not the in-memory-merged version built below —
    // localStorage mirrors Firestore state, not UI-ephemeral computation results.
    for (const project of projects) {
      repo.save(project);
    }
    repo.reorderIndex(projects.map((p) => p.id));
    set((state) => {
      // Preserve in-memory simulationResults for projects already in the store (v0.47.0 SC1-1).
      // Firestore delivers projects with simulationResults stripped; a spert:models-changed
      // re-fetch (invitation claim) would otherwise wipe a freshly-computed run the user is
      // actively viewing. Applies mergeWithLocalSimulationResults — the same helper used by
      // mergeProject since v0.46.4 — per project, falling back to the Firestore-delivered
      // version for projects not yet in memory.
      //
      // At initial cloud load, state.projects already contains localStorage-restored projects
      // (loadProjects() runs from page-mount useEffects before driver.loadAll() resolves).
      // The merge also preserves any session-cached simulation results from those restored
      // projects, which is desirable. The spert:models-changed re-fetch path benefits most
      // in practice, as it can fire while freshly-computed (in-session) results are live.
      const inMemoryById = new Map(state.projects.map((p) => [p.id, p]));
      const merged = projects.map((p) => {
        const existing = inMemoryById.get(p.id);
        return existing ? mergeWithLocalSimulationResults(p, existing) : p;
      });
      return { projects: merged, loadError: false, loadErrors: [], undoStack: [], redoStack: [] };
    });
  },

  mergeProject: (project: Project) => {
    set((state) => {
      // Simulation results are local-only ephemeral state — we never accept
      // them from a Firestore snapshot. The strip on write
      // (stripSimulationResultsForCloud) means every cloud echo reports
      // undefined; preserve in-memory values to avoid wiping a freshly-
      // computed run. See mergeWithLocalSimulationResults helper above.
      const existing = state.projects.find((p) => p.id === project.id);
      const merged = existing
        ? mergeWithLocalSimulationResults(project, existing)
        : project;
      const projects = existing
        ? state.projects.map((p) => (p.id === project.id ? merged : p))
        : [...state.projects, merged];
      return { projects };
    });
    // Update localStorage cache. Note: pass the original `project`, not the
    // sim-results-preserved version — localStorage reflects the snapshot as
    // delivered (the preservation above is a UI-state concern, not a
    // persistence one — `repo.save` already respects storeFullSimulationData
    // for its own strip).
    repo.save(project);
  },

  // v0.45.3 — strictly analogous to deleteProject minus the
  // cloudSyncBus.emitDelete call. Called when a Firestore snapshot
  // listener fails with permission-denied (membership revoked server-side).
  // We must NOT emit a cloud delete: the user has already lost write
  // access, and the emit would surface as a noisy PERMISSION_DENIED toast.
  removeProjectLocally: (id: string) => {
    repo.remove(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));
  },

  clearAllData: () => {
    activeUndoGroup = null;
    set({
      projects: [],
      loadError: false,
      loadErrors: [],
      undoStack: [],
      redoStack: [],
    });
  },

  getCorruptedProjectRawData: (id: string) => {
    return repo.getRawData(id);
  },

  removeCorruptedProject: (id: string) => {
    repo.removeById(id);
    set((state) => ({
      loadErrors: state.loadErrors.filter((e) => e.projectId !== id),
      loadError: state.loadErrors.filter((e) => e.projectId !== id).length > 0,
    }));
  },

  addDependency: (projectId, scenarioId, fromActivityId, toActivityId, type, lagDays) =>
    mutateScenario(projectId, scenarioId, (s) =>
      addDependencyFn(s, fromActivityId, toActivityId, type, lagDays)
    ),

  removeDependency: (projectId, scenarioId, fromActivityId, toActivityId) =>
    mutateScenario(projectId, scenarioId, (s) =>
      removeDependencyFn(s, fromActivityId, toActivityId)
    ),

  updateDependencyLag: (projectId, scenarioId, fromActivityId, toActivityId, lagDays) =>
    mutateScenario(projectId, scenarioId, (s) =>
      updateDependencyLagFn(s, fromActivityId, toActivityId, lagDays)
    ),

  updateDependencyType: (projectId, scenarioId, fromActivityId, toActivityId, type) =>
    mutateScenario(projectId, scenarioId, (s) =>
      updateDependencyTypeFn(s, fromActivityId, toActivityId, type)
    ),

  addMilestone: (projectId, scenarioId, name, targetDate) =>
    mutateScenario(projectId, scenarioId, (s) =>
      addMilestoneFn(s, name, targetDate)
    ),

  removeMilestone: (projectId, scenarioId, milestoneId) =>
    mutateScenario(projectId, scenarioId, (s) =>
      removeMilestoneFn(s, milestoneId)
    ),

  updateMilestone: (projectId, scenarioId, milestoneId, updates) =>
    mutateScenario(projectId, scenarioId, (s) =>
      updateMilestoneFn(s, milestoneId, updates)
    ),

  assignActivityToMilestone: (projectId, scenarioId, activityId, milestoneId) =>
    mutateScenario(projectId, scenarioId, (s) =>
      assignActivityToMilestoneFn(s, activityId, milestoneId)
    ),

  setActivityStartsAtMilestone: (projectId, scenarioId, activityId, milestoneId) =>
    mutateScenario(projectId, scenarioId, (s) =>
      setActivityStartsAtMilestoneFn(s, activityId, milestoneId)
    ),

  toggleScenarioLock: (projectId, scenarioId) => {
    pushUndo(projectId);
    set((state) => {
      const projects = updateScenarioInList(state.projects, projectId, scenarioId, (s) => ({
        ...s,
        locked: !s.locked,
      }));
      persist(projects, projectId);
      return { projects };
    });
  },

  isScenarioLocked: (projectId, scenarioId) => {
    return isLocked(get().projects, projectId, scenarioId);
  },
};});
