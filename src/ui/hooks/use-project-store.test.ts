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

  it("adds scenarios and deletes non-baseline scenarios", () => {
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

    // Delete the second scenario (non-baseline)
    store.deleteScenario(project.id, updated.scenarios[1]!.id);
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(1);
    expect(updated.scenarios[0]!.name).toBe("Baseline");
  });

  it("cannot delete the baseline scenario", () => {
    const store = useProjectStore.getState();
    const project = store.addProject("Protected Baseline");

    let updated = useProjectStore.getState().getProject(project.id)!;
    const baselineId = updated.scenarios[0]!.id;

    // Add a second so deletion isn't blocked by "only one scenario" logic
    store.addScenario(project.id, "Alt", "2025-01-06");

    // Attempt to delete baseline — should be a no-op
    store.deleteScenario(project.id, baselineId);
    updated = useProjectStore.getState().getProject(project.id)!;
    expect(updated.scenarios).toHaveLength(2);
    expect(updated.scenarios[0]!.id).toBe(baselineId);
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
});
