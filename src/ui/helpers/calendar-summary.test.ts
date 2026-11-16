// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  companyCalendarSummary,
  holidaysWords,
  lastHolidayDate,
  notInEffectCount,
  overrideChipDates,
  projectCalendarSummary,
} from "./calendar-summary";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import type { Holiday } from "@domain/models/types";

/**
 * WI-174 (v0.87.0): the words beside each calendar on the Calendar page, as decision tables. Every expected value is
 * written out by hand from the owner's rulings 5 and 10, never computed by the code under test.
 */

const h = (id: string, startDate: string, endDate = startDate): Holiday => ({ id, name: id, startDate, endDate });
const mmddyyyy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;

describe("projectCalendarSummary — a project's parts (ruling 5)", () => {
  // [holidays, converted (the chip count T), not in effect (I), parts]
  const rows: Array<[number, number, number, string[]]> = [
    [0, 0, 0, ["No changes"]],
    [1, 0, 0, ["1 holiday"]],
    [2, 0, 0, ["2 holidays"]],
    [0, 1, 0, ["1 converted work day"]],
    [0, 1, 1, ["1 converted work day, 1 not in effect"]],
    [0, 2, 0, ["2 converted work days"]],
    [0, 3, 1, ["3 converted work days, 1 not in effect"]],
    [0, 3, 3, ["3 converted work days, 3 not in effect"]],
    [1, 2, 0, ["1 holiday", "2 converted work days"]],
    [1, 1, 0, ["1 holiday", "1 converted work day"]],
    [12, 5, 2, ["12 holidays", "5 converted work days, 2 not in effect"]],
  ];
  it.each(rows)("%i holidays, %i converted, %i not in effect", (holidays, converted, notInEffect, parts) => {
    expect(projectCalendarSummary(holidays, converted, notInEffect)).toEqual(parts);
  });
});

describe("companyCalendarSummary — the count and the last date covered (ruling 10)", () => {
  it("none: No holidays", () => {
    expect(companyCalendarSummary([], mmddyyyy)).toEqual(["No holidays"]);
  });
  it("one: 1 holiday, through its date", () => {
    expect(companyCalendarSummary([h("July 4", "2026-07-04")], mmddyyyy)).toEqual(["1 holiday, through 07/04/2026"]);
  });
  it("several: the LATEST end date, wherever it sits in the list, and a multi-day holiday counts once", () => {
    const holidays = [h("a", "2026-01-01"), h("shutdown", "2026-12-24", "2026-12-31"), h("b", "2026-11-26")];
    expect(companyCalendarSummary(holidays, mmddyyyy)).toEqual(["3 holidays, through 12/31/2026"]);
  });
  it("the date comes from the formatter it is given (the user's Date Format)", () => {
    expect(companyCalendarSummary([h("a", "2026-07-04")], (iso) => `[${iso}]`)).toEqual(["1 holiday, through [2026-07-04]"]);
  });
});

describe("the pieces", () => {
  it("holidaysWords: singular and plural", () => {
    expect(holidaysWords(1)).toBe("1 holiday");
    expect(holidaysWords(2)).toBe("2 holidays");
  });
  it("lastHolidayDate: by END date, not start; null when there is none", () => {
    expect(lastHolidayDate([])).toBeNull();
    expect(lastHolidayDate([h("long", "2026-03-01", "2026-12-30"), h("late start", "2026-12-29")])).toBe("2026-12-30");
  });
  it("overrideChipDates: the two lists merged, a date in both counted once, as the chips show it", () => {
    expect(overrideChipDates(["2026-11-21", "2026-11-28"], ["2026-11-28", "2026-12-25"])).toEqual([
      "2026-11-21",
      "2026-11-28",
      "2026-12-25",
    ]);
  });
  it("notInEffectCount: a converted day a company or project holiday falls on is not in effect; a forced one over a company holiday is", () => {
    // 2026-11-26 Thu: company holiday. 2026-11-28 Sat. 2026-12-05 Sat: project holiday. 2026-12-25 Fri: company holiday, forced.
    const company = [h("Thanksgiving", "2026-11-26"), h("Christmas", "2026-12-25")];
    const projectHolidays = [h("Offsite", "2026-12-05")];
    const converted = ["2026-11-26", "2026-11-28", "2026-12-05"];
    const forced = ["2026-12-25"];
    const workCalendar = buildWorkCalendar([1, 2, 3, 4, 5], company, converted, { forcedWorkDays: forced, projectHolidays });
    const dates = overrideChipDates(converted, forced);
    expect(notInEffectCount(dates, { projectHolidays, workCalendar })).toBe(2);
  });
});
