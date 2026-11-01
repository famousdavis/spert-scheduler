// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, ActivityDependency, DeterministicSchedule } from "@domain/models/types";
import { computeDependencySchedule, computeDeterministicSchedule } from "./deterministic";
import { resolveDataDate, scenarioDataDate, zeroFloatIds } from "./recorded-progress";
import { runDependencyTrials, runTrials } from "@core/simulation/monte-carlo";

/**
 * WI-154 (the data date) and WI-151 (an overtaken link's float). Every expected value is written
 * out by hand from a Mon–Fri calendar (no calendar passed), Sept–Nov 2026: Mon 7 Sep, Fri 18 Sep,
 * Mon 21 Sep, Mon 5 Oct, Fri 9 Oct, Mon 12, Wed 14, Thu 15, Fri 16, Mon 19, Tue 20, Fri 23, Mon 26,
 * Tue 27, Fri 30, Sat 31, Mon 2 Nov, Fri 6, Mon 9, Fri 13, Mon 16, Mon 23, Fri 27. Point estimates
 * (Min = Most Likely = Max) make every trial of the simulation take the same durations, so its
 * samples can be written out too. Never computed by the code under test.
 */
function act(id: string, days: number, overrides: Partial<Activity> = {}): Activity {
  return {
    id, name: id, min: days, mostLikely: days, max: days,
    confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned", ...overrides,
  };
}
const fs = (from: string, to: string): ActivityDependency => ({ fromActivityId: from, toActivityId: to, type: "FS", lagDays: 0 });
const row = (s: DeterministicSchedule, id: string) => s.activities.find((a) => a.activityId === id)!;
const dates = (s: DeterministicSchedule, id: string) => [row(s, id).startDate, row(s, id).endDate];

describe("resolveDataDate and the scope", () => {
  it("is nothing without a date, and nothing on or before the project start", () => {
    expect(resolveDataDate(undefined, "2026-10-05", undefined)).toBeUndefined();
    expect(resolveDataDate("2026-10-05", "2026-10-05", undefined)).toBeUndefined();
    expect(resolveDataDate("2026-10-02", "2026-10-05", undefined)).toBeUndefined();
  });
  it("is a working day, its offset counted from the project start: Sat 10/31 moves to Mon 11/02, 20 working days", () => {
    const f = resolveDataDate("2026-10-31", "2026-10-05", undefined)!;
    expect([f.date.getFullYear(), f.date.getMonth() + 1, f.date.getDate(), f.offset]).toEqual([2026, 11, 2, 20]);
    expect(resolveDataDate("2026-10-27", "2026-10-05", undefined)!.offset).toBe(16);
  });
  it("applies only in a scenario that holds a record", () => {
    expect(scenarioDataDate([act("a", 3)], "2026-10-27")).toBeUndefined();
    expect(scenarioDataDate([act("a", 3, { status: "complete", actualDuration: 3 })], "2026-10-27")).toBeUndefined();
    expect(scenarioDataDate([act("a", 3, { status: "inProgress", actualStartDate: "2026-10-05", actualDuration: 1 })], "2026-10-27")).toBe("2026-10-27");
  });
});

/**
 * Review 34's P6 journey, mid-flight (`wi150/review34/interactions/probe1.txt`), today Fri 10/30.
 * Design Complete 09/07–09/18 (10 days); Build In Progress since 09/21, 30 days elapsed, so 31 days:
 * 09/21–11/02; Docs (6) after Design; Training (6) with no predecessor; Test (9) after Build.
 */
const MID = [
  act("Design", 10, { status: "complete", actualStartDate: "2026-09-07", actualFinishDate: "2026-09-18", actualDuration: 10 }),
  act("Build", 20, { status: "inProgress", actualStartDate: "2026-09-21", actualDuration: 30 }),
  act("Docs", 6),
  act("Training", 6),
  act("Test", 9),
];
const MID_DEPS = [fs("Design", "Build"), fs("Design", "Docs"), fs("Build", "Test")];

describe("WI-154, dependencies on: Review 34's mid-flight project", () => {
  it("without a data date, two not-started rows sit in September (the review's measurement)", () => {
    const s = computeDependencySchedule(MID, MID_DEPS, "2026-09-07", 0.5);
    expect([dates(s, "Docs"), dates(s, "Training"), dates(s, "Test")]).toEqual([
      ["2026-09-21", "2026-09-28"], ["2026-09-07", "2026-09-14"], ["2026-11-03", "2026-11-13"],
    ]);
    expect(s.progressNotes).toBeUndefined();
  });

  it("with today, Fri 10/30: Docs and Training start 10/30; the recorded rows and Test do not move", () => {
    const s = computeDependencySchedule(MID, MID_DEPS, "2026-09-07", 0.5, undefined, undefined, "2026-10-30");
    expect([dates(s, "Design"), dates(s, "Build"), dates(s, "Docs"), dates(s, "Training"), dates(s, "Test")]).toEqual([
      ["2026-09-07", "2026-09-18"], ["2026-09-21", "2026-11-02"], ["2026-10-30", "2026-11-06"],
      ["2026-10-30", "2026-11-06"], ["2026-11-03", "2026-11-13"],
    ]);
    // 09/07 – 11/13: eight weeks to 10/30 (40), then 11/02–06 and 11/09–13: 50.
    expect([s.projectEndDate, s.spanDays, s.totalDurationDays]).toEqual(["2026-11-13", 50, 50]);
    const notes = (s.progressNotes ?? []).map((n) => [n.kind, n.activityId, n.date, n.kind === "data-date" ? n.logicStart : ""]);
    expect(notes.sort()).toEqual([
      ["data-date", "Docs", "2026-10-30", "2026-09-21"],
      ["data-date", "Training", "2026-10-30", "2026-09-07"],
    ]);
  });

  it("floats: Docs and Training have 5 days to the end (11/06 → 11/13); Design, Build and Test are critical", () => {
    const s = computeDependencySchedule(MID, MID_DEPS, "2026-09-07", 0.5, undefined, undefined, "2026-10-30");
    expect(["Design", "Build", "Docs", "Training", "Test"].map((id) => row(s, id).totalFloat)).toEqual([0, 0, 5, 5, 0]);
    expect([...zeroFloatIds(s)].sort()).toEqual(["Build", "Design", "Test"]);
  });

  it("the simulation places them where the schedule does: with point estimates every trial ends at day 50", () => {
    // Offsets from 09/07: Design 0–10 (recorded), Build 10–41 (recorded start, 31 days), the data
    // date 10/30 is offset 39: Docs and Training 39–45, Test 41–50.
    const run = (dataDateOffset?: number) => runDependencyTrials({
      activities: MID, dependencies: MID_DEPS, trialCount: 50, rngSeed: "wi154",
      deterministicDurationMap: new Map([["Build", 31], ["Docs", 6], ["Training", 6], ["Test", 9]]),
      recordedStartMap: new Map([["Design", 0], ["Build", 10]]), recordedDurationMap: new Map([["Design", 10]]),
      dataDateOffset,
    }).samples;
    expect(new Set(run(39))).toEqual(new Set([50]));
    expect(new Set(run(undefined))).toEqual(new Set([50])); // Test drives the end either way
  });
});

describe("WI-154: what is floored, in both engines (start 10/05, today Tue 10/27, offset 16)", () => {
  const DONE = act("Done", 5, { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 });

  it("dependencies on: a Planned row after finished work starts on the data date; the simulation agrees", () => {
    const acts = [DONE, act("Next", 6), act("Free", 3)];
    const s = computeDependencySchedule(acts, [fs("Done", "Next")], "2026-10-05", 0.5, undefined, undefined, "2026-10-27");
    // Next: logic 10/12 → 10/27, six days to 11/03. Free: logic 10/05 → 10/27 – 10/29.
    expect([dates(s, "Next"), dates(s, "Free"), s.spanDays]).toEqual([["2026-10-27", "2026-11-03"], ["2026-10-27", "2026-10-29"], 22]);
    const samples = runDependencyTrials({
      activities: acts, dependencies: [fs("Done", "Next")], trialCount: 20, rngSeed: "wi154",
      recordedStartMap: new Map([["Done", 0]]), recordedDurationMap: new Map([["Done", 5]]), dataDateOffset: 16,
    }).samples;
    expect(new Set(samples)).toEqual(new Set([22])); // 16 + 6
  });

  it("dependencies off: the first Planned row after the finished one moves; the row below follows it", () => {
    const acts = [DONE, act("Next", 6), act("Then", 2)];
    const s = computeDeterministicSchedule(acts, "2026-10-05", 0.5, undefined, "2026-10-27");
    // Next 10/27 – 11/03; Then 11/04 – 11/05: span 10/05 – 11/05 = 24.
    expect([dates(s, "Next"), dates(s, "Then"), s.spanDays, s.totalDurationDays]).toEqual([
      ["2026-10-27", "2026-11-03"], ["2026-11-04", "2026-11-05"], 24, 24,
    ]);
    expect((s.progressNotes ?? []).map((n) => [n.kind, n.activityId])).toEqual([["data-date", "Next"]]);
    const samples = runTrials({
      activities: acts, trialCount: 20, rngSeed: "wi154",
      sequentialRecords: [{ startOffset: 0, duration: 5 }, null, null], dataDateOffset: 16,
    }).samples;
    expect(new Set(samples)).toEqual(new Set([24])); // 16 + 6 + 2
  });

  it("In Progress rows — with or without an Actual Start — and Complete rows are never floored", () => {
    const acts = [
      act("Old", 5, { status: "complete", actualDuration: 5 }),
      act("Legacy", 10, { status: "inProgress", actualDuration: 2 }),
      act("Rec", 10, { status: "inProgress", actualStartDate: "2026-10-12", actualDuration: 1 }),
    ];
    const s = computeDependencySchedule(acts, [], "2026-10-05", 0.5, undefined, undefined, "2026-10-27");
    expect([dates(s, "Old"), dates(s, "Legacy"), dates(s, "Rec")]).toEqual([
      ["2026-10-05", "2026-10-09"], ["2026-10-05", "2026-10-16"], ["2026-10-12", "2026-10-23"],
    ]);
    expect(s.progressNotes ?? []).toEqual([]);
  });

  it("a future Start No Earlier Than still moves a row past the data date, with no data-date note", () => {
    const acts = [DONE, act("Late", 3, { constraintType: "SNET", constraintDate: "2026-11-02", constraintMode: "hard" })];
    const s = computeDependencySchedule(acts, [fs("Done", "Late")], "2026-10-05", 0.5, undefined, undefined, "2026-10-27");
    expect(dates(s, "Late")).toEqual(["2026-11-02", "2026-11-04"]);
    expect(s.progressNotes ?? []).toEqual([]);
  });

  it("a hard Must Start On that has passed: started today in both engines, its red error in true words", () => {
    const acts = [DONE, act("X", 5, { constraintType: "MSO", constraintDate: "2026-10-12", constraintMode: "hard" })];
    const s = computeDependencySchedule(acts, [], "2026-10-05", 0.5, undefined, undefined, "2026-10-27");
    expect(dates(s, "X")).toEqual(["2026-10-27", "2026-11-02"]);
    expect(s.constraintConflicts?.map((c) => [c.severity, c.message])).toEqual([[
      // R639, decision 2, and Review 35's W1: the later of today and its links (none here: today).
      "error", "X: Must Start On 2026-10-12 has passed, and X has not started, so the schedule starts it today, 2026-10-27.",
    ]]);
    expect(s.progressNotes ?? []).toEqual([]); // the red error explains it
    const samples = runDependencyTrials({
      activities: acts, dependencies: [], trialCount: 20, rngSeed: "wi154", dataDateOffset: 16,
      recordedStartMap: new Map([["Done", 0]]), recordedDurationMap: new Map([["Done", 5]]),
      constraintMap: new Map([["X", { type: "MSO", offsetFromStart: 5, mode: "hard" }]]),
    }).samples;
    expect(new Set(samples)).toEqual(new Set([21])); // 16 + 5, as the schedule's span
    expect(s.spanDays).toBe(21);
  });

  it("a hard Must Finish On that has passed: the same, finished on 11/02, and the simulation's trial too", () => {
    const acts = [DONE, act("Y", 5, { constraintType: "MFO", constraintDate: "2026-10-16", constraintMode: "hard" })];
    const s = computeDependencySchedule(acts, [], "2026-10-05", 0.5, undefined, undefined, "2026-10-27");
    expect(dates(s, "Y")).toEqual(["2026-10-27", "2026-11-02"]);
    expect(s.constraintConflicts?.map((c) => c.message)).toEqual([
      "Y: Must Finish On 2026-10-16 cannot be met: Y has not started, so the schedule starts it today, 2026-10-27, and finishes it on 2026-11-02.",
    ]);
    const samples = runDependencyTrials({
      activities: acts, dependencies: [], trialCount: 20, rngSeed: "wi154", dataDateOffset: 16,
      recordedStartMap: new Map([["Done", 0]]), recordedDurationMap: new Map([["Done", 5]]),
      constraintMap: new Map([["Y", { type: "MFO", offsetFromStart: 9, mode: "hard" }]]),
    }).samples;
    expect(new Set(samples)).toEqual(new Set([21]));
  });

  it("no data date: a schedule with records is exactly v0.81.0's", () => {
    const acts = [DONE, act("Next", 6)];
    expect(computeDependencySchedule(acts, [fs("Done", "Next")], "2026-10-05", 0.5, undefined, undefined, undefined))
      .toEqual(computeDependencySchedule(acts, [fs("Done", "Next")], "2026-10-05", 0.5));
    expect(dates(computeDependencySchedule(acts, [fs("Done", "Next")], "2026-10-05", 0.5), "Next")).toEqual(["2026-10-12", "2026-10-19"]);
  });
});

/**
 * WI-151 — R632's four cases. P Complete 10/05–10/07 → A Complete 10/08–10/14 → B In Progress, 10
 * days, plus Z (2 days, unlinked). No data date, so only the float is under test.
 */
function chain(bStart: string, extra: Activity[] = []): DeterministicSchedule {
  const acts = [
    act("P", 3, { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-07", actualDuration: 3 }),
    act("A", 5, { status: "complete", actualStartDate: "2026-10-08", actualFinishDate: "2026-10-14", actualDuration: 5 }),
    act("B", 10, { status: "inProgress", actualStartDate: bStart, actualDuration: 1 }),
    act("Z", 2),
    ...extra,
  ];
  return computeDependencySchedule(acts, [fs("P", "A"), fs("A", "B")], "2026-10-05", 0.5);
}
const floats = (s: DeterministicSchedule, ids: string[]) => ids.map((id) => row(s, id).totalFloat);

describe("WI-151: a link a record overtook is left out of the float", () => {
  it("case 1 — B started 10/12, before A finished: A and P have 7 days (end 10/23), not 0; only B is critical", () => {
    const s = chain("2026-10-12");
    // A terminal once A → B is skipped: LS = 10/23 less 4 = 10/19; ES 10/08 → 7. P: LS 10/14 → 7.
    expect(floats(s, ["P", "A", "B", "Z"])).toEqual([7, 7, 0, 13]);
    expect([...zeroFloatIds(s)]).toEqual(["B"]);
    expect(row(s, "A").freeFloat).toBe(7); // no live successor: free float = total float
  });
  it("case 2 — B started 10/15, the day A allowed: P, A and B critical, as before", () => {
    const s = chain("2026-10-15");
    expect(floats(s, ["P", "A", "B"])).toEqual([0, 0, 0]);
  });
  it("case 3 — B started 10/20, three days late: A and P 3, as before", () => {
    expect(floats(chain("2026-10-20"), ["P", "A", "B"])).toEqual([3, 3, 0]);
  });
  it("case 4 — case 1 with a 40-day Y driving the end (11/27): A and P 32, not 22; only Y critical", () => {
    const s = chain("2026-10-12", [act("Y", 40)]);
    // A terminal: LS = 11/27 less 4 = 11/23; 10/08 → 11/23 is 32 working days. P: LS 11/18 → 32.
    expect(floats(s, ["P", "A", "B", "Y"])).toEqual([32, 32, 25, 0]);
    expect([...zeroFloatIds(s)]).toEqual(["Y"]);
  });
  it("R598's example, today 10/27: A (Complete 10/05–10/23) has 15 days, not 0; B and C critical", () => {
    const acts = [
      act("A", 15, { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 }),
      act("B", 10, { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1 }),
      act("C", 10),
    ];
    const s = computeDependencySchedule(acts, [fs("A", "B"), fs("B", "C")], "2026-10-05", 0.5, undefined, undefined, "2026-10-27");
    // C after B (10/19–10/30) starts 11/02, after the data date: not floored. End 11/13.
    expect([dates(s, "C"), floats(s, ["A", "B", "C"])]).toEqual([["2026-11-02", "2026-11-13"], [15, 0, 0]]);
  });
});
