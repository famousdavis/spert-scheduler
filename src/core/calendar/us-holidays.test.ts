import { describe, it, expect } from "vitest";
import { getUSHolidays } from "./us-holidays";

describe("getUSHolidays", () => {
  it("returns 12 holidays", () => {
    const holidays = getUSHolidays(2026);
    expect(holidays).toHaveLength(12);
  });

  it("returns correct holiday names", () => {
    const names = getUSHolidays(2026).map((h) => h.name);
    expect(names).toContain("New Year's Day");
    expect(names).toContain("Martin Luther King Jr. Day");
    expect(names).toContain("Presidents' Day");
    expect(names).toContain("Memorial Day");
    expect(names).toContain("Independence Day");
    expect(names).toContain("Labor Day");
    expect(names).toContain("Columbus Day");
    expect(names).toContain("Veterans Day");
    expect(names).toContain("Thanksgiving");
    expect(names).toContain("Day After Thanksgiving");
    expect(names).toContain("Christmas Eve");
    expect(names).toContain("Christmas Day");
  });

  it("returns correct fixed-date holidays for 2026", () => {
    const holidays = getUSHolidays(2026);
    const byName = (n: string) => holidays.find((h) => h.name === n)!.date;

    expect(byName("New Year's Day")).toBe("2026-01-01");
    expect(byName("Independence Day")).toBe("2026-07-04");
    expect(byName("Veterans Day")).toBe("2026-11-11");
    expect(byName("Christmas Eve")).toBe("2026-12-24");
    expect(byName("Christmas Day")).toBe("2026-12-25");
  });

  it("returns correct floating holidays for 2026", () => {
    const holidays = getUSHolidays(2026);
    const byName = (n: string) => holidays.find((h) => h.name === n)!.date;

    // MLK Day: 3rd Monday of January 2026 → Jan 19
    expect(byName("Martin Luther King Jr. Day")).toBe("2026-01-19");
    // Presidents' Day: 3rd Monday of February 2026 → Feb 16
    expect(byName("Presidents' Day")).toBe("2026-02-16");
    // Memorial Day: last Monday of May 2026 → May 25
    expect(byName("Memorial Day")).toBe("2026-05-25");
    // Labor Day: 1st Monday of September 2026 → Sep 7
    expect(byName("Labor Day")).toBe("2026-09-07");
    // Columbus Day: 2nd Monday of October 2026 → Oct 12
    expect(byName("Columbus Day")).toBe("2026-10-12");
    // Thanksgiving: 4th Thursday of November 2026 → Nov 26
    expect(byName("Thanksgiving")).toBe("2026-11-26");
    // Day after Thanksgiving → Nov 27
    expect(byName("Day After Thanksgiving")).toBe("2026-11-27");
  });

  it("returns correct floating holidays for 2027", () => {
    const holidays = getUSHolidays(2027);
    const byName = (n: string) => holidays.find((h) => h.name === n)!.date;

    // MLK Day: 3rd Monday of January 2027 → Jan 18
    expect(byName("Martin Luther King Jr. Day")).toBe("2027-01-18");
    // Memorial Day: last Monday of May 2027 → May 31
    expect(byName("Memorial Day")).toBe("2027-05-31");
    // Labor Day: 1st Monday of September 2027 → Sep 6
    expect(byName("Labor Day")).toBe("2027-09-06");
    // Thanksgiving: 4th Thursday of November 2027 → Nov 25
    expect(byName("Thanksgiving")).toBe("2027-11-25");
  });

  it("all dates are valid YYYY-MM-DD format", () => {
    const holidays = getUSHolidays(2026);
    for (const h of holidays) {
      expect(h.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("all dates fall within the requested year", () => {
    for (const year of [2025, 2026, 2027, 2028]) {
      const holidays = getUSHolidays(year);
      for (const h of holidays) {
        expect(h.date.startsWith(String(year))).toBe(true);
      }
    }
  });

  it("returns dates in chronological order", () => {
    const holidays = getUSHolidays(2026);
    for (let i = 1; i < holidays.length; i++) {
      expect(holidays[i]!.date >= holidays[i - 1]!.date).toBe(true);
    }
  });
});
