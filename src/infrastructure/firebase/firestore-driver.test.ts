// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Project } from "@domain/models/types";
import { SCHEMA_VERSION } from "@domain/models/types";

// Mock the firebase config module so `db` is a truthy sentinel. The driver
// guards all writes with `if (!db) return;`, so a non-null value is
// sufficient to exercise the debounce/cancel path.
vi.mock("./firebase", () => ({
  db: { __mock: true },
  auth: null,
  isFirebaseAvailable: true,
}));

// Mock firebase/firestore so we can observe setDoc without hitting the
// network. doc/setDoc/serverTimestamp are the only functions the save path
// touches.
const setDocSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, _col: string, id: string) => ({ id })),
  setDoc: (...args: unknown[]) => setDocSpy(...args),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(() => "__ts__"),
}));

import { FirestoreDriver } from "./firestore-driver";

function makeProject(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    createdAt: "2025-01-01T00:00:00.000Z",
    schemaVersion: SCHEMA_VERSION,
    scenarios: [
      {
        id: "s1",
        name: "Baseline",
        startDate: "2025-02-01",
        activities: [],
        dependencies: [],
        milestones: [],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 50000,
          rngSeed: "seed",
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
  };
}

describe("FirestoreDriver.cancelPendingSaves", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drains all pending saves without firing setDoc", () => {
    const driver = new FirestoreDriver("uid-1");

    driver.save(makeProject("p1"));
    driver.save(makeProject("p2"));
    driver.save(makeProject("p3"));

    driver.cancelPendingSaves();

    // Advance past the 500ms debounce window — no save should fire because
    // all timers were cancelled and pending data removed.
    vi.advanceTimersByTime(1000);

    expect(setDocSpy).not.toHaveBeenCalled();
  });

  it("is idempotent when there are no pending saves", () => {
    const driver = new FirestoreDriver("uid-1");

    expect(() => driver.cancelPendingSaves()).not.toThrow();
    expect(() => driver.cancelPendingSaves()).not.toThrow();
    expect(setDocSpy).not.toHaveBeenCalled();
  });

  it("allows per-project cancelPendingSave to still be called afterwards", () => {
    const driver = new FirestoreDriver("uid-1");

    driver.save(makeProject("p1"));
    driver.cancelPendingSaves();

    // Per-project cancel on an already-empty map should be a safe no-op
    expect(() => driver.cancelPendingSave("p1")).not.toThrow();
    expect(() => driver.cancelPendingSave("p-does-not-exist")).not.toThrow();

    vi.advanceTimersByTime(1000);
    expect(setDocSpy).not.toHaveBeenCalled();
  });

  it("does not cancel saves queued AFTER the call", () => {
    const driver = new FirestoreDriver("uid-1");

    driver.save(makeProject("p1"));
    driver.cancelPendingSaves();

    // A new save queued after cancel should still fire
    driver.save(makeProject("p2"));
    vi.advanceTimersByTime(600);

    expect(setDocSpy).toHaveBeenCalledTimes(1);
  });
});
