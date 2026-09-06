// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { ScheduleAnalysisSection } from "./activity-modal-sections";
import { PrintSummarySection } from "./print-sections";
import { ScenarioSummaryCard } from "./ScenarioSummaryCard";
import { createProject } from "@app/api/project-service";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import type { DeterministicSchedule, ScenarioSettings } from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";

/**
 * "1 working days" (audit M14) — every on-screen surface that renders a working-day
 * COUNT: the summary card (both duration cells and the constraint-delay disclosure),
 * the printed summary, and the edit modal's Schedule Analysis. The export block is
 * covered in schedule-export-plurals.test.ts.
 *
 * Each surface gets a one-day fixture (every rendered count is 1) and a two-day twin
 * (every count is 2), so neither half can pass vacuously: the singular assertions fail
 * at 1c9b1db and the plural ones must not move. Values are read from the element
 * beside each label, never from a class.
 */
afterEach(cleanup);

const settings: ScenarioSettings = { ...DEFAULT_SCENARIO_SETTINGS, rngSeed: "plurals" };

/** Work-sum `work`, span 2×work (idle days on a constraint), buffered duration rounding to `work`. */
function fixture(work: number): { schedule: DeterministicSchedule; buffer: ScheduleBuffer } {
  const span = work * 2;
  return {
    schedule: {
      activities: [
        {
          activityId: "a1",
          name: "Only task",
          duration: work,
          startDate: "2026-01-05",
          endDate: "2026-01-05",
          isActual: false,
        },
      ],
      totalDurationDays: work,
      spanDays: span,
      projectEndDate: "2026-01-06",
    },
    buffer: {
      deterministicSpan: span,
      projectTargetDuration: work + 0.4,
      bufferDays: Math.round(work + 0.4 - span), // −1 at work 1, −2 at work 2
      activityProbabilityTarget: 0.5,
      projectProbabilityTarget: 0.95,
    },
  };
}

/** Text of the element immediately after the given label. */
function valueAfter(label: string): string {
  return screen.getByText(label).nextElementSibling!.textContent!.replace(/\s+/g, " ").trim();
}

// -- Edit modal: Schedule Analysis -------------------------------------------

describe("ScheduleAnalysisSection", () => {
  const renderWith = (n: number) =>
    render(
      <ScheduleAnalysisSection
        sa={{ startDate: "2026-01-05", endDate: "2026-01-05", duration: n, totalFloat: n, freeFloat: n }}
        formatDate={(iso) => iso}
      />
    );

  it("renders a one-day duration as '1 working day'", () => {
    renderWith(1);
    expect(valueAfter("Duration")).toBe("1 working day");
  });

  it("keeps the plural at two", () => {
    renderWith(2);
    expect(valueAfter("Duration")).toBe("2 working days");
  });

  it("siblings: total float and free float pluralise too", () => {
    renderWith(1);
    expect(valueAfter("Total Float")).toBe("1 day");
    expect(valueAfter("Free Float")).toBe("1 day");
    cleanup();
    renderWith(2);
    expect(valueAfter("Total Float")).toBe("2 days");
    expect(valueAfter("Free Float")).toBe("2 days");
  });
});

// -- Printed report: Project Summary -----------------------------------------

describe("PrintSummarySection", () => {
  const renderWith = (n: number) => {
    const project = createProject("Plurals", "2026-01-05");
    const { schedule, buffer } = fixture(n);
    render(
      <PrintSummarySection
        project={project}
        scenario={project.scenarios[0]!}
        schedule={schedule}
        buffer={buffer}
        bufferedEndDate="2026-01-06"
        formatDate={(iso) => iso}
      />
    );
  };

  it("renders one-day counts as '1 working day' in all three duration rows", () => {
    renderWith(1);
    expect(valueAfter("Duration:")).toBe("1 working day");
    expect(valueAfter("Duration (w/Buffer):")).toBe("1 working day");
    expect(valueAfter("Constraint Delay:")).toBe("+1 working day");
  });

  it("keeps the plural at two", () => {
    renderWith(2);
    expect(valueAfter("Duration:")).toBe("2 working days");
    expect(valueAfter("Duration (w/Buffer):")).toBe("2 working days");
    expect(valueAfter("Constraint Delay:")).toBe("+2 working days");
  });

  it("sibling: the schedule buffer row pluralises too", () => {
    renderWith(1);
    expect(valueAfter("Schedule Buffer:")).toBe("-1 day");
    cleanup();
    renderWith(2);
    expect(valueAfter("Schedule Buffer:")).toBe("-2 days");
  });
});

// -- Summary card -------------------------------------------------------------

describe("ScenarioSummaryCard", () => {
  const renderWith = (n: number) => {
    const { schedule, buffer } = fixture(n);
    render(
      <ScenarioSummaryCard
        startDate="2026-01-05"
        schedule={schedule}
        buffer={buffer}
        settings={settings}
        hasSimulationResults
        onSettingsChange={vi.fn()}
        onStartDateChange={vi.fn()}
        onNewSeed={vi.fn()}
        projectName="Plurals"
        scenarioName="S"
        activities={[]}
        bands={[]}
        dependencies={[]}
        milestones={[]}
      />
    );
  };

  it("renders a one-day duration and buffered duration as '1 working day'", () => {
    renderWith(1);
    expect(valueAfter("Duration")).toBe("1 working day");
    expect(valueAfter("Duration w/Buffer")).toBe("1 working day");
  });

  it("keeps the plural at two", () => {
    renderWith(2);
    expect(valueAfter("Duration")).toBe("2 working days");
    expect(valueAfter("Duration w/Buffer")).toBe("2 working days");
  });

  it("siblings: the schedule-buffer and constraint-delay figures pluralise too", () => {
    renderWith(1);
    expect(valueAfter("Schedule Buffer:")).toBe("-1 day");
    expect(screen.getByText("Constraint delay:").lastElementChild!.textContent).toBe("+1 day");
    cleanup();
    renderWith(2);
    expect(valueAfter("Schedule Buffer:")).toBe("-2 days");
    expect(screen.getByText("Constraint delay:").lastElementChild!.textContent).toBe("+2 days");
  });
});
