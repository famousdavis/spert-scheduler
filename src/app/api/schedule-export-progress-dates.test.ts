// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { Activity, ActivityDependency, DateFormatPreference } from "@domain/models/types";
import { createProject, createActivity } from "./project-service";
import { buildGridRows, buildScheduleHeaders, exportScheduleCsv, exportScheduleXlsx, type ScheduleExportParams } from "./schedule-export-service";
import { computeDependencySchedule } from "@core/schedule/deterministic";
import { resolveHeaders, COLUMN_LABELS } from "@core/import/flat-activity-parser";

/**
 * WI-137 release 2 — the schedule export's four progress dates (owner, R626): Planned Start,
 * Planned Finish, Actual Start, Actual Finish, after End Date, in the user's date format as the
 * file's other dates are; a Planned row's Planned dates are its scheduled ones (R630, 7a), and the
 * summary names the date format (R630, 7b). Named so WI-150's importer can read them back. Values
 * written out. C is scheduled 11-02..11-13 (after B, In Progress since 10-19, 10 days).
 */
function params(dateFormat: DateFormatPreference = "MM/DD/YYYY"): ScheduleExportParams {
  const p = createProject("P", "2026-10-05", { dependencyMode: true });
  const s = p.scenarios[0]!;
  const row = (id: string, extra: Partial<Activity>): Activity => ({
    ...createActivity(id, s.settings), id, min: 9, mostLikely: 10, max: 11, distributionType: "uniform", ...extra,
  });
  const activities = [
    row("A", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-23", actualDuration: 15,
      plannedStartDate: "2026-10-05", plannedFinishDate: "2026-10-16" }),
    row("B", { status: "inProgress", actualStartDate: "2026-10-19", actualDuration: 1,
      plannedStartDate: "2026-10-26", plannedFinishDate: "2026-11-06" }),
    row("C", { plannedStartDate: "2026-11-09", plannedFinishDate: "2026-11-20" }), // Planned, carrying a pair (an import): not written
    row("L1", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-16", actualDuration: 10 }), // v0.80.0: no pair
    row("L2", { status: "inProgress", actualDuration: 3 }), // before v0.80.0: no date at all
  ];
  const dependencies: ActivityDependency[] = [
    { fromActivityId: "A", toActivityId: "B", type: "FS", lagDays: 0 },
    { fromActivityId: "B", toActivityId: "C", type: "FS", lagDays: 0 },
  ];
  return {
    projectName: "P", scenarioName: s.name, startDate: "2026-10-05", activities,
    schedule: computeDependencySchedule(activities, dependencies, "2026-10-05", 0.5),
    buffer: null, settings: s.settings, dependencies, milestones: [], dateFormat,
  };
}

describe("the four progress dates in the schedule export", () => {
  it("come after End Date, Planned then Actual, in both modes", () => {
    for (const hasDeps of [false, true]) {
      expect(buildScheduleHeaders(hasDeps, "P50").slice(10, 16)).toEqual([
        "Start Date", "End Date", "Planned Start", "Planned Finish", "Actual Start", "Actual Finish",
      ]);
    }
  });

  it("hold what each row holds — and nothing a row does not", () => {
    const cells = buildGridRows(params()).map((r) => [r.name, r.plannedStart, r.plannedFinish, r.actualStart, r.actualFinish]);
    expect(cells).toEqual([
      ["A", "10/05/2026", "10/16/2026", "10/05/2026", "10/23/2026"],
      ["B", "10/26/2026", "11/06/2026", "10/19/2026", ""],
      ["C", "11/02/2026", "11/13/2026", "", ""], // its scheduled start and finish, never the pair it carries
      ["L1", "", "", "10/05/2026", "10/16/2026"],
      ["L2", "", "", "", ""],
    ]);
  });

  it("the CSV's header and row carry them", () => {
    const lines = exportScheduleCsv(params()).split("\n");
    const header = lines.find((l) => l.startsWith("#,"))!;
    expect(header).toContain(",Start Date,End Date,Planned Start,Planned Finish,Actual Start,Actual Finish,");
    expect(lines.find((l) => l.startsWith("1,A,"))).toContain(",10/05/2026,10/16/2026,10/05/2026,10/23/2026,");
  });

  it("the XLSX file itself: the header row and A's row, read back from the workbook", async () => {
    const ExcelJS = await import("exceljs");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await exportScheduleXlsx(params()));
    const ws = wb.worksheets[0]!;
    let headerRow = 0;
    ws.eachRow((row, n) => { if (!headerRow && row.getCell(1).value === "#") headerRow = n; });
    const cells = (n: number) => [11, 12, 13, 14, 15, 16].map((c) => ws.getRow(n).getCell(c).value);
    expect(cells(headerRow)).toEqual(["Start Date", "End Date", "Planned Start", "Planned Finish", "Actual Start", "Actual Finish"]);
    expect(cells(headerRow + 1).slice(2)).toEqual(["10/05/2026", "10/16/2026", "10/05/2026", "10/23/2026"]);
  });

  it("none of the four is a heading the CSV importer reads today (WI-150 adds them; nothing is misread meanwhile)", () => {
    const four = ["Planned Start", "Planned Finish", "Actual Start", "Actual Finish"];
    const template = Object.values(COLUMN_LABELS);
    const resolved = resolveHeaders([...template, ...four]);
    expect("headers" in resolved).toBe(true);
    if (!("headers" in resolved)) return;
    const taken = new Set(Object.values(resolved.headers));
    for (let i = template.length; i < template.length + four.length; i++) expect(taken.has(i)).toBe(false);
  });
});

describe("the date format, named in the file and used for every date (owner, R630, 7b)", () => {
  // A's four dates and Planned C's two, in each format — written out.
  const EXPECTED: Record<DateFormatPreference, { a: string[]; c: string[] }> = {
    "MM/DD/YYYY": { a: ["10/05/2026", "10/16/2026", "10/05/2026", "10/23/2026"], c: ["11/02/2026", "11/13/2026"] },
    "DD/MM/YYYY": { a: ["05/10/2026", "16/10/2026", "05/10/2026", "23/10/2026"], c: ["02/11/2026", "13/11/2026"] },
    "YYYY/MM/DD": { a: ["2026/10/05", "2026/10/16", "2026/10/05", "2026/10/23"], c: ["2026/11/02", "2026/11/13"] },
  };

  for (const fmt of Object.keys(EXPECTED) as DateFormatPreference[]) {
    it(`${fmt}: a real CSV — its summary's Date Format line, and the four columns`, () => {
      const lines = exportScheduleCsv(params(fmt)).split("\n");
      expect(lines).toContain(`Date Format,${fmt}`);
      const header = lines.find((l) => l.startsWith("#,"))!.split(",");
      const at = header.indexOf("Planned Start");
      const cells = (prefix: string) => lines.find((l) => l.startsWith(prefix))!.split(",").slice(at, at + 4);
      expect(cells("1,A,")).toEqual(EXPECTED[fmt].a);
      expect(cells("3,C,")).toEqual([...EXPECTED[fmt].c, "", ""]);
    });

    it(`${fmt}: a real XLSX, read back — the Date Format line, and the four columns`, async () => {
      const ExcelJS = await import("exceljs");
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await exportScheduleXlsx(params(fmt)));
      const ws = wb.worksheets[0]!;
      let headerRow = 0;
      let formatRow = 0;
      ws.eachRow((row, n) => {
        if (!headerRow && row.getCell(1).value === "#") headerRow = n;
        if (row.getCell(1).value === "Date Format") formatRow = n;
      });
      expect(formatRow).toBeGreaterThan(0);
      expect(formatRow).toBeLessThan(headerRow);
      expect(ws.getRow(formatRow).getCell(2).value).toBe(fmt);
      const cells = (n: number) => [13, 14, 15, 16].map((c) => ws.getRow(n).getCell(c).value ?? "");
      expect(cells(headerRow)).toEqual(["Planned Start", "Planned Finish", "Actual Start", "Actual Finish"]);
      expect(cells(headerRow + 1)).toEqual(EXPECTED[fmt].a);
      expect(cells(headerRow + 3)).toEqual([...EXPECTED[fmt].c, "", ""]);
    });
  }
});
