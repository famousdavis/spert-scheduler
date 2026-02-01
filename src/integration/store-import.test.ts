import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import {
  createProject,
  createActivity,
  addActivityToScenario,
} from "@app/api/project-service";
import type { Project } from "@domain/models/types";

/**
 * Tests the importProjects logic at the repository level.
 * This mirrors the Zustand store action but without requiring a React context.
 */
describe("importProjects (repository-level)", () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  function importProjects(
    projects: Project[],
    replaceIds: string[] = []
  ): void {
    for (const id of replaceIds) {
      repo.remove(id);
    }
    for (const project of projects) {
      repo.save(project);
    }
  }

  it("imports new projects into empty store", () => {
    const p1 = createProject("Project A", "2025-06-01");
    const p2 = createProject("Project B", "2025-07-01");

    importProjects([p1, p2]);

    expect(repo.load(p1.id)).not.toBeNull();
    expect(repo.load(p2.id)).not.toBeNull();
    expect(repo.list()).toHaveLength(2);
  });

  it("imports alongside existing projects without conflict", () => {
    const existing = createProject("Existing", "2025-01-01");
    repo.save(existing);

    const newProj = createProject("New Import", "2025-06-01");
    importProjects([newProj]);

    expect(repo.list()).toHaveLength(2);
    expect(repo.load(existing.id)!.name).toBe("Existing");
    expect(repo.load(newProj.id)!.name).toBe("New Import");
  });

  it("replaces existing project when replaceIds includes its ID", () => {
    const original = createProject("Original", "2025-01-01");
    repo.save(original);

    const replacement: Project = {
      ...original,
      name: "Replaced Version",
    };

    importProjects([replacement], [original.id]);

    const loaded = repo.load(original.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Replaced Version");
    expect(repo.list()).toHaveLength(1);
  });

  it("handles mixed import: new project + replaced project", () => {
    const existing = createProject("Will Be Replaced", "2025-01-01");
    repo.save(existing);

    const replacement: Project = {
      ...existing,
      name: "Replaced",
    };
    const brandNew = createProject("Brand New", "2025-08-01");

    importProjects([replacement, brandNew], [existing.id]);

    expect(repo.list()).toHaveLength(2);
    expect(repo.load(existing.id)!.name).toBe("Replaced");
    expect(repo.load(brandNew.id)!.name).toBe("Brand New");
  });

  it("preserves activities through import", () => {
    const project = createProject("With Activities", "2025-06-01");
    const scenario = project.scenarios[0]!;
    const a1 = createActivity("Task A", scenario.settings);
    const updatedScenario = addActivityToScenario(scenario, a1);
    const fullProject: Project = {
      ...project,
      scenarios: [updatedScenario],
    };

    importProjects([fullProject]);

    const loaded = repo.load(fullProject.id)!;
    expect(loaded.scenarios[0]!.activities).toHaveLength(1);
    expect(loaded.scenarios[0]!.activities[0]!.name).toBe("Task A");
  });
});
