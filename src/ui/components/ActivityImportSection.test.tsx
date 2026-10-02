// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Component tests for the Import Activities screen (v0.74.0) — the first for this component.
 *
 * What they pin: "Treat first row as data" reads the rows its preview was built from — a FILE's
 * rows, never the paste box (before v0.74.0 it re-read the box: nothing for an empty one, and for
 * a paste previewed earlier, that paste's rows, imported under a success message); the file
 * checks on that re-read; no empty import from the keyboard; plural words; column headings; the
 * local date; the heuristic preferences.
 *
 * ⚠️ Assertion hygiene: every name asserted below is a fixture's own, found nowhere in the
 * component's static text, so only a file or paste that was really read can satisfy it. The
 * imported activities are read from the `importProjects` call — the preview never lists a valid
 * row's name.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActivityImportSection } from "./ActivityImportSection";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useNotificationStore } from "@ui/hooks/use-notification-store";
import { createProject } from "@app/api/project-service";
import { DEFAULT_SCENARIO_SETTINGS, DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { Project } from "@domain/models/types";
import type { ImportApplyParams } from "@ui/hooks/use-project-store";
import type { ImportOutcome } from "@app/api/export-import-service";

// -- Fixtures -------------------------------------------------------------------

/** A file with no header row: the template's ten activities, in its column order. */
const HEADERLESS_ROWS = [
  "A1,Define Requirements,3,5,7,normal,Medium,planned,,Activity",
  "A2,Design Database,4,7,10,normal,High,planned,A1,Activity",
  "A3,Build API,5,10,30,logNormal,Low,planned,A2,Activity",
  "A4,Frontend Development,4,8,15,triangular,,planned,A2,Activity",
  "A5,Vendor Integration,3,8,25,logNormal,Very Low,planned,A3,Activity",
  'A6,Testing,3,5,10,triangular,,planned,"A3,A4",Activity',
  'A7,Security Review,2,2,5,uniform,,planned,"A5,A6",Activity',
  "A8,Code Review,1,2,3,normal,High,planned,A6,Activity",
  "A9,Data Migration,5,12,40,logNormal,Guesstimate,planned,A5,Activity",
  'A10,Deploy to Production,1,1,1,uniform,,planned,"A7,A8,A9",Activity',
];
const HEADERLESS_CSV = HEADERLESS_ROWS.join("\n");
const FILE_NAMES = [
  "Define Requirements",
  "Design Database",
  "Build API",
  "Frontend Development",
  "Vendor Integration",
  "Testing",
  "Security Review",
  "Code Review",
  "Data Migration",
  "Deploy to Production",
];

const HEADER_TSV = [
  "Activity ID",
  "Activity Name",
  "Optimistic (Min)",
  "Most Likely",
  "Pessimistic (Max)",
  "Distribution",
  "Confidence Level",
  "Status",
  "Predecessors",
].join("\t");
const PASTE_ROWS = [
  "P1\tPaste Alpha\t1\t2\t4\ttriangular\t\tplanned\t",
  "P2\tPaste Beta\t2\t3\t6\ttriangular\t\tplanned\tP1",
  "P3\tPaste Gamma\t1\t1\t2\tuniform\t\tplanned\tP2",
];
const PASTE_HEADED = [HEADER_TSV, ...PASTE_ROWS].join("\n");
const PASTE_HEADERLESS = PASTE_ROWS.join("\n");
const PASTE_NAMES = ["Paste Alpha", "Paste Beta", "Paste Gamma"];

const LONG_ROW_HEADERLESS =
  'This row has more cells than the template\'s ten columns. A cell that contains a comma — for example several predecessors, "A3,A4" — must be in quotes.';

const TREAT_FIRST_ROW = "Treat first row as data and assume default column order";

/** A CSV line as a spreadsheet copies it: its cells (a quoted cell kept whole), joined by tabs. */
function asPasted(line: string): string {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      cells.push(cell);
      cell = "";
    } else cell += ch;
  }
  cells.push(cell);
  return cells.join("\t");
}

// -- Harness --------------------------------------------------------------------

function renderSection(projects: Project[] = []) {
  const importProjects = vi.fn(
    (_params: ImportApplyParams): ImportOutcome => ({
      added: 1,
      replaced: 0,
      copied: 0,
      skipped: 0,
      driftSkipped: [],
      errors: [],
    })
  );
  const importScenarioToProject = vi.fn();
  render(
    <MemoryRouter>
      <ActivityImportSection
        projects={projects}
        importProjects={importProjects}
        importScenarioToProject={importScenarioToProject}
      />
    </MemoryRouter>
  );
  return { importProjects, importScenarioToProject };
}

function pasteBox(): HTMLTextAreaElement {
  return screen.getByLabelText("Paste spreadsheet data") as HTMLTextAreaElement;
}

function paste(text: string): void {
  fireEvent.change(pasteBox(), { target: { value: text } });
}

function pickFile(text: string, name: string): void {
  const file = new File([text], name, { type: "text/csv" });
  fireEvent.change(screen.getByLabelText("Activity import CSV file"), { target: { files: [file] } });
}

/** The preview's summary line, whitespace collapsed, or null when no preview shows. */
function summary(): string | null {
  const line = screen.queryByRole("status");
  return line ? (line.textContent ?? "").replace(/\s+/g, " ").trim() : null;
}

/**
 * The summary line's four counts. It reads the numbers only, so a test of something else does not
 * also pin the words beside them — those are the plurals test's.
 */
function counts() {
  const parts = (summary() ?? "").split(" · ").map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4) return null;
  const [activities, dependencies, errors, warnings] = parts;
  return { activities, dependencies, errors, warnings };
}

async function waitForCounts(activities: number, dependencies: number, errors: number, warnings: number) {
  await waitFor(() => expect(counts()).toEqual({ activities, dependencies, errors, warnings }));
}

async function treatFirstRowAsData(): Promise<void> {
  fireEvent.click(await screen.findByRole("button", { name: TREAT_FIRST_ROW }));
}

function commit(): void {
  fireEvent.click(screen.getByRole("button", { name: "Import Activities" }));
}

function scenarioNameInput(): HTMLInputElement {
  return screen.getByLabelText("Scenario Name") as HTMLInputElement;
}

/** The one project the import handed to the store. */
function importedProject(importProjects: ReturnType<typeof renderSection>["importProjects"]): Project {
  expect(importProjects).toHaveBeenCalledTimes(1);
  const project = importProjects.mock.calls[0]![0].importedProjects[0];
  if (!project) throw new Error("importProjects was called with no project");
  return project;
}

function importedNames(importProjects: ReturnType<typeof renderSection>["importProjects"]): string[] {
  return importedProject(importProjects).scenarios[0]!.activities.map((a) => a.name);
}

/** The preview table's cells for a row number, or null when that row is not listed. */
function previewRow(row: number): HTMLElement[] | null {
  for (const tr of screen.queryAllByRole("row")) {
    const cells = within(tr).queryAllByRole("cell");
    if (cells[0]?.textContent === String(row)) return cells;
  }
  return null;
}

function toastMessages(): string[] {
  return useNotificationStore.getState().notifications.map((n) => n.message);
}

beforeEach(() => {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES } });
  useNotificationStore.setState({ notifications: [] });
});

// -- Treat first row as data ------------------------------------------------------

// WI-91
describe("Treat first row as data reads the rows its preview was built from", () => {
  it("a headerless FILE, then the button: the file's own rows, named for the file", async () => {
    const { importProjects } = renderSection();
    pickFile(HEADERLESS_CSV, "no-header.csv");
    await screen.findByText("No recognizable header row found.");
    // Control: the file was read, and found to have no header row.
    expect(counts()).toEqual({ activities: 0, dependencies: 0, errors: 1, warnings: 0 });

    await treatFirstRowAsData();
    await waitForCounts(10, 13, 0, 0);
    expect(scenarioNameInput()).toHaveValue("no-header");
    commit();
    expect(importedNames(importProjects)).toEqual(FILE_NAMES);
  });

  it("a headed paste in the box, then a headerless FILE and the button: still the file's rows", async () => {
    const { importProjects } = renderSection();
    paste(PASTE_HEADED);
    // Control: the paste previews on its own — three valid rows.
    await waitForCounts(3, 2, 0, 0);

    pickFile(HEADERLESS_CSV, "no-header.csv");
    await screen.findByText("No recognizable header row found.");
    await treatFirstRowAsData();
    await waitForCounts(10, 13, 0, 0);
    // The box keeps what was pasted: the button no longer reads it, so nothing clears it.
    expect(pasteBox()).toHaveValue(PASTE_HEADED);
    commit();
    expect(importedNames(importProjects)).toEqual(FILE_NAMES);
  });

  it("a headerless paste previewed first, then a headerless FILE and the button: the FILE's rows are imported, not the paste's", async () => {
    const { importProjects } = renderSection();
    paste(PASTE_HEADERLESS);
    await screen.findByText("No recognizable header row found.");
    await treatFirstRowAsData();
    // Control: the paste's own button works — its three rows, valid, ready to import.
    await waitForCounts(3, 2, 0, 0);

    pickFile(HEADERLESS_CSV, "no-header.csv");
    await screen.findByText("No recognizable header row found.");
    await treatFirstRowAsData();
    await waitForCounts(10, 13, 0, 0);
    commit();
    const names = importedNames(importProjects);
    expect(names).toEqual(FILE_NAMES);
    expect(names.filter((n) => PASTE_NAMES.includes(n))).toEqual([]);
  });

  it("re-reading a FILE refuses a row longer than the template's ten columns; re-reading a paste does not", async () => {
    // Row 6 gains an eleventh cell. Its Type is still Activity, so only the row's length is wrong.
    const eleven = HEADERLESS_ROWS.map((r, i) => (i === 5 ? `${r},extra` : r));
    renderSection();
    pickFile(eleven.join("\n"), "eleven.csv");
    await screen.findByText("No recognizable header row found.");
    await treatFirstRowAsData();
    await waitFor(() => expect(previewRow(6)?.[3]).toHaveTextContent(LONG_ROW_HEADERLESS));
    expect(counts()).toEqual({ activities: 10, dependencies: 13, errors: 1, warnings: 0 });

    // Control: the same rows pasted. A paste splits on tabs only, so its re-read is not checked.
    paste(eleven.map(asPasted).join("\n"));
    await screen.findByText("No recognizable header row found.");
    await treatFirstRowAsData();
    await waitForCounts(10, 13, 0, 0);
  });
});

// -- No empty import ------------------------------------------------------------------

// WI-92 (c)
describe("the keyboard shortcut", () => {
  it("Ctrl+Enter on a header-only paste imports nothing and stores nothing; with one row it imports", async () => {
    const { importProjects, importScenarioToProject } = renderSection();
    paste(HEADER_TSV);
    await waitForCounts(0, 0, 0, 0);
    fireEvent.keyDown(pasteBox(), { key: "Enter", ctrlKey: true });
    expect(importProjects).not.toHaveBeenCalled();
    expect(importScenarioToProject).not.toHaveBeenCalled();
    expect(toastMessages()).toEqual([]);
    expect(screen.queryByText("No activities were imported.")).toBeNull();

    // Control: one row more, and the same keys import it.
    paste([HEADER_TSV, PASTE_ROWS[0]].join("\n"));
    await waitForCounts(1, 0, 0, 0);
    fireEvent.keyDown(pasteBox(), { key: "Enter", ctrlKey: true });
    expect(importedNames(importProjects)).toEqual(["Paste Alpha"]);
  });
});

// -- Plural words -------------------------------------------------------------------

// WI-95 (g)
describe("plural words", () => {
  it("the summary line says 1 activity, 1 dependency, 1 error, 1 warning — and the plural otherwise", async () => {
    renderSection();
    // G1 imports with a warning (a Status it does not know); G2's Min is not a number.
    paste([HEADER_TSV, "G1\tGlade One\t1\t2\t3\ttriangular\t\tsomeday\t", "G2\tGlade Two\tx\t2\t3\ttriangular\t\tplanned\t"].join("\n"));
    await waitFor(() => expect(summary()).toBe("1 activity · 0 dependencies · 1 error · 1 warning"));

    paste([HEADER_TSV, "G1\tGlade One\t1\t2\t3\ttriangular\t\tplanned\t", "G2\tGlade Two\t1\t2\t3\ttriangular\t\tplanned\tG1"].join("\n"));
    await waitFor(() => expect(summary()).toBe("2 activities · 1 dependency · 0 errors · 0 warnings"));

    // Each the other's predecessor: two dependencies, and a cycle. (One activity can never hold
    // a dependency, so "1 activity · 1 dependency" cannot be shown.)
    paste([HEADER_TSV, "G1\tGlade One\t1\t2\t3\ttriangular\t\tplanned\tG2", "G2\tGlade Two\t1\t2\t3\ttriangular\t\tplanned\tG1"].join("\n"));
    await waitFor(() => expect(summary()).toBe("2 activities · 2 dependencies · 1 error · 0 warnings"));

    // Control: two of each.
    paste(
      [
        HEADER_TSV,
        "G1\tGlade One\t1\t2\t3\ttriangular\t\tsomeday\t",
        "G2\tGlade Two\t1\t2\t3\ttriangular\t\tsomeday\t",
        "G3\tGlade Three\tx\t2\t3\ttriangular\t\tplanned\t",
        "G4\tGlade Four\tx\t2\t3\ttriangular\t\tplanned\t",
      ].join("\n")
    );
    await waitFor(() => expect(summary()).toBe("2 activities · 0 dependencies · 2 errors · 2 warnings"));
  });

  it("the toast says Imported 1 activity, and Imported 2 activities into an existing project", async () => {
    const existing = createProject("Existing Plan");
    const { importProjects, importScenarioToProject } = renderSection([existing]);
    paste([HEADER_TSV, PASTE_ROWS[0]].join("\n"));
    await waitForCounts(1, 0, 0, 0);
    commit();
    expect(importProjects).toHaveBeenCalledTimes(1);
    expect(toastMessages()).toEqual([
      expect.stringMatching(/^Imported 1 activity into new project "Imported — \d{4}-\d{2}-\d{2}"\.$/),
    ]);

    // Control: two activities, into the existing project — the other toast, in the plural.
    fireEvent.click(screen.getByRole("button", { name: "Import another" }));
    paste([HEADER_TSV, PASTE_ROWS[0], PASTE_ROWS[1]].join("\n"));
    await waitForCounts(2, 1, 0, 0);
    fireEvent.change(screen.getByLabelText("Add to project"), { target: { value: existing.id } });
    commit();
    expect(importScenarioToProject).toHaveBeenCalledTimes(1);
    expect(toastMessages()[1]).toBe('Imported 2 activities into "Existing Plan".');
  });
});

// -- Column headings ------------------------------------------------------------------

// WI-92 (d)
describe("the preview's column headings", () => {
  it("the third column is headed Column, and a schema failure's row shows the heading there, not the internal key", async () => {
    renderSection();
    // L1's Min is above its Most Likely: a schema failure, which names the field "min".
    // L2 names a predecessor that does not exist: the parser's own check, which names a heading.
    paste([HEADER_TSV, "L1\tLedger One\t5\t2\t9\ttriangular\t\tplanned\t", "L2\tLedger Two\t1\t2\t3\ttriangular\t\tplanned\tZ9"].join("\n"));
    await waitFor(() => expect(previewRow(3)).not.toBeNull());
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent?.trim())).toEqual([
      "Row",
      "Status",
      "Column",
      "Issue",
    ]);
    expect(previewRow(2)?.[2]).toHaveTextContent(/^Optimistic \(Min\)$/);
    // Control: the parser's own check, already a heading, is shown as it was.
    expect(previewRow(3)?.[2]).toHaveTextContent(/^Predecessors$/);
  });
});

// -- What the import creates ------------------------------------------------------------

// WI-92 (a) and (b)
describe("the scenario an import creates", () => {
  const TZ = process.env.TZ;

  afterEach(() => {
    vi.useRealTimers();
    process.env.TZ = TZ;
  });

  it("starts on, and is named for, the LOCAL date", async () => {
    // 20:38 on 1 October in New York is already 2 October in UTC.
    process.env.TZ = "America/New_York";
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-02T00:38:00Z"));
    // Control: at this instant, in this zone, the UTC date is tomorrow's.
    expect(new Date().toISOString().slice(0, 10)).toBe("2026-10-02");

    const { importProjects } = renderSection();
    paste([HEADER_TSV, PASTE_ROWS[0]].join("\n"));
    await waitForCounts(1, 0, 0, 0);
    expect(scenarioNameInput()).toHaveValue("Imported — 2026-10-01");
    commit();
    const project = importedProject(importProjects);
    expect(project.scenarios[0]!.startDate).toBe("2026-10-01");
    expect(project.name).toBe("Imported — 2026-10-01");
  });

  it("takes the three heuristic preferences, as a new project does", async () => {
    // Non-default values. The defaults are false / 75 / 200 in BOTH the scenario settings and the
    // preferences, so a default fixture would pass against code that ignored the preferences.
    const defaults = DEFAULT_SCENARIO_SETTINGS;
    expect([defaults.heuristicEnabled, defaults.heuristicMinPercent, defaults.heuristicMaxPercent]).toEqual([false, 75, 200]);
    usePreferencesStore.setState({
      preferences: {
        ...DEFAULT_USER_PREFERENCES,
        defaultHeuristicEnabled: true,
        defaultHeuristicMinPercent: 60,
        defaultHeuristicMaxPercent: 180,
      },
    });

    const { importProjects } = renderSection();
    paste([HEADER_TSV, PASTE_ROWS[0]].join("\n"));
    await waitForCounts(1, 0, 0, 0);
    commit();
    const { settings } = importedProject(importProjects).scenarios[0]!;
    expect([settings.heuristicEnabled, settings.heuristicMinPercent, settings.heuristicMaxPercent]).toEqual([true, 60, 180]);
  });
});
