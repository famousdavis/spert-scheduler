// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { act, renderHook, fireEvent } from "@testing-library/react";
import { useHeldWhilePointerDown } from "./use-held-while-pointer-down";

const tick = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function held(initial: string) {
  return renderHook(({ value }) => useHeldWhilePointerDown(value), { initialProps: { value: initial } });
}

describe("useHeldWhilePointerDown", () => {
  it("passes a new value straight through while no pointer is down", () => {
    const { result, rerender } = held("before");
    rerender({ value: "after" });
    expect(result.current).toBe("after");
  });

  it("holds the pre-press value through the press, and releases it a TASK after pointerup", async () => {
    const { result, rerender } = held("before");
    fireEvent.pointerDown(window);
    rerender({ value: "after" }); // what a commit on the press's blur would change
    expect(result.current).toBe("before");

    fireEvent.pointerUp(window);
    // Still held at pointerup: mouseup and click are dispatched in this same task, and they must
    // land on the layout the press began on.
    expect(result.current).toBe("before");
    await tick();
    expect(result.current).toBe("after");
  });

  it.each([
    ["pointercancel", () => fireEvent.pointerCancel(window)],
    ["a window blur", () => fireEvent.blur(window)],
  ])("releases on %s, so a press that never sees its pointerup cannot hold forever", async (_label, end) => {
    const { result, rerender } = held("before");
    fireEvent.pointerDown(window);
    rerender({ value: "after" });
    expect(result.current).toBe("before");
    end();
    await tick();
    expect(result.current).toBe("after");
  });

  it("a second press before the release keeps holding (a double click)", async () => {
    const { result, rerender } = held("before");
    fireEvent.pointerDown(window);
    rerender({ value: "after" });
    fireEvent.pointerUp(window);
    fireEvent.pointerDown(window); // before the release task runs
    await tick();
    expect(result.current).toBe("before");
    fireEvent.pointerUp(window);
    await tick();
    expect(result.current).toBe("after");
  });
});
