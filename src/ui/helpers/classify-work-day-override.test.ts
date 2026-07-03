// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Holiday } from "@domain/models/types";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import {
  classifyWorkDayAdd,
  classifyChipStatus,
  matchHolidays,
  computeBulkEligibleDates,
} from "./classify-work-day-override";

// 2025-01-01 = Wednesday, 2025-01-04 = Saturday, 2025-01-05 = Sunday,
// 2025-01-06 = Monday (same reference week the calendar tests use).
const WEEKDAYS = [1, 2, 3, 4, 5];

function hol(
  id: string,
  name: string,
  startDate: string,
  endDate = startDate
): Holiday {
  return { id, name, startDate, endDate };
}

interface CtxOverrides {
  convertedWorkDays?: string[];
  forcedWorkDays?: string[];
  globalHolidays?: Holiday[];
  projectHolidays?: Holiday[];
}

/** Builds the classifier ctx the same way production assembles it. */
function makeCtx(overrides: CtxOverrides = {}) {
  const convertedWorkDays = overrides.convertedWorkDays ?? [];
  const forcedWorkDays = overrides.forcedWorkDays ?? [];
  const globalHolidays = overrides.globalHolidays ?? [];
  const projectHolidays = overrides.projectHolidays ?? [];
  return {
    convertedWorkDays,
    forcedWorkDays,
    globalHolidays,
    projectHolidays,
    workCalendar: buildWorkCalendar(WEEKDAYS, globalHolidays, convertedWorkDays, {
      forcedWorkDays,
      projectHolidays,
    }),
  };
}

// ---------------------------------------------------------------------------
// classifyWorkDayAdd
// ---------------------------------------------------------------------------

describe("classifyWorkDayAdd", () => {
  it("returns duplicate for a date already in convertedWorkDays", () => {
    const ctx = makeCtx({ convertedWorkDays: ["2025-01-04"] });
    expect(classifyWorkDayAdd("2025-01-04", ctx)).toEqual({
      kind: "duplicate",
    });
  });

  it("returns duplicate for a date already in forcedWorkDays", () => {
    const ctx = makeCtx({ forcedWorkDays: ["2025-01-01"] });
    expect(classifyWorkDayAdd("2025-01-01", ctx)).toEqual({
      kind: "duplicate",
    });
  });

  it("duplicate takes precedence over the project-holiday block", () => {
    const ctx = makeCtx({
      forcedWorkDays: ["2025-01-02"],
      projectHolidays: [hol("p1", "Project Day", "2025-01-02")],
    });
    expect(classifyWorkDayAdd("2025-01-02", ctx)).toEqual({
      kind: "duplicate",
    });
  });

  it("hard-blocks a project holiday", () => {
    const ctx = makeCtx({
      projectHolidays: [hol("p1", "Project Day", "2025-01-02")],
    });
    expect(classifyWorkDayAdd("2025-01-02", ctx)).toEqual({
      kind: "project-holiday-block",
    });
  });

  it("hard-blocks a project holiday even when a global holiday covers the same date", () => {
    const ctx = makeCtx({
      globalHolidays: [hol("g1", "New Year", "2025-01-02")],
      projectHolidays: [hol("p1", "Project Day", "2025-01-02")],
    });
    expect(classifyWorkDayAdd("2025-01-02", ctx)).toEqual({
      kind: "project-holiday-block",
    });
  });

  it("asks for confirmation on a single-day global holiday, without a range", () => {
    const ctx = makeCtx({
      globalHolidays: [hol("g1", "New Year", "2025-01-01")],
    });
    expect(classifyWorkDayAdd("2025-01-01", ctx)).toEqual({
      kind: "global-holiday-confirm",
      holidayNames: ["New Year"],
      range: undefined,
    });
  });

  it("carries the range when exactly one multi-day global holiday matches", () => {
    const ctx = makeCtx({
      globalHolidays: [hol("g2", "Shutdown", "2025-01-01", "2025-01-07")],
    });
    expect(classifyWorkDayAdd("2025-01-02", ctx)).toEqual({
      kind: "global-holiday-confirm",
      holidayNames: ["Shutdown"],
      range: { start: "2025-01-01", end: "2025-01-07" },
    });
  });

  it("omits the range when more than one global holiday covers the date", () => {
    const ctx = makeCtx({
      globalHolidays: [
        hol("g2", "Shutdown", "2025-01-01", "2025-01-07"),
        hol("g3", "Regional Holiday", "2025-01-02"),
      ],
    });
    expect(classifyWorkDayAdd("2025-01-02", ctx)).toEqual({
      kind: "global-holiday-confirm",
      holidayNames: ["Shutdown", "Regional Holiday"],
      range: undefined,
    });
  });

  it("confirms a global holiday even on a mask-off day (Saturday)", () => {
    const ctx = makeCtx({
      globalHolidays: [hol("g1", "Founders Day", "2025-01-04")], // Saturday
    });
    expect(classifyWorkDayAdd("2025-01-04", ctx)).toEqual({
      kind: "global-holiday-confirm",
      holidayNames: ["Founders Day"],
      range: undefined,
    });
  });

  it("no-ops on a date that is already a work day", () => {
    const ctx = makeCtx();
    expect(classifyWorkDayAdd("2025-01-06", ctx)).toEqual({
      kind: "already-workday-noop",
    }); // plain Monday
  });

  it("returns ok for a plain non-work day (weekend conversion path)", () => {
    const ctx = makeCtx();
    expect(classifyWorkDayAdd("2025-01-04", ctx)).toEqual({ kind: "ok" }); // Saturday
  });
});

// ---------------------------------------------------------------------------
// classifyChipStatus
// ---------------------------------------------------------------------------

describe("classifyChipStatus", () => {
  it("marks an effective converted work day as active", () => {
    const ctx = makeCtx({ convertedWorkDays: ["2025-01-04"] });
    expect(classifyChipStatus("2025-01-04", ctx)).toEqual({ active: true });
  });

  it("marks an effective forced work day as active", () => {
    const ctx = makeCtx({
      globalHolidays: [hol("g1", "New Year", "2025-01-01")],
      forcedWorkDays: ["2025-01-01"],
    });
    expect(classifyChipStatus("2025-01-01", ctx)).toEqual({ active: true });
  });

  it("marks a forced entry inert with reason project-holiday when a project holiday lands on it", () => {
    const ctx = makeCtx({
      forcedWorkDays: ["2025-01-02"],
      projectHolidays: [hol("p1", "Project Day", "2025-01-02")],
    });
    expect(classifyChipStatus("2025-01-02", ctx)).toEqual({
      active: false,
      reason: "project-holiday",
    });
  });

  it("marks a converted entry inert with reason global-holiday when a global holiday lands on it", () => {
    const ctx = makeCtx({
      convertedWorkDays: ["2025-01-04"],
      globalHolidays: [hol("g1", "Founders Day", "2025-01-04")],
    });
    expect(classifyChipStatus("2025-01-04", ctx)).toEqual({
      active: false,
      reason: "global-holiday",
    });
  });
});

// ---------------------------------------------------------------------------
// matchHolidays
// ---------------------------------------------------------------------------

describe("matchHolidays", () => {
  const holidays = [
    hol("g1", "New Year", "2025-01-01"),
    hol("g2", "Shutdown", "2025-01-01", "2025-01-07"),
  ];

  it("matches a single-day holiday exactly", () => {
    expect(matchHolidays("2025-01-01", holidays).map((h) => h.id)).toEqual([
      "g1",
      "g2",
    ]);
  });

  it("matches interior days of a multi-day range", () => {
    expect(matchHolidays("2025-01-05", holidays).map((h) => h.id)).toEqual([
      "g2",
    ]);
  });

  it("matches the range end date inclusively", () => {
    expect(matchHolidays("2025-01-07", holidays).map((h) => h.id)).toEqual([
      "g2",
    ]);
  });

  it("returns empty outside every range", () => {
    expect(matchHolidays("2025-01-08", holidays)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// computeBulkEligibleDates
// ---------------------------------------------------------------------------

describe("computeBulkEligibleDates", () => {
  // Wed 2025-01-01 → Tue 2025-01-07, containing Sat 01-04 and Sun 01-05.
  const RANGE = { start: "2025-01-01", end: "2025-01-07" };
  const baseCtx = {
    convertedWorkDays: [] as string[],
    forcedWorkDays: [] as string[],
    projectHolidays: [] as Holiday[],
    workDays: WEEKDAYS,
  };

  it("excludes mask-off days (weekends) inside the range", () => {
    expect(computeBulkEligibleDates(RANGE, baseCtx)).toEqual([
      "2025-01-01",
      "2025-01-02",
      "2025-01-03",
      "2025-01-06",
      "2025-01-07",
    ]);
  });

  it("excludes project holidays inside the range", () => {
    const ctx = {
      ...baseCtx,
      projectHolidays: [hol("p1", "Project Day", "2025-01-02")],
    };
    expect(computeBulkEligibleDates(RANGE, ctx)).toEqual([
      "2025-01-01",
      "2025-01-03",
      "2025-01-06",
      "2025-01-07",
    ]);
  });

  it("excludes dates already present in either override array", () => {
    const ctx = {
      ...baseCtx,
      convertedWorkDays: ["2025-01-03"],
      forcedWorkDays: ["2025-01-06"],
    };
    expect(computeBulkEligibleDates(RANGE, ctx)).toEqual([
      "2025-01-01",
      "2025-01-02",
      "2025-01-07",
    ]);
  });

  it("returns a single date for a single-day range on a mask-on day", () => {
    expect(
      computeBulkEligibleDates({ start: "2025-01-02", end: "2025-01-02" }, baseCtx)
    ).toEqual(["2025-01-02"]);
  });

  it("returns empty when every range date is mask-off", () => {
    expect(
      computeBulkEligibleDates({ start: "2025-01-04", end: "2025-01-05" }, baseCtx)
    ).toEqual([]);
  });
});
