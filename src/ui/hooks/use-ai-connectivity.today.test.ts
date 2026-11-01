// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-154 (Review 36, G1): a connected AI is given a new snapshot when the local day turns, since a
// scenario with a recorded start schedules unstarted work from today. Without it the AI kept
// yesterday's schedule until something else changed. The same Firestore mock as
// use-ai-connectivity.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

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
vi.mock("@infrastructure/firebase/firebase", () => ({
  db: { __db: true },
  isFirebaseAvailable: true,
  getTeardownAiSession: () => null,
}));

import { useAiConnectivity } from "./use-ai-connectivity";
import { AI_SESSION_ID_KEY } from "@app/ai-connectivity-constants";
import type { Project } from "@domain/models/types";

const project = { id: "P1", name: "P", scenarios: [] } as unknown as Project;
/** The snapshot writes so far: the setDoc calls whose payload carries the project. */
const snapshotWrites = () => fs.setDoc.mock.calls.filter((c) => (c as unknown[])[1] && "project" in ((c as unknown[])[1] as object)).length;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 27, 23, 58, 0) }); // Tue 23:58, local
  localStorage.clear();
  fs.getDoc.mockReset().mockResolvedValue({
    exists: () => true,
    data: () => ({ consentRead: true, openProductId: "P1", expiresAt: { toDate: () => new Date(Date.now() + 1_000_000) } }),
  });
  fs.updateDoc.mockReset().mockResolvedValue(undefined);
  fs.setDoc.mockReset().mockResolvedValue(undefined);
  fs.deleteDoc.mockReset().mockResolvedValue(undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("the AI snapshot and the day", () => {
  it("is written again when the local day turns, with nothing else changed", async () => {
    localStorage.setItem(AI_SESSION_ID_KEY, "sess-today");
    const { result } = renderHook(() => useAiConnectivity({
      project, activeScenarioId: null, workCalendar: undefined, applyAiBatch: vi.fn(() => []), clearAiUndoFrame: vi.fn(),
    }));
    await act(async () => { await result.current.startSession(true); });
    await act(async () => { await vi.advanceTimersByTimeAsync(5_000); }); // 23:58:05: the first write
    const before = snapshotWrites();
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * 60_000); }); // past Wed 00:00:01, and its 2 s debounce
    expect([before, snapshotWrites()]).toEqual([1, 2]);
  });
});
