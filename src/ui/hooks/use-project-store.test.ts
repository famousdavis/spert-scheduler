import { describe, it, expect, beforeEach } from "vitest";
import { useProjectStore } from "./use-project-store";

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

  it("adds and deletes scenarios", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("With Scenarios");

    store.addScenario(project.id, "Baseline", "2025-01-06");
    let updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(1);

    store.deleteScenario(project.id, updated.scenarios[0]!.id);
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(0);
  });

  it("adds activities and invalidates simulation results", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("With Activities");
    store.addScenario(project.id, "Baseline", "2025-01-06");

    let updated = useProjectStore.getState().getProject(project.id)!;
    const scenarioId = updated.scenarios[0]!.id;

    store.addActivity(project.id, scenarioId, "Task 1");
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios[0]!.activities).toHaveLength(1);
  });

  it("duplicates scenario with new IDs", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Clone Test");
    store.addScenario(project.id, "Original", "2025-01-06");

    let updated = useProjectStore.getState().getProject(project.id)!;
    const originalId = updated.scenarios[0]!.id;

    store.addActivity(project.id, originalId, "Task 1");
    store.duplicateScenario(project.id, originalId, "Clone");

    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(2);
    expect(updated.scenarios[1]!.name).toBe("Clone");
    expect(updated.scenarios[1]!.id).not.toBe(originalId);
  });
});
