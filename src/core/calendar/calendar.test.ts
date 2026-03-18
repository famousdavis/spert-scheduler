// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import * as fc from "fast-check";
import {
  formatDateISO,
  parseDateISO,
  formatDateDisplay,
  isWorkingDay,
  addWorkingDays,
  subtractWorkingDays,
  countWorkingDays,
  mergeCalendars,
} from "./calendar";
import { buildWorkCalendar, ProjectWorkCalendar } from "./work-calendar";
import type { Calendar } from "@domain/models/types";

describe("formatDateISO / parseDateISO", () => {
  it("round-trips a date", () => {
    const date = new Date(2025, 5, 15); // June 15, 2025
    const iso = formatDateISO(date);
    expect(iso).toBe("2025-06-15");
    const parsed = parseDateISO(iso);
    expect(parsed.getFullYear()).toBe(2025);
    expect(parsed.getMonth()).toBe(5);
    expect(parsed.getDate()).toBe(15);
  });

  it("pads single-digit months and days", () => {
    const date = new Date(2025, 0, 5); // Jan 5
    expect(formatDateISO(date)).toBe("2025-01-05");
  });
});

describe("formatDateDisplay", () => {
  it("converts ISO date to MM/DD/YYYY", () => {
    expect(formatDateDisplay("2025-01-06")).toBe("01/06/2025");
    expect(formatDateDisplay("2025-12-25")).toBe("12/25/2025");
  });

  it("preserves leading zeros", () => {
    expect(formatDateDisplay("2025-03-05")).toBe("03/05/2025");
  });
});

describe("isWorkingDay", () => {
  it("returns true for Monday-Friday", () => {
    // 2025-01-06 is a Monday
    expect(isWorkingDay(new Date(2025, 0, 6))).toBe(true);
    expect(isWorkingDay(new Date(2025, 0, 7))).toBe(true); // Tue
    expect(isWorkingDay(new Date(2025, 0, 8))).toBe(true); // Wed
    expect(isWorkingDay(new Date(2025, 0, 9))).toBe(true); // Thu
    expect(isWorkingDay(new Date(2025, 0, 10))).toBe(true); // Fri
  });

  it("returns false for Saturday and Sunday", () => {
    expect(isWorkingDay(new Date(2025, 0, 4))).toBe(false); // Sat
    expect(isWorkingDay(new Date(2025, 0, 5))).toBe(false); // Sun
  });

  it("returns false for holidays", () => {
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Holiday", startDate: "2025-01-06", endDate: "2025-01-06" }], []);
    expect(isWorkingDay(new Date(2025, 0, 6), calendar)).toBe(false);
  });

  it("returns true for working day not in holiday list", () => {
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Christmas", startDate: "2025-12-25", endDate: "2025-12-25" }], []);
    expect(isWorkingDay(new Date(2025, 0, 6), calendar)).toBe(true);
  });

  it("throws in dev mode for legacy Calendar object", () => {
    const legacyCal: Calendar = { holidays: [] };
    expect(() => isWorkingDay(new Date(2025, 0, 6), legacyCal)).toThrow(
      /Legacy Calendar/
    );
  });

  it("accepts WorkCalendar instance", () => {
    const wc = buildWorkCalendar([1, 2, 3, 4, 5], [], []);
    expect(isWorkingDay(new Date(2025, 0, 6), wc)).toBe(true); // Monday
    expect(isWorkingDay(new Date(2025, 0, 4), wc)).toBe(false); // Saturday
  });
});

describe("addWorkingDays", () => {
  it("adds working days skipping weekends", () => {
    // Start: Friday Jan 3, 2025. Add 1 working day -> Mon Jan 6
    const result = addWorkingDays(new Date(2025, 0, 3), 1);
    expect(formatDateISO(result)).toBe("2025-01-06");
  });

  it("adds multiple working days across a weekend", () => {
    // Start: Thu Jan 2. Add 3 working days: Fri Jan 3, Mon Jan 6, Tue Jan 7
    const result = addWorkingDays(new Date(2025, 0, 2), 3);
    expect(formatDateISO(result)).toBe("2025-01-07");
  });

  it("skips holidays", () => {
    // Start: Wed Jan 1. Add 1 working day. Jan 2 is a holiday -> Jan 3
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Holiday", startDate: "2025-01-02", endDate: "2025-01-02" }], []);
    const result = addWorkingDays(new Date(2025, 0, 1), 1, calendar);
    expect(formatDateISO(result)).toBe("2025-01-03");
  });

  it("returns start date for 0 days", () => {
    const start = new Date(2025, 0, 6);
    const result = addWorkingDays(start, 0);
    expect(formatDateISO(result)).toBe("2025-01-06");
  });

  it("property: result is always a working day", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (days) => {
          const start = new Date(2025, 0, 6); // Monday
          const result = addWorkingDays(start, days);
          return isWorkingDay(result);
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe("subtractWorkingDays", () => {
  it("subtracts working days skipping weekends", () => {
    // Start: Mon Jan 6. Subtract 1 -> Fri Jan 3
    const result = subtractWorkingDays(new Date(2025, 0, 6), 1);
    expect(formatDateISO(result)).toBe("2025-01-03");
  });
});

describe("countWorkingDays", () => {
  it("counts working days in a week", () => {
    // Mon Jan 6 to Fri Jan 10 (inclusive start, exclusive end)
    const count = countWorkingDays(new Date(2025, 0, 6), new Date(2025, 0, 10));
    expect(count).toBe(4); // Mon, Tue, Wed, Thu
  });

  it("counts 5 working days in a full work week", () => {
    // Mon Jan 6 to Mon Jan 13
    const count = countWorkingDays(
      new Date(2025, 0, 6),
      new Date(2025, 0, 13)
    );
    expect(count).toBe(5);
  });

  it("returns 0 for same start and end", () => {
    expect(
      countWorkingDays(new Date(2025, 0, 6), new Date(2025, 0, 6))
    ).toBe(0);
  });

  it("excludes holidays", () => {
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Holiday", startDate: "2025-01-07", endDate: "2025-01-07" }], []); // Tue is holiday
    const count = countWorkingDays(
      new Date(2025, 0, 6),
      new Date(2025, 0, 10),
      calendar
    );
    expect(count).toBe(3); // Mon, Wed, Thu (Tue excluded)
  });

  it("property: addWorkingDays then countWorkingDays round-trips", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (days) => {
          const start = new Date(2025, 0, 6); // Monday
          const end = addWorkingDays(start, days);
          const counted = countWorkingDays(start, end);
          return counted === days;
        }
      ),
      { numRuns: 100 }
    );
  });

  it("excludes holidays from count even on weekends (no double-count)", () => {
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Holiday", startDate: "2025-01-04", endDate: "2025-01-04" }], []); // Saturday
    const countWith = countWorkingDays(new Date(2025, 0, 6), new Date(2025, 0, 13), calendar);
    const countWithout = countWorkingDays(new Date(2025, 0, 6), new Date(2025, 0, 13));
    expect(countWith).toBe(countWithout);
  });
});

describe("calendar edge cases", () => {
  it("addWorkingDays skips a full week of holidays", () => {
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "h1", name: "Full Week Off", startDate: "2025-01-06", endDate: "2025-01-10" },
    ], []);
    const result = addWorkingDays(new Date(2025, 0, 3), 1, calendar);
    expect(formatDateISO(result)).toBe("2025-01-13");
  });

  it("handles year boundary (Dec to Jan)", () => {
    const result = addWorkingDays(new Date(2025, 11, 31), 1);
    expect(formatDateISO(result)).toBe("2026-01-01");
  });

  it("isWorkingDay returns false for holiday on weekend (weekend takes precedence)", () => {
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Holiday", startDate: "2025-01-04", endDate: "2025-01-04" }], []);
    expect(isWorkingDay(new Date(2025, 0, 4), calendar)).toBe(false);
    expect(isWorkingDay(new Date(2025, 0, 4))).toBe(false);
  });

  it("isWorkingDay returns false for date within a multi-day holiday range", () => {
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "h1", name: "Christmas Break", startDate: "2025-12-22", endDate: "2026-01-02" },
    ], []);
    // Mon Dec 22 through Fri Jan 2 — all weekdays within should be non-working
    expect(isWorkingDay(new Date(2025, 11, 22), calendar)).toBe(false);
    expect(isWorkingDay(new Date(2025, 11, 24), calendar)).toBe(false);
    expect(isWorkingDay(new Date(2025, 11, 29), calendar)).toBe(false);
    expect(isWorkingDay(new Date(2026, 0, 2), calendar)).toBe(false);
    // Day after range is working
    expect(isWorkingDay(new Date(2026, 0, 5), calendar)).toBe(true); // Mon Jan 5
  });

  it("addWorkingDays skips a multi-day holiday range correctly", () => {
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "h1", name: "Break", startDate: "2025-01-07", endDate: "2025-01-09" },
    ], []);
    // Start Mon Jan 6, add 2 working days.
    // Jan 6 (Mon) is working, Jan 7-9 (Tue-Thu) are holidays, Jan 10 (Fri) is working.
    const result = addWorkingDays(new Date(2025, 0, 6), 2, calendar);
    expect(formatDateISO(result)).toBe("2025-01-13"); // Mon Jan 13
  });
});

describe("calendar iteration limits", () => {
  it("addWorkingDays throws on pathological calendar with all days as holidays", () => {
    // Create a WorkCalendar where no day is ever a work day (all-false mask, no converted days)
    const calendar = new ProjectWorkCalendar({
      workWeekMask: [false, false, false, false, false, false, false],
      holidays: new Set<string>(),
      convertedWorkDays: new Set<string>(),
    });
    expect(() => addWorkingDays(new Date(2025, 0, 1), 100, calendar)).toThrow(
      "Calendar iteration limit exceeded"
    );
  });

  it("subtractWorkingDays throws on pathological calendar", () => {
    // WorkCalendar where no day is ever a work day
    const calendar = new ProjectWorkCalendar({
      workWeekMask: [false, false, false, false, false, false, false],
      holidays: new Set<string>(),
      convertedWorkDays: new Set<string>(),
    });
    expect(() => subtractWorkingDays(new Date(2025, 6, 1), 100, calendar)).toThrow(
      "Calendar iteration limit exceeded"
    );
  });

  it("countWorkingDays throws on extremely large date range", () => {
    // A 50-year range would exceed 10,000 iterations
    expect(() =>
      countWorkingDays(new Date(2000, 0, 1), new Date(2050, 0, 1))
    ).toThrow("Calendar iteration limit exceeded");
  });

  it("normal calendar operations stay within limits", () => {
    // 5 years of working days should be fine (< 10,000 iterations)
    const result = addWorkingDays(new Date(2025, 0, 1), 1000);
    expect(result.getFullYear()).toBeGreaterThanOrEqual(2028);
  });
});

// ---------------------------------------------------------------------------
// Non-standard work weeks (Category 1)
// ---------------------------------------------------------------------------

describe("non-standard work weeks", () => {
  it("addWorkingDays with Sun-Thu work week skips Fri-Sat", () => {
    // Sun-Thu: [0,1,2,3,4]
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], [], []);
    // Start Thu Jan 9, 2025 (day 4 = Thu, a work day), add 1
    const result = addWorkingDays(new Date(2025, 0, 9), 1, cal);
    // Fri+Sat are off, so next work day is Sun Jan 12
    expect(formatDateISO(result)).toBe("2025-01-12");
  });

  it("addWorkingDays with 3-day week (Mon,Wed,Fri)", () => {
    const cal = buildWorkCalendar([1, 3, 5], [], []);
    // Start Mon Jan 6, add 3 work days: Mon->Wed->Fri->Mon
    const result = addWorkingDays(new Date(2025, 0, 6), 3, cal);
    expect(formatDateISO(result)).toBe("2025-01-13");
  });

  it("addWorkingDays with 1-day week (Wednesday only)", () => {
    const cal = buildWorkCalendar([3], [], []);
    // Start Wed Jan 8, add 2: next Wed Jan 15, next Wed Jan 22
    const result = addWorkingDays(new Date(2025, 0, 8), 2, cal);
    expect(formatDateISO(result)).toBe("2025-01-22");
  });

  it("countWorkingDays with Sun-Thu work week", () => {
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], [], []);
    // Sun Jan 5 to Sun Jan 12: Sun,Mon,Tue,Wed,Thu = 5 work days
    const count = countWorkingDays(new Date(2025, 0, 5), new Date(2025, 0, 12), cal);
    expect(count).toBe(5);
  });

  it("isWorkingDay with non-contiguous [0,2,4,6] (Sun,Tue,Thu,Sat)", () => {
    const cal = buildWorkCalendar([0, 2, 4, 6], [], []);
    expect(isWorkingDay(new Date(2025, 0, 5), cal)).toBe(true);  // Sun
    expect(isWorkingDay(new Date(2025, 0, 6), cal)).toBe(false); // Mon
    expect(isWorkingDay(new Date(2025, 0, 7), cal)).toBe(true);  // Tue
    expect(isWorkingDay(new Date(2025, 0, 8), cal)).toBe(false); // Wed
    expect(isWorkingDay(new Date(2025, 0, 9), cal)).toBe(true);  // Thu
    expect(isWorkingDay(new Date(2025, 0, 10), cal)).toBe(false); // Fri
    expect(isWorkingDay(new Date(2025, 0, 11), cal)).toBe(true);  // Sat
  });

  it("property: addWorkingDays result is always a working day (Sun-Thu)", () => {
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], [], []);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (days) => {
          const result = addWorkingDays(new Date(2025, 0, 5), days, cal); // Start Sun
          return isWorkingDay(result, cal);
        }
      ),
      { numRuns: 200 }
    );
  });

  it("property: countWorkingDays round-trips with addWorkingDays (3-day week)", () => {
    const cal = buildWorkCalendar([1, 3, 5], [], []);
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 50 }),
        (n) => {
          const start = new Date(2025, 0, 6); // Monday (work day in this config)
          const end = addWorkingDays(start, n, cal);
          const counted = countWorkingDays(start, end, cal);
          return counted === n;
        }
      ),
      { numRuns: 200 }
    );
  });

  it("addWorkingDays with full 7-day week skips nothing", () => {
    const cal = buildWorkCalendar([0, 1, 2, 3, 4, 5, 6], [], []);
    // Mon Jan 6 + 7 days = Mon Jan 13 (every day is a work day)
    const result = addWorkingDays(new Date(2025, 0, 6), 7, cal);
    expect(formatDateISO(result)).toBe("2025-01-13");
  });
});

// ---------------------------------------------------------------------------
// mergeCalendars with sourced holidays (Category 2)
// ---------------------------------------------------------------------------

describe("mergeCalendars with sourced holidays", () => {
  it("preserves source field on holidays", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "NY", startDate: "2026-01-01", endDate: "2026-01-01", source: "api" as const, countryCodes: ["US"] }],
    };
    const project: Calendar = {
      holidays: [{ id: "h2", name: "Offsite", startDate: "2026-03-10", endDate: "2026-03-10", source: "manual" as const }],
    };
    const result = mergeCalendars(global, project)!;
    expect(result.holidays[0]!.source).toBe("api");
    expect(result.holidays[1]!.source).toBe("manual");
  });

  it("overlapping dates are not deduped (concatenation)", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "Holiday A", startDate: "2026-01-01", endDate: "2026-01-01" }],
    };
    const project: Calendar = {
      holidays: [{ id: "h2", name: "Holiday B", startDate: "2026-01-01", endDate: "2026-01-01" }],
    };
    const result = mergeCalendars(global, project)!;
    expect(result.holidays).toHaveLength(2);
  });

  it("merged API+manual same date: isWorkDay returns false", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "API", startDate: "2026-01-01", endDate: "2026-01-01", source: "api" as const }],
    };
    const project: Calendar = {
      holidays: [{ id: "h2", name: "Manual", startDate: "2026-01-01", endDate: "2026-01-01", source: "manual" as const }],
    };
    const merged = mergeCalendars(global, project)!;
    const wc = buildWorkCalendar([1, 2, 3, 4, 5], merged.holidays, []);
    expect(isWorkingDay(new Date(2026, 0, 1), wc)).toBe(false);
  });

  it("empty global + project with holidays: returns project holidays", () => {
    const project: Calendar = {
      holidays: [{ id: "h1", name: "Offsite", startDate: "2026-03-10", endDate: "2026-03-10", source: "api" as const, countryCodes: ["DE"] }],
    };
    const result = mergeCalendars(undefined, project)!;
    expect(result.holidays).toHaveLength(1);
    expect(result.holidays[0]!.countryCodes).toEqual(["DE"]);
  });

  it("global with holidays + empty project: returns global holidays", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "NY", startDate: "2026-01-01", endDate: "2026-01-01", source: "api" as const, countryCodes: ["US"] }],
    };
    const result = mergeCalendars(global, undefined)!;
    expect(result.holidays).toHaveLength(1);
    expect(result.holidays[0]!.source).toBe("api");
  });

  it("preserves countryCodes and locale fields through merge", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "Unity Day", startDate: "2026-10-03", endDate: "2026-10-03", source: "api" as const, countryCodes: ["DE"], locale: "Bavaria" }],
    };
    const project: Calendar = {
      holidays: [{ id: "h2", name: "State Day", startDate: "2026-06-15", endDate: "2026-06-15", source: "manual" as const, locale: "Texas" }],
    };
    const result = mergeCalendars(global, project)!;
    expect(result.holidays[0]!.countryCodes).toEqual(["DE"]);
    expect(result.holidays[0]!.locale).toBe("Bavaria");
    expect(result.holidays[1]!.locale).toBe("Texas");
  });
});

// ---------------------------------------------------------------------------
// Date boundary conditions (Category 4)
// ---------------------------------------------------------------------------

describe("date boundary conditions", () => {
  it("year boundary: addWorkingDays from Dec 31 with holiday on Jan 1", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "h1", name: "New Year", startDate: "2026-01-01", endDate: "2026-01-01" },
    ], []);
    // Dec 31 2025 is Wednesday, add 1 working day
    // Jan 1 is holiday (Thursday), so next work day is Jan 2 (Friday)
    const result = addWorkingDays(new Date(2025, 11, 31), 1, cal);
    expect(formatDateISO(result)).toBe("2026-01-02");
  });

  it("year boundary: countWorkingDays spanning Dec-Jan", () => {
    // Mon Dec 29 2025 to Mon Jan 5 2026
    const count = countWorkingDays(new Date(2025, 11, 29), new Date(2026, 0, 5));
    // Dec 29(Mon), 30(Tue), 31(Wed), Jan 1(Thu), 2(Fri) = 5 work days
    expect(count).toBe(5);
  });

  it("leap year: isWorkingDay on Feb 29 2028 (Tuesday)", () => {
    expect(isWorkingDay(new Date(2028, 1, 29))).toBe(true);
  });

  it("leap year Feb 29 as holiday", () => {
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], [
      { id: "h1", name: "Leap Day Off", startDate: "2028-02-29", endDate: "2028-02-29" },
    ], []);
    expect(isWorkingDay(new Date(2028, 1, 29), cal)).toBe(false);
  });

  it("addWorkingDays across leap day Feb 28→Feb 29 in 2028", () => {
    // Feb 28 2028 is Monday, add 1 → Feb 29 (Tuesday)
    const result = addWorkingDays(new Date(2028, 1, 28), 1);
    expect(formatDateISO(result)).toBe("2028-02-29");
  });

  it("addWorkingDays Feb 28→Mar in non-leap 2025", () => {
    // Feb 28 2025 is Friday, add 1 → Mon Mar 3 (skips Sat+Sun, no Feb 29)
    const result = addWorkingDays(new Date(2025, 1, 28), 1);
    expect(formatDateISO(result)).toBe("2025-03-03");
  });

  it("DST spring forward: addWorkingDays across Mar 9 2025", () => {
    // Mar 7 2025 is Friday, add 1 → Mon Mar 10
    const result = addWorkingDays(new Date(2025, 2, 7), 1);
    expect(formatDateISO(result)).toBe("2025-03-10");
  });

  it("DST fall back: addWorkingDays across Nov 2 2025", () => {
    // Oct 31 2025 is Friday, add 1 → Mon Nov 3
    const result = addWorkingDays(new Date(2025, 9, 31), 1);
    expect(formatDateISO(result)).toBe("2025-11-03");
  });

  it("formatDateDisplay for DD/MM/YYYY format", () => {
    expect(formatDateDisplay("2025-01-06", "DD/MM/YYYY")).toBe("06/01/2025");
    expect(formatDateDisplay("2025-12-25", "DD/MM/YYYY")).toBe("25/12/2025");
  });

  it("formatDateDisplay for YYYY/MM/DD format", () => {
    expect(formatDateDisplay("2025-01-06", "YYYY/MM/DD")).toBe("2025/01/06");
    expect(formatDateDisplay("2025-12-25", "YYYY/MM/DD")).toBe("2025/12/25");
  });
});

describe("mergeCalendars", () => {
  it("returns undefined when both inputs are undefined", () => {
    expect(mergeCalendars(undefined, undefined)).toBeUndefined();
  });

  it("returns global calendar when project is undefined", () => {
    const global = { holidays: [{ id: "h1", name: "NY", startDate: "2026-01-01", endDate: "2026-01-01" }] };
    const result = mergeCalendars(global, undefined);
    expect(result).toEqual(global);
  });

  it("returns project calendar when global is undefined", () => {
    const project = { holidays: [{ id: "h2", name: "Offsite", startDate: "2026-03-10", endDate: "2026-03-11" }] };
    const result = mergeCalendars(undefined, project);
    expect(result).toEqual(project);
  });

  it("merges holidays from both calendars", () => {
    const global = { holidays: [{ id: "h1", name: "NY", startDate: "2026-01-01", endDate: "2026-01-01" }] };
    const project = { holidays: [{ id: "h2", name: "Offsite", startDate: "2026-03-10", endDate: "2026-03-11" }] };
    const result = mergeCalendars(global, project);
    expect(result!.holidays).toHaveLength(2);
    expect(result!.holidays[0]!.name).toBe("NY");
    expect(result!.holidays[1]!.name).toBe("Offsite");
  });

  it("merged calendar affects isWorkingDay", () => {
    const global = { holidays: [{ id: "h1", name: "NY", startDate: "2026-01-01", endDate: "2026-01-01" }] };
    const project = { holidays: [{ id: "h2", name: "Offsite", startDate: "2026-01-02", endDate: "2026-01-02" }] };
    const merged = mergeCalendars(global, project)!;
    const mergedWc = buildWorkCalendar([1, 2, 3, 4, 5], merged.holidays, []);
    // Thu Jan 1 2026 — global holiday
    expect(isWorkingDay(new Date(2026, 0, 1), mergedWc)).toBe(false);
    // Fri Jan 2 2026 — project holiday
    expect(isWorkingDay(new Date(2026, 0, 2), mergedWc)).toBe(false);
    // Mon Jan 5 2026 — working day
    expect(isWorkingDay(new Date(2026, 0, 5), mergedWc)).toBe(true);
  });
});
