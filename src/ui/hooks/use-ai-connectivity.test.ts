// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

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
  onSnapshot: vi.fn(() => () => {}),
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

function existingSession(consentRead: boolean) {
  return {
    exists: () => true,
    data: () => ({ consentRead, expiresAt: { toDate: () => new Date(Date.now() + 1_000_000) } }),
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

  it("aborts and reverts local consent when a consent DOWNGRADE (Read → off) fails transiently", async () => {
    localStorage.setItem(AI_SESSION_ID_KEY, "sess-down");
    fs.getDoc.mockResolvedValue(existingSession(true)); // server currently read:true
    fs.updateDoc.mockRejectedValue({ code: "unavailable" });

    const { result } = renderHook(() => useAiConnectivity(makeParams()));

    let ret: boolean | undefined;
    await act(async () => {
      ret = await result.current.startSession(false); // request downgrade
    });

    expect(ret).toBe(false);
    expect(result.current.sessionState.sessionActive).toBe(false);
    // Local consent reverted to the server's actual state (still read:true).
    expect(readConsent()?.read).toBe(true);
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
