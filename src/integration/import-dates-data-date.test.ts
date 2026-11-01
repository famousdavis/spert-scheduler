// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import type { Activity, ActivityDependency, DeterministicSchedule } from "@domain/models/types";
import { parsePastedRows } from "@app/api/csv-import-service";
import { withImportedCounts } from "@core/import/progress-dates";
import { computeScenarioSchedule } from "@ui/hooks/use-schedule";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import { runDependencyTrials, runTrials } from "@core/simulation/monte-carlo";

/**
 * WI-150 on v0.82.0 (Review 34, I-F1, superseded by WI-154): an import that starts the scenario on
 * its earliest Actual Start (S2) puts that Start Date in the past. Since v0.82.0, in a scenario that
 * holds a record, work that has not started is never scheduled before today — so the preview needs
 * no "even when that is before today" line. Proved here through the real paste parser, the commit's
 * counts and both engines.
 *
 * A P6 sheet, today Friday 30 October 2026, Mon–Fri calendar, point estimates (every trial of the
 * simulation takes the same durations). By hand: the scenario starts Mon 7 Sep; 30 Oct is 39 working
 * days on (seven weeks, 35, to Fri 23 Oct; then Mon 26 – Thu 29). Training, 40 days, not started,
 * starts on 30 Oct: working-day indexes 39 to 78, a span of 79. Without the floor it would start on
 * 7 Sep and span 40.
 */
const TODAY = "2026-10-30";
const HEADER = ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Predecessors",
  "Activity Status", "Actual Start", "Actual Finish", "Planned Start", "Planned Finish"];
const SHEET: Record<string, string[]> = {
  A1: ["A1", "Design", "10", "10", "10", "", "", "Completed", "07-Sep-26", "18-Sep-26", "07-Sep-26", "18-Sep-26"],
  A2: ["A2", "Build", "20", "20", "20", "", "A1", "In Progress", "21-Sep-26", "", "21-Sep-26", "16-Oct-26"],
  A3: ["A3", "Docs", "6", "6", "6", "", "A1", "Not Started", "", "", "21-Sep-26", "28-Sep-26"],
  A4: ["A4", "Training", "40", "40", "40", "", "", "Not Started", "", "", "07-Sep-26", "30-Oct-26"],
};

function imported(order: string[], withLinks: boolean): { activities: Activity[]; dependencies: ActivityDependency[]; startDate: string } {
  const header = withLinks ? HEADER : HEADER.filter((h) => h !== "Predecessors");
  const rows = order.map((id) => (withLinks ? SHEET[id]! : SHEET[id]!.filter((_c, i) => i !== 6)));
  const r = parsePastedRows([header, ...rows], { today: TODAY });
  expect(r.errors).toEqual([]);
  return {
    activities: withImportedCounts(r.activities, TODAY, undefined),
    dependencies: r.dependencies,
    startDate: r.earliestActualStart!,
  };
}
const byName = (s: DeterministicSchedule, acts: Activity[], name: string) =>
  s.activities.find((sa) => sa.activityId === acts.find((a) => a.name === name)!.id)!;

beforeAll(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 30, 12), toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

describe("after an S2 import, no unstarted work is scheduled before today (both engines)", () => {
  it("dependencies on: Training (no predecessor) and Docs (after finished Design) start on today", () => {
    const { activities, dependencies, startDate } = imported(["A1", "A2", "A3", "A4"], true);
    expect(startDate).toBe("2026-09-07"); // the S2 line's date: the earliest Actual Start
    const { schedule } = computeScenarioSchedule({
      activities, startDate, probabilityTarget: 0.5, calendar: undefined, network: { dependencies, milestones: [] }, today: TODAY,
    });
    expect(byName(schedule!, activities, "Design").startDate).toBe("2026-09-07");
    expect(byName(schedule!, activities, "Design").recordedStart).toBe(true);
    expect(byName(schedule!, activities, "Training").startDate).toBe("2026-10-30");
    expect(byName(schedule!, activities, "Docs").startDate).toBe("2026-10-30");
    expect(schedule!.spanDays).toBe(79);

    const params = buildSimulationParams(activities, true, 0.5, dependencies, [], startDate, undefined, true, TODAY);
    const dp = params.dependencyParams!;
    const samples = runDependencyTrials({
      activities, dependencies, trialCount: 50, rngSeed: "wi150",
      deterministicDurationMap: new Map(Object.entries(dp.deterministicDurationMap ?? {})),
      recordedStartMap: new Map(Object.entries(dp.recordedStarts ?? {})),
      recordedDurationMap: new Map(Object.entries(dp.recordedDurations ?? {})),
      dataDateOffset: params.dataDateOffset,
    }).samples;
    expect(params.dataDateOffset).toBe(39);
    expect(new Set(samples)).toEqual(new Set([79]));
  });

  it("dependencies off: Training (first row) and Docs (after finished Design) start on today", () => {
    const { activities, startDate } = imported(["A4", "A1", "A3", "A2"], false);
    const { schedule } = computeScenarioSchedule({
      activities, startDate, probabilityTarget: 0.5, calendar: undefined, network: null, today: TODAY,
    });
    expect(byName(schedule!, activities, "Training").startDate).toBe("2026-10-30");
    expect(byName(schedule!, activities, "Docs").startDate >= "2026-10-30").toBe(true);

    const params = buildSimulationParams(activities, false, 0.5, [], [], startDate, undefined, true, TODAY);
    const samples = runTrials({
      activities, trialCount: 50, rngSeed: "wi150",
      deterministicDurations: params.deterministicDurations,
      sequentialRecords: params.sequentialRecords,
      dataDateOffset: params.dataDateOffset,
    }).samples;
    expect(params.dataDateOffset).toBe(39);
    expect(Math.min(...samples)).toBeGreaterThanOrEqual(79);
  });
});
