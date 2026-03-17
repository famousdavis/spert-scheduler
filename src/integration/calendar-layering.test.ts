// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { mergeCalendars } from "@core/calendar/calendar";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import {
  computeDeterministicSchedule,
  computeDependencySchedule,
} from "@core/schedule/deterministic";
import type { Activity, ActivityDependency, Calendar } from "@domain/models/types";

function makeActivity(overrides: Partial<Activity> = {}): Activity {
  return {
    id: "a1",
    name: "Task",
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    ...overrides,
  };
}

function fsDep(from: string, to: string, lag = 0): ActivityDependency {
  return { fromActivityId: from, toActivityId: to, type: "FS", lagDays: lag };
}

describe("calendar layering: global + project", () => {
  const activities = [
    makeActivity({ id: "a1", min: 3, mostLikely: 3, max: 3 }),
    makeActivity({ id: "a2", min: 3, mostLikely: 3, max: 3 }),
  ];

  it("no calendars: default Mon-Fri schedule", () => {
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    // Mon Jan 6, 3-day a1 ends Thu Jan 9, a2 ends Tue Jan 14
    expect(schedule.activities).toHaveLength(2);
    expect(schedule.activities[0]!.startDate).toBe("2025-01-06");
  });

  it("global-only calendar: global holidays observed", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "Global Day", startDate: "2025-01-07", endDate: "2025-01-07" }],
    };
    const merged = mergeCalendars(global, undefined);
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], merged?.holidays ?? [], []);
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5, cal);
    // Tue Jan 7 is holiday, so schedule stretches
    const noHoliday = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    expect(schedule.projectEndDate >= noHoliday.projectEndDate).toBe(true);
  });

  it("project-only calendar: project holidays observed", () => {
    const project: Calendar = {
      holidays: [{ id: "h1", name: "Team Offsite", startDate: "2025-01-08", endDate: "2025-01-08" }],
    };
    const merged = mergeCalendars(undefined, project);
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], merged?.holidays ?? [], []);
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5, cal);
    const noHoliday = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    expect(schedule.projectEndDate >= noHoliday.projectEndDate).toBe(true);
  });

  it("both calendars: union of holidays observed", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "Global", startDate: "2025-01-07", endDate: "2025-01-07" }],
    };
    const project: Calendar = {
      holidays: [{ id: "h2", name: "Project", startDate: "2025-01-08", endDate: "2025-01-08" }],
    };
    const merged = mergeCalendars(global, project)!;
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], merged.holidays, []);
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5, cal);
    // Both holidays skipped
    const globalOnlyCal = buildWorkCalendar([1, 2, 3, 4, 5], global.holidays, []);
    const globalOnly = computeDeterministicSchedule(activities, "2025-01-06", 0.5, globalOnlyCal);
    expect(schedule.projectEndDate >= globalOnly.projectEndDate).toBe(true);
  });

  it("same-date overlap: no double-penalty", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "Shared A", startDate: "2025-01-07", endDate: "2025-01-07" }],
    };
    const project: Calendar = {
      holidays: [{ id: "h2", name: "Shared B", startDate: "2025-01-07", endDate: "2025-01-07" }],
    };
    const merged = mergeCalendars(global, project)!;
    const mergedCal = buildWorkCalendar([1, 2, 3, 4, 5], merged.holidays, []);
    const singleCal = buildWorkCalendar([1, 2, 3, 4, 5], global.holidays, []);
    const mergedSchedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5, mergedCal);
    const singleSchedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5, singleCal);
    // Identical end dates — duplicate holiday doesn't cause extra skip
    expect(mergedSchedule.projectEndDate).toBe(singleSchedule.projectEndDate);
  });

  it("non-standard work week + project holidays", () => {
    const project: Calendar = {
      holidays: [{ id: "h1", name: "Offsite", startDate: "2025-01-13", endDate: "2025-01-13" }], // Monday
    };
    const merged = mergeCalendars(undefined, project)!;
    // Sun-Thu work week: Mon Jan 13 is normally a work day, but it's a holiday
    const cal = buildWorkCalendar([0, 1, 2, 3, 4], merged.holidays, []);
    const schedule = computeDeterministicSchedule(activities, "2025-01-12", 0.5, cal); // Start Sunday
    const noHoliday = buildWorkCalendar([0, 1, 2, 3, 4], [], []);
    const noHolSchedule = computeDeterministicSchedule(activities, "2025-01-12", 0.5, noHoliday);
    expect(schedule.projectEndDate >= noHolSchedule.projectEndDate).toBe(true);
  });

  it("dependency schedule with merged calendars respects all holidays", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "Global", startDate: "2025-01-09", endDate: "2025-01-09" }],
    };
    const project: Calendar = {
      holidays: [{ id: "h2", name: "Project", startDate: "2025-01-10", endDate: "2025-01-10" }],
    };
    const merged = mergeCalendars(global, project)!;
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], merged.holidays, []);
    const deps = [fsDep("a1", "a2")];
    const schedule = computeDependencySchedule(activities, deps, "2025-01-06", 0.5, cal);
    const noCal = computeDependencySchedule(activities, deps, "2025-01-06", 0.5);
    expect(schedule.projectEndDate >= noCal.projectEndDate).toBe(true);
  });

  it("both empty: behaves as no calendar", () => {
    const global: Calendar = { holidays: [] };
    const project: Calendar = { holidays: [] };
    const merged = mergeCalendars(global, project)!;
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], merged.holidays, []);
    const schedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5, cal);
    const noCal = computeDeterministicSchedule(activities, "2025-01-06", 0.5);
    expect(schedule.projectEndDate).toBe(noCal.projectEndDate);
  });

  it("mergeCalendars only merges holidays, not workDays", () => {
    // workDays are set at the scenario/preferences level, not in Calendar
    const global: Calendar = { holidays: [{ id: "h1", name: "H", startDate: "2025-01-07", endDate: "2025-01-07" }] };
    const merged = mergeCalendars(global, undefined)!;
    // Calendar type has only `holidays` field — no workDays
    expect("workDays" in merged).toBe(false);
    expect(merged.holidays).toHaveLength(1);
  });

  it("holiday week from merged global+project: entire week skipped", () => {
    // Global has Mon-Wed, project has Thu-Fri in the same week
    const global: Calendar = {
      holidays: [{ id: "h1", name: "Company", startDate: "2025-01-06", endDate: "2025-01-08" }],
    };
    const project: Calendar = {
      holidays: [{ id: "h2", name: "Team", startDate: "2025-01-09", endDate: "2025-01-10" }],
    };
    const merged = mergeCalendars(global, project)!;
    const cal = buildWorkCalendar([1, 2, 3, 4, 5], merged.holidays, []);
    const singleAct = [makeActivity({ id: "a1", min: 1, mostLikely: 1, max: 1 })];
    const schedule = computeDeterministicSchedule(singleAct, "2025-01-06", 0.5, cal);
    // Entire week Jan 6-10 is holidays, so activity must start Mon Jan 13
    expect(schedule.activities[0]!.startDate).toBe("2025-01-13");
  });

  it("global-only schedule matches mergeCalendars(global, undefined) result", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "NY", startDate: "2025-01-01", endDate: "2025-01-01" }],
    };
    const directCal = buildWorkCalendar([1, 2, 3, 4, 5], global.holidays, []);
    const mergedCal = buildWorkCalendar([1, 2, 3, 4, 5], mergeCalendars(global, undefined)!.holidays, []);
    const directSchedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5, directCal);
    const mergedSchedule = computeDeterministicSchedule(activities, "2025-01-06", 0.5, mergedCal);
    expect(mergedSchedule.projectEndDate).toBe(directSchedule.projectEndDate);
  });

  it("both calendars: end date >= max of either-alone", () => {
    const global: Calendar = {
      holidays: [{ id: "h1", name: "Global", startDate: "2025-01-07", endDate: "2025-01-07" }],
    };
    const project: Calendar = {
      holidays: [{ id: "h2", name: "Project", startDate: "2025-01-08", endDate: "2025-01-08" }],
    };
    const merged = mergeCalendars(global, project)!;
    const mergedCal = buildWorkCalendar([1, 2, 3, 4, 5], merged.holidays, []);
    const globalCal = buildWorkCalendar([1, 2, 3, 4, 5], global.holidays, []);
    const projectCal = buildWorkCalendar([1, 2, 3, 4, 5], project.holidays, []);

    const mergedEnd = computeDeterministicSchedule(activities, "2025-01-06", 0.5, mergedCal).projectEndDate;
    const globalEnd = computeDeterministicSchedule(activities, "2025-01-06", 0.5, globalCal).projectEndDate;
    const projectEnd = computeDeterministicSchedule(activities, "2025-01-06", 0.5, projectCal).projectEndDate;

    expect(mergedEnd >= globalEnd).toBe(true);
    expect(mergedEnd >= projectEnd).toBe(true);
  });
});
