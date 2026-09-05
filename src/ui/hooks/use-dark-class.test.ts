// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useIsDarkClass } from "./use-dark-class";

const root = () => document.documentElement;

/**
 * ⚠️ ASYNC ON PURPOSE. `MutationObserver` delivers its callback as a MICROTASK, so the
 * class mutation and the resulting re-render are never in the same synchronous turn. A
 * plain `act(() => …)` here reads the value before the observer has fired and fails
 * against a hook that works — which is exactly what the first draft of this file did.
 */
const setDark = async (on: boolean) =>
  act(async () => {
    if (on) root().classList.add("dark");
    else root().classList.remove("dark");
    await Promise.resolve();
  });

afterEach(() => {
  root().classList.remove("dark");
  root().removeAttribute("data-unrelated");
  vi.restoreAllMocks();
});

describe("useIsDarkClass", () => {
  it("reports the class that is present when it first renders", () => {
    root().classList.add("dark");
    expect(renderHook(() => useIsDarkClass()).result.current).toBe(true);
  });

  it("reports false when the class is absent", () => {
    expect(renderHook(() => useIsDarkClass()).result.current).toBe(false);
  });

  it("FOLLOWS a later class change — the whole point of the hook", async () => {
    // ⚠️ This is the assertion the DOM-read-during-render could not satisfy. The old code
    // returned the right answer on first render too; what it could not do is notice the
    // second one. A test that only checked the initial value would pass against the bug.
    const { result } = renderHook(() => useIsDarkClass());
    expect(result.current).toBe(false);

    await setDark(true);
    expect(result.current).toBe(true);

    await setDark(false);
    expect(result.current).toBe(false);
  });

  it("ignores attribute changes that are not the class", async () => {
    // The observer is filtered to `class`; an unrelated attribute must not churn renders.
    const { result } = renderHook(() => useIsDarkClass());
    await act(async () => {
      root().setAttribute("data-unrelated", "1");
      await Promise.resolve();
    });
    expect(result.current).toBe(false);
  });

  it("survives a class change that does not touch `dark`", async () => {
    root().classList.add("something-else");
    const { result } = renderHook(() => useIsDarkClass());
    expect(result.current).toBe(false);
    await setDark(true);
    expect(result.current).toBe(true);
    root().classList.remove("something-else");
  });

  it("disconnects its observer on unmount", () => {
    // ⚠️ Asserted on the OBSERVER, not on "nothing crashed". A leaked MutationObserver on
    // documentElement outlives every chart the user ever opens, and the failure mode is
    // invisible until it is a performance problem.
    const disconnect = vi.fn();
    const observe = vi.fn();
    const original = globalThis.MutationObserver;
    class FakeObserver {
      observe = observe;
      disconnect = disconnect;
      takeRecords = () => [];
    }
    globalThis.MutationObserver = FakeObserver as unknown as typeof MutationObserver;
    try {
      const { unmount } = renderHook(() => useIsDarkClass());
      expect(observe).toHaveBeenCalledTimes(1);
      expect(observe.mock.calls[0]?.[1]).toEqual({ attributes: true, attributeFilter: ["class"] });
      expect(disconnect).not.toHaveBeenCalled();
      unmount();
      expect(disconnect).toHaveBeenCalledTimes(1);
    } finally {
      globalThis.MutationObserver = original;
    }
  });

  it("observes the document element itself, not some other node", () => {
    const observe = vi.fn();
    const original = globalThis.MutationObserver;
    class FakeObserver {
      observe = observe;
      disconnect = () => {};
      takeRecords = () => [];
    }
    globalThis.MutationObserver = FakeObserver as unknown as typeof MutationObserver;
    try {
      renderHook(() => useIsDarkClass());
      expect(observe.mock.calls[0]?.[0]).toBe(document.documentElement);
    } finally {
      globalThis.MutationObserver = original;
    }
  });
});
