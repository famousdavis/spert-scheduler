// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";

import { GanttActivityName } from "./GanttActivityName";
import { NAME_CLICK_DELAY_MS } from "./gantt-constants";
import type { Activity } from "@domain/models/types";

/**
 * Wiring test for the Gantt name label.
 *
 * ⚠️ WHAT THIS IS FOR, AND WHAT IT CANNOT DO. `fireEvent` dispatches straight at an
 * element, so it proves the handlers are attached to the NAME and behave — it says
 * nothing about which element a real click would land on, because a dispatched event
 * never goes through hit-testing. That question was settled separately, in the browser,
 * with `elementFromPoint` and real coordinate clicks. Both halves are needed: the hook's
 * own suite covers the timer, and this covers the wiring the hook cannot see.
 */

const ACT: Activity = {
  id: "a1",
  name: "Discovery",
  min: 3,
  mostLikely: 5,
  max: 10,
  confidenceLevel: "mediumConfidence",
  distributionType: "normal",
  status: "planned",
} as Activity;

function setup(over: Partial<Parameters<typeof GanttActivityName>[0]> = {}) {
  const onEditActivity = vi.fn();
  const onRenameActivity = vi.fn();
  const setEditTarget = vi.fn();
  const setEditValue = vi.fn();
  const { container, unmount } = render(
    <svg>
      <GanttActivityName
        act={ACT}
        y={0}
        rowHeight={32}
        leftMargin={260}
        fontSize={12}
        nameCharLimit={40}
        fill="#000"
        isLocked={false}
        onEditActivity={onEditActivity}
        onRenameActivity={onRenameActivity}
        editTarget={null}
        setEditTarget={setEditTarget}
        setEditValue={setEditValue}
        activityIndexMap={null}
        {...over}
      />
    </svg>,
  );
  const text = container.querySelector("text")!;
  return { text, onEditActivity, setEditTarget, setEditValue, unmount, container };
}

const single = (el: Element) => fireEvent.click(el, { detail: 1 });
const double = (el: Element) => {
  fireEvent.click(el, { detail: 1 });
  fireEvent.click(el, { detail: 2 });
  fireEvent.doubleClick(el, { detail: 2 });
};

describe("GanttActivityName — gestures", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("renders the label and marks it clickable", () => {
    const { text } = setup();
    expect(text.textContent).toBe("Discovery");
    expect(text.getAttribute("class")).toContain("cursor-pointer");
  });

  it("single click opens the editor after the delay, and starts no rename", () => {
    const { text, onEditActivity, setEditTarget } = setup();
    single(text);
    expect(onEditActivity).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(NAME_CLICK_DELAY_MS);
    });
    expect(onEditActivity).toHaveBeenCalledWith("a1");
    expect(setEditTarget).not.toHaveBeenCalled();
  });

  it("double click starts the rename and never opens the editor", () => {
    const { text, onEditActivity, setEditTarget, setEditValue } = setup();
    double(text);

    act(() => {
      vi.advanceTimersByTime(NAME_CLICK_DELAY_MS * 4);
    });
    expect(setEditTarget).toHaveBeenCalledWith({ kind: "activity", id: "a1" });
    expect(setEditValue).toHaveBeenCalledWith("Discovery");
    expect(onEditActivity).not.toHaveBeenCalled();
  });

  it("a locked scenario attaches nothing and neither gesture fires", () => {
    const { text, onEditActivity, setEditTarget } = setup({ isLocked: true });
    expect(text.getAttribute("class")).toContain("pointer-events-none");

    single(text);
    double(text);
    act(() => {
      vi.advanceTimersByTime(NAME_CLICK_DELAY_MS * 4);
    });
    expect(onEditActivity).not.toHaveBeenCalled();
    expect(setEditTarget).not.toHaveBeenCalled();
  });

  it("hides itself while this activity is the one being renamed", () => {
    const { text } = setup({ editTarget: { kind: "activity", id: "a1" } });
    expect(text.style.display).toBe("none");
  });

  it("stays visible while a DIFFERENT activity is being renamed", () => {
    // ⚠️ Paired with the case above: a component that hid whenever any edit was in
    // progress would pass that one alone.
    const { text } = setup({ editTarget: { kind: "activity", id: "a2" } });
    expect(text.style.display).toBe("");
  });

  it("stays visible while a BAND is being renamed", () => {
    // Band renaming is a separate path; it must not blank an activity's label.
    const { text } = setup({ editTarget: { kind: "band", id: "a1" } });
    expect(text.style.display).toBe("");
  });

  it("prefixes the activity number when an index map is supplied", () => {
    const { text } = setup({ activityIndexMap: new Map([["a1", 4]]) });
    expect(text.textContent).toBe("#4 Discovery");
  });

  it("truncates a label past the character limit", () => {
    const long = { ...ACT, name: "A".repeat(60) } as Activity;
    const { text } = setup({ act: long, nameCharLimit: 20 });
    expect(text.textContent).toHaveLength(21); // 18 chars + "..."
    expect(text.textContent!.endsWith("...")).toBe(true);
  });
});
