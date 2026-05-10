// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";
import {
  LocalStorageRepository,
  setStorageNamespace,
  getStorageNamespaceForTests,
  migrateLegacyKeysToLocal,
  _resetLegacyMigrationForTests,
} from "./local-storage-repository";

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

describe("local-storage-repository UID namespacing (v0.42.6 M4)", () => {
  beforeEach(() => {
    localStorage.clear();
    setStorageNamespace("local");
  });

  describe("namespace switching", () => {
    it("default namespace is 'local'", () => {
      expect(getStorageNamespaceForTests()).toBe("local");
    });

    it("setStorageNamespace flips the active namespace", () => {
      setStorageNamespace("uid-A");
      expect(getStorageNamespaceForTests()).toBe("uid-A");
      setStorageNamespace("local");
      expect(getStorageNamespaceForTests()).toBe("local");
    });

    it("save and load round-trip under the active namespace", () => {
      setStorageNamespace("uid-A");
      const repo = new LocalStorageRepository();
      repo.save(makeProject({ id: "p1", name: "A's project" }));

      expect(localStorage.getItem("spert:project:uid-A:p1")).not.toBeNull();
      expect(localStorage.getItem("spert:project-index:uid-A")).not.toBeNull();
      expect(localStorage.getItem("spert:project:local:p1")).toBeNull();

      const loaded = repo.load("p1");
      expect(loaded?.name).toBe("A's project");
    });

    it("cross-namespace isolation: switching namespace hides the prior user's data", () => {
      setStorageNamespace("uid-A");
      const repoA = new LocalStorageRepository();
      repoA.save(makeProject({ id: "p1", name: "A's secret" }));

      setStorageNamespace("uid-B");
      const repoB = new LocalStorageRepository();
      // B's view of "p1" must miss — the key is under uid-A, not uid-B.
      expect(repoB.load("p1")).toBeNull();
      expect(repoB.list()).toEqual([]);

      // Switching back to A still sees A's data — the structural prefix is
      // the only authority over visibility.
      setStorageNamespace("uid-A");
      expect(repoA.load("p1")?.name).toBe("A's secret");
    });

    it("clearAll wipes only the current namespace, not other users' data", () => {
      setStorageNamespace("uid-A");
      new LocalStorageRepository().save(makeProject({ id: "pA", name: "A" }));

      setStorageNamespace("uid-B");
      new LocalStorageRepository().save(makeProject({ id: "pB", name: "B" }));

      // B clears their own namespace
      new LocalStorageRepository().clearAll();
      expect(localStorage.getItem("spert:project:uid-B:pB")).toBeNull();
      expect(localStorage.getItem("spert:project-index:uid-B")).toBeNull();

      // A's data is untouched
      expect(localStorage.getItem("spert:project:uid-A:pA")).not.toBeNull();
      expect(localStorage.getItem("spert:project-index:uid-A")).not.toBeNull();
    });
  });

  describe("constructor override (fixedNamespace)", () => {
    it("explicit 'local' override reads local even when active namespace is a UID", () => {
      // local-mode user creates data
      setStorageNamespace("local");
      new LocalStorageRepository().save(makeProject({ id: "p1", name: "local data" }));

      // active namespace flips to a UID (sign-in transition)
      setStorageNamespace("uid-A");
      const localRepo = new LocalStorageRepository("local");
      expect(localRepo.load("p1")?.name).toBe("local data");

      // Default repo (no override) sees nothing — it follows active namespace
      expect(new LocalStorageRepository().load("p1")).toBeNull();
    });

    it("explicit 'local' clearAll clears local even when active namespace is UID", () => {
      setStorageNamespace("local");
      new LocalStorageRepository().save(makeProject({ id: "p1", name: "local" }));

      setStorageNamespace("uid-A");
      new LocalStorageRepository().save(makeProject({ id: "p2", name: "cloud" }));

      // explicit local clear should wipe local but leave cloud alone
      new LocalStorageRepository("local").clearAll();
      expect(localStorage.getItem("spert:project:local:p1")).toBeNull();
      expect(localStorage.getItem("spert:project:uid-A:p2")).not.toBeNull();
    });
  });

  describe("legacy-key migration", () => {
    beforeEach(() => {
      localStorage.clear();
      _resetLegacyMigrationForTests();
    });

    it("migrates pre-v0.42.6 unprefixed keys to 'local' namespace", () => {
      const proj = makeProject({ id: "legacy-1", name: "from before" });
      localStorage.setItem("spert:project:legacy-1", JSON.stringify(proj));
      localStorage.setItem("spert:project-index", JSON.stringify(["legacy-1"]));

      migrateLegacyKeysToLocal();

      // New keys present
      expect(localStorage.getItem("spert:project:local:legacy-1")).not.toBeNull();
      expect(localStorage.getItem("spert:project-index:local")).not.toBeNull();
      // Old keys gone
      expect(localStorage.getItem("spert:project:legacy-1")).toBeNull();
      expect(localStorage.getItem("spert:project-index")).toBeNull();
    });

    it("preserves data integrity through migration (round-trip)", () => {
      const proj = makeProject({ id: "legacy-1", name: "preserved" });
      const json = JSON.stringify(proj);
      localStorage.setItem("spert:project:legacy-1", json);
      localStorage.setItem("spert:project-index", JSON.stringify(["legacy-1"]));

      migrateLegacyKeysToLocal();

      setStorageNamespace("local");
      const repo = new LocalStorageRepository();
      const loaded = repo.load("legacy-1");
      expect(loaded?.name).toBe("preserved");
      expect(repo.list()).toEqual(["legacy-1"]);
    });

    it("idempotent: re-running does not corrupt or duplicate", () => {
      const proj = makeProject({ id: "legacy-1" });
      localStorage.setItem("spert:project:legacy-1", JSON.stringify(proj));
      localStorage.setItem("spert:project-index", JSON.stringify(["legacy-1"]));

      migrateLegacyKeysToLocal();
      _resetLegacyMigrationForTests();
      migrateLegacyKeysToLocal();
      _resetLegacyMigrationForTests();
      migrateLegacyKeysToLocal();

      // Single source of truth in the new namespace
      expect(localStorage.getItem("spert:project:local:legacy-1")).not.toBeNull();
      expect(localStorage.getItem("spert:project:legacy-1")).toBeNull();
    });

    it("does not touch already-namespaced keys", () => {
      // Already-migrated state
      localStorage.setItem(
        "spert:project:uid-A:p1",
        JSON.stringify(makeProject({ id: "p1" })),
      );
      localStorage.setItem("spert:project-index:uid-A", JSON.stringify(["p1"]));

      migrateLegacyKeysToLocal();

      expect(localStorage.getItem("spert:project:uid-A:p1")).not.toBeNull();
      expect(localStorage.getItem("spert:project-index:uid-A")).not.toBeNull();
      // No spurious local-namespace entries created
      expect(localStorage.getItem("spert:project-index:local")).toBeNull();
    });

    it("ordering: writes new key before deleting old (recoverable on partial failure)", () => {
      // Behavioral verification: at any single point in time, the data is
      // never under neither key. We simulate by intercepting setItem to
      // throw — old key MUST still be present.
      const proj = makeProject({ id: "legacy-1" });
      localStorage.setItem("spert:project:legacy-1", JSON.stringify(proj));
      localStorage.setItem("spert:project-index", JSON.stringify(["legacy-1"]));

      const realSetItem = Storage.prototype.setItem;
      // Throw on the write to the new key — exact "mid-migration crash" sim
      Storage.prototype.setItem = function (k: string, v: string) {
        if (k === "spert:project:local:legacy-1") {
          throw new DOMException("simulated quota", "QuotaExceededError");
        }
        realSetItem.call(this, k, v);
      };

      try {
        migrateLegacyKeysToLocal();
      } catch {
        // Migration swallows quota errors and leaves legacy key in place.
      } finally {
        Storage.prototype.setItem = realSetItem;
      }

      // Old key is still there because the new write failed
      expect(localStorage.getItem("spert:project:legacy-1")).not.toBeNull();
      // Worst case = duplicate, never lost
      // (Can't easily assert "duplicate" here because the new write threw,
      // but the safety property is: old key present → data is recoverable.)
    });
  });
});
