// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGridFocus } from "./use-grid-state";
import type { Activity, ActivityBand } from "@domain/models/types";

function makeActivity(id: string): Activity {
  return {
    id,
    name: id,
    min: 1,
    mostLikely: 2,
    max: 3,
    confidenceLevel: "mediumConfidence",
    distributionType: "triangular",
    status: "planned",
  };
}

const noBands: ActivityBand[] = [];

describe("useGridFocus — positional insert support", () => {
  it("signalActivityAddById focuses the specified ID when the array grows", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const inserted = makeActivity("ins");
    const { result, rerender } = renderHook(
      ({ activities }: { activities: Activity[] }) => useGridFocus(activities, noBands),
      { initialProps: { activities: [a1, a2] } },
    );
    expect(result.current.focusActivityId).toBeNull();

    act(() => {
      result.current.signalActivityAddById(inserted.id);
    });
    // Deliver the new array containing the inserted activity at a mid-list position.
    rerender({ activities: [a1, inserted, a2] });
    expect(result.current.focusActivityId).toBe(inserted.id);
  });

  it("signalActivityAdd (no-id) focuses the last activity when the array grows", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const { result, rerender } = renderHook(
      ({ activities }: { activities: Activity[] }) => useGridFocus(activities, noBands),
      { initialProps: { activities: [a1] } },
    );

    act(() => {
      result.current.signalActivityAdd();
    });
    rerender({ activities: [a1, a2] });
    expect(result.current.focusActivityId).toBe(a2.id);
  });

  it("carry-over regression guard: signalActivityAdd after signalActivityAddById clears the stale ID", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const stale = makeActivity("stale");
    const { result, rerender } = renderHook(
      ({ activities }: { activities: Activity[] }) => useGridFocus(activities, noBands),
      { initialProps: { activities: [a1] } },
    );

    // Set positional target, then immediately clear via the no-id signal — no
    // array growth in between.
    act(() => {
      result.current.signalActivityAddById(stale.id);
      result.current.signalActivityAdd();
    });
    // Now grow the array (the new activity is a2, NOT the stale id).
    rerender({ activities: [a1, a2] });
    expect(result.current.focusActivityId).toBe(a2.id);
  });

  it("no-op-then-grow: signalActivityAddById without growth, then signalActivityAdd + grow focuses last activity", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const stale = makeActivity("stale");
    const { result, rerender } = renderHook(
      ({ activities }: { activities: Activity[] }) => useGridFocus(activities, noBands),
      { initialProps: { activities: [a1] } },
    );

    act(() => {
      result.current.signalActivityAddById(stale.id);
    });
    // No array growth occurs after this signal; the ref still holds "stale".
    act(() => {
      result.current.signalActivityAdd(); // clears stale ID
    });
    rerender({ activities: [a1, a2] });
    expect(result.current.focusActivityId).toBe(a2.id);
  });

  it("target ID missing from grown array (cloud-sync race surrogate): focus falls back to last activity", () => {
    const a1 = makeActivity("a1");
    const a2 = makeActivity("a2");
    const a3 = makeActivity("a3");
    const { result, rerender } = renderHook(
      ({ activities }: { activities: Activity[] }) => useGridFocus(activities, noBands),
      { initialProps: { activities: [a1] } },
    );

    act(() => {
      result.current.signalActivityAddById("ghost-id");
    });
    // Deliver a longer array that does NOT contain "ghost-id" (the cloud-sync
    // race surrogate: a remote snapshot grew the array without our activity).
    rerender({ activities: [a1, a2, a3] });
    expect(result.current.focusActivityId).toBe(a3.id);
  });
});
