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
} from "./calendar";

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
    const calendar = { holidays: [{ id: "h1", name: "Holiday", startDate: "2025-01-06", endDate: "2025-01-06" }] };
    expect(isWorkingDay(new Date(2025, 0, 6), calendar)).toBe(false);
  });

  it("returns true for working day not in holiday list", () => {
    const calendar = { holidays: [{ id: "h1", name: "Christmas", startDate: "2025-12-25", endDate: "2025-12-25" }] };
    expect(isWorkingDay(new Date(2025, 0, 6), calendar)).toBe(true);
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
    const calendar = { holidays: [{ id: "h1", name: "Holiday", startDate: "2025-01-02", endDate: "2025-01-02" }] };
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
    const calendar = { holidays: [{ id: "h1", name: "Holiday", startDate: "2025-01-07", endDate: "2025-01-07" }] }; // Tue is holiday
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
    const calendar = { holidays: [{ id: "h1", name: "Holiday", startDate: "2025-01-04", endDate: "2025-01-04" }] }; // Saturday
    const countWith = countWorkingDays(new Date(2025, 0, 6), new Date(2025, 0, 13), calendar);
    const countWithout = countWorkingDays(new Date(2025, 0, 6), new Date(2025, 0, 13));
    expect(countWith).toBe(countWithout);
  });
});

describe("calendar edge cases", () => {
  it("addWorkingDays skips a full week of holidays", () => {
    const calendar = {
      holidays: [
        { id: "h1", name: "Full Week Off", startDate: "2025-01-06", endDate: "2025-01-10" },
      ],
    };
    const result = addWorkingDays(new Date(2025, 0, 3), 1, calendar);
    expect(formatDateISO(result)).toBe("2025-01-13");
  });

  it("handles year boundary (Dec to Jan)", () => {
    const result = addWorkingDays(new Date(2025, 11, 31), 1);
    expect(formatDateISO(result)).toBe("2026-01-01");
  });

  it("isWorkingDay returns false for holiday on weekend (weekend takes precedence)", () => {
    const calendar = { holidays: [{ id: "h1", name: "Holiday", startDate: "2025-01-04", endDate: "2025-01-04" }] };
    expect(isWorkingDay(new Date(2025, 0, 4), calendar)).toBe(false);
    expect(isWorkingDay(new Date(2025, 0, 4))).toBe(false);
  });

  it("isWorkingDay returns false for date within a multi-day holiday range", () => {
    const calendar = {
      holidays: [{ id: "h1", name: "Christmas Break", startDate: "2025-12-22", endDate: "2026-01-02" }],
    };
    // Mon Dec 22 through Fri Jan 2 — all weekdays within should be non-working
    expect(isWorkingDay(new Date(2025, 11, 22), calendar)).toBe(false);
    expect(isWorkingDay(new Date(2025, 11, 24), calendar)).toBe(false);
    expect(isWorkingDay(new Date(2025, 11, 29), calendar)).toBe(false);
    expect(isWorkingDay(new Date(2026, 0, 2), calendar)).toBe(false);
    // Day after range is working
    expect(isWorkingDay(new Date(2026, 0, 5), calendar)).toBe(true); // Mon Jan 5
  });

  it("addWorkingDays skips a multi-day holiday range correctly", () => {
    const calendar = {
      holidays: [{ id: "h1", name: "Break", startDate: "2025-01-07", endDate: "2025-01-09" }],
    };
    // Start Mon Jan 6, add 2 working days.
    // Jan 6 (Mon) is working, Jan 7-9 (Tue-Thu) are holidays, Jan 10 (Fri) is working.
    const result = addWorkingDays(new Date(2025, 0, 6), 2, calendar);
    expect(formatDateISO(result)).toBe("2025-01-13"); // Mon Jan 13
  });
});

describe("calendar iteration limits", () => {
  it("addWorkingDays throws on pathological calendar with all days as holidays", () => {
    // Create a calendar where every day for 50+ years is a holiday
    const calendar = {
      holidays: [{ id: "h1", name: "Eternal Holiday", startDate: "2020-01-01", endDate: "2070-12-31" }],
    };
    expect(() => addWorkingDays(new Date(2025, 0, 1), 100, calendar)).toThrow(
      "Calendar iteration limit exceeded"
    );
  });

  it("subtractWorkingDays throws on pathological calendar", () => {
    // Calendar where all past dates are holidays - force iteration limit
    const calendar = {
      holidays: [{ id: "h1", name: "Eternal Holiday", startDate: "1900-01-01", endDate: "2030-12-31" }],
    };
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
