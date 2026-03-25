// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  buildSummaryData,
  buildGridRows,
  buildPredecessorMap,
  buildSuccessorMap,
  exportScheduleCsv,
  exportScheduleXlsx,
} from "./schedule-export-service";
import type { ScheduleExportParams } from "./schedule-export-service";
import type {
  Activity,
  ActivityDependency,
  DeterministicSchedule,
  ScenarioSettings,
} from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

function makeActivity(overrides: Partial<Activity> & { id: string; name: string }): Activity {
  return {
    min: 5,
    mostLikely: 10,
    max: 20,
    confidenceLevel: "mediumConfidence",
    distributionType: "logNormal",
    status: "planned",
    ...overrides,
  };
}

const activities: Activity[] = [
  makeActivity({ id: "a1", name: "Design" }),
  makeActivity({ id: "a2", name: "Develop", status: "inProgress", actualDuration: 3 }),
  makeActivity({ id: "a3", name: "Test", status: "complete", actualDuration: 8 }),
];

const schedule: DeterministicSchedule = {
  activities: [
    { activityId: "a1", name: "Design", duration: 12, startDate: "2026-03-16", endDate: "2026-03-31", isActual: false },
    { activityId: "a2", name: "Develop", duration: 10, startDate: "2026-04-01", endDate: "2026-04-14", isActual: false },
    { activityId: "a3", name: "Test", duration: 8, startDate: "2026-04-15", endDate: "2026-04-24", isActual: true },
  ],
  totalDurationDays: 30,
  projectEndDate: "2026-04-24",
};

const settings: ScenarioSettings = {
  defaultConfidenceLevel: "mediumConfidence",
  defaultDistributionType: "logNormal",
  trialCount: 10000,
  rngSeed: "test-seed",
  probabilityTarget: 0.5,
  projectProbabilityTarget: 0.95,
  heuristicEnabled: false,
  heuristicMinPercent: 50,
  heuristicMaxPercent: 200,
  dependencyMode: false,
  parkinsonsLawEnabled: true,
};

const buffer: ScheduleBuffer = {
  deterministicTotal: 30,
  projectTargetDuration: 38,
  bufferDays: 8,
  activityProbabilityTarget: 0.5,
  projectProbabilityTarget: 0.95,
};

const dependencies: ActivityDependency[] = [
  { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
  { fromActivityId: "a1", toActivityId: "a3", type: "FS", lagDays: 2 },
  { fromActivityId: "a2", toActivityId: "a3", type: "FS", lagDays: -1 },
];

function makeParams(overrides?: Partial<ScheduleExportParams>): ScheduleExportParams {
  return {
    projectName: "My Project",
    scenarioName: "Baseline",
    activities,
    schedule,
    buffer,
    settings,
    dependencies: [],
    milestones: [],
    dateFormat: "MM/DD/YYYY",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// buildSummaryData
// ---------------------------------------------------------------------------

describe("buildSummaryData", () => {
  it("produces correct key-value pairs", () => {
    const summary = buildSummaryData(makeParams());
    const keys = summary.map((r) => r.key);
    expect(keys).toContain("Project");
    expect(keys).toContain("Scenario");
    expect(keys).toContain("Start Date");
    expect(keys).toContain("Finish (w/o Buffer)");
    expect(keys).toContain("Duration (w/o Buffer)");
    expect(keys).toContain("Finish (w/ Buffer)");
    expect(keys).toContain("Duration (w/ Buffer)");
    expect(keys).toContain("Activity Target");
    expect(keys).toContain("Project Target");
    expect(keys).toContain("Schedule Buffer");
    expect(keys).toContain("Dependency Mode");
    expect(keys).toContain("Exported");
  });

  it("shows project and scenario names", () => {
    const summary = buildSummaryData(makeParams());
    expect(summary.find((r) => r.key === "Project")!.value).toBe("My Project");
    expect(summary.find((r) => r.key === "Scenario")!.value).toBe("Baseline");
  });

  it("shows N/A when buffer is null", () => {
    const summary = buildSummaryData(makeParams({ buffer: null }));
    expect(summary.find((r) => r.key === "Schedule Buffer")!.value).toBe("N/A");
    expect(summary.find((r) => r.key === "Finish (w/ Buffer)")!.value).toBe("N/A");
    expect(summary.find((r) => r.key === "Duration (w/ Buffer)")!.value).toBe("N/A");
  });

  it("shows buffer days when buffer is present", () => {
    const summary = buildSummaryData(makeParams());
    expect(summary.find((r) => r.key === "Schedule Buffer")!.value).toBe("8 days");
  });

  it("formats targets as P-labels", () => {
    const summary = buildSummaryData(makeParams());
    expect(summary.find((r) => r.key === "Activity Target")!.value).toBe("P50");
    expect(summary.find((r) => r.key === "Project Target")!.value).toBe("P95");
  });

  it("shows dependency mode status", () => {
    const summary = buildSummaryData(makeParams());
    expect(summary.find((r) => r.key === "Dependency Mode")!.value).toBe("Off");

    const depSummary = buildSummaryData(
      makeParams({ settings: { ...settings, dependencyMode: true } })
    );
    expect(depSummary.find((r) => r.key === "Dependency Mode")!.value).toBe("On");
  });
});

// ---------------------------------------------------------------------------
// buildGridRows
// ---------------------------------------------------------------------------

describe("buildGridRows", () => {
  it("produces correct columns for sequential mode", () => {
    const rows = buildGridRows(makeParams());
    expect(rows).toHaveLength(3);

    // First row
    expect(rows[0]!.num).toBe(1);
    expect(rows[0]!.name).toBe("Design");
    expect(rows[0]!.min).toBe(5);
    expect(rows[0]!.mostLikely).toBe(10);
    expect(rows[0]!.max).toBe(20);
    expect(rows[0]!.confidence).toBe("Medium");
    expect(rows[0]!.distribution).toBe("LogNormal");
    expect(rows[0]!.status).toBe("Planned");
    expect(rows[0]!.duration).toBe(12);
    expect(rows[0]!.startDate).toBe("03/16/2026");
    expect(rows[0]!.endDate).toBe("03/31/2026");
  });

  it("omits predecessor/successor when dependency mode is off", () => {
    const rows = buildGridRows(makeParams());
    expect(rows[0]).not.toHaveProperty("predecessors");
    expect(rows[0]).not.toHaveProperty("successors");
  });

  it("shows actual only for complete or inProgress activities", () => {
    const rows = buildGridRows(makeParams());
    // planned activity
    expect(rows[0]!.actual).toBe("");
    // inProgress activity
    expect(rows[1]!.actual).toBe(3);
    // complete activity
    expect(rows[2]!.actual).toBe(8);
  });

  it("hides actual for planned even if actualDuration has a stale value", () => {
    const staleActivity = makeActivity({
      id: "a4",
      name: "Stale",
      status: "planned",
      actualDuration: 99,
    });
    const rows = buildGridRows(
      makeParams({
        activities: [staleActivity],
        schedule: {
          activities: [
            { activityId: "a4", name: "Stale", duration: 10, startDate: "2026-03-16", endDate: "2026-03-27", isActual: false },
          ],
          totalDurationDays: 10,
          projectEndDate: "2026-03-27",
        },
      })
    );
    expect(rows[0]!.actual).toBe("");
  });

  it("includes predecessor/successor columns for dependency mode", () => {
    const rows = buildGridRows(
      makeParams({
        dependencies,
        settings: { ...settings, dependencyMode: true },
      })
    );
    // a2 has predecessor a1 (index 1, FS, lag 0)
    expect(rows[1]!.predecessors).toBe("1FS");
    // a3 has predecessors a1 (index 1, FS, lag +2d) and a2 (index 2, FS, lag -1d)
    expect(rows[2]!.predecessors).toBe("1FS+2d, 2FS-1d");
    // a1 has successors a2 (index 2, FS, lag 0) and a3 (index 3, FS, lag +2d)
    expect(rows[0]!.successors).toBe("2FS, 3FS+2d");
  });

  it("formats dates according to dateFormat preference", () => {
    const rows = buildGridRows(makeParams({ dateFormat: "YYYY/MM/DD" }));
    expect(rows[0]!.startDate).toBe("2026/03/16");

    const rows2 = buildGridRows(makeParams({ dateFormat: "DD/MM/YYYY" }));
    expect(rows2[0]!.startDate).toBe("16/03/2026");
  });
});

// ---------------------------------------------------------------------------
// buildPredecessorMap / buildSuccessorMap
// ---------------------------------------------------------------------------

describe("buildPredecessorMap", () => {
  it("maps activity IDs to predecessor display strings", () => {
    const map = buildPredecessorMap(activities, dependencies);
    expect(map.get("a2")).toBe("1FS");
    expect(map.get("a3")).toBe("1FS+2d, 2FS-1d");
    expect(map.has("a1")).toBe(false);
  });
});

describe("buildSuccessorMap", () => {
  it("maps activity IDs to successor display strings", () => {
    const map = buildSuccessorMap(activities, dependencies);
    expect(map.get("a1")).toBe("2FS, 3FS+2d");
    expect(map.get("a2")).toBe("3FS-1d");
    expect(map.has("a3")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// exportScheduleCsv
// ---------------------------------------------------------------------------

describe("exportScheduleCsv", () => {
  it("produces valid CSV with summary block, blank row, headers, and data rows", () => {
    const csv = exportScheduleCsv(makeParams());
    const lines = csv.split("\n");

    // Summary block
    expect(lines[0]).toBe("Project,My Project");
    expect(lines[1]).toBe("Scenario,Baseline");

    // Blank separator
    const blankIndex = lines.indexOf("");
    expect(blankIndex).toBeGreaterThan(0);

    // Column headers follow blank line
    const headerLine = lines[blankIndex + 1]!;
    expect(headerLine).toContain("#");
    expect(headerLine).toContain("Activity Name");
    expect(headerLine).toContain("Duration (P50)");
    expect(headerLine).not.toContain("Predecessors");
  });

  it("includes predecessor/successor columns in dependency mode", () => {
    const csv = exportScheduleCsv(
      makeParams({
        dependencies,
        settings: { ...settings, dependencyMode: true },
      })
    );
    const lines = csv.split("\n");
    const blankIndex = lines.indexOf("");
    const headerLine = lines[blankIndex + 1]!;
    expect(headerLine).toContain("Predecessors");
    expect(headerLine).toContain("Successors");
  });

  it("handles CSV escaping for names with commas", () => {
    const csv = exportScheduleCsv(
      makeParams({
        activities: [makeActivity({ id: "a1", name: 'Design, Phase "1"' })],
        schedule: {
          activities: [
            { activityId: "a1", name: 'Design, Phase "1"', duration: 12, startDate: "2026-03-16", endDate: "2026-03-31", isActual: false },
          ],
          totalDurationDays: 12,
          projectEndDate: "2026-03-31",
        },
      })
    );
    expect(csv).toContain('"Design, Phase ""1"""');
  });

  it("guards against CSV formula injection characters", () => {
    // Each OWASP-dangerous prefix character should be neutralized with a single-quote prefix
    const dangerous = ["=SUM(A:A)", "+cmd|'/C calc'!A0", "@IMPORT(url)", "-2+3", "\tmalicious", "\rmalicious"];
    for (const name of dangerous) {
      const csv = exportScheduleCsv(
        makeParams({
          activities: [makeActivity({ id: "a1", name })],
          schedule: {
            activities: [
              { activityId: "a1", name, duration: 10, startDate: "2026-03-16", endDate: "2026-03-27", isActual: false },
            ],
            totalDurationDays: 10,
            projectEndDate: "2026-03-27",
          },
        })
      );
      // The data rows should contain the activity name prefixed with a single quote
      expect(csv).toContain(`'${name}`);
    }
  });

  it("includes totals row", () => {
    const csv = exportScheduleCsv(makeParams());
    const lines = csv.split("\n");
    const lastLine = lines[lines.length - 1]!;
    expect(lastLine).toContain("Total");
    // Total min = 5+5+5 = 15, ML = 10+10+10 = 30, Max = 20+20+20 = 60
    expect(lastLine).toContain(",15,");
    expect(lastLine).toContain(",30,");
  });
});

// ---------------------------------------------------------------------------
// exportScheduleXlsx
// ---------------------------------------------------------------------------

describe("exportScheduleXlsx", () => {
  it("returns a buffer with content", async () => {
    const result = await exportScheduleXlsx(makeParams());
    // ExcelJS returns Buffer in Node, ArrayBuffer in browser — both have byteLength
    expect(result.byteLength).toBeGreaterThan(0);
  });

  it("produces a valid XLSX with expected sheet name", async () => {
    const ExcelJS = await import("exceljs");
    const arrayBuffer = await exportScheduleXlsx(makeParams());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule");
    expect(ws).toBeDefined();
  });

  it("contains title row and summary data", async () => {
    const ExcelJS = await import("exceljs");
    const arrayBuffer = await exportScheduleXlsx(makeParams());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;

    // Title row
    expect(ws.getCell(1, 1).value).toBe("My Project — Baseline");

    // Summary keys
    expect(ws.getCell(2, 1).value).toBe("Project");
    expect(ws.getCell(2, 2).value).toBe("My Project");
  });

  it("has frozen pane at the column header row", async () => {
    const ExcelJS = await import("exceljs");
    const arrayBuffer = await exportScheduleXlsx(makeParams());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;

    // Summary has 12 rows + title row (1) + blank separator (1) = header at row 15
    // Views should have ySplit at the header row number
    expect(ws.views).toBeDefined();
    expect(ws.views.length).toBeGreaterThan(0);
    expect(ws.views[0]!.state).toBe("frozen");
    // ySplit exists on the frozen view type
    expect((ws.views[0] as { ySplit?: number }).ySplit).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Float column tests
// ---------------------------------------------------------------------------

describe("float columns in export", () => {
  const depSettings: ScenarioSettings = { ...settings, dependencyMode: true };
  const depSchedule: DeterministicSchedule = {
    activities: [
      { activityId: "a1", name: "Design", duration: 12, startDate: "2026-03-16", endDate: "2026-03-31", isActual: false, totalFloat: 0, freeFloat: 0 },
      { activityId: "a2", name: "Develop", duration: 10, startDate: "2026-04-01", endDate: "2026-04-14", isActual: false, totalFloat: 3, freeFloat: 1 },
      { activityId: "a3", name: "Test", duration: 8, startDate: "2026-04-15", endDate: "2026-04-24", isActual: true, totalFloat: 5, freeFloat: 5 },
    ],
    totalDurationDays: 30,
    projectEndDate: "2026-04-24",
  };
  const depParams: ScheduleExportParams = {
    projectName: "Float Test",
    scenarioName: "Baseline",
    activities,
    schedule: depSchedule,
    buffer,
    settings: depSettings,
    dependencies,
    milestones: [],
    dateFormat: "MM/DD/YYYY",
  };

  it("dependency mode CSV includes Total Float and Free Float columns", () => {
    const csv = exportScheduleCsv(depParams);
    const lines = csv.split("\n");
    const headerLine = lines.find((l) => l.startsWith("#,"));
    expect(headerLine).toBeDefined();
    expect(headerLine).toContain("Total Float (days)");
    expect(headerLine).toContain("Free Float (days)");
  });

  it("dependency mode CSV has correct float values", () => {
    const csv = exportScheduleCsv(depParams);
    const lines = csv.split("\n");
    const headerLine = lines.find((l) => l.startsWith("#,"))!;
    const headers = headerLine.split(",");
    const tfIdx = headers.indexOf("Total Float (days)");
    const ffIdx = headers.indexOf("Free Float (days)");
    expect(tfIdx).toBeGreaterThan(-1);
    expect(ffIdx).toBeGreaterThan(-1);

    // First data row (Design): totalFloat=0, freeFloat=0
    const dataLine = lines[lines.indexOf(headerLine) + 1]!;
    const cells = dataLine.split(",");
    expect(cells[tfIdx]).toBe("0");
    expect(cells[ffIdx]).toBe("0");
  });

  it("sequential mode CSV does NOT include float columns", () => {
    const seqParams: ScheduleExportParams = {
      ...depParams,
      settings,
      schedule,
    };
    const csv = exportScheduleCsv(seqParams);
    expect(csv).not.toContain("Total Float (days)");
    expect(csv).not.toContain("Free Float (days)");
  });

  it("buildGridRows includes float in dependency mode", () => {
    const rows = buildGridRows(depParams);
    expect(rows[0]!.totalFloat).toBe(0);
    expect(rows[0]!.freeFloat).toBe(0);
    expect(rows[1]!.totalFloat).toBe(3);
    expect(rows[1]!.freeFloat).toBe(1);
  });

  it("buildGridRows omits float in sequential mode", () => {
    const seqParams: ScheduleExportParams = {
      ...depParams,
      settings,
      schedule,
    };
    const rows = buildGridRows(seqParams);
    expect(rows[0]!.totalFloat).toBeUndefined();
    expect(rows[0]!.freeFloat).toBeUndefined();
  });
});
