// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Activity, ActivityDependency, DeterministicSchedule, Scenario, SimulationRun } from "@domain/models/types";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { staleResults } from "@core/schedule/recorded-progress";
import { statusUpdatesFor, withPlanDates } from "@ui/components/activity-row-helpers";
import { planBulkApply } from "@ui/components/unified-activity-helpers";
import { computeHeuristic } from "@core/estimation/heuristic";
import { passedConstraintPreview } from "./passed-constraint-preview";
import { staleResultsSentence } from "./stale-results-words";
import { buildComparisonModel } from "./comparison-model";
import { buildScenarioSnapshot, classifyAndComputeScenario, ScenarioScheduleCache } from "@app/api/ai-snapshot-service";
import { useToday } from "@ui/hooks/use-today";

/**
 * WI-154 — what the owner's rulings (R639) and Review 35's fixes put on the screen, below the page:
 * C′ for the kept pair and "due", the Edit window's words for a passed hard date, stale results, and
 * today wherever a schedule leaves the page. Mon–Fri calendar; start Mon 10/05/2026; today pinned.
 * Every expected value is written out by hand.
 */
function act5(id: string, overrides: Partial<Activity> = {}): Activity {
  return { id, name: id, min: 5, mostLikely: 5, max: 5, confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned", ...overrides };
}
const fs = (from: string, to: string): ActivityDependency => ({ fromActivityId: from, toActivityId: to, type: "FS", lagDays: 0 });
const mdy = (iso: string) => `${iso.slice(5, 7)}/${iso.slice(8, 10)}/${iso.slice(0, 4)}`;
const REC = act5("Rec", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 });

function run(localDay: [number, number, number]): SimulationRun {
  return {
    id: "r", timestamp: new Date(localDay[0], localDay[1] - 1, localDay[2], 15, 0, 0).toISOString(), trialCount: 1, seed: "s",
    engineVersion: "1.1.1", percentiles: { 50: 20, 95: 22 }, histogramBins: [], mean: 20, standardDeviation: 1,
    minSample: 20, maxSample: 22, samples: [20, 22],
  };
}
function scenario(id: string, activities: Activity[], results?: SimulationRun, deps: ActivityDependency[] = []): Scenario {
  return {
    id, name: id, startDate: "2026-10-05", activities, dependencies: deps, milestones: [],
    settings: { ...DEFAULT_SCENARIO_SETTINGS, dependencyMode: true, probabilityTarget: 0.5 },
    ...(results ? { simulationResults: results } : {}),
  } as Scenario;
}

describe("owner, R639, C′: a row leaving Planned keeps, and Complete judges \"due\" by, the plan before today's floor", () => {
  // P1 → P2 → P3, five days each, none started; a record elsewhere. Today Tue 10/27.
  // The plan: 10/05 – 10/09, 10/12 – 10/16, 10/19 – 10/23. Shown: from today, 10/27 – 11/02, 11/03 – 11/09, 11/10 – 11/16.
  const P = [act5("P1"), act5("P2"), act5("P3")];
  const ACTS = [REC, ...P];
  const DEPS = [fs("P1", "P2"), fs("P2", "P3")];
  const live = () => computeDependencySchedule(ACTS, DEPS, "2026-10-05", 0.5, undefined, undefined, "2026-10-27");
  const plan = () => computeDependencySchedule(ACTS, DEPS, "2026-10-05", 0.5);
  const gridRows = () => withPlanDates(live().activities, plan(), ACTS);
  const rowFor = (id: string) => gridRows().find((r) => r.activityId === id)!;

  beforeEach(() => { vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] }); });
  afterEach(() => { vi.useRealTimers(); });

  it("each Planned row in the grid's rows carries its plan dates; the dates shown are today's", () => {
    expect(gridRows().filter((r) => r.activityId !== "Rec").map((r) => [r.startDate, r.planDates?.startDate, r.planDates?.endDate])).toEqual([
      ["2026-10-27", "2026-10-05", "2026-10-09"], ["2026-11-03", "2026-10-12", "2026-10-16"], ["2026-11-10", "2026-10-19", "2026-10-23"],
    ]);
  });

  it("Review 35's E2: every row of a chain completed late takes its own scheduled dates (R622), not today", () => {
    for (const [a, expected] of [[P[0]!, ["2026-10-05", "2026-10-09"]], [P[1]!, ["2026-10-12", "2026-10-16"]], [P[2]!, ["2026-10-19", "2026-10-23"]]] as const) {
      const u = statusUpdatesFor(a, "complete", rowFor(a.id));
      expect([u.plannedStartDate, u.plannedFinishDate, u.actualStartDate, u.actualFinishDate]).toEqual([...expected, ...expected]);
    }
  });

  it("interactions G1: a late start keeps the date it was late against, and the bulk toolbar keeps the same", () => {
    const u = statusUpdatesFor(P[1]!, "inProgress", rowFor("P2"));
    expect([u.plannedStartDate, u.plannedFinishDate, u.actualStartDate]).toEqual(["2026-10-12", "2026-10-16", "2026-10-27"]);
    const bulk = planBulkApply({ status: "inProgress" }, ["P2"], ACTS, gridRows(), {}, computeHeuristic);
    expect(bulk.perActivity[0]!.updates).toMatchObject({ plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16" });
  });

  it("interactions E3: a row's own constraint is in the plan — a future Start No Earlier Than is not due; a passed Must Start On is", () => {
    const S = act5("S", { constraintType: "SNET", constraintDate: "2026-11-16", constraintMode: "hard" });
    const M = act5("M", { constraintType: "MSO", constraintDate: "2026-10-12", constraintMode: "hard" });
    const acts = [REC, S, M];
    const rows = withPlanDates(
      computeDependencySchedule(acts, [], "2026-10-05", 0.5, undefined, undefined, "2026-10-27").activities,
      computeDependencySchedule(acts, [], "2026-10-05", 0.5), acts,
    );
    const done = (a: Activity) => {
      const u = statusUpdatesFor(a, "complete", rows.find((r) => r.activityId === a.id)!);
      return [u.actualStartDate, u.actualFinishDate];
    };
    // S: planned 11/16 – 11/20, not due — it finished today. M: planned on its date, 10/12 – 10/16, due.
    expect([done(S), done(M)]).toEqual([["2026-10-27", "2026-10-27"], ["2026-10-12", "2026-10-16"]]);
  });
});

describe("Review 35, E4 and E5: the Edit window's words for a passed hard date", () => {
  // M has not started, hard Must Start On 10/12; today Tue 10/27; a record elsewhere.
  const M = act5("M", { constraintType: "MSO", constraintDate: "2026-10-12", constraintMode: "hard" });
  const ACTS = [REC, M];
  const schedule = computeDependencySchedule(ACTS, [], "2026-10-05", 0.5, undefined, undefined, "2026-10-27");
  const preview = (draft: { type: "MSO" | "MFO" | "SNET"; date: string }, status: Activity["status"] = "planned") =>
    passedConstraintPreview({
      activity: M, draftStatus: status, draft: { ...draft, mode: "hard" }, schedule, activities: ACTS,
      scenarioStartDate: "2026-10-05", durationDays: 5, today: "2026-10-27",
    });

  it("as saved: the page's own red words, exactly — never \"Constraint date held\"", () => {
    const shown = preview({ type: "MSO", date: "2026-10-12" });
    expect(shown?.message).toBe("M: Must Start On 2026-10-12 has passed, and M has not started, so the schedule starts it today, 2026-10-27.");
    expect(shown?.message).toBe(schedule.constraintConflicts?.[0]?.message);
  });

  it("a draft not yet saved: the same words for what the schedule will do", () => {
    expect(preview({ type: "MFO", date: "2026-10-16" })?.message).toBe(
      "M: Must Finish On 2026-10-16 cannot be met: M has not started, so the schedule will start it no earlier than today, 2026-10-27.",
    );
  });

  it("anything else keeps the window's preview as it was: a date to come, a soft or other type, or work that has started", () => {
    expect([
      preview({ type: "MSO", date: "2026-10-28" }), preview({ type: "SNET", date: "2026-10-12" }),
      preview({ type: "MSO", date: "2026-10-12" }, "inProgress"),
    ]).toEqual([undefined, undefined, undefined]);
  });
});

describe("owner, R639, decision 3: results from an earlier data date", () => {
  const recorded = [REC, act5("Next")];

  it("are stale when the day they were simulated on had an earlier data date — a weekend shares Monday's", () => {
    const at = (day: [number, number, number], today: string) => staleResults(scenario("s", recorded, run(day)), today, undefined);
    expect(at([2026, 10, 30], "2026-10-31")).toEqual({ simulatedOn: "2026-10-30", dataDate: "2026-11-02" }); // Fri → Sat
    expect([at([2026, 10, 31], "2026-11-01"), at([2026, 10, 31], "2026-11-02"), at([2026, 10, 27], "2026-10-27")]).toEqual([null, null, null]);
  });

  it("never in a scenario with no record, or with no results", () => {
    expect(staleResults(scenario("s", [act5("Next")], run([2026, 10, 20])), "2026-10-27", undefined)).toBeNull();
    expect(staleResults(scenario("s", recorded), "2026-10-27", undefined)).toBeNull();
  });

  it("the one sentence, in the user's date format", () => {
    expect(staleResultsSentence({ simulatedOn: "2026-10-30", dataDate: "2026-11-02" }, mdy)).toBe(
      "The last simulation was run on 10/30/2026. Work that has not started is now scheduled no earlier than 11/02/2026, so run the simulation again to bring the forecast up to date.",
    );
  });

  it("the comparison shows them as not run, offers a Run, and says why", () => {
    const stale = scenario("Plan A", recorded, run([2026, 10, 26]), [fs("Rec", "Next")]);
    const fresh = scenario("Plan B", recorded, run([2026, 10, 27]), [fs("Rec", "Next")]);
    const model = buildComparisonModel({
      scenarios: [stale, fresh], showActivityNumbers: false, formatDate: mdy, today: "2026-10-27",
      runGate: { scenarioId: null, runBlocked: false },
    });
    expect(model.staleNote).toBe(
      "The last simulation of Plan A was run on an earlier day. Work that has not started is now scheduled no earlier than 10/27/2026, so run it again before comparing.",
    );
    expect(model.columns.map((c) => c.offerRun)).toEqual([true, false]);
    expect(model.rows.find((r) => r.label === "Mean")?.values).toEqual([null, "20.0"]);
  });

  it("the comparison reads today as the page does: Next starts today, 10/27, so the end is 11/02", () => {
    const model = buildComparisonModel({
      scenarios: [scenario("A", recorded, undefined, [fs("Rec", "Next")]), scenario("B", recorded)],
      showActivityNumbers: false, formatDate: mdy, today: "2026-10-27", runGate: null,
    });
    expect(model.rows.find((r) => r.label === "End Date (no buffer)")?.values).toEqual(["11/02/2026", "11/02/2026"]);
  });

  it("the AI snapshot says \"stale\", with the sentence", () => {
    const s = scenario("s", recorded, run([2026, 10, 26]));
    expect(buildScenarioSnapshot(s, classifyAndComputeScenario(s, undefined, "2026-10-27"), undefined, "2026-10-27")).toMatchObject({
      simulationStatus: "stale",
      simulationNote: "The last simulation was run on 2026-10-26. Work that has not started is now scheduled no earlier than 2026-10-27, so its results no longer match the schedule until the simulation is run again.",
    });
  });
});

describe("Review 35, verification R3 and G4: the AI snapshot reads today, and its cache is keyed on it", () => {
  // Next follows Rec (finished 10/09), so by its link alone it would start 10/12.
  const s = scenario("s", [REC, act5("Next")], undefined, [fs("Rec", "Next")]);
  const nextStart = (c: { schedule?: DeterministicSchedule }) => c.schedule?.activities.find((a) => a.activityId === "Next")?.startDate;

  it("the snapshot's schedule starts work that has not started today", () => {
    expect(nextStart(classifyAndComputeScenario(s, undefined, "2026-10-27"))).toBe("2026-10-27");
  });

  it("a new day is a new entry: the cache does not answer with yesterday's floor", () => {
    const cache = new ScenarioScheduleCache();
    expect(nextStart(cache.compute(s, undefined, "2026-10-27"))).toBe("2026-10-27");
    expect(nextStart(cache.compute(s, undefined, "2026-10-28"))).toBe("2026-10-28");
  });
});

describe("useToday: the page's today turns at local midnight while it is open (Review 35, G3)", () => {
  afterEach(() => { vi.useRealTimers(); });

  it("Tue 23:59:30 → Wed, 31 seconds later", () => {
    vi.useFakeTimers({ now: new Date(2026, 9, 27, 23, 59, 30) });
    const { result } = renderHook(() => useToday());
    expect(result.current).toBe("2026-10-27");
    act(() => { vi.advanceTimersByTime(31_000); });
    expect(result.current).toBe("2026-10-28");
  });
});
