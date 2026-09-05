// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useSingleOrDoubleClick } from "./use-single-or-double-click";

const DELAY = 250;

/** A real single click: one `click` with detail 1. */
const singleClick = (h: { onClick: ((e: { detail: number }) => void) | undefined }) =>
  act(() => h.onClick?.({ detail: 1 }));

/**
 * A real double click, in the order the browser fires it: click(1), click(2), dblclick.
 * ⚠️ Sending only `dblclick` would skip the two `click` events the production handler
 * actually has to survive, and would let a handler that mis-reads `detail` pass.
 */
const doubleClick = (h: {
  onClick: ((e: { detail: number }) => void) | undefined;
  onDoubleClick: (() => void) | undefined;
}) =>
  act(() => {
    h.onClick?.({ detail: 1 });
    h.onClick?.({ detail: 2 });
    h.onDoubleClick?.();
  });

describe("useSingleOrDoubleClick", () => {
  // ⚠️ Typed as the callbacks the hook actually takes, not `ReturnType<typeof vi.fn>`.
  // The loose form is `Mock<Procedure | Constructable>`, which tsc rejects at the call
  // site — and no `as` here, because a cast would silence exactly the check that caught it.
  let onSingle: Mock<() => void>;
  let onDouble: Mock<() => void>;

  beforeEach(() => {
    vi.useFakeTimers();
    onSingle = vi.fn<() => void>();
    onDouble = vi.fn<() => void>();
  });
  afterEach(() => vi.useRealTimers());

  const both = () =>
    renderHook(() =>
      useSingleOrDoubleClick({ onSingle, onDouble, delayMs: DELAY, enabled: true }),
    );

  it("defers the single action by the delay, then runs it", () => {
    const { result } = both();
    singleClick(result.current);

    // ⚠️ The BEFORE assertion is the one that matters. Without it, a handler that fired
    // immediately would still pass the after-assertion, and the whole point of this hook
    // is the wait.
    expect(onSingle).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(DELAY - 1);
    });
    expect(onSingle).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(onSingle).toHaveBeenCalledTimes(1);
    expect(onDouble).not.toHaveBeenCalled();
  });

  it("a double click runs the double action and never the single one", () => {
    const { result } = both();
    doubleClick(result.current);

    act(() => {
      vi.advanceTimersByTime(DELAY * 4);
    });
    expect(onDouble).toHaveBeenCalledTimes(1);
    expect(onSingle).not.toHaveBeenCalled();
  });

  it("ignores a double click that arrives after the single action already ran", () => {
    // ⚠️ The browser's double-click threshold is an OS setting and is NOT required to be
    // shorter than our delay, so `dblclick` genuinely can arrive after the timer elapsed.
    // Both actions running would open an editor AND start a rename underneath it.
    const { result } = both();
    singleClick(result.current);
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(onSingle).toHaveBeenCalledTimes(1);

    act(() => result.current.onDoubleClick?.());
    expect(onDouble).not.toHaveBeenCalled();
    expect(onSingle).toHaveBeenCalledTimes(1);
  });

  it("a third click after a double click does not also run the single action", () => {
    // ⚠️ THIS TEST EXISTS BECAUSE ITS ABSENCE WAS MEASURED. Removing the `detail > 1`
    // guard from the click handler failed NOTHING in the first draft of this suite: for
    // an ordinary double click the guard is genuinely redundant, because the second
    // click merely re-arms a timer the dblclick then cancels.
    //
    // A THIRD click is where it stops being redundant. Without the guard, click 3 arms a
    // fresh timer after `dblclick` has already started the rename, and the single action
    // then fires on top of it — an editor opening over an in-progress inline rename.
    const { result } = both();
    act(() => {
      result.current.onClick?.({ detail: 1 });
      result.current.onClick?.({ detail: 2 });
      result.current.onDoubleClick?.();
      result.current.onClick?.({ detail: 3 });
    });
    act(() => {
      vi.advanceTimersByTime(DELAY * 4);
    });

    expect(onDouble).toHaveBeenCalledTimes(1);
    expect(onSingle).not.toHaveBeenCalled();
  });

  it("does not wait when there is no double action to wait for", () => {
    const { result } = renderHook(() =>
      useSingleOrDoubleClick({ onSingle, onDouble: undefined, delayMs: DELAY, enabled: true }),
    );
    singleClick(result.current);
    expect(onSingle).toHaveBeenCalledTimes(1); // immediate — no timer advanced
  });

  it("runs the double action on a single click when there is no single action", () => {
    // Preserves the affordance a caller supplying only one callback already had.
    const { result } = renderHook(() =>
      useSingleOrDoubleClick({ onSingle: undefined, onDouble, delayMs: DELAY, enabled: true }),
    );
    singleClick(result.current);
    expect(onDouble).toHaveBeenCalledTimes(1);
  });

  it("is inert when disabled, and attaches no handlers at all", () => {
    const { result } = renderHook(() =>
      useSingleOrDoubleClick({ onSingle, onDouble, delayMs: DELAY, enabled: false }),
    );
    expect(result.current.interactive).toBe(false);
    expect(result.current.onClick).toBeUndefined();
    expect(result.current.onDoubleClick).toBeUndefined();
  });

  it("is inert when neither action is supplied", () => {
    const { result } = renderHook(() =>
      useSingleOrDoubleClick({
        onSingle: undefined, onDouble: undefined, delayMs: DELAY, enabled: true,
      }),
    );
    expect(result.current.interactive).toBe(false);
    expect(result.current.onClick).toBeUndefined();
  });

  it("reports itself interactive whenever an action exists", () => {
    expect(both().result.current.interactive).toBe(true);
  });

  it("drops a pending single action when the element unmounts", () => {
    // A chart that re-renders mid-click must not open an editor for a row that is gone.
    const { result, unmount } = both();
    singleClick(result.current);
    unmount();
    act(() => {
      vi.advanceTimersByTime(DELAY * 4);
    });
    expect(onSingle).not.toHaveBeenCalled();
  });

  it("a second single click replaces the first pending one rather than queueing two", () => {
    const { result } = both();
    singleClick(result.current);
    act(() => {
      vi.advanceTimersByTime(DELAY - 50);
    });
    singleClick(result.current);
    act(() => {
      vi.advanceTimersByTime(DELAY);
    });
    expect(onSingle).toHaveBeenCalledTimes(1);
  });
});
