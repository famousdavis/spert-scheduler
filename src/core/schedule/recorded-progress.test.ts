// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, ActivityStatus } from "@domain/models/types";
import { parseDateISO } from "@core/calendar/calendar";
import {
  detectConstraintNotes,
  detectProgressNotes,
  detectStartDateNotes,
  elapsedWorkingDays,
  hasAnyRecord,
  hasRecordedFinish,
  pinnedFinishInt,
  recordExplains,
  recordableToday,
  recordedFlags,
  resolveRecordedProgress,
  statusChangeUpdates,
  zeroFloatIds,
} from "./recorded-progress";

/**
 * WI-137. Every expected value below is written out by hand from a Mon–Fri calendar (no calendar
 * passed), October 2026: Mon 5, Fri 9, Mon 12, Fri 16, Sat 17, Mon 19, Fri 23, Sat 24, Mon 26,
 * Tue 27, Fri 30, Sat 31, Mon 2 Nov. Never computed by the code under test.
 */
function act(id: string, overrides: Partial<Activity> = {}): Activity {
  return {
    id,
    name: id,
    min: 9,
    mostLikely: 10,
    max: 11,
    confidenceLevel: "mediumConfidence",
    distributionType: "uniform",
    status: "planned",
    ...overrides,
  };
}

const TUE = "2026-10-27";
const SAT = "2026-10-31";

describe("statusChangeUpdates — the one rule, as a decision table", () => {
  const ctx = (today: string, sched?: { start: string; finish: string; dur: number }) => ({
    today,
    scheduledStart: sched?.start,
    scheduledFinish: sched?.finish,
    scheduledDuration: sched?.dur,
    calendar: undefined,
  });
  const PAST = { start: "2026-10-05", finish: "2026-10-16", dur: 10 }; // due before today
  const NOW = { start: "2026-10-19", finish: "2026-10-30", dur: 10 }; // started, not yet due
  const LATER = { start: "2026-11-02", finish: "2026-11-13", dur: 10 }; // not yet started

  const rows: Array<[string, Activity, ActivityStatus, ReturnType<typeof ctx>, Partial<Activity>]> = [
    ["same status → nothing", act("a", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 3 }), "inProgress", ctx(TUE, NOW), {}],
    ["Planned → In Progress on a Tuesday: today, 1", act("a"), "inProgress", ctx(TUE, NOW),
      { plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30", actualStartDate: TUE, actualFinishDate: undefined, actualDuration: 1 }],
    ["Planned → In Progress ignores a date a Planned row carries (an import): today", act("a", { actualStartDate: "2026-09-01" }), "inProgress", ctx(TUE, NOW),
      { plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30", actualStartDate: TUE, actualFinishDate: undefined, actualDuration: 1 }],
    ["Planned → In Progress on a Saturday: the Friday before, never a Monday to come (h)", act("a"), "inProgress", ctx(SAT, NOW),
      { plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30", actualStartDate: "2026-10-30", actualFinishDate: undefined, actualDuration: 1 }],
    ["Complete → In Progress: start kept, finish cleared, elapsed from the start", act("a", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }), "inProgress", ctx(TUE, PAST),
      { actualStartDate: "2026-10-05", actualFinishDate: undefined, actualDuration: 17 }],
    ["In Progress → Complete on a Tuesday: finish today", act("a", { status: "inProgress", actualStartDate: "2026-10-05", actualDuration: 3 }), "complete", ctx(TUE, PAST),
      { actualStartDate: "2026-10-05", actualFinishDate: TUE, actualDuration: 17 }],
    ["In Progress → Complete on a Saturday: finish the Friday before", act("a", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 3 }), "complete", ctx(SAT, NOW),
      { actualStartDate: "2026-10-19", actualFinishDate: "2026-10-30", actualDuration: 10 }],
    ["In Progress → Complete, recorded start after today: finish never before the start", act("a", { status: "inProgress", actualStartDate: "2026-11-02", actualDuration: 1 }), "complete", ctx(TUE, LATER),
      { actualStartDate: "2026-11-02", actualFinishDate: "2026-11-02", actualDuration: 1 }],
    ["In Progress with NO start → Complete (ruling 3): no dates, its count kept", act("a", { status: "inProgress", actualDuration: 7 }), "complete", ctx(TUE, NOW), {}],
    ["In Progress with no start and no count → Complete: its scheduled duration, no dates", act("a", { status: "inProgress" }), "complete", ctx(TUE, NOW),
      { actualDuration: 10 }],
    ["In Progress with no start, no count, no schedule → Complete: nothing", act("a", { status: "inProgress" }), "complete", ctx(TUE), {}],
    ["Planned → Complete, already due: its scheduled start and finish", act("a"), "complete", ctx(TUE, PAST),
      { plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-16", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-16", actualDuration: 10 }],
    ["Planned → Complete, started and not yet due: scheduled start to today", act("a"), "complete", ctx(TUE, NOW),
      { plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30", actualStartDate: "2026-10-19", actualFinishDate: TUE, actualDuration: 7 }],
    ["Planned → Complete, not yet started: today and today", act("a"), "complete", ctx(TUE, LATER),
      { plannedStartDate: "2026-11-02", plannedFinishDate: "2026-11-13", actualStartDate: TUE, actualFinishDate: TUE, actualDuration: 1 }],
    ["Planned → Complete with no schedule: today and today", act("a"), "complete", ctx(TUE),
      { plannedStartDate: undefined, plannedFinishDate: undefined, actualStartDate: TUE, actualFinishDate: TUE, actualDuration: 1 }],
    ["Planned → Complete on a Saturday, due Friday 10-30: its scheduled dates, nothing after today", act("a"), "complete", ctx(SAT, NOW),
      { plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30", actualStartDate: "2026-10-19", actualFinishDate: "2026-10-30", actualDuration: 10 }],
    // Release 2 (v0.81.0): leaving Planned also keeps the Planned pair — the schedule's dates, or
    // both keys undefined with no schedule — and → Planned clears the pair with the three.
    ["In Progress → Planned: all three cleared", act("a", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 3 }), "planned", ctx(TUE, NOW),
      { actualDuration: undefined, plannedStartDate: undefined, plannedFinishDate: undefined, actualStartDate: undefined, actualFinishDate: undefined }],
    ["Complete → Planned: all three cleared", act("a", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-16", actualDuration: 10 }), "planned", ctx(TUE, PAST),
      { actualDuration: undefined, plannedStartDate: undefined, plannedFinishDate: undefined, actualStartDate: undefined, actualFinishDate: undefined }],
  ];

  for (const [name, activity, to, c, expected] of rows) {
    it(name, () => {
      expect(statusChangeUpdates(activity, to, c)).toStrictEqual(expected);
    });
  }

  it("a clear names its keys, so a spread over the activity removes the old values", () => {
    const u = statusChangeUpdates(act("a", { status: "complete", actualStartDate: "2026-10-05" }), "planned", ctx(TUE));
    expect(Object.keys(u).sort()).toEqual(["actualDuration", "actualFinishDate", "actualStartDate", "plannedFinishDate", "plannedStartDate"]);
  });
});

describe("the dates taken from today", () => {
  it("recordableToday keeps a working day and steps a weekend back to Friday", () => {
    expect(recordableToday(TUE, undefined)).toBe(TUE);
    expect(recordableToday(SAT, undefined)).toBe("2026-10-30");
    expect(recordableToday("2026-11-01", undefined)).toBe("2026-10-30");
  });

  it("elapsedWorkingDays counts both ends when today is a working day", () => {
    expect(elapsedWorkingDays("2026-10-19", TUE, undefined)).toBe(7);
    expect(elapsedWorkingDays("2026-10-19", SAT, undefined)).toBe(10);
    expect(elapsedWorkingDays("2026-11-02", TUE, undefined)).toBe(1);
  });
});

describe("resolveRecordedProgress", () => {
  const START = "2026-10-05";

  it("has no record for a Planned row, a row with no start, or any row a v25 build wrote", () => {
    const rows = [
      act("p", { actualStartDate: "2026-10-12" }),
      act("ip", { status: "inProgress", actualDuration: 3 }),
      act("c", { status: "complete", actualDuration: 10 }),
    ];
    expect(resolveRecordedProgress(rows, START, undefined).size).toBe(0);
    expect(hasAnyRecord(rows)).toBe(false);
  });

  it("an In Progress start: its offset, as recorded", () => {
    const rec = resolveRecordedProgress([act("b", { status: "inProgress", actualStartDate: "2026-10-19" })], START, undefined).get("b")!;
    expect(rec).toStrictEqual({ start: "2026-10-19", startOffset: 10, startAsRecorded: true, complete: false });
    expect(recordedFlags(rec)).toStrictEqual({ recordedStart: true });
  });

  it("a Saturday start moves forward to Monday and a Saturday finish back to Friday — neither shown as recorded", () => {
    const rec = resolveRecordedProgress(
      [act("a", { status: "complete", actualStartDate: "2026-10-17", actualFinishDate: "2026-10-24", actualDuration: 5 })], START, undefined,
    ).get("a")!;
    expect(rec).toStrictEqual({
      start: "2026-10-19", startOffset: 10, startAsRecorded: false, complete: true,
      finish: "2026-10-23", finishAsRecorded: false, duration: 5,
    });
    expect(recordedFlags(rec)).toStrictEqual({});
  });

  it("(l) a start before the Start Date is drawn from it, not flagged, and remembered for the note", () => {
    const rec = resolveRecordedProgress(
      [act("a", { status: "complete", actualStartDate: "2026-10-01", actualFinishDate: "2026-10-09", actualDuration: 7 })], START, undefined,
    ).get("a")!;
    expect(rec).toStrictEqual({
      start: START, startOffset: 0, startAsRecorded: false, clampedFrom: "2026-10-01", complete: true,
      finish: "2026-10-09", finishAsRecorded: true, duration: 5,
    });
    expect(recordedFlags(rec)).toStrictEqual({ recordedFinish: true });
  });

  it("a finish before its start is read as one day on the start", () => {
    const rec = resolveRecordedProgress(
      [act("a", { status: "complete", actualStartDate: "2026-10-12", actualFinishDate: "2026-10-05" })], START, undefined,
    ).get("a")!;
    expect(rec.finish).toBe("2026-10-12");
    expect(rec.duration).toBe(1);
    expect(rec.finishAsRecorded).toBe(false);
  });

  it("hasRecordedFinish: a Complete row with both dates, and nothing else", () => {
    expect(hasRecordedFinish(act("a", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09" }))).toBe(true);
    expect(hasRecordedFinish(act("a", { status: "complete", actualStartDate: "2026-10-05" }))).toBe(false);
    expect(hasRecordedFinish(act("a", { status: "inProgress", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09" }))).toBe(false);
  });
});

describe("the neutral notes", () => {
  const START = "2026-10-05";
  const dates = (m: Record<string, [string, string]>) => ({
    startDates: new Map(Object.entries(m).map(([k, [s]]) => [k, parseDateISO(s)])),
    endDates: new Map(Object.entries(m).map(([k, [, e]]) => [k, parseDateISO(e)])),
  });

  it("FS: one note with the predecessor's finish and what the link allowed; none for an on-time start (S8)", () => {
    const a = act("a", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 });
    const b = act("b", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1 });
    const records = resolveRecordedProgress([a, b], START, undefined);
    const notes = detectProgressNotes({
      pairs: [{ fromId: "a", toId: "b", type: "FS", lagDays: 0 }],
      records, ...dates({ a: ["2026-10-05", "2026-10-23"], b: ["2026-10-19", "2026-10-30"] }),
      activityMap: new Map([["a", a], ["b", b]]), calendar: undefined, sequential: false,
    });
    expect(notes).toStrictEqual([{
      kind: "link", activityId: "b", activityName: "b", event: "start", date: "2026-10-19",
      predecessorId: "a", predecessorName: "a", predecessorComplete: true, dependencyType: "FS", lagDays: 0,
      predecessorDate: "2026-10-23", allowedDate: "2026-10-26", sequential: false,
    }]);
    // B starting on 10-26, the first day the link allows, is no overlap.
    const onTime = resolveRecordedProgress([a, { ...b, actualStartDate: "2026-10-26" }], START, undefined);
    expect(detectProgressNotes({
      pairs: [{ fromId: "a", toId: "b", type: "FS", lagDays: 0 }],
      records: onTime, ...dates({ a: ["2026-10-05", "2026-10-23"], b: ["2026-10-26", "2026-11-06"] }),
      activityMap: new Map([["a", a], ["b", b]]), calendar: undefined, sequential: false,
    })).toEqual([]);
  });

  it("FS with a 3-day lag: the allowed date counts the lag (2c)", () => {
    const a = act("a");
    const b = act("b", { status: "inProgress", actualStartDate: "2026-10-20" });
    const [n] = detectProgressNotes({
      pairs: [{ fromId: "a", toId: "b", type: "FS", lagDays: 3 }],
      records: resolveRecordedProgress([a, b], START, undefined),
      ...dates({ a: ["2026-10-05", "2026-10-16"], b: ["2026-10-20", "2026-10-30"] }),
      activityMap: new Map([["a", a], ["b", b]]), calendar: undefined, sequential: false,
    });
    expect(n).toMatchObject({ date: "2026-10-20", predecessorDate: "2026-10-16", allowedDate: "2026-10-22", lagDays: 3, predecessorComplete: false });
  });

  it("SS with a 5-day lag, and FF only on a Complete row (an In Progress finish is a forecast the link holds)", () => {
    const a = act("a");
    const b = act("b", { status: "inProgress", actualStartDate: "2026-10-08" });
    const c = act("c", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-14", actualDuration: 8 });
    const d = act("d", { status: "inProgress", actualStartDate: "2026-10-05" });
    const notes = detectProgressNotes({
      pairs: [
        { fromId: "a", toId: "b", type: "SS", lagDays: 5 },
        { fromId: "a", toId: "c", type: "FF", lagDays: 0 },
        { fromId: "a", toId: "d", type: "FF", lagDays: 0 },
      ],
      records: resolveRecordedProgress([a, b, c, d], START, undefined),
      ...dates({ a: ["2026-10-05", "2026-10-16"], b: ["2026-10-08", "2026-10-21"], c: ["2026-10-05", "2026-10-14"], d: ["2026-10-05", "2026-10-09"] }),
      activityMap: new Map([["a", a], ["b", b], ["c", c], ["d", d]]), calendar: undefined, sequential: false,
    });
    expect(notes.map((n) => [n.activityId, n.event, n.date, n.allowedDate])).toEqual([
      ["b", "start", "2026-10-08", "2026-10-12"],
      ["c", "finish", "2026-10-14", "2026-10-16"],
    ]);
  });

  it("constraints: a start constraint the record broke, a Complete row's missed deadline; an In Progress row's deadline is not a note", () => {
    const b = act("b", { status: "inProgress", actualStartDate: "2026-10-19", constraintType: "MSO", constraintDate: "2026-10-26", constraintMode: "hard" });
    const c = act("c", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", constraintType: "FNLT", constraintDate: "2026-10-20", constraintMode: "soft" });
    const d = act("d", { status: "inProgress", actualStartDate: "2026-10-05", constraintType: "FNLT", constraintDate: "2026-10-06", constraintMode: "hard" });
    const e = act("e", { status: "inProgress", actualStartDate: "2026-10-19", constraintType: "SNET", constraintDate: "2026-10-12", constraintMode: "hard" });
    const records = resolveRecordedProgress([b, c, d, e], START, undefined);
    const notes = detectConstraintNotes({
      records,
      endDates: new Map([["c", parseDateISO("2026-10-23")], ["b", parseDateISO("2026-10-30")], ["d", parseDateISO("2026-10-16")], ["e", parseDateISO("2026-10-30")]]),
      activityMap: new Map([["b", b], ["c", c], ["d", d], ["e", e]]),
    });
    expect(notes).toStrictEqual([
      { kind: "constraint", activityId: "b", activityName: "b", event: "start", date: "2026-10-19", constraintType: "MSO", constraintDate: "2026-10-26" },
      { kind: "constraint", activityId: "c", activityName: "c", event: "finish", date: "2026-10-23", constraintType: "FNLT", constraintDate: "2026-10-20" },
    ]);
  });

  it("(l) a start before the Start Date: one note with the recorded date", () => {
    const a = act("a", { status: "inProgress", actualStartDate: "2026-09-28" });
    expect(detectStartDateNotes(resolveRecordedProgress([a], START, undefined), new Map([["a", a]]))).toStrictEqual([
      { kind: "before-start-date", activityId: "a", activityName: "a", date: "2026-09-28", startDate: START },
    ]);
  });

  it("recordExplains: FS and SS for any recorded row; FF only for a Complete one (2b)", () => {
    const records = resolveRecordedProgress([
      act("ip", { status: "inProgress", actualStartDate: "2026-10-05" }),
      act("c", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09" }),
    ], START, undefined);
    expect([recordExplains("FS", "ip", records), recordExplains("SS", "ip", records), recordExplains("FF", "ip", records)]).toEqual([true, true, false]);
    expect(recordExplains("FF", "c", records)).toBe(true);
    expect(recordExplains("FS", "none", records)).toBe(false);
  });
});

describe("pinnedFinishInt — the simulation's finish rule for an In Progress row (exclusive offsets)", () => {
  it("a hard Must Finish On holds the finish on its day; a hard Finish No Earlier Than is a floor; nothing else moves it", () => {
    expect(pinnedFinishInt(10, 20, { type: "MFO", offsetFromStart: 17, mode: "hard" })).toBe(18);
    expect(pinnedFinishInt(10, 20, { type: "MFO", offsetFromStart: 5, mode: "hard" })).toBe(11);
    expect(pinnedFinishInt(10, 20, { type: "FNET", offsetFromStart: 24, mode: "hard" })).toBe(25);
    expect(pinnedFinishInt(10, 20, { type: "FNET", offsetFromStart: 12, mode: "hard" })).toBe(20);
    expect(pinnedFinishInt(10, 20, { type: "FNLT", offsetFromStart: 12, mode: "hard" })).toBe(20);
    expect(pinnedFinishInt(10, 20, { type: "MFO", offsetFromStart: 17, mode: "soft" })).toBe(20);
    expect(pinnedFinishInt(10, 20, null)).toBe(20);
  });
});

describe("zeroFloatIds", () => {
  it("is the rows with no total float", () => {
    expect([...zeroFloatIds({ activities: [
      { activityId: "a", totalFloat: 0 }, { activityId: "b", totalFloat: 5 }, { activityId: "c" }, { activityId: "d", totalFloat: 0 },
    ] })]).toEqual(["a", "d"]);
  });
});
