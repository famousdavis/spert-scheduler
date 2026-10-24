// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Targeted coverage for the A4 consent/session-integrity fix (v0.57.4): the
// symmetric consent-UPGRADE-failure abort in resumeSession, its DOWNGRADE-failure
// sibling (regression), and changePermissions' already-correct fail-closed
// handling (regression guard). NOT comprehensive hook coverage — everything else
// on the hook (fresh-session creation internals, heartbeats, listener reconnect,
// snapshot scheduling) is intentionally out of scope for this pass.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// Reconfigurable spies shared with the firebase/firestore mock (hoisted so the
// mock factory can close over them).
const fs = vi.hoisted(() => ({
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  // Typed with the real onSnapshot shape so a test may mockImplementation a
  // (query, onNext, onError) capture; the default is reset per test below.
  onSnapshot: vi.fn(
    (_q: unknown, _onNext: (s: unknown) => void, _onError?: (e: unknown) => void) => () => {},
  ),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn(() => ({ __ref: true })),
  collection: vi.fn(() => ({ __col: true })),
  query: vi.fn(() => ({ __query: true })),
  where: vi.fn(() => ({ __where: true })),
  orderBy: vi.fn(() => ({ __order: true })),
  serverTimestamp: vi.fn(() => ({ __ts: true })),
  getDoc: fs.getDoc,
  updateDoc: fs.updateDoc,
  setDoc: fs.setDoc,
  deleteDoc: fs.deleteDoc,
  onSnapshot: fs.onSnapshot,
}));

// Truthy db + availability so startSession does not bail at its guard, plus a
// no-op teardown callable.
vi.mock("@infrastructure/firebase/firebase", () => ({
  db: { __db: true },
  isFirebaseAvailable: true,
  getTeardownAiSession: () => null,
}));

import { useAiConnectivity } from "./use-ai-connectivity";
import { AI_SESSION_ID_KEY, AI_CONSENT_KEY } from "@app/ai-connectivity-constants";
import type { Project } from "@domain/models/types";

const project = { id: "P1", name: "P", scenarios: [] } as unknown as Project;

function makeParams() {
  return {
    project,
    activeScenarioId: null,
    workCalendar: undefined,
    applyAiBatch: vi.fn(() => []),
    clearAiUndoFrame: vi.fn(),
  };
}

function existingSession(consentRead: boolean, openProductId: string = "P1") {
  return {
    exists: () => true,
    data: () => ({
      consentRead,
      openProductId,
      expiresAt: { toDate: () => new Date(Date.now() + 1_000_000) },
    }),
  };
}

function readConsent(): { read?: boolean } | null {
  const raw = localStorage.getItem(AI_CONSENT_KEY);
  return raw ? JSON.parse(raw) : null;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  fs.getDoc.mockReset();
  fs.updateDoc.mockReset();
  fs.setDoc.mockReset().mockResolvedValue(undefined);
  fs.deleteDoc.mockReset().mockResolvedValue(undefined);
  fs.onSnapshot.mockReset().mockReturnValue(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("resumeSession consent-write-failure handling (A4)", () => {
  it("aborts and reverts local consent when a consent UPGRADE (off → Read) fails transiently", async () => {
    localStorage.setItem(AI_SESSION_ID_KEY, "sess-up");
    fs.getDoc.mockResolvedValue(existingSession(false)); // server currently read:false
    fs.updateDoc.mockRejectedValue({ code: "unavailable" }); // transient, not not-found/permission-denied

    const { result } = renderHook(() => useAiConnectivity(makeParams()));

    let ret: boolean | undefined;
    await act(async () => {
      ret = await result.current.startSession(true); // request upgrade
    });

    expect(ret).toBe(false);
    expect(result.current.sessionState.sessionActive).toBe(false);
    expect(result.current.sessionState.consentRead).toBe(false);
    // Local consent reverted to the server's actual state (read:false).
    expect(readConsent()?.read).toBe(false);
    // No snapshot doc written — the abort returns before scheduleSnapshot.
    expect(fs.setDoc).not.toHaveBeenCalled();
  });

  it("AI-6: aborts but KEEPS the user's Read-off choice when a consent DOWNGRADE fails transiently", async () => {
    localStorage.setItem(AI_SESSION_ID_KEY, "sess-down");
    fs.getDoc.mockResolvedValue(existingSession(true)); // server currently read:true
    fs.updateDoc.mockRejectedValue({ code: "unavailable" });

    const { result } = renderHook(() => useAiConnectivity(makeParams()));

    let ret: boolean | undefined;
    await act(async () => {
      ret = await result.current.startSession(false); // request downgrade (Read off)
    });

    expect(ret).toBe(false);
    expect(result.current.sessionState.sessionActive).toBe(false);
    // AI-6 (v0.79.x audit): local consent keeps the user's CHOICE (read:false), NOT the server's
    // stale read:true. Pre-fix it wrote read:true, so the next Connect silently resumed Read on.
    expect(readConsent()?.read).toBe(false);
  });
});

describe("changePermissions fails closed on a write error (A4 regression guard)", () => {
  it("returns false and makes no optimistic state change in either direction", async () => {
    // No stored session id → fresh session path (no getDoc, setDoc succeeds).
    const { result } = renderHook(() => useAiConnectivity(makeParams()));

    let started: boolean | undefined;
    await act(async () => {
      started = await result.current.startSession(false); // start with Read off
    });
    expect(started).toBe(true);
    expect(result.current.sessionState.sessionActive).toBe(true);
    expect(result.current.sessionState.consentRead).toBe(false);

    // Now every consentRead write fails.
    fs.updateDoc.mockRejectedValue({ code: "unavailable" });

    let up: boolean | undefined;
    await act(async () => {
      up = await result.current.changePermissions(true);
    });
    expect(up).toBe(false);
    expect(result.current.sessionState.consentRead).toBe(false); // no optimistic flip

    let down: boolean | undefined;
    await act(async () => {
      down = await result.current.changePermissions(false);
    });
    expect(down).toBe(false);
    expect(result.current.sessionState.consentRead).toBe(false);
  });
});

// AI-4 (v0.79.8 security self-audit): a session is bound to the project it was
// opened for (`openProductId`). Its queued edits must never drain into a different
// project — not on resume, and not after the user navigates under a live session.
describe("AI-4 project binding", () => {
  it("recreates instead of resuming when the stored session was opened for a DIFFERENT project", async () => {
    // Threat reproduction: a session authored against P2 is present, but the open
    // project is P1. Pre-fix, resumeSession rebinds openProductId to P1 and P2's
    // queued edits drain into P1. The fix must start fresh instead.
    localStorage.setItem(AI_SESSION_ID_KEY, "sess-P2");
    fs.getDoc.mockResolvedValue(existingSession(true, "P2"));
    fs.setDoc.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAiConnectivity(makeParams()));
    let ret: boolean | undefined;
    await act(async () => {
      ret = await result.current.startSession(true);
    });

    expect(ret).toBe(true);
    // resumeSession did NOT run: no updateDoc carried a consentRead field (only
    // resume writes that — the heartbeat writes timestamps/openProductId only), so
    // the P2 session was never resumed into P1...
    const resumed = fs.updateDoc.mock.calls.some((args) => {
      const patch = args[1] as Record<string, unknown> | undefined;
      return !!patch && "consentRead" in patch;
    });
    expect(resumed).toBe(false);
    // ...a fresh session was created instead (createFreshSession → setDoc)...
    expect(fs.setDoc).toHaveBeenCalled();
    // ...under a new id, so P2's queued ops can never reach P1.
    expect(localStorage.getItem(AI_SESSION_ID_KEY)).not.toBe("sess-P2");
  });

  it("resumes in place when the stored session was opened for THIS project (control)", async () => {
    localStorage.setItem(AI_SESSION_ID_KEY, "sess-P1");
    fs.getDoc.mockResolvedValue(existingSession(true, "P1"));
    fs.updateDoc.mockResolvedValue(undefined);

    const { result } = renderHook(() => useAiConnectivity(makeParams()));
    await act(async () => {
      await result.current.startSession(true);
    });

    // Resumed in place: resumeSession wrote consentRead (not just the heartbeat);
    // no fresh create; id kept.
    const resumed = fs.updateDoc.mock.calls.some((args) => {
      const patch = args[1] as Record<string, unknown> | undefined;
      return !!patch && "consentRead" in patch;
    });
    expect(resumed).toBe(true);
    expect(fs.setDoc).not.toHaveBeenCalled();
    expect(localStorage.getItem(AI_SESSION_ID_KEY)).toBe("sess-P1");
  });

  it("rejects a drained batch after the user navigates to another project under a live session", async () => {
    // Capture the ops-listener callback (resubscribeOps subscribes first).
    let opsOnNext: ((snap: unknown) => void) | undefined;
    fs.onSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      opsOnNext ??= onNext;
      return () => {};
    });
    fs.setDoc.mockResolvedValue(undefined);

    const applyAiBatch = vi.fn(() => []);
    const p1 = { id: "P1", name: "P", scenarios: [] } as unknown as Project;
    const p2 = { id: "P2", name: "Q", scenarios: [] } as unknown as Project;
    const base = { activeScenarioId: null, workCalendar: undefined, applyAiBatch, clearAiUndoFrame: vi.fn() };

    const { result, rerender } = renderHook(
      (props: { project: Project }) => useAiConnectivity({ ...base, project: props.project }),
      { initialProps: { project: p1 } },
    );
    await act(async () => {
      await result.current.startSession(true); // binds the session to P1
    });
    expect(opsOnNext).toBeTypeOf("function");

    // User navigates to P2 while the session stays live.
    rerender({ project: p2 });

    const batch = {
      docChanges: () => [{ type: "added", doc: { data: () => ({ seq: 1, op: "create_activity", payload: {} }) } }],
    };
    act(() => opsOnNext!(batch));

    // Bound to P1, open is P2 → the batch is rejected, never applied.
    expect(applyAiBatch).not.toHaveBeenCalled();
  });

  it("applies a drained batch while the open project still matches the bound project (control)", async () => {
    let opsOnNext: ((snap: unknown) => void) | undefined;
    fs.onSnapshot.mockImplementation((_q: unknown, onNext: (s: unknown) => void) => {
      opsOnNext ??= onNext;
      return () => {};
    });
    fs.setDoc.mockResolvedValue(undefined);

    const applyAiBatch = vi.fn(() => []);
    const { result } = renderHook(() => useAiConnectivity({ ...makeParams(), applyAiBatch }));
    await act(async () => {
      await result.current.startSession(true);
    });

    const batch = {
      docChanges: () => [{ type: "added", doc: { data: () => ({ seq: 1, op: "create_activity", payload: {} }) } }],
    };
    act(() => opsOnNext!(batch));

    expect(applyAiBatch).toHaveBeenCalledWith("P1", expect.any(Array), null);
  });
});
