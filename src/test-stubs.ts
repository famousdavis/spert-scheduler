// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Browser APIs jsdom does not implement, stubbed for the component layer (charter §3.3).
//
// ⚠️ WHY THESE ARE A SEPARATE, TESTED MODULE RATHER THAN INLINE IN test-setup.ts
// A stub that reports success without exercising anything is instance 1–7 of this
// project's recurring failure class — except in SHARED infrastructure, where it poisons
// every file built on it rather than one. The two specific hazards:
//
//   • a ResizeObserver stub whose callback never fires makes every resize-dependent
//     assertion pass vacuously;
//   • a matchMedia stub whose `matches` never changes makes every theme assertion pass
//     whichever branch is under test.
//
// Both look like green tests. So each stub is controllable, and `test-stubs.test.ts`
// proves it can fail — the callback fires, the query result changes — BEFORE anything is
// written on top of it. Installed by test-setup.ts, which runs for every test file, so
// this state is per-file and needs no manual reset.
//
// Nothing is stubbed speculatively. html2canvas and navigator.clipboard are NOT here:
// only export-chart uses them, its pure half is already extracted and tested, and the
// remaining shell is genuinely browser-only. Add them when a test needs them, with a
// proof, not before.

// -- ResizeObserver ----------------------------------------------------------

export interface StubResizeObserver {
  observed: Element[];
  disconnected: boolean;
  observe(el: Element): void;
  unobserve(el: Element): void;
  disconnect(): void;
  /** Drive a resize through the observed callback. */
  emit(width: number): void;
}

let lastResizeObserverInstance: StubResizeObserver | null = null;

/** The most recently constructed observer, or null if nothing has constructed one. */
export function lastResizeObserver(): StubResizeObserver | null {
  return lastResizeObserverInstance;
}

function createStubResizeObserver(cb: ResizeObserverCallback): StubResizeObserver {
  const stub: StubResizeObserver = {
    observed: [],
    disconnected: false,
    observe(el) {
      stub.observed.push(el);
    },
    unobserve(el) {
      stub.observed = stub.observed.filter((e) => e !== el);
    },
    disconnect() {
      stub.disconnected = true;
    },
    emit(width) {
      cb(
        [{ contentRect: { width } } as unknown as ResizeObserverEntry],
        stub as unknown as ResizeObserver,
      );
    },
  };
  return stub;
}

export function installResizeObserverStub(): void {
  lastResizeObserverInstance = null;
  // A plain function rather than a class: `new` on a function returning an object yields
  // that object, which avoids aliasing `this` in a constructor
  // (@typescript-eslint/no-this-alias).
  globalThis.ResizeObserver = function (cb: ResizeObserverCallback) {
    lastResizeObserverInstance = createStubResizeObserver(cb);
    return lastResizeObserverInstance;
  } as unknown as typeof ResizeObserver;
}

// -- matchMedia --------------------------------------------------------------

type MediaListener = (e: MediaQueryListEvent) => void;

let systemPrefersDark = false;
const colorSchemeListeners = new Set<MediaListener>();

/** Set what `(prefers-color-scheme: dark)` reports to subsequent queries. */
export function setSystemPrefersDark(value: boolean): void {
  systemPrefersDark = value;
}

/** Set the preference AND notify every registered listener, as a real OS change would. */
export function emitSystemColorSchemeChange(value: boolean): void {
  systemPrefersDark = value;
  for (const listener of colorSchemeListeners) {
    listener({ matches: value } as MediaQueryListEvent);
  }
}

/** How many listeners are currently registered — lets a test assert cleanup happened. */
export function colorSchemeListenerCount(): number {
  return colorSchemeListeners.size;
}

export function installMatchMediaStub(): void {
  systemPrefersDark = false;
  colorSchemeListeners.clear();
  globalThis.matchMedia = ((query: string) => ({
    // Only the dark-scheme query is modelled; anything else reports no match rather than
    // silently inheriting the colour-scheme answer.
    get matches() {
      return query.includes("prefers-color-scheme: dark") && systemPrefersDark;
    },
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => {
      colorSchemeListeners.add(listener);
    },
    removeEventListener: (_type: string, listener: MediaListener) => {
      colorSchemeListeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof matchMedia;
}
