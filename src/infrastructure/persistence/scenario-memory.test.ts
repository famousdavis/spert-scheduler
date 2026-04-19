// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import {
  getLastScenarioId,
  setLastScenarioId,
  removeLastScenarioId,
  clearAllLastScenarios,
} from "./scenario-memory";

const STORAGE_KEY = "spert-scheduler:active-scenarios";

beforeEach(() => {
  localStorage.clear();
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
