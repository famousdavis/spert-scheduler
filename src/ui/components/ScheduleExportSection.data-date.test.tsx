// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ScheduleExportSection } from "./ScheduleExportSection";
import { downloadFile } from "@ui/helpers/download";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import type { Activity, Project, Scenario, SimulationRun } from "@domain/models/types";

vi.mock("@ui/helpers/download", () => ({ downloadFile: vi.fn(), sanitizeFilename: (s: string) => s }));

/**
 * WI-154 — Settings' schedule export reads today as the project page does (Review 35, verification
 * G5), and leaves out results simulated on an earlier data date, naming them (owner, R639, decision
 * 3). Done (Complete, recorded, 10/05 – 10/09) then Next (5 days, not started), dependencies on.
 * Today Tue 10/27: Next starts today — by its link alone it would start Mon 10/12.
 */
const act5 = (id: string, overrides: Partial<Activity> = {}): Activity => ({
  id, name: id, min: 5, mostLikely: 5, max: 5, confidenceLevel: "mediumConfidence", distributionType: "uniform", status: "planned", ...overrides,
});
const run = (day: number): SimulationRun => ({
  id: "r", timestamp: new Date(2026, 9, day, 15, 0, 0).toISOString(), trialCount: 1000, seed: "s", engineVersion: "1.1.1",
  percentiles: { 50: 20, 95: 22 }, histogramBins: [], mean: 20, standardDeviation: 1, minSample: 20, maxSample: 22, samples: [20, 22],
});
const scenario = (id: string, day: number): Scenario => ({
  id, name: id, startDate: "2026-10-05", milestones: [], simulationResults: run(day),
  activities: [act5("Done", { status: "complete", actualStartDate: "2026-10-05", actualFinishDate: "2026-10-09", actualDuration: 5 }), act5("Next")],
  dependencies: [{ fromActivityId: "Done", toActivityId: "Next", type: "FS", lagDays: 0 }],
  settings: { ...DEFAULT_SCENARIO_SETTINGS, dependencyMode: true, probabilityTarget: 0.5 },
} as Scenario);
const PROJECT = { id: "p1", name: "Osprey", scenarios: [scenario("Fresh", 27), scenario("Old", 26)] } as unknown as Project;

beforeEach(() => {
  vi.useFakeTimers({ now: new Date("2026-10-27T12:00:00"), toFake: ["Date"] });
  usePreferencesStore.setState((st) => ({ preferences: { ...st.preferences, dateFormat: "MM/DD/YYYY" } }));
  useProjectStore.setState({ projects: [PROJECT], loadError: false });
  vi.mocked(downloadFile).mockClear();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("the schedule export, with a data date", () => {
  it("offers only the current results, and names the rest", () => {
    const { container } = render(<ScheduleExportSection projects={[PROJECT]} />);
    fireEvent.change(container.querySelector('select[name="exportProjectId"]')!, { target: { value: "p1" } });
    const options = Array.from(container.querySelectorAll('select[name="exportScenarioId"] option')).map((o) => o.textContent);
    expect(options).toEqual(["Select a scenario…", "Fresh — 10/05/2026"]);
    expect(screen.getByText(
      "The last simulation of Old was run on an earlier day. Work that has not started is now scheduled no earlier than 10/27/2026, so run it again before exporting.",
    )).toBeTruthy();
  });

  it("schedules work that has not started from today: Next 10/27 – 11/02, its Planned dates the plan's 10/12 – 10/16 (owner, Q1)", () => {
    const { container } = render(<ScheduleExportSection projects={[PROJECT]} />);
    fireEvent.change(container.querySelector('select[name="exportProjectId"]')!, { target: { value: "p1" } });
    fireEvent.change(container.querySelector('select[name="exportScenarioId"]')!, { target: { value: "Fresh" } });
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    const csv = String(vi.mocked(downloadFile).mock.calls[0]![0]);
    const next = csv.split("\n").find((line) => line.includes("Next"))!;
    // Start and End from today; Planned Start and Finish from the plan before today's floor (Q1).
    expect(["10/27/2026", "11/02/2026", "10/12/2026", "10/16/2026"].map((d) => next.includes(d))).toEqual([true, true, true, true]);
  });
});
