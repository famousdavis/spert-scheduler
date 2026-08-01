// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useWorkCalendar } from "./use-work-calendar";
import { usePreferencesStore } from "./use-preferences-store";
import { useProjectStore } from "./use-project-store";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { Holiday, Project, UserPreferences } from "@domain/models/types";

/**
 * At 0% coverage before charter §3.2. Tier 1 — two Zustand stores and `/core`, nothing else.
 *
 * CLAUDE.md calls this "the ONLY place buildWorkCalendar() should be called in the
 * codebase", which makes it the single assembly point for every date computation in the
 * app — and it was entirely unexercised. The layering rules it encodes (project holidays
 * are absolute; forced work days are filtered against them) are tested in
 * work-calendar.test.ts; what is tested here is that this hook feeds them the right
 * arguments from the right places.
 */

// 2026-04-11 is a Saturday, 2026-04-13 a Monday — confirmed below before use.
const SATURDAY = new Date("2026-04-11T00:00:00");
const MONDAY = new Date("2026-04-13T00:00:00");

/**
 * ⚠️ A Holiday is a RANGE ({ id, name, startDate, endDate }), not a { date }. The first
 * draft of this file used `{ date, name }`; `buildHolidaySet` compared
 * `undefined === undefined`, added `undefined` to the set, and every holiday test failed.
 * The `as Partial<...>` casts that kept those fixtures terse are precisely what stopped
 * `tsc` from catching it — a reminder that a cast in a fixture disables the check that
 * would have found the mistake.
 */
const holiday = (date: string, name: string): Holiday => ({
  id: `h-${date}`,
  name,
  startDate: date,
  endDate: date,
});

const project = (overrides: Partial<Project> = {}): Project =>
  ({
    id: "p1",
    name: "Project 1",
    scenarios: [],
    ...overrides,
  }) as Project;

const setPrefs = (overrides: Partial<UserPreferences>) =>
  usePreferencesStore.setState({
    preferences: { ...DEFAULT_USER_PREFERENCES, ...overrides },
  });

const setProject = (p: Project) => useProjectStore.setState({ projects: [p] });

beforeEach(() => {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
  useProjectStore.setState({ projects: [] });
});

describe("useWorkCalendar", () => {
  it("fixture premise: the chosen dates really are a Saturday and a Monday", () => {
    expect(SATURDAY.getDay()).toBe(6);
    expect(MONDAY.getDay()).toBe(1);
  });

  it("fixture premise: a holiday is a single-day RANGE, which is what buildHolidaySet reads", () => {
    const h = holiday("2026-04-13", "Test Holiday");
    expect(h.startDate).toBe("2026-04-13");
    expect(h.endDate).toBe(h.startDate);
  });

  it("returns a working calendar even when the project does not exist", () => {
    // Every project lookup is `find(...)?.field`, so an unknown id must degrade to
    // preference-only defaults rather than throw.
    const { result } = renderHook(() => useWorkCalendar("nope"));
    expect(result.current.isWorkDay(MONDAY)).toBe(true);
    expect(result.current.isWorkDay(SATURDAY)).toBe(false);
  });

  it("applies the work-week preference", () => {
    setProject(project());
    setPrefs({ workDays: [1, 2, 3, 4, 5, 6] }); // Saturday now a work day
    const { result } = renderHook(() => useWorkCalendar("p1"));
    expect(result.current.isWorkDay(SATURDAY)).toBe(true);
  });

  it("falls back to Mon–Fri when the work-week preference is absent", () => {
    const prefs: Record<string, unknown> = { ...DEFAULT_USER_PREFERENCES };
    delete prefs.workDays;
    usePreferencesStore.setState({ preferences: prefs as unknown as UserPreferences });
    expect("workDays" in (usePreferencesStore.getState().preferences as object)).toBe(false);

    setProject(project());
    const { result } = renderHook(() => useWorkCalendar("p1"));
    expect(result.current.isWorkDay(MONDAY)).toBe(true);
    expect(result.current.isWorkDay(SATURDAY)).toBe(false);
  });

  it("removes a global holiday from the working calendar", () => {
    setPrefs({ globalCalendar: { holidays: [holiday("2026-04-13", "Test Holiday")] } });
    setProject(project());
    const { result } = renderHook(() => useWorkCalendar("p1"));
    expect(result.current.isWorkDay(MONDAY)).toBe(false);
  });

  it("converts a project weekend day into a work day", () => {
    setProject(project({ convertedWorkDays: ["2026-04-11"] }));
    const { result } = renderHook(() => useWorkCalendar("p1"));
    expect(result.current.isWorkDay(SATURDAY)).toBe(true);
  });

  it("lets a forced work day override a GLOBAL holiday", () => {
    setPrefs({ globalCalendar: { holidays: [holiday("2026-04-13", "Test Holiday")] } });
    setProject(project({ forcedWorkDays: ["2026-04-13"] }));
    const { result } = renderHook(() => useWorkCalendar("p1"));
    expect(result.current.isWorkDay(MONDAY)).toBe(true);
  });

  it("does NOT let a forced work day override a PROJECT holiday", () => {
    // The asymmetry is deliberate: project holidays are absolute. Threading
    // projectHolidays through the overrides argument is what makes it hold, and getting
    // that argument wrong here would silently re-open an overridable project holiday.
    setProject(
      project({
        forcedWorkDays: ["2026-04-13"],
        globalCalendarOverride: { holidays: [holiday("2026-04-13", "Project Holiday")] },
      }),
    );
    const { result } = renderHook(() => useWorkCalendar("p1"));
    expect(result.current.isWorkDay(MONDAY)).toBe(false);
  });

  it("removes a project holiday even when no global calendar exists", () => {
    setProject(
      project({
        globalCalendarOverride: { holidays: [holiday("2026-04-13", "Project Holiday")] },
      }),
    );
    const { result } = renderHook(() => useWorkCalendar("p1"));
    expect(result.current.isWorkDay(MONDAY)).toBe(false);
  });

  it("returns a stable instance until an input actually changes", () => {
    setProject(project());
    const { result, rerender } = renderHook(() => useWorkCalendar("p1"));
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
