// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { applyAiOpsToProject, type AiOp, type AiBatchContext, type AiOpOutcome } from "./ai-batch-service";
import type { BulkSetProgressItem } from "./ai-op-types";
import { createProject, createScenario, createActivity } from "./project-service";
import { computeScenarioSchedule, scenarioScheduleInputs } from "./scenario-schedule";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { DEFAULT_SCENARIO_SETTINGS, type Activity, type ActivityDependency, type Project, type Scenario } from "@domain/models/types";

/**
 * WI-150 release C — Connect AI records progress (`bulk_set_activity_progress`), as the owner ruled it
 * (R650): add-only (ruling 6d), a left-out date from the day the request was sent and a weekend judged
 * on that day (ruling 5), both dates for Planned → Complete, no date ever from the plan, and never a
 * Planned date. The scenario starts Mon 2026-10-05, Monday to Friday, no holidays unless a test says
 * so; every row is 3/5/7 Triangular, so P50 is 5 working days. Every expected date below is counted on
 * that calendar by hand — never computed by the code under test. Today is the batch's `today`, not the
 * clock; the day a request was sent is the op's `createdOn` (absent: today).
 */
const START = "2026-10-05";
const TODAY = "2026-10-21"; // a Wednesday
const CTX: AiBatchContext = { today: TODAY };

function activity(id: string, over: Partial<Activity> = {}): Activity {
  return {
    ...createActivity(id, DEFAULT_SCENARIO_SETTINGS),
    id,
    name: id,
    min: 3,
    mostLikely: 5,
    max: 7,
    distributionType: "triangular",
    ...over,
  };
}

/** A done 10/05–10/09, then B and C Planned: in the plan B is 10/12–10/16 and C 10/19–10/23. */
function recordRows(): Activity[] {
  return [
    activity("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 }),
    activity("B"),
    activity("C"),
  ];
}

function projectOf(
  activities: Activity[],
  opts: { dependencyMode?: boolean; dependencies?: ActivityDependency[]; locked?: boolean } = {},
): { project: Project; scenarioId: string } {
  const base = createScenario("S1", START);
  const scenario: Scenario = {
    ...base,
    activities,
    dependencies: opts.dependencies ?? [],
    locked: opts.locked,
    settings: { ...base.settings, dependencyMode: opts.dependencyMode ?? false },
  };
  return { project: { ...createProject("P", START), scenarios: [scenario] }, scenarioId: scenario.id };
}

function progressOp(updates: BulkSetProgressItem[], meta: { seq?: number; createdOn?: string } = {}): AiOp {
  return { seq: meta.seq ?? 1, op: "bulk_set_activity_progress", payload: { updates }, createdOn: meta.createdOn };
}

function run(activities: Activity[], ops: AiOp[], ctx: AiBatchContext = CTX, opts: Parameters<typeof projectOf>[1] = {}) {
  const { project, scenarioId } = projectOf(activities, opts);
  const out = applyAiOpsToProject(project, ops, scenarioId, ctx);
  const scenario = out.project.scenarios.find((s) => s.id === scenarioId)!;
  return { outcome: out.results[0]!.outcome, outcomes: out.results.map((r) => r.outcome), scenario, before: project, after: out.project };
}

const rowOf = (s: Scenario, id: string): Activity => s.activities.find((a) => a.id === id)!;
const progressOf = (a: Activity) => ({
  status: a.status,
  actualStartDate: a.actualStartDate,
  actualFinishDate: a.actualFinishDate,
  actualDuration: a.actualDuration,
  plannedStartDate: a.plannedStartDate,
  plannedFinishDate: a.plannedFinishDate,
});

/** One entry refused with one reason, and nothing written. The feed names it by its activity (G2). */
function expectRefused(rows: Activity[], item: BulkSetProgressItem, reason: string, ctx: AiBatchContext = CTX, createdOn?: string) {
  const { outcome, scenario } = run(rows, [progressOp([item], { createdOn })], ctx);
  const name = rows.find((a) => a.id === item.id)?.name ?? item.id;
  expect(outcome).toEqual({ status: "partial", appliedCount: 0, skippedItems: [{ index: 0, id: item.id, name, reason }] });
  expect(scenario.activities).toEqual(rows);
}

describe("the dispatcher routes the progress op (a case, not unknown_op)", () => {
  it("applies a well-formed op", () => {
    expect(run(recordRows(), [progressOp([{ id: "B", status: "inProgress" }])]).outcome).toEqual({ status: "applied" });
  });
  it("a payload that fails the structural parse is one whole-op invalid", () => {
    const malformed = { seq: 1, op: "bulk_set_activity_progress", payload: { updates: "B" } } as unknown as AiOp;
    expect(run(recordRows(), [malformed]).outcome).toEqual({ status: "skipped", reason: "invalid" });
  });
  it("a locked scenario refuses it, as every op", () => {
    expect(run(recordRows(), [progressOp([{ id: "B", status: "inProgress" }])], CTX, { locked: true }).outcome)
      .toEqual({ status: "skipped", reason: "locked" });
  });
});

describe("never a Planned date: THE Status rule keeps the PLAN's pair (C′, the schedule without today's floor)", () => {
  it("the live schedule floors B at today; the kept Planned pair is the plan's 10/12–10/16", () => {
    const { project, scenarioId } = projectOf(recordRows());
    const s = project.scenarios.find((x) => x.id === scenarioId)!;
    const live = computeScenarioSchedule({ ...scenarioScheduleInputs(s, undefined, TODAY), activities: s.activities }).schedule!;
    expect(live.activities.find((r) => r.activityId === "B")!.startDate).toBe("2026-10-21"); // floored: the control
    const { scenario } = run(recordRows(), [progressOp([{ id: "B", status: "inProgress" }])]);
    expect(progressOf(rowOf(scenario, "B"))).toEqual({
      status: "inProgress", actualStartDate: "2026-10-21", actualFinishDate: undefined, actualDuration: 1,
      plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16",
    });
  });
  it("a start sent overlays nothing from the plan; the count is recounted to today; the pair stays the plan's", () => {
    const { scenario } = run(recordRows(), [progressOp([{ id: "B", status: "inProgress", actualStartDate: "2026-10-14" }])]);
    expect(progressOf(rowOf(scenario, "B"))).toEqual({
      status: "inProgress", actualStartDate: "2026-10-14", actualFinishDate: undefined, actualDuration: 6,
      plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16",
    });
  });
  it("Planned → Complete with both dates records exactly those dates, counted over them, and keeps the plan's pair", () => {
    const { scenario } = run(recordRows(), [progressOp([{ id: "C", status: "complete", actualStartDate: "2026-10-19", actualFinishDate: "2026-10-20" }])]);
    expect(progressOf(rowOf(scenario, "C"))).toEqual({
      status: "complete", actualStartDate: "2026-10-19", actualFinishDate: "2026-10-20", actualDuration: 2,
      plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-23",
    });
  });
  it("an explicit pair on Complete: snapped (finish back from a Sunday), counted over the pair", () => {
    const { scenario } = run(recordRows(), [progressOp([{ id: "B", status: "complete", actualStartDate: "2026-10-13", actualFinishDate: "2026-10-18" }])]);
    expect(progressOf(rowOf(scenario, "B"))).toMatchObject({ actualStartDate: "2026-10-13", actualFinishDate: "2026-10-16", actualDuration: 4 });
  });
  it("In Progress → Complete with the finish left out: it finishes on the day sent; its start and pair stay", () => {
    const started = activity("E", { status: "inProgress", actualStartDate: "2026-10-14", actualDuration: 6, plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16" });
    const { scenario } = run([started], [progressOp([{ id: "E", status: "complete" }])]);
    expect(progressOf(rowOf(scenario, "E"))).toEqual({
      status: "complete", actualStartDate: "2026-10-14", actualFinishDate: "2026-10-21", actualDuration: 6,
      plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16",
    });
  });
  it("every applied write clears the scenario's results, as every AI write does", () => {
    const { before, after } = run(recordRows(), [progressOp([{ id: "B", status: "inProgress" }])]);
    expect(after).not.toBe(before);
    expect(after.scenarios[0]!.simulationResults).toBeUndefined();
  });
});

describe("ruling 5: no date ever comes from the plan", () => {
  it("an overdue Planned row (plan 10/12–10/16) started with no date starts on the day sent, 10/21 — not its plan's 10/12", () => {
    const { scenario } = run(recordRows(), [progressOp([{ id: "B", status: "inProgress" }])]);
    expect(rowOf(scenario, "B").actualStartDate).toBe("2026-10-21");
  });
  it("the same row set Complete with no dates is refused — the grid's overdue default (its plan's dates) is not the AI's", () => {
    expectRefused(recordRows(), { id: "B", status: "complete" }, "needs_both_dates");
  });
  it("an In Progress row with no recorded start, set Complete with no dates, is refused — no start from the plan, no count from it", () => {
    expectRefused([activity("E", { status: "inProgress", actualDuration: 4 })], { id: "E", status: "complete" }, "finish_without_start");
  });
});

describe("refusals — each entry all or nothing, each with its own reason (W9)", () => {
  const rows = (): Activity[] => [
    ...recordRows(),
    activity("E", { status: "inProgress", actualDuration: 4 }), // started before v0.80.0: no Actual Start
    activity("G", { status: "inProgress", actualStartDate: "2026-10-14", actualDuration: 6 }),
  ];
  it.each<[string, string, BulkSetProgressItem]>([
    ["an unknown id", "not_found", { id: "Z", status: "inProgress" }],
    ["nothing to record", "invalid", { id: "B" }],
    ["a Status word the app does not have", "invalid", { id: "B", status: "started" as BulkSetProgressItem["status"] }],
    ["a date that is not on the calendar", "invalid", { id: "B", status: "inProgress", actualStartDate: "2026-02-30" }],
    ["dates on a row that stays Planned", "dates_on_planned", { id: "B", actualStartDate: "2026-10-14" }],
    ["dates with Planned", "dates_on_planned", { id: "B", status: "planned", actualStartDate: "2026-10-14" }],
    ["a finish with In Progress", "finish_while_in_progress", { id: "B", status: "inProgress", actualFinishDate: "2026-10-16" }],
    ["a finish on a row that stays In Progress", "finish_while_in_progress", { id: "G", actualFinishDate: "2026-10-20" }],
    ["Planned → Complete with no dates (ruling 5)", "needs_both_dates", { id: "B", status: "complete" }],
    ["Planned → Complete with the start only (ruling 5)", "needs_both_dates", { id: "B", status: "complete", actualStartDate: "2026-10-14" }],
    ["Planned → Complete with the finish only (ruling 5)", "needs_both_dates", { id: "B", status: "complete", actualFinishDate: "2026-10-16" }],
    ["Planned on an In Progress row (add-only)", "already_started", { id: "G", status: "planned" }],
    ["Planned on a Complete row (add-only)", "already_started", { id: "A", status: "planned" }],
    ["Planned with dates on a started row: the move back is the reason (add-only)", "already_started", { id: "G", status: "planned", actualStartDate: "2026-10-14" }],
    ["In Progress on a Complete row (add-only)", "already_complete", { id: "A", status: "inProgress" }],
    ["a start that differs from the recorded one (add-only)", "date_recorded", { id: "G", actualStartDate: "2026-10-15" }],
    ["a start that differs, sent with Complete (add-only)", "date_recorded", { id: "G", status: "complete", actualStartDate: "2026-10-15", actualFinishDate: "2026-10-20" }],
    ["a finish that differs from the recorded one (add-only)", "date_recorded", { id: "A", actualFinishDate: "2026-10-08" }],
    ["a start after today", "date_after_today", { id: "B", status: "inProgress", actualStartDate: "2026-10-22" }],
    ["a finish after today", "date_after_today", { id: "B", status: "complete", actualStartDate: "2026-10-14", actualFinishDate: "2026-10-22" }],
    ["a start before the Start Date (F6)", "before_start_date", { id: "B", status: "inProgress", actualStartDate: "2026-10-02" }],
    ["a finish before its start", "dates_out_of_order", { id: "B", status: "complete", actualStartDate: "2026-10-14", actualFinishDate: "2026-10-13" }],
    ["a finish without a start", "finish_without_start", { id: "E", status: "complete", actualFinishDate: "2026-10-20" }],
    ["Complete on a Complete row, nothing sent", "value_unchanged", { id: "A", status: "complete" }],
    ["its own stored start, resent", "value_unchanged", { id: "A", actualStartDate: "2026-10-05" }],
    ["its own stored finish, resent with its Status", "value_unchanged", { id: "A", status: "complete", actualFinishDate: "2026-10-09" }],
    ["Planned on a Planned row", "value_unchanged", { id: "B", status: "planned" }],
    ["In Progress on an In Progress row", "value_unchanged", { id: "G", status: "inProgress" }],
    ["a recorded Monday start resent as the Saturday before it (the app records that Saturday as the Monday)", "value_unchanged", { id: "G", status: "inProgress", actualStartDate: "2026-10-10" }],
  ])("%s → %s", (_label, reason, item) => {
    const base = rows();
    // G's start for the last case is Mon 10/12 (a Saturday 10/10 sent moves forward to it).
    const fixture = item.actualStartDate === "2026-10-10"
      ? base.map((a) => (a.id === "G" ? { ...a, actualStartDate: "2026-10-12", actualDuration: 8 } : a))
      : base;
    expectRefused(fixture, item, reason);
  });
  it("a finish after today that a weekend would move back to today is refused as sent (today Fri 10/23, finish Sat 10/24)", () => {
    expectRefused(recordRows(), { id: "C", status: "complete", actualStartDate: "2026-10-19", actualFinishDate: "2026-10-24" }, "date_after_today", { today: "2026-10-23" });
  });
  it("one entry's refusal leaves the others to apply (partial), each skipped entry named by its activity", () => {
    const named = [activity("B", { name: "Build" }), activity("C", { name: "Test" })];
    const { outcome, scenario } = run(named, [progressOp([
      { id: "B", status: "inProgress" },
      { id: "Z", status: "inProgress" },
      { id: "C", actualStartDate: "2026-10-20" },
    ])]);
    expect(outcome).toEqual({
      status: "partial", appliedCount: 1,
      skippedItems: [
        { index: 1, id: "Z", name: "Z", reason: "not_found" },
        { index: 2, id: "C", name: "Test", reason: "dates_on_planned" },
      ],
    });
    expect(rowOf(scenario, "B").status).toBe("inProgress");
    expect(rowOf(scenario, "C").status).toBe("planned");
  });
});

describe("add-only: an entry adds what is not yet recorded", () => {
  it("a start for an In Progress row that has none (from before v0.80.0) is added, and the count recounted to today", () => {
    const { outcome, scenario } = run([activity("E", { status: "inProgress", actualDuration: 4 })], [progressOp([{ id: "E", actualStartDate: "2026-10-14" }])]);
    expect(outcome).toEqual({ status: "applied" });
    expect(progressOf(rowOf(scenario, "E"))).toMatchObject({ status: "inProgress", actualStartDate: "2026-10-14", actualDuration: 6 });
  });
  it("both dates for a Complete row that has none (from before v0.80.0) are added, counted over them", () => {
    const { outcome, scenario } = run([activity("F", { status: "complete", actualDuration: 9 })], [progressOp([{ id: "F", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09" }])]);
    expect(outcome).toEqual({ status: "applied" });
    expect(progressOf(rowOf(scenario, "F"))).toMatchObject({ status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 });
  });
  it("Complete with the recorded start resent and a new finish: the finish is added", () => {
    const started = activity("G", { status: "inProgress", actualStartDate: "2026-10-14", actualDuration: 6 });
    const { outcome, scenario } = run([started], [progressOp([{ id: "G", status: "complete", actualStartDate: "2026-10-14", actualFinishDate: "2026-10-20" }])]);
    expect(outcome).toEqual({ status: "applied" });
    expect(progressOf(rowOf(scenario, "G"))).toMatchObject({ status: "complete", actualStartDate: "2026-10-14", actualFinishDate: "2026-10-20", actualDuration: 5 });
  });
});

describe("R4 — a left-out date is the day the AI sent the request, not the day it drained", () => {
  const MONDAY: AiBatchContext = { today: "2026-10-26" };
  it("queued Friday 10/23, drained Monday 10/26: started Friday; the count runs to Monday", () => {
    const { scenario } = run(recordRows(), [progressOp([{ id: "B", status: "inProgress" }], { createdOn: "2026-10-23" })], MONDAY);
    expect(progressOf(rowOf(scenario, "B"))).toMatchObject({ actualStartDate: "2026-10-23", actualDuration: 2 });
  });
  it("a Complete queued Wednesday 10/21 finishes that Wednesday — not on the Monday it drained", () => {
    const started = activity("G", { status: "inProgress", actualStartDate: "2026-10-14", actualDuration: 6 });
    const { scenario } = run([started], [progressOp([{ id: "G", status: "complete" }], { createdOn: "2026-10-21" })], MONDAY);
    expect(progressOf(rowOf(scenario, "G"))).toMatchObject({ actualStartDate: "2026-10-14", actualFinishDate: "2026-10-21", actualDuration: 6 });
  });
  it.each([["after today", "2026-10-27"], ["not a calendar date", "2026-13-01"], ["absent", undefined]])(
    "a creation day %s falls back to today",
    (_label, createdOn) => {
      const { scenario } = run(recordRows(), [progressOp([{ id: "B", status: "inProgress" }], { createdOn })], MONDAY);
      expect(rowOf(scenario, "B").actualStartDate).toBe("2026-10-26");
    },
  );
});

describe("ruling 5: a weekend or holiday is judged on the day the request was SENT, not the day it drains", () => {
  it.each([
    ["sent Saturday, drained Saturday", "2026-10-24", "2026-10-24", "2026-10-23"],
    ["sent Saturday, drained Monday (Review 37, E1 = R1)", "2026-10-26", "2026-10-24", "2026-10-23"],
    ["sent Sunday, drained Monday", "2026-10-26", "2026-10-25", "2026-10-23"],
    ["sent Monday: forward to Monday, as the window moves it", "2026-10-26", "2026-10-26", "2026-10-26"],
  ])("a Saturday 10/24 start, %s", (_label, today, sent, recorded) => {
    const { scenario } = run(recordRows(), [progressOp([{ id: "B", status: "inProgress", actualStartDate: "2026-10-24" }], { createdOn: sent })], { today });
    expect(rowOf(scenario, "B").actualStartDate).toBe(recorded);
  });
  it.each([["drained Sunday", "2026-10-25"], ["drained Monday", "2026-10-26"]])(
    "weekend work, Saturday 10/24 to Sunday 10/25, sent Sunday and %s: the same record, Fri 10/23 to Fri 10/23",
    (_label, today) => {
      const { outcome, scenario } = run(recordRows(), [progressOp([
        { id: "B", status: "complete", actualStartDate: "2026-10-24", actualFinishDate: "2026-10-25" },
      ], { createdOn: "2026-10-25" })], { today });
      expect(outcome).toEqual({ status: "applied" });
      expect(progressOf(rowOf(scenario, "B"))).toMatchObject({ actualStartDate: "2026-10-23", actualFinishDate: "2026-10-23", actualDuration: 1 });
    },
  );
  it("a start left out of a request sent on a Saturday is the Friday before, drained the Monday after", () => {
    const { scenario } = run(recordRows(), [progressOp([{ id: "B", status: "inProgress" }], { createdOn: "2026-10-24" })], { today: "2026-10-26" });
    expect(progressOf(rowOf(scenario, "B"))).toMatchObject({ actualStartDate: "2026-10-23", actualDuration: 2 });
  });
  it("a holiday is judged on the calendar: a start left out of a request sent on holiday Monday 10/19 is Friday 10/16", () => {
    const calendar = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h", name: "Holiday", startDate: "2026-10-19", endDate: "2026-10-19" }], []);
    const { scenario } = run(recordRows(), [progressOp([{ id: "C", status: "inProgress" }], { createdOn: "2026-10-19" })], { today: TODAY, calendar });
    expect(rowOf(scenario, "C").actualStartDate).toBe("2026-10-16");
  });
  it("D4: the stored record, resent unchanged, is not moved — an imported Saturday stays a Saturday", () => {
    const imported = activity("D", { status: "inProgress", actualStartDate: "2026-10-10", actualDuration: 8 });
    const { scenario } = run([imported], [progressOp([{ id: "D", status: "complete", actualStartDate: "2026-10-10", actualFinishDate: "2026-10-20" }])]);
    expect(progressOf(rowOf(scenario, "D"))).toMatchObject({ actualStartDate: "2026-10-10", actualFinishDate: "2026-10-20", actualDuration: 7 });
  });
});

describe("F7 — no schedule, no Planned dates kept, and the feed is told", () => {
  it("a dependency cycle: the Status changes, no pair is kept, the outcome counts it", () => {
    const deps: ActivityDependency[] = [
      { fromActivityId: "B", toActivityId: "C", type: "FS", lagDays: 0 },
      { fromActivityId: "C", toActivityId: "B", type: "FS", lagDays: 0 },
    ];
    const { outcome, scenario } = run([activity("B"), activity("C")], [progressOp([{ id: "B", status: "inProgress" }])], CTX,
      { dependencyMode: true, dependencies: deps });
    expect(outcome).toEqual({ status: "applied", noPlanKept: 1 });
    expect(progressOf(rowOf(scenario, "B"))).toMatchObject({ status: "inProgress", plannedStartDate: undefined, plannedFinishDate: undefined });
  });
});

describe("batch semantics — one plan per op, read after the batch's earlier ops", () => {
  const network = (): { rows: Activity[]; deps: ActivityDependency[] } => ({
    rows: [activity("A"), activity("B")],
    deps: [{ fromActivityId: "A", toActivityId: "B", type: "FS", lagDays: 0 }],
  });
  it("ONE op starting A and B: B keeps its pre-op plan, 10/12–10/16 (ruling 5b, as one bulk Apply)", () => {
    const { rows, deps } = network();
    const { scenario } = run(rows, [progressOp([
      { id: "A", status: "inProgress", actualStartDate: "2026-10-07" },
      { id: "B", status: "inProgress", actualStartDate: "2026-10-21" },
    ])], CTX, { dependencyMode: true, dependencies: deps });
    expect(progressOf(rowOf(scenario, "A"))).toMatchObject({ plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-09" });
    expect(progressOf(rowOf(scenario, "B"))).toMatchObject({ plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16" });
  });
  it("TWO ops in one batch: the second reads the plan after the first — B's pair follows A's forecast", () => {
    const { rows, deps } = network();
    const { scenario, outcomes } = run(rows, [
      progressOp([{ id: "A", status: "inProgress", actualStartDate: "2026-10-07" }], { seq: 1 }),
      progressOp([{ id: "B", status: "inProgress", actualStartDate: "2026-10-21" }], { seq: 2 }),
    ], CTX, { dependencyMode: true, dependencies: deps });
    expect(outcomes).toEqual<AiOpOutcome[]>([{ status: "applied" }, { status: "applied" }]);
    // A started 10/07 with 11 working days elapsed by 10/21, so it is forecast through 10/22; B follows.
    expect(progressOf(rowOf(scenario, "B"))).toMatchObject({ plannedStartDate: "2026-10-23", plannedFinishDate: "2026-10-29" });
  });
  it("a repeated id in one op sees the earlier entry's result: started, then finished", () => {
    const { outcome, scenario } = run(recordRows(), [progressOp([
      { id: "B", status: "inProgress", actualStartDate: "2026-10-13" },
      { id: "B", status: "complete", actualFinishDate: "2026-10-20" },
    ])]);
    expect(outcome).toEqual({ status: "applied" });
    expect(progressOf(rowOf(scenario, "B"))).toEqual({
      status: "complete", actualStartDate: "2026-10-13", actualFinishDate: "2026-10-20", actualDuration: 6,
      plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-16",
    });
  });
  it("a repeated id cannot change what the earlier entry recorded (add-only)", () => {
    const { outcome, scenario } = run(recordRows(), [progressOp([
      { id: "B", status: "inProgress", actualStartDate: "2026-10-13" },
      { id: "B", status: "inProgress", actualStartDate: "2026-10-14" },
    ])]);
    expect(outcome).toEqual({ status: "partial", appliedCount: 1, skippedItems: [{ index: 1, id: "B", name: "B", reason: "date_recorded" }] });
    expect(rowOf(scenario, "B").actualStartDate).toBe("2026-10-13");
  });
});
