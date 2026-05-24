// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBufferedField } from "./use-buffered-field";

interface HookProps {
  externalValue: string;
  onCommit: (value: string) => void;
}

function setup(initial: HookProps) {
  return renderHook(
    ({ externalValue, onCommit }: HookProps) => useBufferedField(externalValue, onCommit),
    { initialProps: initial },
  );
}

describe("useBufferedField", () => {
  it("focus guard: external update while focused does not overwrite the typed value", () => {
    const onCommit = vi.fn();
    const { result, rerender } = setup({ externalValue: "A", onCommit });

    act(() => {
      result.current.handleFocus();
    });
    act(() => {
      result.current.setLocalValue("AB");
    });
    // Simulate any external source (cloud sync ack, undo, collaborator) while
    // the user is still focused and typing.
    rerender({ externalValue: "X", onCommit });

    expect(result.current.localValue).toBe("AB");
    expect(onCommit).not.toHaveBeenCalled();

    act(() => {
      result.current.handleBlur();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("AB");
  });

  it("unfocused sync: external updates flow into localValue when not focused", () => {
    const onCommit = vi.fn();
    const { result, rerender } = setup({ externalValue: "A", onCommit });

    rerender({ externalValue: "B", onCommit });

    expect(result.current.localValue).toBe("B");
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("change-aware blur — no edit, no external change: does not commit", () => {
    const onCommit = vi.fn();
    const { result } = setup({ externalValue: "A", onCommit });

    act(() => {
      result.current.handleFocus();
    });
    act(() => {
      result.current.handleBlur();
    });

    expect(onCommit).not.toHaveBeenCalled();
  });

  it("change-aware blur — no edit, external change while focused: does not commit (stale-blur-no-edit guard)", () => {
    const onCommit = vi.fn();
    const { result, rerender } = setup({ externalValue: "A", onCommit });

    act(() => {
      result.current.handleFocus(); // snapshot = "A"
    });
    // User does NOT type anything. External (collaborator/undo) updates the
    // value while the user is focused.
    rerender({ externalValue: "B", onCommit });

    act(() => {
      result.current.handleBlur();
    });

    // The user never typed; the change-aware guard against focusedSnapshot
    // must prevent reverting the collaborator's update.
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("change-aware blur — edited: commits the typed value once", () => {
    const onCommit = vi.fn();
    const { result } = setup({ externalValue: "A", onCommit });

    act(() => {
      result.current.handleFocus();
    });
    act(() => {
      result.current.setLocalValue("new");
    });
    act(() => {
      result.current.handleBlur();
    });

    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("new");
  });

  it("Escape (revertValue + blur): reverts without committing", () => {
    const onCommit = vi.fn();
    const { result } = setup({ externalValue: "A", onCommit });

    act(() => {
      result.current.handleFocus();
    });
    act(() => {
      result.current.setLocalValue("typed");
    });
    act(() => {
      result.current.revertValue();
    });
    // Simulates the synchronous blur that follows nameInputRef.current?.blur()
    // at the call site after revertValue().
    act(() => {
      result.current.handleBlur();
    });

    expect(onCommit).not.toHaveBeenCalled();
    expect(result.current.localValue).toBe("A");
  });

  it("last-blur-wins: blur overwrites a concurrent remote rename that arrived while focused", () => {
    const onCommit = vi.fn();
    const { result, rerender } = setup({ externalValue: "original", onCommit });

    act(() => {
      result.current.handleFocus();
    });
    act(() => {
      result.current.setLocalValue("user typed");
    });
    // Collaborator renames while the user is still focused — focus guard
    // suppresses, localValue stays "user typed".
    rerender({ externalValue: "collaborator rename", onCommit });
    expect(result.current.localValue).toBe("user typed");

    act(() => {
      result.current.handleBlur();
    });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("user typed");
  });
});
