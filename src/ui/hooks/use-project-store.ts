// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { create } from "zustand";
import type {
  Project,
  Scenario,
  Activity,
  Calendar,
  DependencyType,
  Milestone,
  ScenarioSettings,
  SimulationRun,
} from "@domain/models/types";
import {
  createProject,
  createScenario,
  addScenarioToProject,
  removeScenarioFromProject,
  updateScenario,
  cloneScenario,
  createActivity,
  addActivityToScenario,
  removeActivityFromScenario,
  updateActivity,
  reorderActivities,
  setGlobalCalendar,
  renameProject as renameProjectFn,
  renameScenario as renameScenarioFn,
  addDependency as addDependencyFn,
  removeDependency as removeDependencyFn,
  updateDependencyLag as updateDependencyLagFn,
  removeActivitiesDeps,
  addMilestone as addMilestoneFn,
  removeMilestone as removeMilestoneFn,
  updateMilestone as updateMilestoneFn,
  assignActivityToMilestone as assignActivityToMilestoneFn,
  setActivityStartsAtMilestone as setActivityStartsAtMilestoneFn,
} from "@app/api/project-service";
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
import { UNDO_STACK_LIMIT } from "@ui/constants";

const repo = new LocalStorageRepository();

export type { LoadError };

interface UndoEntry {
  projectId: string;
  snapshot: Project;
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

  // Project CRUD
  loadProjects: () => void;
  addProject: (name: string) => Project;
  deleteProject: (id: string) => void;
  reorderProjects: (fromIndex: number, toIndex: number) => void;
  getProject: (id: string) => Project | undefined;

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
  duplicateScenario: (
    projectId: string,
    scenarioId: string,
    newName: string,
    options?: CloneOptions
  ) => void;
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
  moveActivity: (
    projectId: string,
    scenarioId: string,
    fromIndex: number,
    toIndex: number
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

  // Import
  importProjects: (projects: Project[], replaceIds?: string[]) => void;

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
      // Notify cloud sync layer (no-op when no listeners registered)
      cloudSyncBus.emitSave(projectId);
    }
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => {
  /** Push current project state to undo stack before mutating */
  function pushUndo(projectId: string) {
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

  undo: () => {
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

  addProject: (name: string) => {
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
    });
    repo.save(project);
    set((state) => ({ projects: [...state.projects, project] }));
    cloudSyncBus.emitCreate(project.id);
    return project;
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
      // Protect baseline (first scenario) from deletion
      if (project?.scenarios[0]?.id === scenarioId) return state;

      const projects = state.projects.map((p) =>
        p.id === projectId ? removeScenarioFromProject(p, scenarioId) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  duplicateScenario: (projectId, scenarioId, newName, options) => {
    pushUndo(projectId);
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;
      const scenario = project.scenarios.find((s) => s.id === scenarioId);
      if (!scenario) return state;

      const clone = cloneScenario(scenario, newName, options);
      const projects = state.projects.map((p) =>
        p.id === projectId ? addScenarioToProject(p, clone) : p
      );
      persist(projects, projectId);
      return { projects };
    });
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
      const projects = state.projects.map((p) =>
        p.id === projectId
          ? updateScenario(p, scenarioId, (s) =>
              addActivityToScenario(s, activity)
            )
          : p
      );
      persist(projects, projectId);
      return { projects };
    });
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
      };

      const projects = state.projects.map((p) =>
        p.id === projectId
          ? updateScenario(p, scenarioId, (s) =>
              addActivityToScenario(s, clone)
            )
          : p
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

  moveActivity: (projectId, scenarioId, fromIndex, toIndex) =>
    mutateScenario(projectId, scenarioId, (s) =>
      reorderActivities(s, fromIndex, toIndex)
    ),

  setSimulationResults: (projectId, scenarioId, results) => {
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId
          ? updateScenario(p, scenarioId, (s: Scenario) => ({
              ...s,
              simulationResults: results,
            }))
          : p
      );
      persist(projects, projectId);
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
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          convertedWorkDays: (p.convertedWorkDays ?? []).filter((d) => d !== date),
        };
      });
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
      return {
        ...cleaned,
        activities: cleaned.activities.filter((a) => !activityIds.includes(a.id)),
        simulationResults: undefined,
      };
    }),

  importProjects: (projects, replaceIds = []) => {
    set((state) => {
      // Remove projects being replaced
      const filteredExisting = state.projects.filter(
        (p) => !replaceIds.includes(p.id)
      );
      for (const id of replaceIds) {
        repo.remove(id);
      }
      // Save all imported projects to localStorage
      for (const project of projects) {
        repo.save(project);
      }
      return {
        projects: [...filteredExisting, ...projects],
      };
    });

    // Cloud sync: delete replaced docs not in import set, create all imported
    const importedIds = new Set(projects.map((p) => p.id));
    for (const id of replaceIds) {
      if (!importedIds.has(id)) {
        cloudSyncBus.emitDelete(id);
      }
    }
    for (const project of projects) {
      cloudSyncBus.emitCreate(project.id);
    }
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
    // Also sync to localStorage so local cache stays current
    for (const project of projects) {
      repo.save(project);
    }
    // Update the index to match
    repo.reorderIndex(projects.map((p) => p.id));
    set({ projects, loadError: false, loadErrors: [], undoStack: [], redoStack: [] });
  },

  mergeProject: (project: Project) => {
    set((state) => {
      const exists = state.projects.some((p) => p.id === project.id);
      const projects = exists
        ? state.projects.map((p) => (p.id === project.id ? project : p))
        : [...state.projects, project];
      return { projects };
    });
    // Update localStorage cache
    repo.save(project);
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
      const projects = state.projects.map((p) =>
        p.id === projectId
          ? updateScenario(p, scenarioId, (s) => ({
              ...s,
              locked: !s.locked,
            }))
          : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  isScenarioLocked: (projectId, scenarioId) => {
    return isLocked(get().projects, projectId, scenarioId);
  },
};});
