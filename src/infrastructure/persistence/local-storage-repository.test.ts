// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  LocalStorageRepository,
  stripSimulationSamples,
} from "./local-storage-repository";
import type { Project, SimulationRun } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "p1",
    name: "Test Project",
    createdAt: "2025-01-01T00:00:00.000Z",
    schemaVersion: SCHEMA_VERSION,
    owner: null,
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
        dependencies: [],
        milestones: [],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 50000,
          rngSeed: "test-seed",
          probabilityTarget: 0.85,
          projectProbabilityTarget: 0.95,
          heuristicEnabled: false,
          heuristicMinPercent: 50,
          heuristicMaxPercent: 200,
          dependencyMode: false,
          parkinsonsLawEnabled: true,
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
    localStorage.setItem("spert:project:local:bad", "not json{");
    expect(repo.load("bad")).toBeNull();
  });

  it("returns null for incompatible future schema version", () => {
    const project = makeProject({ schemaVersion: SCHEMA_VERSION + 1 });
    localStorage.setItem("spert:project:local:future", JSON.stringify(project));
    expect(repo.load("future")).toBeNull();
  });

  it("returns null for invalid project data", () => {
    const bad = { id: "bad", schemaVersion: SCHEMA_VERSION }; // missing required fields
    localStorage.setItem("spert:project:local:bad", JSON.stringify(bad));
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

  it("reorders the project index", () => {
    repo.save(makeProject({ id: "p1" }));
    repo.save(makeProject({ id: "p2", name: "Second" }));
    repo.save(makeProject({ id: "p3", name: "Third" }));

    repo.reorderIndex(["p3", "p1", "p2"]);
    expect(repo.list()).toEqual(["p3", "p1", "p2"]);
  });

  it("preserves reordered index after fresh repo instance", () => {
    repo.save(makeProject({ id: "p1" }));
    repo.save(makeProject({ id: "p2", name: "Second" }));
    repo.reorderIndex(["p2", "p1"]);

    const freshRepo = new LocalStorageRepository();
    expect(freshRepo.list()).toEqual(["p2", "p1"]);
  });

  describe("clearAll", () => {
    it("removes every indexed project and the index itself", () => {
      repo.save(makeProject({ id: "p1" }));
      repo.save(makeProject({ id: "p2", name: "Second" }));
      repo.save(makeProject({ id: "p3", name: "Third" }));

      repo.clearAll();

      expect(localStorage.getItem("spert:project:local:p1")).toBeNull();
      expect(localStorage.getItem("spert:project:local:p2")).toBeNull();
      expect(localStorage.getItem("spert:project:local:p3")).toBeNull();
      expect(localStorage.getItem("spert:project-index:local")).toBeNull();
      expect(repo.list()).toEqual([]);
      expect(repo.load("p1")).toBeNull();
    });

    it("is idempotent on an empty repo", () => {
      expect(() => repo.clearAll()).not.toThrow();
      expect(repo.list()).toEqual([]);
    });

    it("does not touch non-project keys", () => {
      repo.save(makeProject({ id: "p1" }));
      // v0.45.3 — preferences and scenario memory are themselves UID-namespaced
      // (`:local` under the default namespace). The repo's clearAll must leave
      // them untouched; only project keys belong to its responsibility.
      localStorage.setItem("spert:user-preferences:local", "{\"theme\":\"dark\"}");
      localStorage.setItem("spert-scheduler:active-scenarios:local", "{\"p1\":\"s1\"}");
      localStorage.setItem("spert:storage-mode", "cloud");
      localStorage.setItem("spert_firstRun_seen", "1");

      repo.clearAll();

      expect(localStorage.getItem("spert:user-preferences:local")).toBe(
        "{\"theme\":\"dark\"}"
      );
      expect(localStorage.getItem("spert-scheduler:active-scenarios:local")).toBe(
        "{\"p1\":\"s1\"}"
      );
      expect(localStorage.getItem("spert:storage-mode")).toBe("cloud");
      expect(localStorage.getItem("spert_firstRun_seen")).toBe("1");
    });
  });
});

describe("CI-5/SD-3 — resilient cloud mirror and orphan sweep (v0.79.x audit)", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("saveCloudMirror caches a normal project, indexes it, and returns true", () => {
    const repo = new LocalStorageRepository("uid-X");
    expect(repo.saveCloudMirror(makeProject({ id: "m" }))).toBe(true);
    expect(repo.load("m")).not.toBeNull();
    expect(localStorage.getItem("spert:project-index:uid-X")).toBe(JSON.stringify(["m"]));
  });

  it("CI-5: saveCloudMirror skips an oversized document — returns false and writes nothing", () => {
    const repo = new LocalStorageRepository("uid-X");
    const huge = makeProject({ id: "big", name: "x".repeat(2_000_001) });
    expect(repo.saveCloudMirror(huge)).toBe(false);
    expect(localStorage.getItem("spert:project:uid-X:big")).toBeNull();
    expect(localStorage.getItem("spert:project-index:uid-X")).toBeNull();
  });

  it("CI-5: saveCloudMirror swallows a quota error — returns false and does not throw", () => {
    const repo = new LocalStorageRepository("uid-X");
    const realSet = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(function (this: Storage, key: string, value: string) {
      if (key.startsWith("spert:project:uid-X:")) throw new DOMException("full", "QuotaExceededError");
      realSet.call(this, key, value);
    });
    let result: boolean | undefined;
    expect(() => {
      result = repo.saveCloudMirror(makeProject({ id: "q" }));
    }).not.toThrow();
    expect(result).toBe(false);
  });

  it("SD-3: replaceIndex sweeps a UID-namespace data key the cloud no longer names — indexed or orphaned", () => {
    const repo = new LocalStorageRepository("uid-X");
    repo.save(makeProject({ id: "a" }));
    repo.save(makeProject({ id: "b", name: "B" }));
    // An orphan the index never named — a stale mirror copy from an earlier cloud answer.
    localStorage.setItem("spert:project:uid-X:orphan", JSON.stringify(makeProject({ id: "orphan" })));

    repo.replaceIndex(["a"]);

    expect(localStorage.getItem("spert:project:uid-X:a")).not.toBeNull();
    expect(localStorage.getItem("spert:project:uid-X:b")).toBeNull();
    expect(localStorage.getItem("spert:project:uid-X:orphan")).toBeNull();
    expect(localStorage.getItem("spert:project-index:uid-X")).toBe(JSON.stringify(["a"]));
  });

  it("SD-3: replaceIndex never sweeps the signed-out namespace — an unlisted key there may be recoverable (WI-130)", () => {
    const repo = new LocalStorageRepository("local");
    localStorage.setItem("spert:project:local:x", JSON.stringify(makeProject({ id: "x" })));

    repo.replaceIndex(["y"]); // y is not stored; x is unlisted but must survive

    expect(localStorage.getItem("spert:project:local:x")).not.toBeNull();
  });

  it("SD-3: clearAll sweeps an unindexed orphan in a UID namespace", () => {
    const repo = new LocalStorageRepository("uid-X");
    repo.save(makeProject({ id: "a" }));
    localStorage.setItem("spert:project:uid-X:orphan", JSON.stringify(makeProject({ id: "orphan" })));

    repo.clearAll();

    expect(localStorage.getItem("spert:project:uid-X:a")).toBeNull();
    expect(localStorage.getItem("spert:project:uid-X:orphan")).toBeNull();
    expect(localStorage.getItem("spert:project-index:uid-X")).toBeNull();
  });
});

describe("stripSimulationSamples", () => {
  function makeSimulationRun(): SimulationRun {
    return {
      id: "sim1",
      timestamp: "2025-01-01T00:00:00.000Z",
      trialCount: 50000,
      seed: "test-seed",
      engineVersion: "1.0.0",
      percentiles: { 5: 10, 50: 20, 95: 30 },
      histogramBins: [{ binStart: 0, binEnd: 5, count: 100 }],
      mean: 20,
      standardDeviation: 5,
      minSample: 5,
      maxSample: 40,
      samples: Array(1000).fill(20), // Large samples array
    };
  }

  it("empties samples array but preserves other fields", () => {
    const project = makeProject();
    project.scenarios[0]!.simulationResults = makeSimulationRun();

    const stripped = stripSimulationSamples(project);

    expect(stripped.scenarios[0]!.simulationResults).toBeDefined();
    expect(stripped.scenarios[0]!.simulationResults!.samples).toEqual([]);
    expect(stripped.scenarios[0]!.simulationResults!.percentiles).toEqual({
      5: 10,
      50: 20,
      95: 30,
    });
    expect(stripped.scenarios[0]!.simulationResults!.mean).toBe(20);
    expect(stripped.scenarios[0]!.simulationResults!.histogramBins).toHaveLength(1);
  });

  it("handles scenarios without simulation results", () => {
    const project = makeProject();
    project.scenarios[0]!.simulationResults = undefined;

    const stripped = stripSimulationSamples(project);

    expect(stripped.scenarios[0]!.simulationResults).toBeUndefined();
  });

  it("does not mutate the original project", () => {
    const project = makeProject();
    project.scenarios[0]!.simulationResults = makeSimulationRun();
    const originalLength = project.scenarios[0]!.simulationResults.samples.length;

    stripSimulationSamples(project);

    expect(project.scenarios[0]!.simulationResults!.samples).toHaveLength(
      originalLength
    );
  });
});
