// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import {
  getLastScenarioId,
  setLastScenarioId,
  removeLastScenarioId,
  clearAllLastScenarios,
  migrateLegacyScenarioMemoryToLocal,
  _resetLegacyScenarioMemoryMigrationForTests,
} from "./scenario-memory";
import { setStorageNamespace } from "./local-storage-repository";

// v0.45.3 — scenario memory is now UID-namespaced. Default namespace is "local".
const STORAGE_KEY = "spert-scheduler:active-scenarios:local";
const LEGACY_STORAGE_KEY = "spert-scheduler:active-scenarios";

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
});

describe("scenario memory", () => {
  it("returns null for unknown project", () => {
    expect(getLastScenarioId("nope")).toBeNull();
  });

  it("persists and retrieves an active scenario id", () => {
    setLastScenarioId("p1", "s1");
    expect(getLastScenarioId("p1")).toBe("s1");
  });

  it("overwrites an existing entry", () => {
    setLastScenarioId("p1", "s1");
    setLastScenarioId("p1", "s2");
    expect(getLastScenarioId("p1")).toBe("s2");
  });

  it("removes a single entry", () => {
    setLastScenarioId("p1", "s1");
    setLastScenarioId("p2", "s2");
    removeLastScenarioId("p1");
    expect(getLastScenarioId("p1")).toBeNull();
    expect(getLastScenarioId("p2")).toBe("s2");
  });

  it("tolerates corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json{");
    expect(getLastScenarioId("p1")).toBeNull();
  });
});

describe("clearAllLastScenarios", () => {
  it("removes the entire active-scenarios key", () => {
    setLastScenarioId("p1", "s1");
    setLastScenarioId("p2", "s2");
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    clearAllLastScenarios();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(getLastScenarioId("p1")).toBeNull();
    expect(getLastScenarioId("p2")).toBeNull();
  });

  it("is idempotent when the key is already absent", () => {
    expect(() => clearAllLastScenarios()).not.toThrow();
    expect(getLastScenarioId("p1")).toBeNull();
  });
});

describe("UID namespacing (v0.45.3)", () => {
  beforeEach(() => {
    setStorageNamespace("local");
  });

  it("default namespace writes to the :local key", () => {
    setLastScenarioId("p1", "s1");
    expect(localStorage.getItem("spert-scheduler:active-scenarios:local")).not.toBeNull();
    // Unscoped legacy key is NOT written
    expect(localStorage.getItem("spert-scheduler:active-scenarios")).toBeNull();
  });

  it("cross-namespace isolation: A's map is not visible to B", () => {
    setStorageNamespace("uid-A");
    setLastScenarioId("p1", "s-A");

    setStorageNamespace("uid-B");
    // B sees nothing — uid-A's data is structurally inaccessible
    expect(getLastScenarioId("p1")).toBeNull();

    setStorageNamespace("uid-A");
    expect(getLastScenarioId("p1")).toBe("s-A");
  });

  it("clearAllLastScenarios only clears the active namespace", () => {
    setStorageNamespace("uid-A");
    setLastScenarioId("pA", "sA");

    setStorageNamespace("uid-B");
    setLastScenarioId("pB", "sB");

    // B clears their own namespace
    clearAllLastScenarios();
    expect(localStorage.getItem("spert-scheduler:active-scenarios:uid-B")).toBeNull();

    // A's data is untouched
    expect(localStorage.getItem("spert-scheduler:active-scenarios:uid-A")).not.toBeNull();
    setStorageNamespace("uid-A");
    expect(getLastScenarioId("pA")).toBe("sA");
  });
});

describe("legacy-key migration (v0.45.3)", () => {
  beforeEach(() => {
    localStorage.clear();
    setStorageNamespace("local");
    _resetLegacyScenarioMemoryMigrationForTests();
  });

  it("migrates pre-v0.45.3 unprefixed key to :local namespace", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ p1: "s1", p2: "s2" }));

    migrateLegacyScenarioMemoryToLocal();

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();

    expect(getLastScenarioId("p1")).toBe("s1");
    expect(getLastScenarioId("p2")).toBe("s2");
  });

  it("idempotent: re-running does not corrupt or duplicate", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ p1: "s1" }));

    migrateLegacyScenarioMemoryToLocal();
    _resetLegacyScenarioMemoryMigrationForTests();
    migrateLegacyScenarioMemoryToLocal();
    _resetLegacyScenarioMemoryMigrationForTests();
    migrateLegacyScenarioMemoryToLocal();

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("does nothing when legacy key is absent", () => {
    migrateLegacyScenarioMemoryToLocal();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("recoverable on partial failure: leaves legacy key in place if write fails", () => {
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ p1: "s1" }));

    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === STORAGE_KEY) {
        throw new DOMException("simulated quota", "QuotaExceededError");
      }
      realSetItem.call(this, k, v);
    };

    try {
      migrateLegacyScenarioMemoryToLocal();
    } finally {
      Storage.prototype.setItem = realSetItem;
    }

    // Legacy key still present — data is recoverable
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });
});
