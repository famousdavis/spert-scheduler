// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, ActivityDependency, DeterministicSchedule } from "@domain/models/types";
import {
  computeDependencySchedule,
  computeDeterministicDurations,
  computeDeterministicSchedule,
} from "@core/schedule/deterministic";
import { runDependencyTrials, runTrials } from "@core/simulation/monte-carlo";
import { percentile, sortSamples } from "@core/analytics/analytics";
import { runSimulationSync } from "@app/api/simulation-service";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import { zeroFloatIds } from "@core/schedule/recorded-progress";

/**
 * WI-137 — R598's example, end to end through the engine and the app's own simulation path:
 * A → B → C finish-to-start, each Uniform 9/10/11 (10 days at P50), Start Date Mon 2026-10-05,
 * Mon–Fri. A Complete 10-05..10-23; B In Progress since 10-19 (elapsed 1, as set that day);
 * C Planned. Every expected date and number is written out (NUMBERS.md, measured on the
 * prototype; the dates counted by hand), never computed by the code under test.
 */
const START = "2026-10-05";

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

const fs = (from: string, to: string, lagDays = 0): ActivityDependency => ({ fromActivityId: from, toActivityId: to, type: "FS", lagDays });
const ff = (from: string, to: string, lagDays = 0): ActivityDependency => ({ fromActivityId: from, toActivityId: to, type: "FF", lagDays });

const A = act("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15 });
const B = act("B", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1 });
const C = act("C");
const ABC = [A, B, C];
const ABC_DEPS = [fs("A", "B"), fs("B", "C")];

const rows = (s: DeterministicSchedule) => s.activities.map((sa) => [sa.activityId, sa.startDate, sa.endDate]);

describe("R598's example — the schedule keeps B's real start, in both modes", () => {
  for (const [mode, schedule] of [
    ["dependencies on", () => computeDependencySchedule(ABC, ABC_DEPS, START, 0.5)],
    ["dependencies off", () => computeDeterministicSchedule(ABC, START, 0.5)],
  ] as const) {
    it(`${mode}: A 10-05..10-23, B 10-19..10-30, C 11-02..11-13; span 30; one note; no warning`, () => {
      const s = schedule();
      expect(rows(s)).toEqual([
        ["A", "2026-10-05", "2026-10-23"],
        ["B", "2026-10-19", "2026-10-30"],
        ["C", "2026-11-02", "2026-11-13"],
      ]);
      expect(s.spanDays).toBe(30);
      expect(s.totalDurationDays).toBe(30);
      expect(s.projectEndDate).toBe("2026-11-13");
      expect(s.constraintConflicts).toBeUndefined();
      expect(s.dependencyConflicts).toBeUndefined();
      expect(s.progressNotes).toHaveLength(1);
      expect(s.progressNotes![0]).toMatchObject({ kind: "link", activityId: "B", predecessorId: "A", date: "2026-10-19", predecessorDate: "2026-10-23" });
      expect(s.activities.map((sa) => [sa.recordedStart ?? false, sa.recordedFinish ?? false])).toEqual([[true, true], [true, false], [false, false]]);
    });
  }

  it("the workaround's hard Must Start On 10-19 on B: set aside — no red, no amber, one note for the link", () => {
    const s = computeDependencySchedule([A, { ...B, constraintType: "MSO", constraintDate: "2026-10-19", constraintMode: "hard" }, C], ABC_DEPS, START, 0.5);
    expect(rows(s)).toEqual([["A", "2026-10-05", "2026-10-23"], ["B", "2026-10-19", "2026-10-30"], ["C", "2026-11-02", "2026-11-13"]]);
    expect(s.constraintConflicts).toBeUndefined();
    expect(s.dependencyConflicts).toBeUndefined();
    expect(s.progressNotes!.map((n) => n.kind)).toEqual(["link"]);
  });

  it("with A still open on 10-27 (elapsed 17): A 10-05..10-28, B stays 10-19..10-30", () => {
    const open = act("A", { status: "inProgress", actualStartDate: "2026-10-05", actualDuration: 17 });
    const s = computeDependencySchedule([open, B, C], ABC_DEPS, START, 0.5);
    expect(rows(s)).toEqual([["A", "2026-10-05", "2026-10-28"], ["B", "2026-10-19", "2026-10-30"], ["C", "2026-11-02", "2026-11-13"]]);
    expect(s.progressNotes![0]).toMatchObject({ predecessorComplete: false, predecessorDate: "2026-10-28" });
  });

  it("a start constraint the record breaks is set aside with a note: B stays 10-19..10-30, no red", () => {
    const s = computeDependencySchedule([A, { ...B, constraintType: "MSO", constraintDate: "2026-10-26", constraintMode: "hard" }, C], ABC_DEPS, START, 0.5);
    expect(rows(s)).toEqual([["A", "2026-10-05", "2026-10-23"], ["B", "2026-10-19", "2026-10-30"], ["C", "2026-11-02", "2026-11-13"]]);
    expect(s.constraintConflicts).toBeUndefined();
    expect(s.progressNotes!.map((n) => [n.kind, n.activityId])).toEqual([["link", "B"], ["constraint", "B"]]);
  });

  it("a Complete row with both dates is as long as its dates say, whatever count is stored (a calendar changed since)", () => {
    const stale = act("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 7 });
    for (const s of [computeDependencySchedule([stale, C], [fs("A", "C")], START, 0.5), computeDeterministicSchedule([stale, C], START, 0.5)]) {
      expect(rows(s)).toEqual([["A", "2026-10-05", "2026-10-09"], ["C", "2026-10-12", "2026-10-23"]]);
    }
  });

  it("dependencies off: a recorded row that ends before the row above ends — the project ends at the LATEST end", () => {
    const shortB = act("B", { min: 2, mostLikely: 3, max: 4, status: "inProgress", actualStartDate: "2026-10-05", actualDuration: 1 });
    const s = computeDeterministicSchedule([act("A"), shortB], START, 0.5);
    expect(rows(s)).toEqual([["A", "2026-10-05", "2026-10-16"], ["B", "2026-10-05", "2026-10-07"]]);
    expect([s.projectEndDate, s.totalDurationDays, s.spanDays]).toEqual(["2026-10-16", 10, 10]);
    const params = buildSimulationParams([act("A"), shortB], false, 0.5, [], [], START, undefined, true);
    const run = runSimulationSync([act("A"), shortB], 1000, "latest", params.deterministicDurations, undefined, undefined, params.sequentialRecords);
    // Every trial ends with A (Uniform 9..11, floored at 10), never with B's 3 days.
    expect(Math.min(...run.samples)).toBeGreaterThanOrEqual(10);
  });

  it("(j) the critical-path highlight is the schedule's own zero-float rows", () => {
    // A → {B, C} → D; B started early (recorded 10-05) while A is still to do; C takes 15.
    const c15 = act("C", { min: 14, mostLikely: 15, max: 16 });
    const s = computeDependencySchedule(
      [act("A"), act("B", { status: "inProgress", actualStartDate: "2026-10-05", actualDuration: 1 }), c15, act("D")],
      [fs("A", "B"), fs("A", "C"), fs("B", "D"), fs("C", "D")], START, 0.5,
    );
    expect([...zeroFloatIds(s)].sort()).toEqual(["A", "C", "D"]);
  });
});

describe("ruling 2 — an In Progress row's forecast finish follows FF links and finish constraints (2b)", () => {
  // A Planned 10 days (10-05..10-16). B In Progress, recorded 10-05, a 3-day estimate (2/3/4), elapsed 1.
  const A10 = act("A");
  const B3 = (extra: Partial<Activity> = {}) =>
    act("B", { min: 2, mostLikely: 3, max: 4, status: "inProgress", actualStartDate: "2026-10-05", actualDuration: 1, ...extra });

  it("an FF link holds its finish: B keeps its start and finishes with A, with no amber warning", () => {
    const s = computeDependencySchedule([A10, B3()], [ff("A", "B")], START, 0.5);
    expect(rows(s)).toEqual([["A", "2026-10-05", "2026-10-16"], ["B", "2026-10-05", "2026-10-16"]]);
    expect(s.activities[1]!.duration).toBe(10);
    expect(s.dependencyConflicts).toBeUndefined();
    expect(s.progressNotes).toBeUndefined();
  });

  it("with no FF link its forecast finish is its own: 10-05..10-07", () => {
    const s = computeDependencySchedule([A10, B3()], [], START, 0.5);
    expect(rows(s)).toEqual([["A", "2026-10-05", "2026-10-16"], ["B", "2026-10-05", "2026-10-07"]]);
  });

  it("a soft Finish No Later Than it misses warns, as on v0.79.36", () => {
    const s = computeDependencySchedule([A10, B3({ constraintType: "FNLT", constraintDate: "2026-10-14", constraintMode: "soft" })], [ff("A", "B")], START, 0.5);
    expect(s.constraintConflicts?.map((c) => [c.severity, c.message])).toEqual([
      ["warning", "B: Soft constraint FNLT 2026-10-14 not met by current schedule (network-driven date: 2026-10-16, delta: 2 working days)."],
    ]);
    expect(s.progressNotes).toBeUndefined();
  });

  it("a hard Finish No Later Than it misses is the red error, as on v0.79.36", () => {
    const s = computeDependencySchedule([A10, B3({ constraintType: "FNLT", constraintDate: "2026-10-14", constraintMode: "hard" })], [ff("A", "B")], START, 0.5);
    expect(s.constraintConflicts?.map((c) => [c.severity, c.message])).toEqual([
      ["error", "B: Finish No Later Than 2026-10-14 cannot be satisfied (network-driven LF: 2026-10-16)."],
    ]);
  });

  it("a hard Must Finish On holds the finish on its day; one it cannot meet is the red error, and the FF link it breaks is amber", () => {
    const later = computeDependencySchedule([A10, B3({ constraintType: "MFO", constraintDate: "2026-10-20", constraintMode: "hard" })], [ff("A", "B")], START, 0.5);
    expect(rows(later)[1]).toEqual(["B", "2026-10-05", "2026-10-20"]);
    expect(later.constraintConflicts).toBeUndefined();

    const early = computeDependencySchedule([A10, B3({ constraintType: "MFO", constraintDate: "2026-10-12", constraintMode: "hard" })], [ff("A", "B")], START, 0.5);
    expect(rows(early)[1]).toEqual(["B", "2026-10-05", "2026-10-12"]);
    expect(early.constraintConflicts?.map((c) => [c.severity, c.message])).toEqual([
      ["error", "B: Must Finish On 2026-10-12 conflicts with predecessor logic (network-driven EF: 2026-10-16, delta: 4 working days). Constraint date held."],
    ]);
    expect(early.dependencyConflicts?.map((c) => [c.severity, c.dependencyType])).toEqual([["warning", "FF"]]);
  });

  it("dependencies off: a hard Finish No Earlier Than holds the forecast finish too", () => {
    const s = computeDeterministicSchedule([B3({ constraintType: "FNET", constraintDate: "2026-10-09", constraintMode: "hard" })], START, 0.5);
    expect(rows(s)).toEqual([["B", "2026-10-05", "2026-10-09"]]);
  });

  it("a Complete row's finish is a fact: a missed FF link and a missed deadline are grey notes, never amber or red", () => {
    const done = act("B", {
      status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5,
      constraintType: "FNLT", constraintDate: "2026-10-07", constraintMode: "hard",
    });
    const s = computeDependencySchedule([A10, done], [ff("A", "B")], START, 0.5);
    expect(rows(s)).toEqual([["A", "2026-10-05", "2026-10-16"], ["B", "2026-10-05", "2026-10-09"]]);
    expect(s.constraintConflicts).toBeUndefined();
    expect(s.dependencyConflicts).toBeUndefined();
    expect(s.progressNotes!.map((n) => [n.kind, n.date])).toEqual([["link", "2026-10-09"], ["constraint", "2026-10-09"]]);
  });

  it("(l) a recorded start before the Start Date: drawn from it, not green, with a note", () => {
    const early = act("A", { status: "inProgress", actualStartDate: "2026-09-28", actualDuration: 6 });
    const s = computeDependencySchedule([early], [], START, 0.5);
    expect(rows(s)).toEqual([["A", "2026-10-05", "2026-10-16"]]);
    expect(s.activities[0]!.recordedStart).toBeUndefined();
    expect(s.progressNotes).toStrictEqual([
      { kind: "before-start-date", activityId: "A", activityName: "A", date: "2026-09-28", startDate: START },
    ]);
  });
});

describe("the simulation keeps the record too — through the app's own path, in both modes (2a)", () => {
  // NUMBERS.md: 20,000 trials, seed "probe-1", Parkinson's Law on. The same draws as today's
  // build, with B placed at offset 10 instead of 15: exactly 5 less.
  const P50 = 30.451189059661253;
  const P95 = 31.339003251031873;

  for (const depMode of [true, false]) {
    it(`dependencies ${depMode ? "on" : "off"}: P50 ${P50}, P95 ${P95}`, () => {
      const params = buildSimulationParams(ABC, depMode, 0.5, ABC_DEPS, [], START, undefined, true);
      const run = runSimulationSync(
        ABC, 20000, "probe-1", params.deterministicDurations, params.dependencyParams,
        params.sequentialConstraints, params.sequentialRecords,
      );
      const sorted = sortSamples(Float64Array.from(run.samples ?? []));
      expect(sorted.length).toBe(20000);
      expect(percentile(sorted, 0.5)).toBe(P50);
      expect(percentile(sorted, 0.95)).toBe(P95);
    });
  }

  it("dependencies off: the records reach the sequential engine (they are what moves the forecast 5 days)", () => {
    const params = buildSimulationParams(ABC, false, 0.5, ABC_DEPS, [], START, undefined, true);
    expect(params.sequentialRecords).toStrictEqual([{ startOffset: 0, duration: 15 }, { startOffset: 10, duration: undefined }, null]);
    const without = runTrials({ activities: ABC, trialCount: 20000, rngSeed: "probe-1", deterministicDurations: params.deterministicDurations });
    expect(percentile(sortSamples(without.samples), 0.5)).toBe(35.45118905966125);
  });

  it("an FF link holds an In Progress row's finish in every trial; a hard Must Finish On holds it on its day", () => {
    const a = act("A");
    const b = act("B", { min: 2, mostLikely: 3, max: 4, status: "inProgress", actualStartDate: "2026-10-05", actualDuration: 1 });
    const linked = runDependencyTrials({
      activities: [a, b], dependencies: [ff("A", "B", 2)], trialCount: 1000, rngSeed: "ff",
      recordedStartMap: new Map([["B", 0]]),
    });
    const free = runDependencyTrials({
      activities: [a, b], dependencies: [], trialCount: 1000, rngSeed: "ff",
      recordedStartMap: new Map([["B", 0]]),
    });
    // Uniform 9..11 for A: each trial ends at A's finish, plus B's 2-day lag past it.
    for (let i = 0; i < 1000; i++) expect(linked.samples[i]).toBeCloseTo(free.samples[i]! + 2, 9);

    const held = runDependencyTrials({
      activities: [b], dependencies: [], trialCount: 1000, rngSeed: "mfo",
      recordedStartMap: new Map([["B", 0]]),
      constraintMap: new Map([["B", { type: "MFO", offsetFromStart: 7, mode: "hard" }]]),
    });
    expect(new Set(held.samples)).toEqual(new Set([8]));
  });

  it("(a) the Parkinson floors skip a Complete row counted from its dates, as the sequential engine does", () => {
    const dated = act("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09" });
    expect(computeDeterministicDurations([dated, act("B"), act("C")], 0.5)).toEqual([10, 10]);
    expect(computeDeterministicDurations([act("A", { status: "complete", actualStartDate: "2026-10-05" }), act("B")], 0.5)).toEqual([10, 10]);
  });
});
