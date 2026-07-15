// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  buildWorkWeekMask,
  buildHolidaySet,
  buildWorkCalendar,
  ProjectWorkCalendar,
  CalendarConfigurationError,
  advanceToNextWorkingDay,
  CALENDAR_ITERATION_LIMIT_MESSAGE,
  isCalendarError,
} from "./work-calendar";
import { addWorkingDays, countWorkingDays } from "./calendar";
import type { Holiday } from "@domain/models/types";

// ---------------------------------------------------------------------------
// isCalendarError (shared two-shape predicate)
// ---------------------------------------------------------------------------

describe("isCalendarError (shared two-shape predicate)", () => {
  it("recognizes a CalendarConfigurationError instance", () => {
    expect(isCalendarError(new CalendarConfigurationError("no valid work days"))).toBe(true);
  });

  it("recognizes a plain Error with the iteration-limit message prefix", () => {
    expect(isCalendarError(new Error(`${CALENDAR_ITERATION_LIMIT_MESSAGE} - date range too large`))).toBe(true);
  });

  it("does not misclassify an unrelated error", () => {
    expect(isCalendarError(new Error("PERT mean must be > 0, got 0"))).toBe(false);
    expect(isCalendarError("not even an Error")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// buildWorkWeekMask
// ---------------------------------------------------------------------------

describe("buildWorkWeekMask", () => {
  it("Mon–Fri (contiguous)", () => {
    const mask = buildWorkWeekMask([1, 2, 3, 4, 5]);
    expect(mask).toEqual([false, true, true, true, true, true, false]);
    expect(mask).toHaveLength(7);
  });

  it("Sun–Thu", () => {
    const mask = buildWorkWeekMask([0, 1, 2, 3, 4]);
    expect(mask).toEqual([true, true, true, true, true, false, false]);
  });

  it("Fri–Tue (non-contiguous)", () => {
    const mask = buildWorkWeekMask([5, 6, 0, 1, 2]);
    // Fri, Sat, Sun, Mon, Tue = work; Wed, Thu = off
    expect(mask).toEqual([true, true, true, false, false, true, true]);
  });

  it("single day", () => {
    const mask = buildWorkWeekMask([3]);
    expect(mask).toEqual([false, false, false, true, false, false, false]);
  });

  it("full week", () => {
    const mask = buildWorkWeekMask([0, 1, 2, 3, 4, 5, 6]);
    expect(mask).toEqual([true, true, true, true, true, true, true]);
  });

  it("always returns length-7 array", () => {
    for (let d = 0; d < 7; d++) {
      expect(buildWorkWeekMask([d])).toHaveLength(7);
    }
    expect(buildWorkWeekMask([0, 1, 2, 3, 4, 5, 6])).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------
// buildHolidaySet
// ---------------------------------------------------------------------------

describe("buildHolidaySet", () => {
  it("handles single-day holidays", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "New Year", startDate: "2025-01-01", endDate: "2025-01-01" },
    ];
    const set = buildHolidaySet(holidays);
    expect(set.has("2025-01-01")).toBe(true);
    expect(set.size).toBe(1);
  });

  it("expands multi-day holiday ranges", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Christmas Break", startDate: "2025-12-24", endDate: "2025-12-26" },
    ];
    const set = buildHolidaySet(holidays);
    expect(set.has("2025-12-24")).toBe(true);
    expect(set.has("2025-12-25")).toBe(true);
    expect(set.has("2025-12-26")).toBe(true);
    expect(set.size).toBe(3);
  });

  it("throws on range > 366 days", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Absurd", startDate: "2025-01-01", endDate: "2027-01-01" },
    ];
    expect(() => buildHolidaySet(holidays)).toThrow(/more than 366 days/);
  });

  it("handles empty array", () => {
    const set = buildHolidaySet([]);
    expect(set.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// ProjectWorkCalendar — isWorkDay
// ---------------------------------------------------------------------------

describe("ProjectWorkCalendar.isWorkDay", () => {
  it("returns true for Mon-Fri with default work week", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    expect(cal.isWorkDay(new Date(2025, 0, 6))).toBe(true); // Monday
    expect(cal.isWorkDay(new Date(2025, 0, 7))).toBe(true); // Tuesday
    expect(cal.isWorkDay(new Date(2025, 0, 10))).toBe(true); // Friday
  });

  it("returns false for Sat/Sun with default work week", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    expect(cal.isWorkDay(new Date(2025, 0, 4))).toBe(false); // Saturday
    expect(cal.isWorkDay(new Date(2025, 0, 5))).toBe(false); // Sunday
  });

  it("respects custom work week (Fri-Tue)", () => {
    const cal = buildWorkCalendar([5, 6, 0, 1, 2], [], []);
    expect(cal.isWorkDay(new Date(2025, 0, 6))).toBe(true); // Monday
    expect(cal.isWorkDay(new Date(2025, 0, 7))).toBe(true); // Tuesday
    expect(cal.isWorkDay(new Date(2025, 0, 8))).toBe(false); // Wednesday
    expect(cal.isWorkDay(new Date(2025, 0, 9))).toBe(false); // Thursday
    expect(cal.isWorkDay(new Date(2025, 0, 10))).toBe(true); // Friday
    expect(cal.isWorkDay(new Date(2025, 0, 11))).toBe(true); // Saturday
    expect(cal.isWorkDay(new Date(2025, 0, 12))).toBe(true); // Sunday
  });

  it("holidays override work days", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Holiday", startDate: "2025-01-06", endDate: "2025-01-06" },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], holidays, []);
    expect(cal.isWorkDay(new Date(2025, 0, 6))).toBe(false); // Monday, but holiday
  });

  it("converted work days override non-work days", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], ["2025-01-04"]); // Saturday
    expect(cal.isWorkDay(new Date(2025, 0, 4))).toBe(true);
  });

  it("holidays take precedence over converted work days", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Holiday", startDate: "2025-01-04", endDate: "2025-01-04" },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], holidays, ["2025-01-04"]);
    // Holiday wins: false
    expect(cal.isWorkDay(new Date(2025, 0, 4))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ProjectWorkCalendar — nextWorkDay
// ---------------------------------------------------------------------------

describe("ProjectWorkCalendar.nextWorkDay", () => {
  it("skips weekends", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    const result = cal.nextWorkDay(new Date(2025, 0, 10)); // Friday
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(13);
  });

  it("skips holidays", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Holiday", startDate: "2025-01-06", endDate: "2025-01-06" },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], holidays, []);
    const result = cal.nextWorkDay(new Date(2025, 0, 3)); // Friday
    // Monday is holiday, so Tuesday
    expect(result.getDate()).toBe(7);
  });

  it("does not mutate input date", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    const input = new Date(2025, 0, 10);
    const originalTime = input.getTime();
    cal.nextWorkDay(input);
    expect(input.getTime()).toBe(originalTime);
  });
});

// ---------------------------------------------------------------------------
// ProjectWorkCalendar — addWorkDays
// ---------------------------------------------------------------------------

describe("ProjectWorkCalendar.addWorkDays", () => {
  it("adds 0 days returns same date", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    const result = cal.addWorkDays(new Date(2025, 0, 6), 0);
    expect(result.getDate()).toBe(6);
  });

  it("adds 1 day from Friday returns Monday", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    const result = cal.addWorkDays(new Date(2025, 0, 10), 1); // Friday
    expect(result.getDate()).toBe(13); // Monday
  });

  it("adds 5 days = one work week", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    const result = cal.addWorkDays(new Date(2025, 0, 6), 5); // Monday
    expect(result.getDate()).toBe(13); // Next Monday
  });

  it("skips holidays", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Holiday", startDate: "2025-01-07", endDate: "2025-01-07" },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], holidays, []);
    const result = cal.addWorkDays(new Date(2025, 0, 6), 1); // Monday + 1
    // Tuesday is holiday, so Wednesday
    expect(result.getDate()).toBe(8);
  });

  it("respects converted work days", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], ["2025-01-11"]); // Saturday as work day
    const result = cal.addWorkDays(new Date(2025, 0, 10), 1); // Friday + 1
    // Saturday is converted work day
    expect(result.getDate()).toBe(11);
  });

  it("does not mutate input date", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    const input = new Date(2025, 0, 6);
    const originalTime = input.getTime();
    cal.addWorkDays(input, 3);
    expect(input.getTime()).toBe(originalTime);
  });

  it("works across DST boundary (US spring forward)", () => {
    // March 9, 2025 is DST spring forward in US
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    const result = cal.addWorkDays(new Date(2025, 2, 7), 1); // Friday March 7
    expect(result.getMonth()).toBe(2);
    expect(result.getDate()).toBe(10); // Monday March 10
  });
});

// ---------------------------------------------------------------------------
// CalendarConfigurationError
// ---------------------------------------------------------------------------

describe("CalendarConfigurationError", () => {
  it("is thrown when no work days exist in range", () => {
    // Mon-Mon work week (single day), and make every Monday a holiday
    // Need 1500+ entries to cover MAX_CALENDAR_ITERATIONS (10000 days ÷ 7 ≈ 1429 weeks)
    const mondays: Holiday[] = [];
    for (let i = 0; i < 1500; i++) {
      const d = new Date(2025, 0, 6 + i * 7); // Every Monday
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      mondays.push({ id: String(i), name: `H${i}`, startDate: iso, endDate: iso });
    }
    const cal = buildWorkCalendar([1], mondays, []); // Mon only + Mon holidays

    expect(() => cal.nextWorkDay(new Date(2025, 0, 6))).toThrow(CalendarConfigurationError);
    expect(() => cal.addWorkDays(new Date(2025, 0, 6), 1)).toThrow(CalendarConfigurationError);
  });

  it("error has correct name", () => {
    const err = new CalendarConfigurationError("test");
    expect(err.name).toBe("CalendarConfigurationError");
    expect(err.message).toBe("test");
    expect(err instanceof Error).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ProjectWorkCalendar — non-standard work weeks (Category 1)
// ---------------------------------------------------------------------------

describe("ProjectWorkCalendar with non-standard work weeks", () => {
  it("addWorkDays with Sun-Thu skips Fri and Sat", () => {
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], [], []);
    // Thu Jan 9, 2025 + 1 work day → Sun Jan 12 (Fri+Sat off)
    const result = cal.addWorkDays(new Date(2025, 0, 9), 1);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(12);
    expect(result.getDay()).toBe(0); // Sunday
  });

  it("nextWorkDay from Friday in Sun-Thu week returns Sunday", () => {
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], [], []);
    // Fri Jan 10 → next work day is Sun Jan 12
    const result = cal.nextWorkDay(new Date(2025, 0, 10));
    expect(result.getDate()).toBe(12);
    expect(result.getDay()).toBe(0); // Sunday
  });

  it("1-day week with holiday on that day throws CalendarConfigurationError", () => {
    // Wednesday-only week, with every Wednesday as holiday for enough weeks
    const wedHolidays: Holiday[] = [];
    for (let i = 0; i < 1500; i++) {
      const d = new Date(2025, 0, 8 + i * 7); // Every Wednesday starting Jan 8
      const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      wedHolidays.push({ id: String(i), name: `H${i}`, startDate: iso, endDate: iso });
    }
    const cal = buildWorkCalendar([3], wedHolidays, []);
    expect(() => cal.nextWorkDay(new Date(2025, 0, 8))).toThrow(CalendarConfigurationError);
  });

  it("converted work day on non-work day overrides mask in Sun-Thu week", () => {
    // Sun-Thu week, but convert Fri Jan 10 to a work day
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], [], ["2025-01-10"]);
    expect(cal.isWorkDay(new Date(2025, 0, 10))).toBe(true); // Friday converted
    expect(cal.isWorkDay(new Date(2025, 0, 11))).toBe(false); // Saturday still off
  });
});

// ---------------------------------------------------------------------------
// Holiday source field interactions (Category 2)
// ---------------------------------------------------------------------------

describe("holiday source field interactions", () => {
  it("API-sourced holiday blocks work day identically to manual", () => {
    const apiCal = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "1", name: "Holiday", startDate: "2025-01-06", endDate: "2025-01-06", source: "api" as const, countryCodes: ["US"] },
    ], []);
    const manualCal = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "2", name: "Holiday", startDate: "2025-01-06", endDate: "2025-01-06", source: "manual" as const },
    ], []);
    expect(apiCal.isWorkDay(new Date(2025, 0, 6))).toBe(false);
    expect(manualCal.isWorkDay(new Date(2025, 0, 6))).toBe(false);
  });

  it("holiday without source field blocks work day (backward compat)", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "1", name: "Old Holiday", startDate: "2025-01-06", endDate: "2025-01-06" },
    ], []);
    expect(cal.isWorkDay(new Date(2025, 0, 6))).toBe(false);
  });

  it("holiday with countryCodes field blocks work day", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "1", name: "Shared", startDate: "2025-01-06", endDate: "2025-01-06", source: "api" as const, countryCodes: ["US", "CA"] },
    ], []);
    expect(cal.isWorkDay(new Date(2025, 0, 6))).toBe(false);
  });

  it("holiday with locale field blocks work day", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "1", name: "State Holiday", startDate: "2025-01-06", endDate: "2025-01-06", source: "manual" as const, locale: "Bavaria" },
    ], []);
    expect(cal.isWorkDay(new Date(2025, 0, 6))).toBe(false);
  });

  it("multi-country same-date holidays: buildHolidaySet deduplicates to single date entry", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Memorial Day", startDate: "2025-05-26", endDate: "2025-05-26", source: "api" as const, countryCodes: ["US"] },
      { id: "2", name: "Whit Monday", startDate: "2025-05-26", endDate: "2025-05-26", source: "api" as const, countryCodes: ["DE"] },
    ];
    const set = buildHolidaySet(holidays);
    expect(set.has("2025-05-26")).toBe(true);
    expect(set.size).toBe(1); // Same date, deduped in Set
  });

  it("two countries different dates: both block their respective days", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "MLK Day", startDate: "2025-01-20", endDate: "2025-01-20", source: "api" as const, countryCodes: ["US"] },
      { id: "2", name: "Unity Day", startDate: "2025-10-03", endDate: "2025-10-03", source: "api" as const, countryCodes: ["DE"] },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], holidays, []);
    expect(cal.isWorkDay(new Date(2025, 0, 20))).toBe(false);  // US
    expect(cal.isWorkDay(new Date(2025, 9, 3))).toBe(false);   // DE
    expect(cal.isWorkDay(new Date(2025, 0, 21))).toBe(true);   // Normal day
  });

  it("removing one country's holidays preserves another's", () => {
    const allHolidays: Holiday[] = [
      { id: "1", name: "MLK Day", startDate: "2025-01-20", endDate: "2025-01-20", source: "api" as const, countryCodes: ["US"] },
      { id: "2", name: "Unity Day", startDate: "2025-10-03", endDate: "2025-10-03", source: "api" as const, countryCodes: ["DE"] },
    ];
    // Filter out US holidays
    const deOnly = allHolidays.filter((h) => !h.countryCodes?.includes("US"));
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], deOnly, []);
    expect(cal.isWorkDay(new Date(2025, 0, 20))).toBe(true);  // US holiday removed
    expect(cal.isWorkDay(new Date(2025, 9, 3))).toBe(false);   // DE holiday remains
  });

  it("multi-day holiday with countryCodes expands correctly", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Christmas", startDate: "2025-12-24", endDate: "2025-12-26", source: "api" as const, countryCodes: ["DE"] },
    ];
    const set = buildHolidaySet(holidays);
    expect(set.has("2025-12-24")).toBe(true);
    expect(set.has("2025-12-25")).toBe(true);
    expect(set.has("2025-12-26")).toBe(true);
    expect(set.size).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Date boundary conditions (Category 4)
// ---------------------------------------------------------------------------

describe("buildHolidaySet date boundaries", () => {
  it("holiday range spanning year boundary expands correctly", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Year End Break", startDate: "2025-12-30", endDate: "2026-01-02" },
    ];
    const set = buildHolidaySet(holidays);
    expect(set.has("2025-12-30")).toBe(true);
    expect(set.has("2025-12-31")).toBe(true);
    expect(set.has("2026-01-01")).toBe(true);
    expect(set.has("2026-01-02")).toBe(true);
    expect(set.size).toBe(4);
  });

  it("holiday on leap day Feb 29 2028", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Leap Day", startDate: "2028-02-29", endDate: "2028-02-29" },
    ];
    const set = buildHolidaySet(holidays);
    expect(set.has("2028-02-29")).toBe(true);
    expect(set.size).toBe(1);
  });

  it("single-day holiday on Dec 31", () => {
    const set = buildHolidaySet([
      { id: "1", name: "NYE", startDate: "2025-12-31", endDate: "2025-12-31" },
    ]);
    expect(set.has("2025-12-31")).toBe(true);
    expect(set.size).toBe(1);
  });

  it("single-day holiday on Jan 1", () => {
    const set = buildHolidaySet([
      { id: "1", name: "NY", startDate: "2026-01-01", endDate: "2026-01-01" },
    ]);
    expect(set.has("2026-01-01")).toBe(true);
    expect(set.size).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// buildWorkCalendar factory
// ---------------------------------------------------------------------------

describe("buildWorkCalendar", () => {
  it("returns a ProjectWorkCalendar instance", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    expect(cal).toBeInstanceOf(ProjectWorkCalendar);
  });

  it("accepts holidays and converted work days", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "NY", startDate: "2025-01-01", endDate: "2025-01-01" },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], holidays, ["2025-01-04"]);
    expect(cal.isWorkDay(new Date(2025, 0, 1))).toBe(false); // Holiday
    expect(cal.isWorkDay(new Date(2025, 0, 4))).toBe(true); // Converted Saturday
  });
});

// ---------------------------------------------------------------------------
// forcedWorkDays — global-holiday overrides
// ---------------------------------------------------------------------------

describe("forcedWorkDays (global-holiday overrides)", () => {
  const globalHolidays: Holiday[] = [
    { id: "g1", name: "New Year", startDate: "2025-01-01", endDate: "2025-01-01" },
  ];

  it("a forced work day overrides a global holiday", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], globalHolidays, [], {
      forcedWorkDays: ["2025-01-01"],
    });
    expect(cal.isWorkDay(new Date(2025, 0, 1))).toBe(true); // Wednesday holiday, forced
  });

  it("a project holiday is not overridable even when present in forcedWorkDays", () => {
    const projectHolidays: Holiday[] = [
      { id: "p1", name: "Team Offsite", startDate: "2025-01-02", endDate: "2025-01-02" },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], [], {
      forcedWorkDays: ["2025-01-02"],
      projectHolidays,
    });
    // The assembly-time filter drops the forced entry: project holidays are absolute.
    expect(cal.isWorkDay(new Date(2025, 0, 2))).toBe(false);
  });

  it("compound case: a Saturday that is also a global holiday, forced → work day", () => {
    const satHoliday: Holiday[] = [
      { id: "g2", name: "Founders Day", startDate: "2025-01-04", endDate: "2025-01-04" },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], satHoliday, [], {
      forcedWorkDays: ["2025-01-04"],
    });
    expect(cal.isWorkDay(new Date(2025, 0, 4))).toBe(true); // beats holiday AND mask
  });

  it("projectHolidays passed via overrides join the effective holiday set", () => {
    const projectHolidays: Holiday[] = [
      { id: "p1", name: "Team Offsite", startDate: "2025-01-03", endDate: "2025-01-03" },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], globalHolidays, [], {
      projectHolidays,
    });
    expect(cal.isWorkDay(new Date(2025, 0, 1))).toBe(false); // global holiday
    expect(cal.isWorkDay(new Date(2025, 0, 3))).toBe(false); // project holiday
    expect(cal.isWorkDay(new Date(2025, 0, 2))).toBe(true); // plain Thursday
  });

  it("a stale forced entry (no holiday on that date) still yields a work day", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], [], {
      forcedWorkDays: ["2025-01-04"], // Saturday, no holiday anywhere
    });
    expect(cal.isWorkDay(new Date(2025, 0, 4))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// advanceToNextWorkingDay — the shared seed-advance helper that replaced every
// unguarded `while (!isWorkingDay(...)) { date.setDate(...) }` loop in the repo.
// ---------------------------------------------------------------------------

describe("advanceToNextWorkingDay", () => {
  const workWeek = () => buildWorkCalendar([1, 2, 3, 4, 5], [], []);

  it("returns the same day (cloned, never the same reference) when the seed is already a working day", () => {
    const cal = workWeek();
    const monday = new Date(2025, 0, 6); // Monday
    const result = advanceToNextWorkingDay(monday, cal);
    expect(result.getTime()).toBe(monday.getTime());
    expect(result).not.toBe(monday);
  });

  it("advances a weekend seed to the next working day", () => {
    const cal = workWeek();
    // Sat Jan 4 2025 → Mon Jan 6 (Sun Jan 5 also skipped)
    const result = advanceToNextWorkingDay(new Date(2025, 0, 4), cal);
    expect(result.getFullYear()).toBe(2025);
    expect(result.getMonth()).toBe(0);
    expect(result.getDate()).toBe(6);
    expect(result.getDay()).toBe(1); // Monday
  });

  it("advances a holiday seed to the next working day", () => {
    const holidays: Holiday[] = [
      { id: "1", name: "Holiday", startDate: "2025-01-06", endDate: "2025-01-06" },
    ];
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], holidays, []);
    // Mon Jan 6 is a holiday → Tue Jan 7
    const result = advanceToNextWorkingDay(new Date(2025, 0, 6), cal);
    expect(result.getDate()).toBe(7);
  });

  it("does not mutate the input date", () => {
    const cal = workWeek();
    const input = new Date(2025, 0, 4); // Saturday
    const originalTime = input.getTime();
    advanceToNextWorkingDay(input, cal);
    expect(input.getTime()).toBe(originalTime);
  });

  it("throws CalendarConfigurationError (bounded, not a hang) on a zero-working-day calendar", () => {
    const cal = buildWorkCalendar([], [], []); // no work days at all
    expect(() => advanceToNextWorkingDay(new Date(2025, 0, 6), cal)).toThrow(
      CalendarConfigurationError
    );
  });

  it("uses the built-in Mon-Fri fallback when no calendar is passed", () => {
    // Sat Jan 4 → Mon Jan 6 with the default weekend fallback
    const result = advanceToNextWorkingDay(new Date(2025, 0, 4));
    expect(result.getDate()).toBe(6);
    expect(result.getDay()).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// CALENDAR_ITERATION_LIMIT_MESSAGE — prefix contract for the AI-snapshot
// classifier (§4.7). The free-standing calendar.ts helpers throw plain Errors
// whose two distinct messages must both start with this exported constant, so
// the classifier can match by prefix rather than by a duplicated literal.
// ---------------------------------------------------------------------------

describe("CALENDAR_ITERATION_LIMIT_MESSAGE", () => {
  it("is the prefix of addWorkingDays' 'excessive consecutive holidays' message", () => {
    const cal = buildWorkCalendar([], [], []); // impossible: never finds a work day
    let message = "";
    try {
      addWorkingDays(new Date(2025, 0, 6), 1, cal);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toBe("");
    expect(message.startsWith(CALENDAR_ITERATION_LIMIT_MESSAGE)).toBe(true);
    expect(message).toContain("excessive consecutive holidays"); // distinct suffix #1
  });

  it("is the prefix of countWorkingDays' distinct 'date range too large' message", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    // A span > MAX_CALENDAR_ITERATIONS days trips the count guard regardless of calendar.
    let message = "";
    try {
      countWorkingDays(new Date(2025, 0, 1), new Date(2065, 0, 1), cal);
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).not.toBe("");
    expect(message.startsWith(CALENDAR_ITERATION_LIMIT_MESSAGE)).toBe(true);
    expect(message).toContain("date range too large"); // distinct suffix #2
  });
});
