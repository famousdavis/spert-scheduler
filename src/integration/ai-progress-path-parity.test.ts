// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { applyAiOpsToProject, type AiOp } from "@app/api/ai-batch-service";
import { createProject, createScenario, createActivity } from "@app/api/project-service";
import { computeScenarioSchedule, scenarioScheduleInputs } from "@app/api/scenario-schedule";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { computeHeuristic } from "@core/estimation/heuristic";
import { statusUpdatesFor, withPlanDates } from "@ui/components/activity-row-helpers";
import { planBulkApply, bulkUpdatesById } from "@ui/components/unified-activity-helpers";
import type { BulkSetProgressItem } from "@app/api/ai-op-types";
import { DEFAULT_SCENARIO_SETTINGS, type Activity, type ActivityStatus, type Project, type Scenario } from "@domain/models/types";

/**
 * WI-150 release C — PATH PARITY for the AI's progress write (the brief's v0.82.0 point 1): a Status
 * change sent by Connect AI gives an activity the SAME fields — its Actual Start, Actual Finish and
 * count, and its kept Planned pair (C′) — as the grid's Status cell for one row, and as one bulk
 * Apply for several (ruling 5b), in a scenario where today's floor applies. The grid and bulk paths
 * are driven exactly as the page drives them: the live rows from the page's one schedule function
 * with today, each Planned row given its plan dates by `withPlanDates`, and the page's `planSchedule`
 * — that same function with today left out. A holiday on Tue 10/13 makes the calendar count.
 *
 * Owner, R650 (ruling 5): the AI's own dates are not the grid's defaults — Planned → Complete needs
 * both dates, and no date comes from the plan. So for Complete from Planned the AI SENDS the dates
 * the grid records, and parity is then field for field: the same Planned pair, the same count. In
 * Progress → Complete with the finish left out (E) needs no dates sent: the day sent is today.
 */
const START = "2026-10-05";
const TODAY = "2026-10-21";
const CAL = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Holiday", startDate: "2026-10-13", endDate: "2026-10-13" }], []);

function activity(id: string, over: Partial<Activity> = {}): Activity {
  return { ...createActivity(id, DEFAULT_SCENARIO_SETTINGS), id, name: id, min: 3, mostLikely: 5, max: 7, distributionType: "triangular", ...over };
}

function scenarioOf(dependencyMode: boolean): Scenario {
  const base = createScenario("S1", START);
  return {
    ...base,
    activities: [
      activity("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 }),
      activity("B"),
      activity("C"),
      activity("E", { status: "inProgress", actualStartDate: "2026-10-14", actualDuration: 5 }),
    ],
    dependencies: dependencyMode
      ? [{ fromActivityId: "A", toActivityId: "B", type: "FS", lagDays: 0 }, { fromActivityId: "B", toActivityId: "C", type: "FS", lagDays: 0 }]
      : [],
    settings: { ...base.settings, dependencyMode },
  };
}

/** The page's two inputs to a Status change: its grid rows and its `planSchedule`. */
function pagePaths(scenario: Scenario) {
  const inputs = scenarioScheduleInputs(scenario, CAL, TODAY);
  const activities = scenario.activities;
  const live = computeScenarioSchedule({ ...inputs, activities }).schedule!;
  const planSchedule = (changed: Activity[]) => {
    const byId = new Map(changed.map((a) => [a.id, a]));
    return computeScenarioSchedule({ ...inputs, today: undefined, activities: activities.map((a) => byId.get(a.id) ?? a) }).schedule;
  };
  return { live, rows: withPlanDates(live.activities, planSchedule([]), activities), planSchedule };
}

/**
 * The AI's entries for the rows another path changed: the Status alone, and — for Complete from
 * Planned, which needs both (ruling 5) — the very dates that path recorded.
 */
function entriesLike(scenario: Scenario, ids: string[], status: ActivityStatus, other: (id: string) => Activity): BulkSetProgressItem[] {
  return ids.map((id) => (status === "complete" && rowOf(scenario, id).status === "planned"
    ? { id, status, actualStartDate: other(id).actualStartDate, actualFinishDate: other(id).actualFinishDate }
    : { id, status }));
}

function aiWrite(scenario: Scenario, updates: BulkSetProgressItem[]): Scenario {
  const project: Project = { ...createProject("P", START), scenarios: [scenario] };
  const op: AiOp = { seq: 1, op: "bulk_set_activity_progress", payload: { updates } };
  const out = applyAiOpsToProject(project, [op], scenario.id, { today: TODAY, calendar: CAL });
  expect(out.results[0]!.outcome).toEqual({ status: "applied" });
  return out.project.scenarios[0]!;
}

const rowOf = (s: Scenario, id: string): Activity => s.activities.find((a) => a.id === id)!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 9, 21, 12, 0)); // the grid reads today from the clock
});
afterEach(() => {
  vi.useRealTimers();
});

describe.each([["sequential", false], ["dependency mode", true]] as const)("%s", (_mode, dependencyMode) => {
  it("the page floors B at today, and its plan does not — the control", () => {
    const { live, rows } = pagePaths(scenarioOf(dependencyMode));
    const b = rows.find((r) => r.activityId === "B")!;
    expect([b.startDate, b.planDates?.startDate, b.planDates?.endDate]).toEqual(["2026-10-21", "2026-10-12", "2026-10-19"]);
    expect(live.activities.find((r) => r.activityId === "C")!.startDate > "2026-10-21").toBe(true);
  });

  describe.each(["inProgress", "complete"] as const)("→ %s", (status) => {
    it("one row: the AI write equals the grid's Status cell", () => {
      const scenario = scenarioOf(dependencyMode);
      const { rows } = pagePaths(scenario);
      const ids = status === "complete" ? ["B", "C", "E"] : ["B", "C"];
      for (const id of ids) {
        const grid = { ...rowOf(scenario, id), ...statusUpdatesFor(rowOf(scenario, id), status, rows.find((r) => r.activityId === id), CAL) };
        expect(rowOf(aiWrite(scenario, entriesLike(scenario, [id], status, () => grid)), id)).toEqual(grid);
      }
    });

    it("two rows: the AI write equals ONE bulk Apply (each keeps its pre-Apply plan)", () => {
      const scenario = scenarioOf(dependencyMode);
      const { rows, planSchedule } = pagePaths(scenario);
      const plan = planBulkApply({ status }, ["B", "C"], scenario.activities, rows, {}, computeHeuristic, CAL, planSchedule);
      const bulk = bulkUpdatesById(["B", "C"], plan);
      const after = (id: string): Activity => ({ ...rowOf(scenario, id), ...bulk.get(id) });
      const ai = aiWrite(scenario, entriesLike(scenario, ["B", "C"], status, after));
      for (const id of ["B", "C"]) expect(rowOf(ai, id)).toEqual(after(id));
    });
  });

  it("the pair the AI keeps, counted by hand: B 10/12–10/19 (the holiday on 10/13), C 10/20–10/26", () => {
    const ai = aiWrite(scenarioOf(dependencyMode), [{ id: "B", status: "inProgress" }, { id: "C", status: "inProgress" }]);
    expect([rowOf(ai, "B").plannedStartDate, rowOf(ai, "B").plannedFinishDate]).toEqual(["2026-10-12", "2026-10-19"]);
    expect([rowOf(ai, "C").plannedStartDate, rowOf(ai, "C").plannedFinishDate]).toEqual(["2026-10-20", "2026-10-26"]);
  });
});
