// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// WI-162, the owner's condition on delete (R674): a Section delete's row in Recent AI activity names
// what went and where, and those names stay in the browser. "Only AI-generated content transits the
// relay" (the AI Privacy Notice) must stay true, so nothing the drain writes back may carry them. The
// real hook and the real store, with Firestore mocked at the module edge; the same mock as
// use-ai-connectivity.test.ts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

const fs = vi.hoisted(() => ({
  getDoc: vi.fn(),
  updateDoc: vi.fn(),
  setDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn((_q: unknown, _onNext: (s: unknown) => void, _onError?: (e: unknown) => void) => () => {}),
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
import { useProjectStore } from "./use-project-store";
import { createActivity, createProject, createScenario } from "@app/api/project-service";
import { describeOutcome } from "@ui/components/ConnectAI/describe-ai-outcome";
import type { AiOpResult } from "@app/api/ai-batch-service";
import { DEFAULT_SCENARIO_SETTINGS, type Project } from "@domain/models/types";

const GONE = "Zanzibar Phase";
const KEPT = "Kept Phase";
const SCENARIO = "Baseline";

function seed(): Project {
  const scenario = {
    ...createScenario(SCENARIO, "2026-11-02"),
    activities: [{ ...createActivity("a1", DEFAULT_SCENARIO_SETTINGS), id: "a1", min: 3, mostLikely: 5, max: 7 }],
    bands: [
      { id: "h1", name: GONE, insertBeforeActivityId: "a1" },
      { id: "h2", name: KEPT, insertBeforeActivityId: null },
    ],
  };
  const project: Project = { ...createProject("P", "2026-11-02"), scenarios: [scenario] };
  useProjectStore.setState({ projects: [project], undoStack: [], redoStack: [] });
  return project;
}

/** Everything the drain and the snapshot sent toward the relay, as text. */
const written = () => JSON.stringify([...fs.setDoc.mock.calls, ...fs.updateDoc.mock.calls]);

/** Connect, drain one `delete_sections`, and let the 2 s snapshot debounce pass. */
async function deleteThroughTheDrain(consentRead: boolean) {
  const project = seed();
  const onResults = vi.fn<(results: AiOpResult[]) => void>();
  let drain: ((snapshot: unknown) => void) | undefined;
  fs.onSnapshot.mockImplementation((q, onNext) => {
    if ((q as { __query?: boolean }).__query) drain = onNext;
    return () => {};
  });
  const store = useProjectStore.getState();
  const { result, rerender } = renderHook(
    ({ current }: { current: Project }) => useAiConnectivity({
      project: current,
      activeScenarioId: current.scenarios[0]!.id,
      workCalendar: undefined,
      applyAiBatch: store.applyAiBatch,
      clearAiUndoFrame: store.clearAiUndoFrame,
      onResults,
    }),
    { initialProps: { current: project } },
  );
  await act(async () => { await result.current.startSession(consentRead); });
  act(() => {
    drain!({ docChanges: () => [{ type: "added", doc: { data: () => ({ seq: 1, op: "delete_sections", payload: { ids: ["h1"] } }) } }] });
  });
  rerender({ current: useProjectStore.getState().projects[0]! });
  await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  return onResults.mock.calls[0]![0]!;
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  fs.getDoc.mockReset();
  fs.updateDoc.mockReset().mockResolvedValue(undefined);
  fs.setDoc.mockReset().mockResolvedValue(undefined);
  fs.deleteDoc.mockReset().mockResolvedValue(undefined);
  fs.onSnapshot.mockReset().mockReturnValue(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("a Section delete's names stay in the browser", () => {
  it("reach the row, and no write, with Read Mode off", async () => {
    const results = await deleteThroughTheDrain(false);
    expect(describeOutcome(results[0]!.outcome).text).toBe(`Deleted from ${SCENARIO}: ${GONE}`);
    expect(fs.setDoc).toHaveBeenCalled(); // the session document, so the search below has something to read
    expect(written()).not.toContain(GONE);
    expect(written()).not.toContain(SCENARIO);
  });

  it("reach no write with Read Mode on, where the snapshot does carry the project as it stands", async () => {
    const results = await deleteThroughTheDrain(true);
    expect(describeOutcome(results[0]!.outcome).text).toBe(`Deleted from ${SCENARIO}: ${GONE}`);
    expect(written()).toContain(KEPT); // the control: the snapshot was written, and this search can see a Section's name
    expect(written()).not.toContain(GONE);
    expect(written()).not.toContain("deletedSections");
  });
});
