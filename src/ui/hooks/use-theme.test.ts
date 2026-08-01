// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useTheme } from "./use-theme";
import { usePreferencesStore } from "./use-preferences-store";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { ThemePreference } from "@domain/models/types";

/**
 * At 0% coverage before charter §3.2. Tier 1 — a store, `window.matchMedia`, and one
 * `document.documentElement` class.
 *
 * jsdom has no `matchMedia`, so it is stubbed here rather than in `src/test-setup.ts`,
 * keeping the blast radius off the other test files.
 */

let systemPrefersDark = false;
let changeHandlers: ((e: MediaQueryListEvent) => void)[] = [];
let removedHandlers = 0;

function stubMatchMedia() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("dark") && systemPrefersDark,
    media: query,
    addEventListener: (_: string, h: (e: MediaQueryListEvent) => void) => {
      changeHandlers.push(h);
    },
    removeEventListener: () => {
      removedHandlers++;
    },
  }));
}

/** Drive a system theme change through every registered listener. */
const emitSystemChange = (matches: boolean) =>
  act(() => {
    systemPrefersDark = matches;
    for (const h of changeHandlers) h({ matches } as MediaQueryListEvent);
  });

const setTheme = (theme: ThemePreference) =>
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_USER_PREFERENCES, theme },
  });

const isDark = () => document.documentElement.classList.contains("dark");

beforeEach(() => {
  systemPrefersDark = false;
  changeHandlers = [];
  removedHandlers = 0;
  document.documentElement.classList.remove("dark");
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
  stubMatchMedia();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTheme", () => {
  it("defaults to the shipped 'system' preference", () => {
    expect(DEFAULT_USER_PREFERENCES.theme).toBe("system");
    expect(renderHook(() => useTheme()).result.current.theme).toBe("system");
  });

  describe("explicit preferences", () => {
    it("resolves 'light' and removes the dark class", () => {
      document.documentElement.classList.add("dark"); // start dirty
      setTheme("light");
      const { result } = renderHook(() => useTheme());
      expect(result.current.effectiveTheme).toBe("light");
      expect(isDark()).toBe(false);
    });

    it("resolves 'dark' and adds the dark class", () => {
      setTheme("dark");
      const { result } = renderHook(() => useTheme());
      expect(result.current.effectiveTheme).toBe("dark");
      expect(isDark()).toBe(true);
    });

    it("ignores the system preference entirely", () => {
      systemPrefersDark = true;
      setTheme("light");
      const { result } = renderHook(() => useTheme());
      expect(result.current.effectiveTheme).toBe("light");
      expect(isDark()).toBe(false);
    });
  });

  describe("'system' preference", () => {
    it("follows a dark system setting", () => {
      systemPrefersDark = true;
      setTheme("system");
      const { result } = renderHook(() => useTheme());
      expect(result.current.effectiveTheme).toBe("dark");
      expect(isDark()).toBe(true);
    });

    it("follows a light system setting", () => {
      systemPrefersDark = false;
      setTheme("system");
      const { result } = renderHook(() => useTheme());
      expect(result.current.effectiveTheme).toBe("light");
      expect(isDark()).toBe(false);
    });

    it("subscribes to system changes, and unsubscribes on unmount", () => {
      setTheme("system");
      const { unmount } = renderHook(() => useTheme());
      expect(changeHandlers.length).toBe(1);
      unmount();
      expect(removedHandlers).toBe(1);
    });

    it("does NOT subscribe when the preference is explicit", () => {
      setTheme("dark");
      renderHook(() => useTheme());
      expect(changeHandlers.length).toBe(0);
    });

    it("updates the dark class when the system flips to dark", () => {
      setTheme("system");
      const { result } = renderHook(() => useTheme());
      expect(isDark()).toBe(false);

      emitSystemChange(true);
      expect(isDark()).toBe(true);

      // ⚠️ RECORDED, NOT ENDORSED — and NOT a defect shipping today.
      //
      // `effectiveTheme` is memoised on [theme] alone, so the RETURNED value does not
      // follow a system change; only the DOM class does, via the separate effect above.
      //
      // Nothing is broken right now: `useTheme()` is called in exactly one place
      // (Layout.tsx:37) and it is a bare side-effect call — no destructuring, so
      // effectiveTheme has ZERO consumers outside this hook and this file. Verified by
      // grep, not assumed. Tailwind's `dark:` variant keys off the class, so what the
      // user sees is correct.
      //
      // It is a trap laid for the first consumer. Whoever adds a component that branches
      // on effectiveTheme — a chart palette, a canvas fill, anything that cannot use a
      // CSS variant — gets a value that silently stops tracking the system theme. That
      // is why this is routed to §3.6 as an injection candidate rather than patched here:
      // the hook's output is not a function of its inputs, which is the actual defect
      // class, and §3.6 is where that gets addressed deliberately.
      expect(result.current.effectiveTheme).toBe("light");
    });

    it("updates the dark class when the system flips back to light", () => {
      systemPrefersDark = true;
      setTheme("system");
      renderHook(() => useTheme());
      expect(isDark()).toBe(true);

      emitSystemChange(false);
      expect(isDark()).toBe(false);
    });
  });

  describe("setTheme", () => {
    it("writes the preference through to the store", () => {
      const { result } = renderHook(() => useTheme());
      act(() => result.current.setTheme("dark"));
      expect(usePreferencesStore.getState().preferences.theme).toBe("dark");
    });

    it("re-resolves the effective theme and the dark class", () => {
      const { result } = renderHook(() => useTheme());
      expect(isDark()).toBe(false);

      act(() => result.current.setTheme("dark"));
      expect(result.current.effectiveTheme).toBe("dark");
      expect(isDark()).toBe(true);

      act(() => result.current.setTheme("light"));
      expect(result.current.effectiveTheme).toBe("light");
      expect(isDark()).toBe(false);
    });

    it("leaves other preferences alone", () => {
      usePreferencesStore.setState({
        preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat: "DD/MM/YYYY" },
      });
      const { result } = renderHook(() => useTheme());
      act(() => result.current.setTheme("dark"));
      expect(usePreferencesStore.getState().preferences.dateFormat).toBe("DD/MM/YYYY");
    });
  });
});
