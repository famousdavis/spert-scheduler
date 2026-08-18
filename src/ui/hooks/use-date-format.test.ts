// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useDateFormat, useDateFormatShort } from "./use-date-format";
import { usePreferencesStore } from "./use-preferences-store";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { DateFormatPreference } from "@domain/models/types";

/**
 * At 0% coverage before charter §3.2. Tier 1: reaches only `/core` and a Zustand store.
 *
 * The formatters themselves are tested in calendar.test.ts; what is untested here is the
 * wiring — that each hook reads `preferences.dateFormat` and re-issues its callback when
 * that preference changes.
 */

const setFormat = (dateFormat: DateFormatPreference) =>
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat },
  });

beforeEach(() => {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
});

describe("useDateFormat", () => {
  it("uses the default MM/DD/YYYY preference", () => {
    // Premise: the shipped default is what this test assumes it is.
    expect(DEFAULT_USER_PREFERENCES.dateFormat).toBe("MM/DD/YYYY");
    const { result } = renderHook(() => useDateFormat());
    expect(result.current("2026-04-07")).toBe("04/07/2026");
  });

  it("follows the stored preference for each supported format", () => {
    for (const [format, expected] of [
      ["MM/DD/YYYY", "04/07/2026"],
      ["DD/MM/YYYY", "07/04/2026"],
      ["YYYY/MM/DD", "2026/04/07"],
    ] as const) {
      setFormat(format);
      const { result } = renderHook(() => useDateFormat());
      expect(result.current("2026-04-07"), `format ${format}`).toBe(expected);
    }
  });

  it("re-issues the callback when the preference changes", () => {
    const { result, rerender } = renderHook(() => useDateFormat());
    const first = result.current;

    setFormat("YYYY/MM/DD");
    rerender();

    // Identity matters: a stale callback would keep formatting with the old preference
    // in any consumer that captured it.
    expect(result.current).not.toBe(first);
    expect(result.current("2026-04-07")).toBe("2026/04/07");
  });

  it("keeps the same callback identity when nothing changes", () => {
    const { result, rerender } = renderHook(() => useDateFormat());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});

describe("useDateFormatShort", () => {
  it("produces the compact form for each supported format", () => {
    // ⚠️ YYYY/MM/DD was "04/07" until v0.64.2 — zero-padded numeric while the other two
    // abbreviated the month, so one preference got a different visual language. Corrected
    // when the Gantt bar labels became this hook's first production consumer. All three
    // now abbreviate; only the ORDER differs, which is what the preference actually means.
    for (const [format, expected] of [
      ["MM/DD/YYYY", "Apr 7"],
      ["DD/MM/YYYY", "7 Apr"],
      ["YYYY/MM/DD", "Apr 7"],
    ] as const) {
      setFormat(format);
      const { result } = renderHook(() => useDateFormatShort());
      expect(result.current("2026-04-07"), `format ${format}`).toBe(expected);
    }
  });

  it("re-issues the callback when the preference changes", () => {
    const { result, rerender } = renderHook(() => useDateFormatShort());
    const first = result.current;
    setFormat("DD/MM/YYYY");
    rerender();
    expect(result.current).not.toBe(first);
    expect(result.current("2026-04-07")).toBe("7 Apr");
  });
});
