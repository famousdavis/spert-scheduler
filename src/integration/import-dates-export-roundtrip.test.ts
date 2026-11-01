// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import Papa from "papaparse";
import type { Activity } from "@domain/models/types";
import { createActivity, createProject } from "@app/api/project-service";
import { exportScheduleCsv } from "@app/api/schedule-export-service";
import { computeDeterministicSchedule } from "@core/schedule/deterministic";
import { parseCsvFileRows, readCsvRows } from "@app/api/csv-import-service";

/**
 * WI-150 (Review 34, V-W1; DESIGN §0, ruled E0): the REAL schedule export, through the REAL file
 * reader, does not re-import — and a copy hand-edited in four places does, with its four dates.
 * Today pinned to Saturday 31 October 2026; dependencies off. Values written out by hand.
 */
function exported(): string {
  const p = createProject("P", "2026-10-05", { dependencyMode: false });
  const s = p.scenarios[0]!;
  const row = (id: string, extra: Partial<Activity>): Activity => ({
    ...createActivity(id, s.settings), id, min: 9, mostLikely: 10, max: 11, distributionType: "uniform", ...extra,
  });
  const activities = [
    row("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15,
      plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-16" }),
    row("B", { status: "inProgress", actualStartDate: "2026-10-26", actualDuration: 5,
      plannedStartDate: "2026-10-19", plannedFinishDate: "2026-10-30" }),
    row("C", {}),
  ];
  const schedule = computeDeterministicSchedule(activities, "2026-10-05", 0.5);
  return exportScheduleCsv({
    projectName: "P", scenarioName: s.name, startDate: "2026-10-05", activities, schedule, buffer: null,
    settings: s.settings, dependencies: [], milestones: [], dateFormat: "MM/DD/YYYY",
  });
}
const read = (csv: string) => readCsvRows(new File([csv], "export.csv", { type: "text/csv" }));

beforeAll(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 31, 12), toFake: ["Date"] });
});
afterAll(() => {
  vi.useRealTimers();
});

describe("the schedule export through the file reader (V-W1)", () => {
  it("as exported: nothing imports — the summary block stands where the header should", async () => {
    const r = parseCsvFileRows(await read(exported()));
    expect(r.activities).toEqual([]);
    expect(r.errors.map((e) => e.message)).toEqual([
      "Missing required columns: Activity ID, Activity Name, Optimistic (Min), Most Likely, Pessimistic (Max), Confidence Level.",
    ]);
  });

  it("hand-edited (summary block removed, # renamed Activity ID, Total row removed): the four dates come back", async () => {
    const rows = await read(exported());
    const header = rows.findIndex((r) => r[0] === "#");
    const edited = [["Activity ID", ...rows[header]!.slice(1)], ...rows.slice(header + 1).filter((r) => r[1] !== "Total")];
    const r = parseCsvFileRows(await read(Papa.unparse(edited)));
    expect(r.errors).toEqual([]);
    expect(r.activities.map((a) => [a.name, a.status, a.actualStartDate, a.actualFinishDate, a.plannedStartDate, a.plannedFinishDate])).toEqual([
      ["A", "complete", "2026-10-05", "2026-10-23", "2026-10-05", "2026-10-16"],
      ["B", "inProgress", "2026-10-26", undefined, "2026-10-19", "2026-10-30"],
      ["C", "planned", undefined, undefined, undefined, undefined],
    ]);
    expect(r.earliestActualStart).toBe("2026-10-05");
    expect(r.notes).toEqual([
      "Planned Start and Planned Finish were not imported for 1 activity that has not started (Status Planned). Scheduler schedules these activities itself, and keeps an activity's Planned Start and Planned Finish from its own plan when the activity starts.",
    ]);
  });
});
