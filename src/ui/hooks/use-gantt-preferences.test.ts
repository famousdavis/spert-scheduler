// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

import { useGanttPreferences } from "./use-gantt-preferences";
import { usePreferencesStore } from "./use-preferences-store";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { UserPreferences } from "@domain/models/types";

/**
 * At 0% coverage before charter §3.2. Tier 1.
 *
 * ⚠️ The first draft asserted a viewMode of "buffered", which is not a member of
 * GanttViewMode ("deterministic" | "uncertainty"). The test PASSED — the store holds
 * whatever it is given — so it was asserting a value the app can never produce. `tsc`
 * caught it only because the type is a literal union; on a plain `string` field the same
 * mistake would have shipped. Third fixture-value slip in this session.
 *
 * Five preference reads, each with a `??` fallback, plus five setters. The fallbacks are
 * the interesting part: they fire when a preferences object predating the Gantt settings
 * is loaded from localStorage, which the Zod schema permits because those fields are
 * `.optional()`. The setters are the other half — each must write its OWN key and leave
 * the rest alone.
 */

const setPrefs = (overrides: Partial<UserPreferences>) =>
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_USER_PREFERENCES, ...overrides },
  });

/** A preferences object with every Gantt key absent, as an old stored blob would be. */
const withoutGanttKeys = () => {
  const prefs: Record<string, unknown> = { ...DEFAULT_USER_PREFERENCES };
  for (const k of [
    "ganttViewMode",
    "ganttShowToday",
    "ganttShowCriticalPath",
    "ganttShowProjectName",
    "ganttShowArrows",
  ]) {
    delete prefs[k];
  }
  usePreferencesStore.setState({ preferences: prefs as unknown as UserPreferences });
};

beforeEach(() => {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

describe("useGanttPreferences", () => {
  it("reads the stored values", () => {
    setPrefs({
      ganttViewMode: "uncertainty",
      ganttShowToday: false,
      ganttShowCriticalPath: false,
      ganttShowProjectName: true,
      ganttShowArrows: false,
    });
    const { result } = renderHook(() => useGanttPreferences());

    expect(result.current.viewMode).toBe("uncertainty");
    expect(result.current.showToday).toBe(false);
    expect(result.current.showCriticalPath).toBe(false);
    expect(result.current.showProjectName).toBe(true);
    expect(result.current.showArrows).toBe(false);
  });

  it("falls back when the keys are absent entirely", () => {
    // Premise: the fixture really is missing the keys, or the `??` branches below are
    // never exercised and this test proves nothing.
    withoutGanttKeys();
    const stored = usePreferencesStore.getState().preferences as unknown as Record<
      string,
      unknown
    >;
    expect("ganttViewMode" in stored).toBe(false);
    expect("ganttShowArrows" in stored).toBe(false);

    const { result } = renderHook(() => useGanttPreferences());
    expect(result.current.viewMode).toBe("deterministic");
    expect(result.current.showToday).toBe(true);
    expect(result.current.showCriticalPath).toBe(true);
    expect(result.current.showProjectName).toBe(false);
    expect(result.current.showArrows).toBe(true);
  });

  it("does NOT fall back over a stored `false` — only over absence", () => {
    // `??` rather than `||` is what makes this true, and swapping them is a plausible
    // edit that this test is here to reject.
    setPrefs({
      ganttShowToday: false,
      ganttShowCriticalPath: false,
      ganttShowArrows: false,
    });
    const { result } = renderHook(() => useGanttPreferences());
    expect(result.current.showToday).toBe(false);
    expect(result.current.showCriticalPath).toBe(false);
    expect(result.current.showArrows).toBe(false);
  });

  describe("setters", () => {
    it("each writes only its own key", () => {
      const { result } = renderHook(() => useGanttPreferences());

      act(() => result.current.setViewMode("uncertainty"));
      act(() => result.current.setShowToday(false));
      act(() => result.current.setShowCriticalPath(false));
      act(() => result.current.setShowProjectName(true));
      act(() => result.current.setShowArrows(false));

      const prefs = usePreferencesStore.getState().preferences;
      expect(prefs.ganttViewMode).toBe("uncertainty");
      expect(prefs.ganttShowToday).toBe(false);
      expect(prefs.ganttShowCriticalPath).toBe(false);
      expect(prefs.ganttShowProjectName).toBe(true);
      expect(prefs.ganttShowArrows).toBe(false);
    });

    it("leaves unrelated preferences untouched", () => {
      setPrefs({ dateFormat: "DD/MM/YYYY", defaultTrialCount: 12345 });
      const { result } = renderHook(() => useGanttPreferences());

      act(() => result.current.setShowArrows(false));

      const prefs = usePreferencesStore.getState().preferences;
      expect(prefs.dateFormat).toBe("DD/MM/YYYY");
      expect(prefs.defaultTrialCount).toBe(12345);
    });

    it("is reflected in the hook's own next read", () => {
      const { result } = renderHook(() => useGanttPreferences());
      expect(result.current.showArrows).toBe(true);
      act(() => result.current.setShowArrows(false));
      expect(result.current.showArrows).toBe(false);
    });
  });
});
