import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import {
  createProject,
  createScenario,
  addScenarioToProject,
  createActivity,
  addActivityToScenario,
} from "@app/api/project-service";
import { SCHEMA_VERSION } from "@domain/models/types";

describe("Persistence round-trip", () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  it("save -> load preserves all data", () => {
    let project = createProject("Roundtrip Test");
    const scenario = createScenario("Baseline", "2025-03-01");
    project = addScenarioToProject(project, scenario);

    const activity = createActivity("Task", project.scenarios[0]!.settings);
    const updatedScenario = addActivityToScenario(project.scenarios[0]!, {
      ...activity,
      min: 2,
      mostLikely: 5,
      max: 12,
      confidenceLevel: "highConfidence",
      distributionType: "logNormal",
    });
    project = { ...project, scenarios: [updatedScenario] };

    repo.save(project);
    const loaded = repo.load(project.id);

    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe("Roundtrip Test");
    expect(loaded!.schemaVersion).toBe(SCHEMA_VERSION);
    expect(loaded!.scenarios).toHaveLength(1);

    const loadedActivity = loaded!.scenarios[0]!.activities[0]!;
    expect(loadedActivity.min).toBe(2);
    expect(loadedActivity.mostLikely).toBe(5);
    expect(loadedActivity.max).toBe(12);
    expect(loadedActivity.confidenceLevel).toBe("highConfidence");
    expect(loadedActivity.distributionType).toBe("logNormal");
  });

  it("save -> delete -> load returns null", () => {
    const project = createProject("To Delete");
    repo.save(project);
    repo.remove(project.id);

    expect(repo.load(project.id)).toBeNull();
    expect(repo.list()).not.toContain(project.id);
  });

  it("multiple projects save and list independently", () => {
    const p1 = createProject("Project A");
    const p2 = createProject("Project B");
    const p3 = createProject("Project C");

    repo.save(p1);
    repo.save(p2);
    repo.save(p3);

    const ids = repo.list();
    expect(ids).toHaveLength(3);
    expect(ids).toContain(p1.id);
    expect(ids).toContain(p2.id);
    expect(ids).toContain(p3.id);

    // Delete one, others remain
    repo.remove(p2.id);
    expect(repo.list()).toHaveLength(2);
    expect(repo.load(p2.id)).toBeNull();
    expect(repo.load(p1.id)).not.toBeNull();
    expect(repo.load(p3.id)).not.toBeNull();
  });

  it("handles corrupted data gracefully", () => {
    localStorage.setItem("spert:project:bad1", "not json at all");
    localStorage.setItem("spert:project:bad2", JSON.stringify({ id: "bad2" }));
    localStorage.setItem("spert:project-index", JSON.stringify(["bad1", "bad2"]));

    expect(repo.load("bad1")).toBeNull();
    expect(repo.load("bad2")).toBeNull();
  });

  it("rejects future schema versions", () => {
    const project = createProject("Future");
    const data = { ...project, schemaVersion: SCHEMA_VERSION + 10 };
    localStorage.setItem(`spert:project:${project.id}`, JSON.stringify(data));

    expect(repo.load(project.id)).toBeNull();
  });
});
