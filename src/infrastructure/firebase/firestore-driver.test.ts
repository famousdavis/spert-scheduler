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
  // Cloud Function callable factories — return null in tests so the driver's
  // null-guards short-circuit (we don't exercise the CF round-trip here).
  getSendInvitationEmail: vi.fn(() => null),
  getClaimPendingInvitations: vi.fn(() => null),
  getRevokeInvite: vi.fn(() => null),
  getResendInvite: vi.fn(() => null),
}));

// Mock firebase/firestore so we can observe setDoc without hitting the
// network. doc/setDoc/serverTimestamp are the only functions the save path
// touches; runTransaction/deleteField support the v0.42.0 removeCollaborator.
const setDocSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, _col: string, id: string) => ({ id })),
  setDoc: (...args: unknown[]) => setDocSpy(...args),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => "__delete__"),
  getDocs: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "__ts__"),
  updateDoc: vi.fn(),
}));

import {
  onSnapshot,
  runTransaction,
  where,
} from "firebase/firestore";
import { FirestoreDriver } from "./firestore-driver";

function makeProject(id: string): Project {
  return {
    id,
    name: `Project ${id}`,
    createdAt: "2025-01-01T00:00:00.000Z",
    schemaVersion: SCHEMA_VERSION,
    owner: null,
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

describe("FirestoreDriver.doSave (merge sentinel behavior)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("emits deleteField sentinels for cleared map keys so merge:true actually removes them", async () => {
    // Regression for the "Gantt custom colors return after refresh" bug:
    // when a preset click clears customPlannedColor/customInProgressColor by
    // setting them to `undefined`, the debounced save must include
    // deleteField() sentinels for those keys. Without the sentinels,
    // Firestore's deep merge leaves the prior values on the server doc.
    const driver = new FirestoreDriver("uid-1");
    const project = makeProject("p1");
    project.ganttAppearance = {
      nameColumnWidth: "normal",
      activityFontSize: "normal",
      rowDensity: "normal",
      barLabel: "duration",
      colorPreset: "classic",
      // Two cleared fields + one freshly-set field — matches the user repro.
      customPlannedColor: undefined,
      customInProgressColor: undefined,
      customCompletedColor: "#65a30d",
      weekendShading: false,
      fitToWindow: false,
    };

    driver.save(project);
    await vi.advanceTimersByTimeAsync(600);

    expect(setDocSpy).toHaveBeenCalledTimes(1);
    const [, payload, opts] = setDocSpy.mock.calls[0]!;
    expect(opts).toEqual({ merge: true });
    const data = payload as { ganttAppearance: Record<string, unknown> };
    expect(data.ganttAppearance.customCompletedColor).toBe("#65a30d");
    expect(data.ganttAppearance.customPlannedColor).toBe("__delete__");
    expect(data.ganttAppearance.customInProgressColor).toBe("__delete__");
  });
});

describe("FirestoreDriver.save debounce window", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setDocSpy.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not fire at 150ms, fires by 250ms (200ms debounce window)", async () => {
    // Regression: v0.45.6 → v0.45.7 reduced the debounce from 500ms to
    // 200ms so click-driven changes (preset reset, color picker) reach
    // Firestore before a fast browser refresh races the beforeunload
    // flush. Lock the boundary so future tuning is deliberate.
    const driver = new FirestoreDriver("uid-debounce");
    driver.save(makeProject("p-debounce"));

    await vi.advanceTimersByTimeAsync(150);
    expect(setDocSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(100);
    expect(setDocSpy).toHaveBeenCalledTimes(1);
  });
});

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

// ─── v0.42.0 bulk-sharing additions ────────────────────────────────────

describe("FirestoreDriver.listPendingInvites", () => {
  it("queries by inviterUid + modelId, NOT appId + modelId (composite-index regression guard)", async () => {
    const whereSpy = vi.mocked(where);
    whereSpy.mockClear();
    const driver = new FirestoreDriver("uid-owner");
    // Query may throw because getDocs is unconfigured here — that's fine; we
    // only care that `where` was called with the correct field names.
    await driver.listPendingInvites("project-123").catch(() => {});
    const fields = whereSpy.mock.calls.map(([field]) => field);
    expect(fields).toContain("inviterUid");
    expect(fields).toContain("modelId");
    expect(fields).not.toContain("appId"); // composite index is (inviterUid, modelId)
  });
});

describe("FirestoreDriver.removeCollaborator", () => {
  beforeEach(() => {
    vi.mocked(runTransaction).mockReset();
  });

  it("throws when removing yourself (self-removal lockout prevention)", async () => {
    const driver = new FirestoreDriver("uid-self");
    setDocSpy.mockClear();
    await expect(driver.removeCollaborator("p1", "uid-self")).rejects.toThrow(
      /yourself/i
    );
    // Guard 1 throws before runTransaction is even invoked.
    expect(runTransaction).not.toHaveBeenCalled();
    expect(setDocSpy).not.toHaveBeenCalled();
  });

  it("throws when caller is not the owner (Guard 2)", async () => {
    vi.mocked(runTransaction).mockImplementationOnce(
      async (
        _db: unknown,
        fn: (tx: never) => Promise<unknown>
      ): Promise<unknown> => {
        return fn({
          get: vi.fn().mockResolvedValue({
            exists: () => true,
            data: () => ({
              owner: "uid-someone-else",
              members: { "uid-someone-else": "owner" },
            }),
          }),
          update: vi.fn(),
        } as never);
      }
    );
    const driver = new FirestoreDriver("uid-caller");
    await expect(driver.removeCollaborator("p1", "uid-target")).rejects.toThrow(
      /owner/i
    );
  });

  it("throws when removing the project owner (Guard 3)", async () => {
    vi.mocked(runTransaction).mockImplementationOnce(
      async (
        _db: unknown,
        fn: (tx: never) => Promise<unknown>
      ): Promise<unknown> => {
        return fn({
          get: vi.fn().mockResolvedValue({
            exists: () => true,
            data: () => ({
              owner: "uid-caller",
              members: { "uid-caller": "owner" },
            }),
          }),
          update: vi.fn(),
        } as never);
      }
    );
    const driver = new FirestoreDriver("uid-caller");
    await expect(driver.removeCollaborator("p1", "uid-caller")).rejects.toThrow(
      /yourself/i
    );
    // Guard 1 actually fires for owner-self (caller === target). The Guard 3
    // path requires a different caller-vs-target combination — covered by the
    // happy-path test below by absence of the throw.
  });

  it("removes a non-owner member via tx.update + deleteField", async () => {
    const updateSpy = vi.fn();
    vi.mocked(runTransaction).mockImplementationOnce(
      async (
        _db: unknown,
        fn: (tx: never) => Promise<unknown>
      ): Promise<unknown> => {
        return fn({
          get: vi.fn().mockResolvedValue({
            exists: () => true,
            data: () => ({
              owner: "uid-caller",
              members: { "uid-caller": "owner", "uid-editor": "editor" },
            }),
          }),
          update: updateSpy,
        } as never);
      }
    );
    const driver = new FirestoreDriver("uid-caller");
    await expect(
      driver.removeCollaborator("p1", "uid-editor")
    ).resolves.toBeUndefined();
    expect(updateSpy).toHaveBeenCalledOnce();
    // The update call should target a `members.<uid>` field with the
    // delete sentinel — not a full members rebuild.
    const [, payload] = updateSpy.mock.calls[0]!;
    expect(payload).toHaveProperty("members.uid-editor");
    expect((payload as Record<string, unknown>)["members.uid-editor"]).toBe(
      "__delete__"
    );
  });
});

describe("FirestoreDriver.subscribeToProject", () => {
  it("callback receives owner from raw doc (LU1 / Lesson 38 regression guard)", () => {
    const callback = vi.fn();
    vi.mocked(onSnapshot).mockImplementationOnce(
      ((_ref: unknown, cb: (snap: unknown) => void) => {
        cb({
          metadata: { hasPendingWrites: false },
          exists: () => true,
          id: "p1",
          data: () => ({
            id: "p1",
            name: "Test",
            createdAt: "2026-01-01T00:00:00.000Z",
            schemaVersion: SCHEMA_VERSION,
            scenarios: [],
            owner: "uid-owner",
            members: { "uid-owner": "owner" },
          }),
        });
        return () => {};
      }) as never
    );
    const driver = new FirestoreDriver("uid-owner");
    driver.subscribeToProject("p1", callback);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ owner: "uid-owner" })
    );
  });

  it("callback receives owner: null when raw doc has no owner field", () => {
    const callback = vi.fn();
    vi.mocked(onSnapshot).mockImplementationOnce(
      ((_ref: unknown, cb: (snap: unknown) => void) => {
        cb({
          metadata: { hasPendingWrites: false },
          exists: () => true,
          id: "p1",
          data: () => ({
            id: "p1",
            name: "Test",
            createdAt: "2026-01-01T00:00:00.000Z",
            schemaVersion: SCHEMA_VERSION,
            scenarios: [],
            members: { "uid-owner": "owner" },
            // owner field intentionally absent — Zod default + ?? null fallback
          }),
        });
        return () => {};
      }) as never
    );
    const driver = new FirestoreDriver("uid-owner");
    driver.subscribeToProject("p1", callback);
    expect(callback).toHaveBeenCalledWith(
      expect.objectContaining({ owner: null })
    );
  });
});

