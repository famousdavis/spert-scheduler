// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-58 — while this screen's Run is refused (a flagged row, or a cell the grid would not store),
 * the summary card's export tooltip and its buffer line name the fixes first, instead of asking for
 * a run the Run button refuses. The words are the owner's (2026-09-27); written out, never computed.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import { createActivity } from "@app/api/project-service";
import { computeSchedule } from "@app/api/schedule-service";
import { computeScheduleBuffer } from "@core/schedule/buffer";
import { ScenarioSummaryCard } from "./ScenarioSummaryCard";

afterEach(cleanup);

const SETTINGS = { ...DEFAULT_SCENARIO_SETTINGS, rngSeed: "run-blocked" };
const START = "2026-01-05";
const ACTIVITY = { ...createActivity("Survey", SETTINGS), min: 5, mostLikely: 10, max: 20 };

function renderCard({ runBlocked, run }: { runBlocked: boolean; run: boolean }) {
  const onRunSimulation = vi.fn();
  const schedule = run ? computeSchedule([ACTIVITY], START, SETTINGS.probabilityTarget) : null;
  const buffer =
    run && schedule
      ? computeScheduleBuffer(schedule.spanDays, { 50: 10, 75: 12, 90: 14, 95: 16 }, SETTINGS.probabilityTarget, SETTINGS.projectProbabilityTarget)
      : null;
  render(
    <ScenarioSummaryCard
      startDate={START}
      schedule={schedule}
      buffer={buffer}
      settings={SETTINGS}
      hasSimulationResults={run}
      runBlocked={runBlocked}
      onSettingsChange={vi.fn()}
      onStartDateChange={vi.fn()}
      onNewSeed={vi.fn()}
      projectName="Card"
      scenarioName="S"
      activities={[ACTIVITY]}
      bands={[]}
      dependencies={[]}
      milestones={[]}
      onRunSimulation={onRunSimulation}
    />
  );
  return onRunSimulation;
}

const titles = () => [screen.getByRole("button", { name: "XLSX" }).title, screen.getByRole("button", { name: "CSV" }).title];

describe("the summary card while this screen's Run is refused", () => {
  it("W7: both export buttons say to fix the validation errors first", () => {
    renderCard({ runBlocked: true, run: false });
    expect(titles()).toEqual([
      "Fix the validation errors, then run the simulation to enable export",
      "Fix the validation errors, then run the simulation to enable export",
    ]);
  });

  it("W8: the buffer line names the fixes, with the link kept on 'run the simulation' (P-f)", () => {
    const onRun = renderCard({ runBlocked: true, run: false });
    const link = screen.getByRole("button", { name: "run the simulation" });
    expect(link.parentElement!.textContent).toBe(
      "Fix the validation errors, then run the simulation to calculate the schedule buffer"
    );
    fireEvent.click(link); // the page's handler refuses with WI-53's toast; the link still reaches it
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it("CONTROL: with Run open, today's words", () => {
    renderCard({ runBlocked: false, run: false });
    expect(titles()).toEqual(["Run simulation first to enable export", "Run simulation first to enable export"]);
    const link = screen.getAllByRole("button", { name: "Run simulation" })[0]!;
    expect(link.parentElement!.textContent).toBe("Run simulation to calculate schedule buffer");
    expect(screen.queryByText(/Fix the validation errors/)).toBeNull();
  });

  it("a RUN scenario shows none of the three, refused or not (S4: its results are kept)", () => {
    renderCard({ runBlocked: true, run: true });
    expect(titles()).toEqual(["Download as formatted Excel file", "Download as CSV file"]);
    expect(screen.getByText("Schedule Buffer:")).toBeDefined(); // non-vacuity: the buffer is shown
    expect(document.body.textContent).not.toContain("Fix the validation errors");
  });
});
