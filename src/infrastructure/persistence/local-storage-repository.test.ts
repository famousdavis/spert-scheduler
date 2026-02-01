import { describe, it, expect, beforeEach } from "vitest";
import { LocalStorageRepository } from "./local-storage-repository";
import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Test Project",
    createdAt: "2025-01-01T00:00:00.000Z",
    schemaVersion: SCHEMA_VERSION,
    scenarios: [
      {
        id: "s1",
        name: "Baseline",
        startDate: "2025-02-01",
        activities: [
          {
            id: "a1",
            name: "Task 1",
            min: 2,
            mostLikely: 4,
            max: 8,
            confidenceLevel: "mediumConfidence",
            distributionType: "normal",
            status: "planned",
          },
        ],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 50000,
          rngSeed: "test-seed",
          probabilityTarget: 0.85,
          projectProbabilityTarget: 0.95,
        },
      },
    ],
    ...overrides,
  };
}

describe("LocalStorageRepository", () => {
  let repo: LocalStorageRepository;

  beforeEach(() => {
    localStorage.clear();
    repo = new LocalStorageRepository();
  });

  it("returns empty list initially", () => {
    expect(repo.list()).toEqual([]);
  });

  it("saves and loads a project", () => {
    const project = makeProject();
    repo.save(project);

    const loaded = repo.load("p1");
    expect(loaded).not.toBeNull();
    expect(loaded!.id).toBe("p1");
    expect(loaded!.name).toBe("Test Project");
    expect(loaded!.scenarios).toHaveLength(1);
  });

  it("lists saved project IDs", () => {
    repo.save(makeProject({ id: "p1" }));
    repo.save(makeProject({ id: "p2", name: "Second" }));

    const ids = repo.list();
    expect(ids).toContain("p1");
    expect(ids).toContain("p2");
  });

  it("removes a project", () => {
    repo.save(makeProject());
    repo.remove("p1");

    expect(repo.load("p1")).toBeNull();
    expect(repo.list()).not.toContain("p1");
  });

  it("returns null for non-existent project", () => {
    expect(repo.load("nonexistent")).toBeNull();
  });

  it("returns null for corrupted JSON", () => {
    localStorage.setItem("spert:project:bad", "not json{");
    expect(repo.load("bad")).toBeNull();
  });

  it("returns null for incompatible future schema version", () => {
    const project = makeProject({ schemaVersion: SCHEMA_VERSION + 1 });
    localStorage.setItem("spert:project:future", JSON.stringify(project));
    expect(repo.load("future")).toBeNull();
  });

  it("returns null for invalid project data", () => {
    const bad = { id: "bad", schemaVersion: SCHEMA_VERSION }; // missing required fields
    localStorage.setItem("spert:project:bad", JSON.stringify(bad));
    expect(repo.load("bad")).toBeNull();
  });

  it("does not duplicate IDs on repeated saves", () => {
    const project = makeProject();
    repo.save(project);
    repo.save(project);
    repo.save(project);

    const ids = repo.list();
    expect(ids.filter((id) => id === "p1")).toHaveLength(1);
  });

  it("preserves other projects when removing one", () => {
    repo.save(makeProject({ id: "p1" }));
    repo.save(makeProject({ id: "p2", name: "Keep" }));
    repo.remove("p1");

    expect(repo.list()).toEqual(["p2"]);
    expect(repo.load("p2")).not.toBeNull();
  });
});
