// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from "vitest";

// Mock firebase/firestore deleteField with an observable sentinel so we can
// assert the merge-aware sanitizer emits it for cleared keys instead of just
// stripping them.
vi.mock("firebase/firestore", () => ({
  deleteField: vi.fn(() => "__delete__"),
}));

import {
  sanitizeForFirestore,
  sanitizeForFirestoreMerge,
  stripFirestoreFields,
  stripSimulationResultsForCloud,
} from "./firestore-sanitize";
import type { Project } from "@domain/models/types";

describe("sanitizeForFirestore", () => {
  it("passes through primitives unchanged", () => {
    expect(sanitizeForFirestore(42)).toBe(42);
    expect(sanitizeForFirestore("hello")).toBe("hello");
    expect(sanitizeForFirestore(true)).toBe(true);
    expect(sanitizeForFirestore(null)).toBe(null);
  });

  it("strips undefined values from objects", () => {
    const input = { a: 1, b: undefined, c: "hello" };
    const result = sanitizeForFirestore(input);
    expect(result).toEqual({ a: 1, c: "hello" });
    expect("b" in result).toBe(false);
  });

  it("strips undefined values recursively", () => {
    const input = {
      a: 1,
      nested: { b: 2, c: undefined, deep: { d: undefined, e: 3 } },
    };
    expect(sanitizeForFirestore(input)).toEqual({
      a: 1,
      nested: { b: 2, deep: { e: 3 } },
    });
  });

  it("preserves null values (Firestore accepts null)", () => {
    const input = { a: null, b: 1 };
    expect(sanitizeForFirestore(input)).toEqual({ a: null, b: 1 });
  });

  it("handles arrays with undefined-containing objects", () => {
    const input = [{ a: 1, b: undefined }, { c: 3 }];
    expect(sanitizeForFirestore(input)).toEqual([{ a: 1 }, { c: 3 }]);
  });

  it("handles empty objects and arrays", () => {
    expect(sanitizeForFirestore({})).toEqual({});
    expect(sanitizeForFirestore([])).toEqual([]);
  });

  it("converts undefined to null at top level", () => {
    expect(sanitizeForFirestore(undefined)).toBe(null);
  });
});

describe("stripFirestoreFields", () => {
  it("removes owner, members, and updatedAt fields", () => {
    const data = {
      id: "test-id",
      name: "Test Project",
      owner: "user-123",
      members: { "user-123": "owner" },
      updatedAt: "2026-01-01T00:00:00Z",
      schemaVersion: 8,
    };
    const result = stripFirestoreFields(data);
    expect(result).toEqual({
      id: "test-id",
      name: "Test Project",
      schemaVersion: 8,
    });
    expect("owner" in result).toBe(false);
    expect("members" in result).toBe(false);
    expect("updatedAt" in result).toBe(false);
  });

  it("works when Firestore fields are absent", () => {
    const data = { id: "test", name: "Test" };
    const result = stripFirestoreFields(data);
    expect(result).toEqual({ id: "test", name: "Test" });
  });
});

describe("stripSimulationResultsForCloud", () => {
  it("removes simulationResults from all scenarios", () => {
    const project = {
      id: "p1",
      name: "Test",
      createdAt: "2026-01-01T00:00:00Z",
      schemaVersion: 8,
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          startDate: "2026-01-01",
          activities: [],
          dependencies: [],
          milestones: [],
          settings: {} as unknown as Project["scenarios"][number]["settings"],
          simulationResults: {
            samples: [1, 2, 3],
            percentiles: {},
            mean: 2,
            standardDeviation: 1,
          } as unknown as Project["scenarios"][number]["simulationResults"],
        },
        {
          id: "s2",
          name: "Optimistic",
          startDate: "2026-01-01",
          activities: [],
          dependencies: [],
          milestones: [],
          settings: {} as unknown as Project["scenarios"][number]["settings"],
          simulationResults: undefined,
        },
      ],
    } as unknown as Project;

    const result = stripSimulationResultsForCloud(project);

    expect(result.scenarios[0]!.simulationResults).toBeUndefined();
    expect(result.scenarios[1]!.simulationResults).toBeUndefined();
    // Original unchanged
    expect(project.scenarios[0]!.simulationResults).toBeDefined();
  });

  it("preserves all band fields on each scenario", () => {
    const project = {
      id: "p1",
      name: "Test",
      createdAt: "2026-01-01T00:00:00Z",
      schemaVersion: 21,
      scenarios: [
        {
          id: "s1",
          name: "Baseline",
          startDate: "2026-01-01",
          activities: [],
          dependencies: [],
          milestones: [],
          settings: {} as unknown as Project["scenarios"][number]["settings"],
          bands: [
            {
              id: "b1",
              name: "Phase 1",
              insertBeforeActivityId: "a1",
              color: "#3366FF",
            },
          ],
        },
      ],
    } as unknown as Project;

    const result = stripSimulationResultsForCloud(project);
    expect(result.scenarios[0]!.bands).toEqual([
      { id: "b1", name: "Phase 1", insertBeforeActivityId: "a1", color: "#3366FF" },
    ]);
  });
});

describe("sanitizeForFirestoreMerge", () => {
  it("replaces undefined map-keys with deleteField sentinels", () => {
    // Regression: clearing a custom Gantt color (preset click sets the
    // custom* fields to `undefined`) used to leave the old value on the
    // Firestore document because `merge:true` deep-merges and the strip
    // path omitted the key. With deleteField sentinels, the merge actually
    // removes the field on the server.
    const input = {
      ganttAppearance: {
        colorPreset: "classic",
        customPlannedColor: undefined,
        customInProgressColor: undefined,
        customCompletedColor: "#65a30d",
      },
    };
    const result = sanitizeForFirestoreMerge(input) as {
      ganttAppearance: Record<string, unknown>;
    };
    expect(result.ganttAppearance.colorPreset).toBe("classic");
    expect(result.ganttAppearance.customCompletedColor).toBe("#65a30d");
    expect(result.ganttAppearance.customPlannedColor).toBe("__delete__");
    expect(result.ganttAppearance.customInProgressColor).toBe("__delete__");
  });

  it("passes through primitives unchanged", () => {
    expect(sanitizeForFirestoreMerge(42)).toBe(42);
    expect(sanitizeForFirestoreMerge("hello")).toBe("hello");
    expect(sanitizeForFirestoreMerge(true)).toBe(true);
    expect(sanitizeForFirestoreMerge(null)).toBe(null);
  });

  it("preserves null values (null is distinct from undefined)", () => {
    const input = { a: null, b: 1, c: undefined };
    const result = sanitizeForFirestoreMerge(input) as Record<string, unknown>;
    expect(result.a).toBe(null);
    expect(result.b).toBe(1);
    expect(result.c).toBe("__delete__");
  });

  it("strips undefined inside arrays (deleteField is forbidden in arrays)", () => {
    // Arrays are atomic under merge:true — the whole array is replaced — so
    // we never need deleteField inside them. Firestore also rejects
    // deleteField sentinels nested in arrays.
    const input = {
      bands: [
        { id: "b1", name: "Phase", insertBeforeActivityId: null, color: undefined },
      ],
    };
    const result = sanitizeForFirestoreMerge(input) as {
      bands: Record<string, unknown>[];
    };
    expect(result.bands[0]).toEqual({
      id: "b1",
      name: "Phase",
      insertBeforeActivityId: null,
    });
    expect("color" in result.bands[0]!).toBe(false);
  });

  it("recurses into nested maps", () => {
    const input = {
      level1: {
        keep: 1,
        clear: undefined,
        level2: { keep2: 2, clear2: undefined },
      },
    };
    const result = sanitizeForFirestoreMerge(input) as {
      level1: { keep: number; clear: unknown; level2: { keep2: number; clear2: unknown } };
    };
    expect(result.level1.keep).toBe(1);
    expect(result.level1.clear).toBe("__delete__");
    expect(result.level1.level2.keep2).toBe(2);
    expect(result.level1.level2.clear2).toBe("__delete__");
  });
});

describe("sanitizeForFirestore with bands", () => {
  it("preserves all band fields when color is set", () => {
    const input = {
      bands: [
        { id: "b1", name: "Phase 1", insertBeforeActivityId: "a1", color: "#3366FF" },
      ],
    };
    expect(sanitizeForFirestore(input)).toEqual({
      bands: [
        { id: "b1", name: "Phase 1", insertBeforeActivityId: "a1", color: "#3366FF" },
      ],
    });
  });

  it("strips color key when undefined but preserves other band fields", () => {
    const input = {
      bands: [
        { id: "b1", name: "Bare", insertBeforeActivityId: null, color: undefined },
      ],
    };
    const result = sanitizeForFirestore(input) as { bands: Record<string, unknown>[] };
    expect(result.bands[0]).toEqual({
      id: "b1",
      name: "Bare",
      insertBeforeActivityId: null,
    });
    expect("color" in result.bands[0]!).toBe(false);
  });
});
