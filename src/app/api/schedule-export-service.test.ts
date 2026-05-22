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
  xlsxSanitize,
  mixWithWhite,
} from "./schedule-export-service";
import type { ScheduleExportParams } from "./schedule-export-service";
import type {
  Activity,
  ActivityBand,
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

  it("returns empty confidence for triangular distribution", () => {
    const rows = buildGridRows(
      makeParams({
        activities: [makeActivity({ id: "a1", name: "Design", distributionType: "triangular" })],
        schedule: {
          activities: [
            { activityId: "a1", name: "Design", duration: 10, startDate: "2026-03-16", endDate: "2026-03-27", isActual: false },
          ],
          totalDurationDays: 10,
          projectEndDate: "2026-03-27",
        },
      })
    );
    expect(rows[0]!.confidence).toBe("");
  });

  it("returns empty confidence for uniform distribution", () => {
    const rows = buildGridRows(
      makeParams({
        activities: [makeActivity({ id: "a1", name: "Design", distributionType: "uniform" })],
        schedule: {
          activities: [
            { activityId: "a1", name: "Design", duration: 10, startDate: "2026-03-16", endDate: "2026-03-27", isActual: false },
          ],
          totalDurationDays: 10,
          projectEndDate: "2026-03-27",
        },
      })
    );
    expect(rows[0]!.confidence).toBe("");
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

// ---------------------------------------------------------------------------
// xlsxSanitize — formula injection guard for XLSX cells
// ---------------------------------------------------------------------------

describe("xlsxSanitize", () => {
  it.each(["=", "+", "-", "@", "\t", "\r"])("prefixes strings starting with '%s'", (ch) => {
    const input = `${ch}dangerous`;
    expect(xlsxSanitize(input)).toBe(`'${input}`);
  });

  it("passes safe strings unchanged", () => {
    expect(xlsxSanitize("Activity A")).toBe("Activity A");
    expect(xlsxSanitize("")).toBe("");
  });

  it("passes numbers unchanged", () => {
    expect(xlsxSanitize(42)).toBe(42);
    expect(xlsxSanitize(0)).toBe(0);
    expect(xlsxSanitize(-5)).toBe(-5);
  });
});

// ---------------------------------------------------------------------------
// mixWithWhite — known-value fixtures
// ---------------------------------------------------------------------------

describe("mixWithWhite", () => {
  it("blends red at 20% opacity to FFFFCCCC", () => {
    // R = round(255*0.2 + 255*0.8) = 255 = FF
    // G/B = round(0*0.2 + 255*0.8) = 204 = CC
    expect(mixWithWhite("#FF0000", 0.2)).toBe("FFFFCCCC");
  });

  it("blends black at 20% opacity to FFCCCCCC", () => {
    // All channels = round(0*0.2 + 255*0.8) = 204 = CC
    expect(mixWithWhite("#000000", 0.2)).toBe("FFCCCCCC");
  });

  it("blends 50% gray at 50% opacity to FFC0C0C0", () => {
    // round(128*0.5 + 255*0.5) = round(191.5) = 192 = C0
    expect(mixWithWhite("#808080", 0.5)).toBe("FFC0C0C0");
  });

  it("returns FFFFFFFF for white at any opacity", () => {
    // mix(255, x) = round(255*x + 255*(1-x)) = 255 for any x
    expect(mixWithWhite("#FFFFFF", 0.2)).toBe("FFFFFFFF");
  });
});

// ---------------------------------------------------------------------------
// CSV — bands / Type column
// ---------------------------------------------------------------------------

function makeBand(overrides: Partial<ActivityBand> & { id: string; name: string }): ActivityBand {
  return {
    insertBeforeActivityId: null,
    ...overrides,
  };
}

describe("exportScheduleCsv with bands", () => {
  function getHeaderLine(csv: string): string {
    const lines = csv.split("\n");
    const blankIndex = lines.indexOf("");
    return lines[blankIndex + 1]!;
  }

  function getDataLines(csv: string): string[] {
    const lines = csv.split("\n");
    const blankIndex = lines.indexOf("");
    // Lines after header, up to (but not including) the Totals row at the end
    return lines.slice(blankIndex + 2, lines.length - 1);
  }

  it("activity-only export has Type column last with Activity in every row", () => {
    const csv = exportScheduleCsv(makeParams({ bands: [] }));
    const headers = getHeaderLine(csv).split(",");
    expect(headers[headers.length - 1]).toBe("Type");
    const dataLines = getDataLines(csv);
    expect(dataLines).toHaveLength(3);
    for (const line of dataLines) {
      const cells = line.split(",");
      expect(cells[cells.length - 1]).toBe("Activity");
    }
    // Totals row column count must match header count
    const lines = csv.split("\n");
    const totalsCells = lines[lines.length - 1]!.split(",");
    expect(totalsCells).toHaveLength(headers.length);
  });

  it("sequential mode: Type column index === headers.length - 1; band rows have Section in last column, name in column 1, others blank", () => {
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "Phase 1", insertBeforeActivityId: "a1" }),
    ];
    const csv = exportScheduleCsv(makeParams({ bands }));
    const headers = getHeaderLine(csv).split(",");
    expect(headers[headers.length - 1]).toBe("Type");
    const dataLines = getDataLines(csv);
    // 3 activities + 1 band = 4
    expect(dataLines).toHaveLength(4);
    // First emitted row is the band (anchored before a1)
    const bandCells = dataLines[0]!.split(",");
    expect(bandCells[1]).toBe("Phase 1");
    expect(bandCells[bandCells.length - 1]).toBe("Section");
    // All other cells blank
    for (let i = 0; i < bandCells.length; i++) {
      if (i === 1 || i === bandCells.length - 1) continue;
      expect(bandCells[i]).toBe("");
    }
  });

  it("dependency mode: Type is last column, band rows correct in wider layout", () => {
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "Section A", insertBeforeActivityId: "a2" }),
    ];
    const csv = exportScheduleCsv(
      makeParams({
        bands,
        dependencies,
        settings: { ...settings, dependencyMode: true },
      })
    );
    const headers = getHeaderLine(csv).split(",");
    expect(headers[headers.length - 1]).toBe("Type");
    const dataLines = getDataLines(csv);
    // Order: a1, band, a2, a3
    const bandLine = dataLines[1]!.split(",");
    expect(bandLine[1]).toBe("Section A");
    expect(bandLine[bandLine.length - 1]).toBe("Section");
  });

  it("Totals row excludes bands and has Type column slot", () => {
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "Stage 1", insertBeforeActivityId: "a1" }),
    ];
    const csv = exportScheduleCsv(makeParams({ bands }));
    const lines = csv.split("\n");
    const totalsLine = lines[lines.length - 1]!;
    expect(totalsLine).toContain("Total");
    // Min+ML totals are computed across activities only (5+5+5=15, 10+10+10=30)
    expect(totalsLine).toContain(",15,");
    expect(totalsLine).toContain(",30,");
    const headers = getHeaderLine(csv).split(",");
    expect(totalsLine.split(",")).toHaveLength(headers.length);
  });

  it("band name with commas, quotes, and newlines round-trips through csvEscape", () => {
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: 'Stage "A", part 1\nnext line', insertBeforeActivityId: "a1" }),
    ];
    const csv = exportScheduleCsv(makeParams({ bands }));
    // csvEscape quotes the cell and doubles internal quotes
    expect(csv).toContain('"Stage ""A"", part 1\nnext line"');
  });

  it("band name starting with = is neutralized (formula-injection guard)", () => {
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "=SUM(A:A)", insertBeforeActivityId: "a1" }),
    ];
    const csv = exportScheduleCsv(makeParams({ bands }));
    expect(csv).toContain("'=SUM(A:A)");
  });

  it("Type cell for band rows is the literal string Section (no leading quote, no surrounding double-quotes)", () => {
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "Header", insertBeforeActivityId: "a1" }),
    ];
    const csv = exportScheduleCsv(makeParams({ bands }));
    const bandLine = getDataLines(csv)[0]!;
    const cells = bandLine.split(",");
    expect(cells[cells.length - 1]).toBe("Section");
  });

  it("two bands anchored to the same activity render in their original array order", () => {
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "First Header", insertBeforeActivityId: "a2" }),
      makeBand({ id: "b2", name: "Second Header", insertBeforeActivityId: "a2" }),
    ];
    const csv = exportScheduleCsv(makeParams({ bands }));
    const dataLines = getDataLines(csv);
    // Order: a1, b1, b2, a2, a3
    expect(dataLines[1]!.split(",")[1]).toBe("First Header");
    expect(dataLines[2]!.split(",")[1]).toBe("Second Header");
  });

  it("empty band name: Activity Name slot is empty string (not absent)", () => {
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "", insertBeforeActivityId: "a1" }),
    ];
    const csv = exportScheduleCsv(makeParams({ bands }));
    const bandLine = getDataLines(csv)[0]!;
    const cells = bandLine.split(",");
    expect(cells[1]).toBe("");
    expect(cells[cells.length - 1]).toBe("Section");
  });
});

// ---------------------------------------------------------------------------
// XLSX — bands / Type column
// ---------------------------------------------------------------------------

describe("exportScheduleXlsx with bands", () => {
  it("activity-only export has Type column with Activity in all data rows; no extra rows", async () => {
    const ExcelJS = await import("exceljs");
    const arrayBuffer = await exportScheduleXlsx(makeParams({ bands: [] }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;
    // Find header row by scanning column A for "#"
    let headerRow = -1;
    for (let r = 1; r <= 30; r++) {
      if (ws.getCell(r, 1).value === "#") { headerRow = r; break; }
    }
    expect(headerRow).toBeGreaterThan(0);
    // Last header column should be "Type"
    const lastCol = 17;
    expect(ws.getCell(headerRow, lastCol).value).toBe("Type");
    // Three activities → three data rows after header
    for (let i = 1; i <= 3; i++) {
      expect(ws.getCell(headerRow + i, lastCol).value).toBe("Activity");
    }
  });

  it("band row layout: position, name styling, type cell, blank data cells, no border on column 1", async () => {
    const ExcelJS = await import("exceljs");
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "Phase 1", insertBeforeActivityId: "a2", color: "#FF8800" }),
    ];
    const arrayBuffer = await exportScheduleXlsx(makeParams({ bands }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;
    let headerRow = -1;
    for (let r = 1; r <= 30; r++) {
      if (ws.getCell(r, 1).value === "#") { headerRow = r; break; }
    }
    const lastCol = 17;
    // Order: a1 (header+1), band (header+2), a2, a3
    const bandRowNum = headerRow + 2;
    const nameCell = ws.getCell(bandRowNum, 2);
    expect(nameCell.value).toBe("Phase 1");
    expect(nameCell.font?.bold).toBe(true);
    expect(nameCell.font?.size).toBe(13);

    // Type cell
    expect(ws.getCell(bandRowNum, lastCol).value).toBe("Section");

    // Data cells (3 to lastCol-1) should be null
    for (let c = 3; c < lastCol; c++) {
      expect(ws.getCell(bandRowNum, c).value).toBe(null);
    }

    // Column 1 — no sequence number
    expect(ws.getCell(bandRowNum, 1).value).toBe(null);
  });

  it("xlsxSanitize applied to band name with formula-leading character", async () => {
    const ExcelJS = await import("exceljs");
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "=SUM(A:A)", insertBeforeActivityId: "a1" }),
    ];
    const arrayBuffer = await exportScheduleXlsx(makeParams({ bands }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;
    let headerRow = -1;
    for (let r = 1; r <= 30; r++) {
      if (ws.getCell(r, 1).value === "#") { headerRow = r; break; }
    }
    // Band is anchored before a1 → directly after the header row
    expect(ws.getCell(headerRow + 1, 2).value).toBe("'=SUM(A:A)");
  });

  it("band row height is 20", async () => {
    const ExcelJS = await import("exceljs");
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "Heading", insertBeforeActivityId: "a1" }),
    ];
    const arrayBuffer = await exportScheduleXlsx(makeParams({ bands }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;
    let headerRow = -1;
    for (let r = 1; r <= 30; r++) {
      if (ws.getCell(r, 1).value === "#") { headerRow = r; break; }
    }
    const bandRowNum = headerRow + 1;
    const dataRow = ws.getRow(bandRowNum);
    expect(dataRow.height).toBeCloseTo(20, 0);
  });

  it("two bands anchored to the same activity render in their original array order", async () => {
    const ExcelJS = await import("exceljs");
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "First", insertBeforeActivityId: "a2" }),
      makeBand({ id: "b2", name: "Second", insertBeforeActivityId: "a2" }),
    ];
    const arrayBuffer = await exportScheduleXlsx(makeParams({ bands }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;
    let headerRow = -1;
    for (let r = 1; r <= 30; r++) {
      if (ws.getCell(r, 1).value === "#") { headerRow = r; break; }
    }
    // Order: a1, b1, b2, a2, a3 → rows: header+1=a1, header+2=b1, header+3=b2
    expect(ws.getCell(headerRow + 2, 2).value).toBe("First");
    expect(ws.getCell(headerRow + 3, 2).value).toBe("Second");
  });

  it("empty band name: nameCell.value is null (not empty string)", async () => {
    const ExcelJS = await import("exceljs");
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "", insertBeforeActivityId: "a1" }),
    ];
    const arrayBuffer = await exportScheduleXlsx(makeParams({ bands }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;
    let headerRow = -1;
    for (let r = 1; r <= 30; r++) {
      if (ws.getCell(r, 1).value === "#") { headerRow = r; break; }
    }
    expect(ws.getCell(headerRow + 1, 2).value).toBe(null);
  });

  it("with-color round-trip: fill, border-left medium, border color ARGB, font.bold, Type cell", async () => {
    const ExcelJS = await import("exceljs");
    const bandColor = "#3366FF";
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "Phase", insertBeforeActivityId: "a1", color: bandColor }),
    ];
    const arrayBuffer = await exportScheduleXlsx(makeParams({ bands }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;
    let headerRow = -1;
    for (let r = 1; r <= 30; r++) {
      if (ws.getCell(r, 1).value === "#") { headerRow = r; break; }
    }
    const bandRowNum = headerRow + 1;
    const loadedNameCell = ws.getCell(bandRowNum, 2);
    const lastCol = 17;

    expect(loadedNameCell.fill).toBeDefined();
    expect(loadedNameCell.border?.left).toBeDefined();

    const fill = loadedNameCell.fill as { fgColor?: { argb?: string } };
    expect(fill.fgColor?.argb?.toUpperCase()).toBe(mixWithWhite(bandColor, 0.2));

    expect(loadedNameCell.border?.left?.style).toBe("medium");
    expect(loadedNameCell.border?.left?.color?.argb?.toUpperCase()).toBe(
      "FF" + bandColor.replace(/^#/, "").toUpperCase()
    );

    expect(loadedNameCell.font?.bold).toBe(true);
    expect(ws.getCell(bandRowNum, lastCol).value).toBe("Section");

    const dataRow = ws.getRow(bandRowNum);
    expect(dataRow.height).toBeCloseTo(20, 0);
  });

  it("no-color round-trip: fill is gray fallback AND border-left is not medium (asserted conjunctively)", async () => {
    const ExcelJS = await import("exceljs");
    const bands: ActivityBand[] = [
      makeBand({ id: "b1", name: "Bare", insertBeforeActivityId: "a1" }),
    ];
    const arrayBuffer = await exportScheduleXlsx(makeParams({ bands }));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.getWorksheet("Schedule")!;
    let headerRow = -1;
    for (let r = 1; r <= 30; r++) {
      if (ws.getCell(r, 1).value === "#") { headerRow = r; break; }
    }
    const loadedNameCell = ws.getCell(headerRow + 1, 2);
    expect(loadedNameCell.fill).toBeDefined();
    const fill = loadedNameCell.fill as { fgColor?: { argb?: string } };
    expect(fill.fgColor?.argb?.toUpperCase()).toBe("FFF3F4F6");
    expect(loadedNameCell.border?.left?.style).not.toBe("medium");
  });
});
