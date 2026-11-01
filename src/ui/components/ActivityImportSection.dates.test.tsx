// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ActivityImportSection } from "./ActivityImportSection";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { useProjectStore, type ImportApplyParams } from "@ui/hooks/use-project-store";
import type { ImportOutcome } from "@app/api/export-import-service";
import { createProject } from "@app/api/project-service";
import type { Project, Scenario } from "@domain/models/types";

// WI-150 — the preview says what the import does with the file's dates, and the commit counts from them.
// Expected values are written out by hand.

const HEADER = ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status",
  "Planned Start", "Planned Finish", "Actual Start", "Actual Finish"].join("\t");
const ROWS = [
  ["A1", "Design", "2", "3", "5", "", "Complete", "10/05/2026", "10/08/2026", "10/05/2026", "10/09/2026"],
  ["A2", "Build", "5", "8", "12", "", "In Progress", "10/12/2026", "10/23/2026", "10/13/2026", ""],
  ["A3", "Test", "3", "5", "9", "", "Planned", "11/02/2026", "11/13/2026", "", ""],
].map((r) => r.join("\t"));

function renderSection() {
  const importProjects = vi.fn(
    (_params: ImportApplyParams): ImportOutcome => ({ added: 1, replaced: 0, copied: 0, skipped: 0, driftSkipped: [], errors: [] }),
  );
  render(
    <MemoryRouter>
      <ActivityImportSection projects={[]} importProjects={importProjects} importScenarioToProject={vi.fn()} />
    </MemoryRouter>,
  );
  return importProjects;
}

describe("Import Activities with dates (WI-150)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 30, 12)); // Friday 30 October 2026, local time
    usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat: "MM/DD/YYYY" } });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("says where the scenario starts and that the not-started row's Planned dates were not imported", async () => {
    renderSection();
    fireEvent.change(screen.getByLabelText("Paste spreadsheet data"), { target: { value: [HEADER, ...ROWS].join("\n") } });
    const list = await waitFor(() => screen.getByRole("list", { name: "About the dates" }));
    expect(Array.from(list.querySelectorAll("li"), (li) => li.textContent?.replace(/\s+/g, " ").trim())).toEqual([
      "The scenario will start on 10/05/2026, the earliest Actual Start, rather than today.",
      "Planned Start and Planned Finish were not imported for 1 activity that has not started (Status Planned). Scheduler schedules these activities itself, and keeps an activity's Planned Start and Planned Finish from its own plan when the activity starts.",
    ]);
  });

  it("commits a scenario that starts on the earliest Actual Start, with each started row's count from its dates", async () => {
    const importProjects = renderSection();
    fireEvent.change(screen.getByLabelText("Paste spreadsheet data"), { target: { value: [HEADER, ...ROWS].join("\n") } });
    const button = await waitFor(() => screen.getByRole("button", { name: "Import Activities" }));
    fireEvent.click(button);
    expect(importProjects).toHaveBeenCalledTimes(1);
    const scenario = importProjects.mock.calls[0]![0].importedProjects[0]!.scenarios[0]!;
    expect(scenario.startDate).toBe("2026-10-05");
    expect(scenario.activities.map((a) => [a.status, a.actualStartDate, a.actualFinishDate, a.actualDuration])).toEqual([
      ["complete", "2026-10-05", "2026-10-09", 5], // Mon 5 → Fri 9 October, both counted
      ["inProgress", "2026-10-13", undefined, 14], // Tue 13 → Fri 30 October, both counted
      ["planned", undefined, undefined, undefined],
    ]);
    expect(scenario.activities.map((a) => [a.plannedStartDate, a.plannedFinishDate])).toEqual([
      ["2026-10-05", "2026-10-08"],
      ["2026-10-12", "2026-10-23"],
      [undefined, undefined],
    ]);
  });

  it("a file with no dates still starts the scenario today and shows no date notes", async () => {
    const importProjects = renderSection();
    const plain = ["Activity ID\tActivity Name\tMin\tMost Likely\tMax\tConfidence Level", "A1\tDesign\t2\t3\t5\t"].join("\n");
    fireEvent.change(screen.getByLabelText("Paste spreadsheet data"), { target: { value: plain } });
    const button = await waitFor(() => screen.getByRole("button", { name: "Import Activities" }));
    expect(screen.queryByRole("list", { name: "About the dates" })).toBeNull();
    fireEvent.click(button);
    expect(importProjects.mock.calls[0]![0].importedProjects[0]!.scenarios[0]!.startDate).toBe("2026-10-30");
  });
});

// -- The build's fixes (Review 34; owner, R636) --------------------------------------------------------

const paste = (lines: string[]) =>
  fireEvent.change(screen.getByLabelText("Paste spreadsheet data"), { target: { value: lines.join("\n") } });
const dateLines = () => {
  const list = screen.queryByRole("list", { name: "About the dates" });
  return list ? Array.from(list.querySelectorAll("li"), (li) => li.textContent?.replace(/\s+/g, " ").trim()) : [];
};
const committedScenario = (importProjects: ReturnType<typeof renderSection>) =>
  importProjects.mock.calls[0]![0].importedProjects[0]!.scenarios[0]!;
const ONE_DATE_HEADER = ["Activity ID", "Activity Name", "Min", "Most Likely", "Max", "Confidence Level", "Status", "Actual Start"].join("\t");

describe("Import Activities with dates — the build's fixes", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 30, 12)); // Friday 30 October 2026, local time
    usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat: "MM/DD/YYYY" } });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("no date lines, and no Import button, while an error blocks the import (V-G1)", async () => {
    renderSection();
    paste([HEADER, ...ROWS, ["A4", "Late", "2", "3", "5", "", "In Progress", "", "", "11/14/2026", ""].join("\t")]);
    await waitFor(() => screen.getByText(/is after today/));
    expect(screen.queryByRole("list", { name: "About the dates" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Import Activities" })).toBeNull();
  });

  it("no Start Date line when the earliest Actual Start is today (V-E5); the scenario starts today", async () => {
    const importProjects = renderSection();
    paste([ONE_DATE_HEADER, ["A1", "Design", "2", "3", "5", "", "In Progress", "10/30/2026"].join("\t")]);
    const button = await waitFor(() => screen.getByRole("button", { name: "Import Activities" }));
    expect(dateLines()).toEqual([]);
    fireEvent.click(button);
    expect(committedScenario(importProjects).startDate).toBe("2026-10-30");
  });

  it("the date lines sit inside the live region with the counts (I-W8)", async () => {
    renderSection();
    paste([HEADER, ...ROWS]);
    const list = await waitFor(() => screen.getByRole("list", { name: "About the dates" }));
    expect(list.closest('[role="status"]')).toBe(screen.getByRole("status"));
    expect(screen.getByRole("status").textContent).toMatch(/^3 activities · 0 dependencies · 0 errors · 0 warnings/);
  });

  it("a recorded date on a non-working day: one line says the schedule moves it (I-F4)", async () => {
    renderSection();
    paste([ONE_DATE_HEADER, ["A1", "Design", "2", "3", "5", "", "In Progress", "10/10/2026"].join("\t")]); // a Saturday
    await waitFor(() => screen.getByRole("list", { name: "About the dates" }));
    expect(dateLines()).toEqual([
      "The scenario will start on 10/10/2026, the earliest Actual Start, rather than today.",
      "1 recorded date falls on a day that is not a working day. The schedule starts such an activity on the next working day, or ends it on the last working day before, and does not show that date in green.",
    ]);
  });

  it("a paste is read in the user's Date Format: 05/10/2026 is 5 October for a DD/MM user (V-G5)", async () => {
    usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat: "DD/MM/YYYY" } });
    const importProjects = renderSection();
    paste([ONE_DATE_HEADER, ["A1", "Design", "2", "3", "5", "", "In Progress", "05/10/2026"].join("\t")]);
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Import Activities" })));
    expect(committedScenario(importProjects).activities[0]!.actualStartDate).toBe("2026-10-05");
  });

  const csv = ["Activity ID,Activity Name,Min,Most Likely,Max,Confidence Level,Status,Actual Start", "A1,Design,2,3,5,,In Progress,05/10/2026"].join("\n");
  const upload = () =>
    fireEvent.change(screen.getByLabelText("Activity import CSV file"), {
      target: { files: [new File([csv], "plan.csv", { type: "text/csv" })] },
    });

  it("a file is read in the user's Date Format: 05/10/2026 is 5 October for a DD/MM user (V-G5)", async () => {
    usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat: "DD/MM/YYYY" } });
    const importProjects = renderSection();
    upload();
    fireEvent.click(await waitFor(() => screen.getByRole("button", { name: "Import Activities" })));
    expect(committedScenario(importProjects).activities[0]!.actualStartDate).toBe("2026-10-05");
  });

  it("a file's preview is read again when the Date Format changes, as a paste's is (I-W11)", async () => {
    usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat: "DD/MM/YYYY" } });
    const importProjects = renderSection();
    upload();
    await waitFor(() => screen.getByRole("button", { name: "Import Activities" }));
    act(() => usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat: "MM/DD/YYYY" } }));
    fireEvent.click(screen.getByRole("button", { name: "Import Activities" }));
    expect(committedScenario(importProjects).activities[0]!.actualStartDate).toBe("2026-05-10");
  });
});

describe("Add to project: the dates, counted on the TARGET project's calendar (Review 34, I-W6 = V-G3)", () => {
  let target: Project;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 30, 12)); // Friday 30 October 2026, local time
    usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, dateFormat: "MM/DD/YYYY" } });
    target = {
      ...createProject("Existing", "2026-11-02"),
      globalCalendarOverride: { holidays: [{ id: "h1", name: "Hol", startDate: "2026-10-15", endDate: "2026-10-15" }] },
    };
    useProjectStore.setState({ projects: [target] });
  });
  afterEach(() => {
    vi.useRealTimers();
    useProjectStore.setState({ projects: [] });
  });

  it("the new scenario starts on the earliest Actual Start, and the target's holiday is not counted", async () => {
    const importScenarioToProject = vi.fn((_projectId: string, _scenario: Scenario) => undefined);
    render(
      <MemoryRouter>
        <ActivityImportSection projects={[target]} importProjects={vi.fn()} importScenarioToProject={importScenarioToProject} />
      </MemoryRouter>,
    );
    paste([HEADER, ...ROWS]);
    const button = await waitFor(() => screen.getByRole("button", { name: "Import Activities" }));
    fireEvent.change(screen.getByLabelText("Add to project"), { target: { value: target.id } });
    fireEvent.click(button);
    expect(importScenarioToProject).toHaveBeenCalledTimes(1);
    const [projectId, scenario] = importScenarioToProject.mock.calls[0]!;
    expect(projectId).toBe(target.id);
    expect(scenario.startDate).toBe("2026-10-05");
    expect(scenario.activities.map((a) => a.actualDuration)).toEqual([
      5, // Mon 5 → Fri 9 October
      13, // Tue 13 → Fri 30 October, both counted, less the holiday on Thu 15 October
      undefined,
    ]);
  });
});
