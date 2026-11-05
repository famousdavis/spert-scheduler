// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import type { AiOp } from "@app/api/ai-batch-service";
import { createProject, createScenario, createActivity } from "@app/api/project-service";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { DEFAULT_SCENARIO_SETTINGS, type Activity, type Project } from "@domain/models/types";

/**
 * WI-150 release C — the progress write through the REAL store action, `applyAiBatch`, as the
 * Connect AI drain calls it: the batch's today and work calendar reach the rule, and the write is one
 * AI undo frame — undo puts the row back as it was (its Status, its dates and its Planned pair);
 * redo writes it again. The plan, counted by hand: A done 10/05–10/09; B, 3/5/7 Triangular, is
 * 10/12–10/19 around the holiday on Tue 10/13.
 */
const CAL = buildWorkCalendar([1, 2, 3, 4, 5], [{ id: "h1", name: "Holiday", startDate: "2026-10-13", endDate: "2026-10-13" }], []);

function activity(id: string, over: Partial<Activity> = {}): Activity {
  return { ...createActivity(id, DEFAULT_SCENARIO_SETTINGS), id, name: id, min: 3, mostLikely: 5, max: 7, distributionType: "triangular", ...over };
}

function seed(): { projectId: string; scenarioId: string } {
  const scenario = {
    ...createScenario("S1", "2026-10-05"),
    activities: [
      activity("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 }),
      activity("B"),
    ],
  };
  const project: Project = { ...createProject("AI progress", "2026-10-05"), scenarios: [scenario] };
  useProjectStore.setState({ projects: [project] });
  return { projectId: project.id, scenarioId: scenario.id };
}

const rowB = (projectId: string): Activity =>
  useProjectStore.getState().projects.find((p) => p.id === projectId)!.scenarios[0]!.activities.find((a) => a.id === "B")!;

beforeEach(() => {
  useProjectStore.setState({ projects: [] });
});

describe("the real applyAiBatch records progress, and undo and redo take it back and forth", () => {
  it("records with the batch's today and calendar; undo restores the row; redo re-applies", () => {
    const { projectId, scenarioId } = seed();
    const op: AiOp = { seq: 1, op: "bulk_set_activity_progress", payload: { scenarioId, updates: [{ id: "B", status: "inProgress" }] } };
    const s = useProjectStore.getState;
    const results = s().applyAiBatch(projectId, [op], scenarioId, { today: "2026-10-21", calendar: CAL });
    expect(results[0]!.outcome).toEqual({ status: "applied" });
    const recorded = {
      status: "inProgress", actualStartDate: "2026-10-21", actualDuration: 1,
      plannedStartDate: "2026-10-12", plannedFinishDate: "2026-10-19",
    };
    expect(rowB(projectId)).toMatchObject(recorded);

    s().undo();
    const undone = rowB(projectId);
    expect(undone.status).toBe("planned");
    expect([undone.actualStartDate, undone.actualDuration, undone.plannedStartDate, undone.plannedFinishDate])
      .toEqual([undefined, undefined, undefined, undefined]);

    s().redo();
    expect(rowB(projectId)).toMatchObject(recorded);
  });
});
