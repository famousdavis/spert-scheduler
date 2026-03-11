// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { sanitizeForFirestore, stripFirestoreFields, stripSimulationResultsForCloud } from "./firestore-sanitize";
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
});
