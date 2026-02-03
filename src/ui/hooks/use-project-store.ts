import { create } from "zustand";
import type {
  Project,
  Scenario,
  Activity,
  Calendar,
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
} from "@app/api/project-service";
import type { CloneOptions } from "@app/api/project-service";
import { generateId } from "@app/api/id";
import {
  LocalStorageRepository,
  type LoadError,
} from "@infrastructure/persistence/local-storage-repository";
import { UNDO_STACK_LIMIT } from "@ui/constants";

const repo = new LocalStorageRepository();

export type { LoadError };

interface UndoEntry {
  projectId: string;
  snapshot: Project;
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

  // Import
  importProjects: (projects: Project[], replaceIds?: string[]) => void;

  // Archive
  archiveProject: (id: string) => void;
  unarchiveProject: (id: string) => void;

  // Error recovery
  getCorruptedProjectRawData: (id: string) => string | null;
  removeCorruptedProject: (id: string) => void;
}

function persist(projects: Project[], projectId?: string) {
  if (projectId) {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      repo.save(project);
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
    const project = createProject(name);
    repo.save(project);
    set((state) => ({ projects: [...state.projects, project] }));
    return project;
  },

  deleteProject: (id: string) => {
    repo.remove(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
    }));
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

  updateScenarioSettings: (projectId, scenarioId, settings) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId
          ? updateScenario(p, scenarioId, (s) => ({
              ...s,
              settings: { ...s.settings, ...settings },
              simulationResults: undefined, // Invalidate
            }))
          : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  addActivity: (projectId, scenarioId, name) => {
    pushUndo(projectId);
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;
      const scenario = project.scenarios.find((s) => s.id === scenarioId);
      if (!scenario) return state;

      const activity = createActivity(name, scenario.settings);
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
    pushUndo(projectId);
    set((state) => {
      const project = state.projects.find((p) => p.id === projectId);
      if (!project) return state;
      const scenario = project.scenarios.find((s) => s.id === scenarioId);
      if (!scenario) return state;
      const activity = scenario.activities.find((a) => a.id === activityId);
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

  deleteActivity: (projectId, scenarioId, activityId) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId
          ? updateScenario(p, scenarioId, (s) =>
              removeActivityFromScenario(s, activityId)
            )
          : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  updateActivityField: (projectId, scenarioId, activityId, updates) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId
          ? updateScenario(p, scenarioId, (s) =>
              updateActivity(s, activityId, updates)
            )
          : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  moveActivity: (projectId, scenarioId, fromIndex, toIndex) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId
          ? updateScenario(p, scenarioId, (s) =>
              reorderActivities(s, fromIndex, toIndex)
            )
          : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

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

  bulkUpdateActivities: (projectId, scenarioId, activityIds, updates) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return updateScenario(p, scenarioId, (s) => ({
          ...s,
          activities: s.activities.map((a) =>
            activityIds.includes(a.id) ? { ...a, ...updates } : a
          ),
          simulationResults: undefined,
        }));
      });
      persist(projects, projectId);
      return { projects };
    });
  },

  bulkDeleteActivities: (projectId, scenarioId, activityIds) => {
    pushUndo(projectId);
    set((state) => {
      const projects = state.projects.map((p) => {
        if (p.id !== projectId) return p;
        return updateScenario(p, scenarioId, (s) => ({
          ...s,
          activities: s.activities.filter((a) => !activityIds.includes(a.id)),
          simulationResults: undefined,
        }));
      });
      persist(projects, projectId);
      return { projects };
    });
  },

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
};});
