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
} from "@app/api/project-service";
import type { CloneOptions } from "@app/api/project-service";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";

const repo = new LocalStorageRepository();

export interface ProjectStore {
  // State
  projects: Project[];
  loadError: boolean;

  // Project CRUD
  loadProjects: () => void;
  addProject: (name: string) => Project;
  deleteProject: (id: string) => void;
  reorderProjects: (fromIndex: number, toIndex: number) => void;
  getProject: (id: string) => Project | undefined;

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
}

function persist(projects: Project[], projectId?: string) {
  if (projectId) {
    const project = projects.find((p) => p.id === projectId);
    if (project) {
      repo.save(project);
    }
  }
}

export const useProjectStore = create<ProjectStore>((set, get) => ({
  projects: [],
  loadError: false,

  loadProjects: () => {
    const ids = repo.list();
    const projects: Project[] = [];
    let hasError = false;

    for (const id of ids) {
      const project = repo.load(id);
      if (project) {
        projects.push(project);
      } else {
        hasError = true;
      }
    }

    set({ projects, loadError: hasError });
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
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? removeScenarioFromProject(p, scenarioId) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },

  duplicateScenario: (projectId, scenarioId, newName, options) => {
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

  deleteActivity: (projectId, scenarioId, activityId) => {
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
    set((state) => {
      const projects = state.projects.map((p) =>
        p.id === projectId ? setGlobalCalendar(p, calendar) : p
      );
      persist(projects, projectId);
      return { projects };
    });
  },
}));
