// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";

import {
  installResizeObserverStub,
  lastResizeObserver,
  installMatchMediaStub,
  setSystemPrefersDark,
  emitSystemColorSchemeChange,
  colorSchemeListenerCount,
} from "./test-stubs";

/**
 * Proof that the shared browser stubs can FAIL, written before anything is built on them.
 *
 * These are the only two pieces of test infrastructure every component test in §3.3 will
 * depend on, which makes them the highest-leverage place in the gap for the project's
 * recurring failure class: a stub that reports success without exercising anything looks
 * exactly like a passing test, and here it would do so for every file at once rather than
 * one.
 *
 * The two specific hazards, and the assertion that rules each out:
 *
 *   • a ResizeObserver whose callback never fires  -> "delivers the width to the callback"
 *   • a matchMedia whose `matches` never changes   -> "the query result CHANGES"
 *
 * Each of those tests distinguishes a working stub from a no-op. A stub that merely
 * exists would pass neither.
 */

beforeEach(() => {
  installResizeObserverStub();
  installMatchMediaStub();
});

describe("ResizeObserver stub", () => {
  it("is installed on the global", () => {
    expect(typeof globalThis.ResizeObserver).toBe("function");
  });

  it("reports no instance until something constructs one", () => {
    expect(lastResizeObserver()).toBeNull();
  });

  it("captures the instance and records what it observes", () => {
    const el = document.createElement("div");
    const observer = new ResizeObserver(() => {});
    observer.observe(el);

    expect(lastResizeObserver()).not.toBeNull();
    expect(lastResizeObserver()!.observed).toEqual([el]);
  });

  it("DELIVERS THE WIDTH TO THE CALLBACK — the assertion a no-op stub cannot pass", () => {
    // This is the whole point of the file. A stub that stores the callback and never
    // calls it would satisfy every other test here, and would silently make every
    // resize-dependent assertion in §3.3 pass vacuously.
    const cb = vi.fn();
    // Bound rather than discarded: constructing IS the subject here — the stub captures
    // the instance from its constructor — and `lastResizeObserver()` must return this one.
    const observer = new ResizeObserver(cb);
    expect(lastResizeObserver()).toBe(observer as unknown as ReturnType<typeof lastResizeObserver>);

    expect(cb).not.toHaveBeenCalled();
    lastResizeObserver()!.emit(1440);

    expect(cb).toHaveBeenCalledTimes(1);
    const [entries] = cb.mock.calls[0]!;
    expect((entries as ResizeObserverEntry[])[0]!.contentRect.width).toBe(1440);
  });

  it("delivers each emit separately rather than coalescing", () => {
    const cb = vi.fn();
    const observer = new ResizeObserver(cb);
    expect(observer).toBeDefined();
    lastResizeObserver()!.emit(800);
    lastResizeObserver()!.emit(1200);
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it("records disconnect, so a cleanup assertion means something", () => {
    const observer = new ResizeObserver(() => {});
    expect(observer).toBeDefined();
    expect(lastResizeObserver()!.disconnected).toBe(false);
    lastResizeObserver()!.disconnect();
    expect(lastResizeObserver()!.disconnected).toBe(true);
  });

  it("drops an unobserved element", () => {
    const a = document.createElement("div");
    const b = document.createElement("div");
    const observer = new ResizeObserver(() => {});
    observer.observe(a);
    observer.observe(b);
    observer.unobserve(a);
    expect(lastResizeObserver()!.observed).toEqual([b]);
  });

  it("resets the captured instance on re-install, so state cannot leak between files", () => {
    const observer = new ResizeObserver(() => {});
    expect(observer).toBeDefined();
    expect(lastResizeObserver()).not.toBeNull();
    installResizeObserverStub();
    expect(lastResizeObserver()).toBeNull();
  });
});

describe("matchMedia stub", () => {
  const darkQuery = () => matchMedia("(prefers-color-scheme: dark)");

  it("is installed on the global", () => {
    expect(typeof globalThis.matchMedia).toBe("function");
  });

  it("defaults to a light system preference", () => {
    expect(darkQuery().matches).toBe(false);
  });

  it("THE QUERY RESULT CHANGES — the assertion a fixed stub cannot pass", () => {
    // A stub returning a constant would satisfy "defaults to light" above and then make
    // every dark-mode branch untestable while appearing to pass.
    expect(darkQuery().matches).toBe(false);
    setSystemPrefersDark(true);
    expect(darkQuery().matches).toBe(true);
    setSystemPrefersDark(false);
    expect(darkQuery().matches).toBe(false);
  });

  it("reflects the change on an ALREADY-HELD query object, not only on new ones", () => {
    // Components hold the MediaQueryList across renders, so a snapshot-at-construction
    // stub would diverge from real browser behaviour.
    const mq = darkQuery();
    expect(mq.matches).toBe(false);
    setSystemPrefersDark(true);
    expect(mq.matches).toBe(true);
  });

  it("does not answer an unrelated query with the colour-scheme answer", () => {
    setSystemPrefersDark(true);
    expect(matchMedia("(min-width: 600px)").matches).toBe(false);
  });

  it("notifies registered listeners on an emitted change", () => {
    const listener = vi.fn();
    darkQuery().addEventListener("change", listener);

    expect(listener).not.toHaveBeenCalled();
    emitSystemColorSchemeChange(true);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0].matches).toBe(true);
    // The emitted change must also move the query result, not just fire the event.
    expect(darkQuery().matches).toBe(true);
  });

  it("stops notifying after removeEventListener, so cleanup assertions mean something", () => {
    const listener = vi.fn();
    const mq = darkQuery();
    mq.addEventListener("change", listener);
    expect(colorSchemeListenerCount()).toBe(1);

    mq.removeEventListener("change", listener);
    expect(colorSchemeListenerCount()).toBe(0);

    emitSystemColorSchemeChange(true);
    expect(listener).not.toHaveBeenCalled();
  });

  it("clears listeners and preference on re-install, so state cannot leak between files", () => {
    darkQuery().addEventListener("change", vi.fn());
    setSystemPrefersDark(true);

    installMatchMediaStub();

    expect(colorSchemeListenerCount()).toBe(0);
    expect(darkQuery().matches).toBe(false);
  });
});
