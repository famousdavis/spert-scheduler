// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, renderHook, screen, cleanup } from "@testing-library/react";

import { MilestonePanel } from "./MilestonePanel";
import { ScenarioSummaryCard } from "./ScenarioSummaryCard";
import { PrintMilestonesTable } from "./print-sections";
import { createScenario } from "@app/api/project-service";
import { useMilestoneBuffers } from "@ui/hooks/use-milestone-buffers";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import type {
  Activity,
  Milestone,
  MilestoneBufferInfo,
  MilestoneNoHealthReason,
  ScheduledActivity,
  SimulationRun,
} from "@domain/models/types";

/**
 * A milestone with no result shows NO health — a grey dash, no health colour and no word — on the
 * summary card, the Milestones panel and the printed report (v0.70.3; owner, 2026-09-19). Until
 * then "no result" and "5 or more days ahead" shared the green branch, so an unrun milestone read
 * healthy, and an edit that cleared the results turned a Late milestone On Track until the next run.
 *
 * ⚠️ Every map below is built by the REAL hook from real inputs, not written by hand. The defect
 * lived in the hook and in computeMilestoneHealth, so a hand-built "none" would let a surface row
 * pass with the defect planted back. Built this way, the whole chain is under test.
 *
 * ⚠️ The five cases are four states: "never run" and "cleared by an edit" are the same state —
 * no results — and nothing on screen can or should tell them apart. The panel and print exist
 * only in dependency mode, so "dependencies-off" is tested on the card, the one surface that
 * still lists milestones then.
 */

afterEach(cleanup);

/** Every health word any surface has ever shown, retired ones included. */
const EVERY_WORD = ["On Track", "At Risk", "Late", "Healthy", "Warning", "Over"];
const wordsIn = (text: string | null | undefined) =>
  EVERY_WORD.filter((w) => new RegExp(`\\b${w}\\b`).test(text ?? ""));

// The draft wording (the owner rules it); pinned here independently of format-labels.ts.
const HINT: Record<MilestoneNoHealthReason, string> = {
  "no-results": "Run the simulation to see this milestone's health",
  "no-activities": "Assign activities to this milestone before its health can be shown",
  "unlisted-target": "Choose a Project target from the list before this milestone's health can be shown",
  "dependencies-off": "Turn on Dependencies before this milestone's health can be shown",
};

// Hand-derived, as in use-milestone-buffers.test.ts: 2026-04-06 is a Monday; the activity ends
// 2026-04-15, a deterministic duration of 8; P95 = 12 gives a buffer of 4, a buffered end of
// 2026-04-21 and, against a 2026-04-24 target, 3 working days of slack — amber, "At Risk".
const START = "2026-04-06";
const GATE: Milestone = { id: "m1", name: "Design Gate", targetDate: "2026-04-24" };
const ASSIGNED: Activity = {
  id: "a1",
  name: "Discovery",
  min: 3,
  mostLikely: 5,
  max: 10,
  confidenceLevel: "mediumConfidence",
  distributionType: "normal",
  status: "planned",
  milestoneId: "m1",
};
const SCHEDULED: ScheduledActivity[] = [
  { activityId: "a1", name: "Discovery", duration: 8, startDate: START, endDate: "2026-04-15", isActual: false },
];
// Only milestoneResults is read by the hook; the rest of a run is not fabricated.
const RUN = { milestoneResults: { m1: { percentiles: { 95: 12 }, mean: 0, standardDeviation: 0 } } } as unknown as SimulationRun;
// What a run in sequential mode leaves: results, but no milestone entries.
const SEQUENTIAL_RUN = { milestoneResults: undefined } as unknown as SimulationRun;

interface Situation {
  activities: Activity[];
  results: SimulationRun | undefined;
  target: number;
  dependencyMode: boolean;
}

const MEASURED: Situation = { activities: [ASSIGNED], results: RUN, target: 0.95, dependencyMode: true };

const NO_HEALTH: { reason: MilestoneNoHealthReason; cases: string; situation: Situation }[] = [
  {
    reason: "no-results",
    cases: "never run, or results cleared by an edit",
    situation: { ...MEASURED, results: undefined },
  },
  { reason: "no-activities", cases: "nothing assigned to it", situation: { ...MEASURED, activities: [] } },
  {
    reason: "unlisted-target",
    cases: "a Project target the simulation keeps no percentile for, after a run",
    situation: { ...MEASURED, target: 0.93 },
  },
  {
    reason: "dependencies-off",
    cases: "dependency mode off, after a run",
    situation: { ...MEASURED, results: SEQUENTIAL_RUN, dependencyMode: false },
  },
];
const DEPENDENCY_MODE_CASES = NO_HEALTH.filter((c) => c.reason !== "dependencies-off");

function buffersFor(s: Situation): Map<string, MilestoneBufferInfo> {
  return renderHook(() =>
    useMilestoneBuffers([GATE], SCHEDULED, s.activities, s.results, START, s.target, s.dependencyMode),
  ).result.current!;
}

function renderCard(s: Situation) {
  return render(
    <ScenarioSummaryCard
      startDate={START}
      schedule={null}
      buffer={null}
      settings={{ ...DEFAULT_SCENARIO_SETTINGS, rngSeed: "no-health", dependencyMode: s.dependencyMode }}
      hasSimulationResults={s.results !== undefined}
      onSettingsChange={vi.fn()}
      onStartDateChange={vi.fn()}
      onNewSeed={vi.fn()}
      projectName="No health"
      scenarioName="Baseline"
      activities={s.activities}
      bands={[]}
      dependencies={[]}
      milestones={[GATE]}
      milestoneBuffers={buffersFor(s)}
    />,
  );
}

function renderPanel(s: Situation) {
  return render(
    <MilestonePanel
      milestones={[GATE]}
      activities={s.activities}
      milestoneBuffers={buffersFor(s)}
      onAddMilestone={vi.fn()}
      onRemoveMilestone={vi.fn()}
      onUpdateMilestone={vi.fn()}
      onAssignActivity={vi.fn()}
      onSetStartsAt={vi.fn()}
    />,
  );
}

function renderPrint(s: Situation) {
  const base = createScenario("Baseline", START);
  const scenario = { ...base, milestones: [GATE], settings: { ...base.settings, dependencyMode: true } };
  return render(<PrintMilestonesTable scenario={scenario} milestoneBuffers={buffersFor(s)} formatDate={(iso) => iso} />);
}

// The pieces each surface is read by.
const cardRow = () => screen.getByText(GATE.name).parentElement!;
const panelRow = () => screen.getByDisplayValue(GATE.name).parentElement!;
const printHealthCell = () => screen.getByText(GATE.name).closest("tr")!.lastElementChild!;

describe("PARTNER — the same milestone, measured, still reads its word everywhere", () => {
  // Without these rows every "shows no word" assertion below would also pass on a surface that
  // had stopped naming health altogether.
  it("on the card", () => {
    renderCard(MEASURED);
    expect(wordsIn(cardRow().textContent)).toEqual(["At Risk"]);
  });

  it("on the panel", () => {
    renderPanel(MEASURED);
    expect(wordsIn(panelRow().textContent)).toEqual(["At Risk"]);
  });

  it("in print", () => {
    renderPrint(MEASURED);
    expect(wordsIn(printHealthCell().textContent)).toEqual(["At Risk"]);
  });
});

describe("the summary card, with no result", () => {
  it.each(NO_HEALTH)("$reason ($cases): a grey dot and dash, no word, and the reason as its hint", ({ reason, situation }) => {
    renderCard(situation);
    const row = cardRow();
    expect(wordsIn(row.textContent)).toEqual([]);
    expect(row.querySelector("span.rounded-full")!.className).toContain("bg-gray-400");

    const mark = row.lastElementChild as HTMLElement;
    expect(mark.title).toBe(HINT[reason]);
    expect(mark.className).toContain("text-gray-500");
    expect(mark.querySelector('[aria-hidden="true"]')!.textContent).toBe("—");
    expect(mark.querySelector(".sr-only")!.textContent).toBe(HINT[reason]);
    // The italic "Run simulation" it replaced is gone — it was false for three of these reasons.
    expect(row.textContent).not.toContain("Run simulation");
  });
});

describe("the Milestones panel, with no result", () => {
  it.each(DEPENDENCY_MODE_CASES)("$reason ($cases): a grey dash badge, no word, and the reason as its hint", ({ reason, situation }) => {
    renderPanel(situation);
    const row = panelRow();
    expect(wordsIn(row.textContent)).toEqual([]);

    const badge = row.querySelector<HTMLElement>("span[title]")!;
    expect(badge.title).toBe(HINT[reason]);
    expect(badge.className).toContain("bg-gray-100");
    expect(badge.className).not.toMatch(/(green|amber|red)-/);
    expect(badge.querySelector('[aria-hidden="true"]')!.textContent).toBe("—");
    expect(badge.querySelector(".sr-only")!.textContent).toBe(HINT[reason]);
  });
});

describe("the printed report, with no result", () => {
  it.each(DEPENDENCY_MODE_CASES)("$reason ($cases): a grey dash, and no word", ({ situation }) => {
    renderPrint(situation);
    const cell = printHealthCell();
    expect(cell.textContent).toBe("—");
    expect(cell.querySelector("span")!.className).toBe("text-gray-500");
  });
});
