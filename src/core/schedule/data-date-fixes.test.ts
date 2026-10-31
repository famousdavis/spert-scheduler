// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, ActivityDependency, DeterministicSchedule, LinkProgressNote } from "@domain/models/types";
import { computeDependencySchedule, computeDeterministicSchedule } from "./deterministic";
import { zeroFloatIds } from "./recorded-progress";
import { runDependencyTrials, runTrials } from "@core/simulation/monte-carlo";
import { progressNoteLines, progressNoteSentence } from "@ui/helpers/progress-note-words";

/**
 * WI-154 — Review 35's fixes and the owner's ruling 2 (R639), each pinned here so it fails without
 * the fix. Mon–Fri calendar, no holidays; start Mon 10/05/2026; point estimates (Min = Most Likely =
 * Max), so every simulation trial takes the same durations and its samples can be written out.
 * Working-day offsets from 10/05: 10/12 = 5, 10/16 = 9, 10/19 = 10, 10/20 = 11, 10/23 = 14,
 * 10/27 = 16, 10/30 = 19, 11/02 = 20, 11/03 = 21, 11/06 = 24, 11/09 = 25, 11/10 = 26, 11/16 = 30,
 * 11/20 = 34. Every expected value is counted by hand, never computed by the code under test.
 */
function act(id: string, days: number, overrides: Partial<Activity> = {}): Activity {
  return {
    id, name: id, min: days, mostLikely: days, max: days,
    confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned", ...overrides,
  };
}
const link = (from: string, to: string, type: "FS" | "SS" | "FF" = "FS", lagDays = 0): ActivityDependency =>
  ({ fromActivityId: from, toActivityId: to, type, lagDays });
const row = (s: DeterministicSchedule, id: string) => s.activities.find((a) => a.activityId === id)!;
const dates = (s: DeterministicSchedule, id: string) => [row(s, id).startDate, row(s, id).endDate];
const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const linkNotes = (s: DeterministicSchedule) => (s.progressNotes ?? []).filter((n): n is LinkProgressNote => n.kind === "link");
// A record elsewhere in the scenario, so the data date applies (the callers' scope).
const REC = act("Rec", 5, { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 });
const TODAY = "2026-10-27";

describe("Review 35, interactions E1: work that has not started never holds work that has", () => {
  // P has not started; C is Complete and L In Progress, neither with a recorded start (a row from
  // before v0.80.0, or a spreadsheet import). P → C and P → L.
  const ACTS = [
    REC, act("P", 5),
    act("C", 5, { status: "complete", actualDuration: 5 }),
    act("L", 5, { status: "inProgress", actualDuration: 2 }),
  ];
  const DEPS = [link("P", "C"), link("P", "L")];

  it("dependencies on: P starts today; C and L keep their place from the Start Date — finished work is not pushed past today", () => {
    const s = computeDependencySchedule(ACTS, DEPS, "2026-10-05", 0.5, undefined, undefined, TODAY);
    // P 10/27 – 11/02 (five days). C: its count, 5, from the Start Date: 10/05 – 10/09. L: 2 elapsed,
    // so at least 3, and its estimate 5: 10/05 – 10/09. Without the fix, both followed P: 11/03 – 11/09.
    expect([dates(s, "P"), dates(s, "C"), dates(s, "L")]).toEqual([
      ["2026-10-27", "2026-11-02"], ["2026-10-05", "2026-10-09"], ["2026-10-05", "2026-10-09"],
    ]);
    expect([s.projectEndDate, s.spanDays, s.dependencyConflicts]).toEqual(["2026-11-02", 21, undefined]);
    expect(linkNotes(s).map((n) => [n.predecessorId, n.activityId, n.unrecorded, n.predecessorNotStarted])).toEqual([
      ["P", "C", "complete", { start: "2026-10-27", finish: "2026-11-02" }],
      ["P", "L", "inProgress", { start: "2026-10-27", finish: "2026-11-02" }],
    ]);
  });

  it("… and the simulation agrees: every trial ends with P, at day 21 (16 + 5), not 26", () => {
    const samples = runDependencyTrials({
      activities: ACTS, dependencies: DEPS, trialCount: 20, rngSeed: "wi154-e1",
      recordedStartMap: new Map([["Rec", 0]]), recordedDurationMap: new Map([["Rec", 5]]), dataDateOffset: 16,
    }).samples;
    expect(new Set(samples)).toEqual(new Set([21]));
  });

  it("an In Progress row's forecast finish is not held by a finish-to-finish link from work that has not started", () => {
    // S started 10/12 (5 elapsed, estimate 10): 10/12 – 10/23. P (10 days) has not started: 10/27 – 11/09.
    // Without the fix the link held S's finish to 11/09.
    const acts = [act("P", 10), act("S", 10, { status: "inProgress", actualStartDate: "2026-10-12", actualDuration: 5 })];
    const s = computeDependencySchedule(acts, [link("P", "S", "FF")], "2026-10-05", 0.5, undefined, undefined, TODAY);
    expect([dates(s, "P"), dates(s, "S"), s.dependencyConflicts]).toEqual([
      ["2026-10-27", "2026-11-09"], ["2026-10-12", "2026-10-23"], undefined,
    ]);
    expect(progressNoteSentence(linkNotes(s)[0]!, mdy)).toBe(
      "S has started, but its predecessor P has not (it is scheduled from 10/27/2026 to 11/09/2026). The schedule does not hold work that has started back for work that has not.",
    );
    const samples = runDependencyTrials({
      activities: acts, dependencies: [link("P", "S", "FF")], trialCount: 20, rngSeed: "wi154-e1",
      recordedStartMap: new Map([["S", 5]]), dataDateOffset: 16,
    }).samples;
    expect(new Set(samples)).toEqual(new Set([26])); // P 16 – 26; S 5 – 15
  });

  it("dependencies off: a started row below one that has not started follows the last started row", () => {
    // Rec 10/05 – 10/09; A has not started: today, 10/27 – 11/02; B, Complete with no dates, after
    // Rec: 10/12 – 10/16 (without the fix, after A: 11/03 – 11/09); C after B (10/19), today: 10/27 – 10/29.
    const acts = [REC, act("A", 5), act("B", 5, { status: "complete", actualDuration: 5 }), act("C", 3)];
    const s = computeDeterministicSchedule(acts, "2026-10-05", 0.5, undefined, TODAY);
    expect(acts.map((a) => dates(s, a.id))).toEqual([
      ["2026-10-05", "2026-10-09"], ["2026-10-27", "2026-11-02"], ["2026-10-12", "2026-10-16"], ["2026-10-27", "2026-10-29"],
    ]);
    // Positions: Rec 0–5, A 16–21, B 5–10, C 16–19: the work content ends at 21, as does the span.
    expect([s.spanDays, s.totalDurationDays]).toEqual([21, 21]);
    expect(linkNotes(s).map((n) => [n.predecessorId, n.activityId, n.unrecorded, n.sequential])).toEqual([["A", "B", "complete", true]]);
    const samples = runTrials({
      activities: acts, trialCount: 20, rngSeed: "wi154-e1",
      sequentialRecords: [{ startOffset: 0, duration: 5 }, null, null, null], dataDateOffset: 16,
    }).samples;
    expect(new Set(samples)).toEqual(new Set([21]));
  });

  it("the data date never moves a started row: the same dates for today 10/27 and today 11/16", () => {
    const at = (today: string) => {
      const s = computeDependencySchedule(ACTS, DEPS, "2026-10-05", 0.5, undefined, undefined, today);
      return ["Rec", "C", "L"].map((id) => dates(s, id));
    };
    expect(at("2026-11-16")).toEqual(at(TODAY));
  });

  it("without the data date, exactly as before: C and L after P", () => {
    const s = computeDependencySchedule(ACTS, DEPS, "2026-10-05", 0.5);
    expect([dates(s, "P"), dates(s, "C"), dates(s, "L")]).toEqual([
      ["2026-10-05", "2026-10-09"], ["2026-10-12", "2026-10-16"], ["2026-10-12", "2026-10-16"],
    ]);
  });
});

describe("owner, R639, decision 2: a passed hard date after predecessors that finish after today", () => {
  // P (10 days) has not started: 10/27 – 11/09. X or Y (5 days) follows it.
  it("Must Start On 10/12: X starts after P, 11/10 – 11/16, in both engines (31 = 31), and the words say when", () => {
    const acts = [REC, act("P", 10), act("X", 5, { constraintType: "MSO", constraintDate: "2026-10-12", constraintMode: "hard" })];
    const s = computeDependencySchedule(acts, [link("P", "X")], "2026-10-05", 0.5, undefined, undefined, TODAY);
    expect([dates(s, "X"), s.spanDays, s.dependencyConflicts]).toEqual([["2026-11-10", "2026-11-16"], 31, undefined]);
    expect(s.constraintConflicts?.map((c) => [c.severity, c.message, c.passed])).toEqual([[
      "error", "X: Must Start On 2026-10-12 has passed, and X has not started, so the schedule starts it on 2026-11-10.", true,
    ]]);
    const samples = runDependencyTrials({
      activities: acts, dependencies: [link("P", "X")], trialCount: 20, rngSeed: "wi154-r2",
      recordedStartMap: new Map([["Rec", 0]]), recordedDurationMap: new Map([["Rec", 5]]), dataDateOffset: 16,
      constraintMap: new Map([["X", { type: "MSO", offsetFromStart: 5, mode: "hard" }]]),
    }).samples;
    expect(new Set(samples)).toEqual(new Set([31]));
  });

  it("Must Finish On 10/16: Y starts after P and runs its five days, 11/10 – 11/16, in both engines", () => {
    const acts = [REC, act("P", 10), act("Y", 5, { constraintType: "MFO", constraintDate: "2026-10-16", constraintMode: "hard" })];
    const s = computeDependencySchedule(acts, [link("P", "Y")], "2026-10-05", 0.5, undefined, undefined, TODAY);
    expect([dates(s, "Y"), s.spanDays]).toEqual([["2026-11-10", "2026-11-16"], 31]);
    expect(s.constraintConflicts?.map((c) => c.message)).toEqual([
      "Y: Must Finish On 2026-10-16 cannot be met: Y has not started, so the schedule starts it on 2026-11-10 and finishes it on 2026-11-16.",
    ]);
    const samples = runDependencyTrials({
      activities: acts, dependencies: [link("P", "Y")], trialCount: 20, rngSeed: "wi154-r2",
      recordedStartMap: new Map([["Rec", 0]]), recordedDurationMap: new Map([["Rec", 5]]), dataDateOffset: 16,
      constraintMap: new Map([["Y", { type: "MFO", offsetFromStart: 9, mode: "hard" }]]),
    }).samples;
    expect(new Set(samples)).toEqual(new Set([31])); // without the hold: Y "ends" at 10, P at 26
  });

  it("start-to-start, 3 days' lag, from P: X starts 10/30 — P's start and its lag — in both engines (26 = 26)", () => {
    const acts = [REC, act("P", 10), act("X", 5, { constraintType: "MSO", constraintDate: "2026-10-12", constraintMode: "hard" })];
    const s = computeDependencySchedule(acts, [link("P", "X", "SS", 3)], "2026-10-05", 0.5, undefined, undefined, TODAY);
    expect([dates(s, "X"), s.spanDays, s.dependencyConflicts]).toEqual([["2026-10-30", "2026-11-05"], 26, undefined]);
    const samples = runDependencyTrials({
      activities: acts, dependencies: [link("P", "X", "SS", 3)], trialCount: 20, rngSeed: "wi154-r2",
      recordedStartMap: new Map([["Rec", 0]]), recordedDurationMap: new Map([["Rec", 5]]), dataDateOffset: 16,
      constraintMap: new Map([["X", { type: "MSO", offsetFromStart: 5, mode: "hard" }]]),
    }).samples;
    expect(new Set(samples)).toEqual(new Set([26]));
  });

  it("dependencies off: after the row above, which ends past today (both engines: 31)", () => {
    const acts = [REC, act("P", 10), act("X", 5, { constraintType: "MSO", constraintDate: "2026-10-12", constraintMode: "hard" })];
    const s = computeDeterministicSchedule(acts, "2026-10-05", 0.5, undefined, TODAY);
    expect([dates(s, "X"), s.spanDays]).toEqual([["2026-11-10", "2026-11-16"], 31]);
    const samples = runTrials({
      activities: acts, trialCount: 20, rngSeed: "wi154-r2", dataDateOffset: 16,
      sequentialRecords: [{ startOffset: 0, duration: 5 }, null, null],
      sequentialConstraints: [null, null, { type: "MSO", offsetFromStart: 5, mode: "hard" }],
    }).samples;
    expect(new Set(samples)).toEqual(new Set([31]));
  });
});

describe("Review 35, verification E3: a skipped link never makes a No Later Than date look unmeetable", () => {
  it("no data date: A finishes 10/16, before its Finish No Later Than 10/20 — no red error, though B overtook A → B", () => {
    // A In Progress 10/05 – 10/16; B started 10/12, 20 days, to 11/06. WI-151 skips A → B for the float,
    // so A's float runs to the project's end (10/26 less 10/05: 15); the check reads the full network's
    // late finish, 10/09 (B's late start 10/12, less A's ten days), as before WI-151.
    const acts = [
      act("A", 10, { status: "inProgress", actualStartDate: "2026-10-05", actualDuration: 1, constraintType: "FNLT", constraintDate: "2026-10-20", constraintMode: "hard" }),
      act("B", 20, { status: "inProgress", actualStartDate: "2026-10-12", actualDuration: 1 }),
    ];
    const s = computeDependencySchedule(acts, [link("A", "B")], "2026-10-05", 0.5);
    expect([s.constraintConflicts, row(s, "A").totalFloat, row(s, "A").lateFinishNet]).toEqual([undefined, 15, "2026-10-09"]);
  });

  it("with the data date (today Sat 10/31): A, not started, Finish No Later Than 11/12, finishing 11/06 — no red error", () => {
    // A starts Mon 11/02, five days to Fri 11/06. B started 10/12, 30 days, to 11/20.
    const acts = [
      act("A", 5, { constraintType: "FNLT", constraintDate: "2026-11-12", constraintMode: "hard" }),
      act("B", 30, { status: "inProgress", actualStartDate: "2026-10-12", actualDuration: 1 }),
    ];
    const s = computeDependencySchedule(acts, [link("A", "B")], "2026-10-05", 0.5, undefined, undefined, "2026-10-31");
    expect([dates(s, "A"), s.projectEndDate, s.constraintConflicts]).toEqual([["2026-11-02", "2026-11-06"], "2026-11-20", undefined]);
  });
});

describe("Review 35's words: W4, W5, E4 and W7, and G3's grouped line", () => {
  it("W4: only the reworded Must Start On or Must Finish On error silences a row's line; a soft or No Later Than one does not", () => {
    const acts = [
      REC,
      act("S1", 5, { constraintType: "SNLT", constraintDate: "2026-10-14", constraintMode: "soft" }),
      act("S2", 5, { constraintType: "FNLT", constraintDate: "2026-10-23", constraintMode: "hard" }),
      act("S3", 5),
    ];
    const s = computeDependencySchedule(acts, [], "2026-10-05", 0.5, undefined, undefined, TODAY);
    expect((s.progressNotes ?? []).filter((n) => n.kind === "data-date").map((n) => n.activityId)).toEqual(["S1", "S2", "S3"]);
  });

  it("W5: the grouped line names the rows in the grid's order, not the network's", () => {
    // Docs follows Design; Training has no predecessor. Both start today; the grid lists Docs first.
    const acts = [REC, act("Design", 5, { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 }), act("Docs", 3), act("Training", 3)];
    const s = computeDependencySchedule(acts, [link("Design", "Docs")], "2026-10-05", 0.5, undefined, undefined, TODAY);
    expect(progressNoteLines(s.progressNotes ?? [], mdy).map((l) => l.sentence)).toEqual([
      "Docs and Training have not started, so the schedule starts them today, 10/27/2026, not on days that have passed. Once a start is recorded in a scenario, work that has not started is not scheduled before today.",
    ]);
  });

  it("E4: a start-to-start link from work that has not started never says it started", () => {
    const acts = [act("Kickoff", 5), act("Pilot", 10, { status: "inProgress", actualStartDate: "2026-10-12", actualDuration: 5 })];
    const s = computeDependencySchedule(acts, [link("Kickoff", "Pilot", "SS")], "2026-10-05", 0.5, undefined, undefined, "2026-10-31");
    // Today is Sat 10/31: Kickoff starts Mon 11/02, five days to 11/06.
    expect(progressNoteSentence(linkNotes(s)[0]!, mdy)).toBe(
      "Pilot started on 10/12/2026, but its predecessor Kickoff has not started (it is scheduled from 11/02/2026 to 11/06/2026). The schedule keeps the start you recorded.",
    );
  });

  it("W7 and G3: each out-of-sequence start has its own true line in the window, and ONE line on the page", () => {
    // P has not started (today, 10/27 – 11/02); S started 10/20 and T 10/22, both after P.
    const acts = [
      act("P", 5),
      act("S", 10, { status: "inProgress", actualStartDate: "2026-10-20", actualDuration: 6 }),
      act("T", 10, { status: "inProgress", actualStartDate: "2026-10-22", actualDuration: 4 }),
    ];
    const s = computeDependencySchedule(acts, [link("P", "S"), link("P", "T")], "2026-10-05", 0.5, undefined, undefined, TODAY);
    expect(linkNotes(s).map((n) => progressNoteSentence(n, mdy))).toEqual([
      "S started on 10/20/2026, but its predecessor P has not started (it is scheduled from 10/27/2026 to 11/02/2026). The schedule keeps the start you recorded.",
      "T started on 10/22/2026, but its predecessor P has not started (it is scheduled from 10/27/2026 to 11/02/2026). The schedule keeps the start you recorded.",
    ]);
    expect(progressNoteLines(s.progressNotes ?? [], mdy).map((l) => l.sentence)).toEqual([
      "S and T have started, but some of their predecessors have not: the schedule does not hold work that has started back for work that has not.",
      "P has not started, and 10/05/2026 has passed, so the schedule starts it today, 10/27/2026. Once a start is recorded in a scenario, work that has not started is not scheduled before today.",
    ]);
  });

  it("G3 and ruling 6: the critical path such a start leaves — the link it overtook is not on it", () => {
    // P today (10/27 – 11/02) → Q, ten days, 11/03 – 11/16; S started 10/20, twenty days, to 11/16.
    // P, Q and S all end with the project: each has no float. P → S is the overtaken link.
    const acts = [act("P", 5), act("S", 20, { status: "inProgress", actualStartDate: "2026-10-20", actualDuration: 6 }), act("Q", 10)];
    const s = computeDependencySchedule(acts, [link("P", "S"), link("P", "Q")], "2026-10-05", 0.5, undefined, undefined, TODAY);
    expect([dates(s, "Q"), dates(s, "S"), [...zeroFloatIds(s)].sort()]).toEqual([
      ["2026-11-03", "2026-11-16"], ["2026-10-20", "2026-11-16"], ["P", "Q", "S"],
    ]);
    expect(linkNotes(s).map((n) => [n.predecessorId, n.activityId])).toEqual([["P", "S"]]);
  });

  it("dependencies off, G3: the grouped line names the rows that started below rows that have not", () => {
    const acts = [
      REC, act("A", 5), act("B", 5, { status: "complete", actualDuration: 5 }),
      act("C", 3), act("D", 4, { status: "inProgress", actualDuration: 1 }),
    ];
    const s = computeDeterministicSchedule(acts, "2026-10-05", 0.5, undefined, TODAY);
    expect(progressNoteLines(s.progressNotes ?? [], mdy)[0]!.sentence).toBe(
      "B and D have started, but the activity above each of them has not: the schedule does not hold work that has started back for work that has not.",
    );
  });
});
