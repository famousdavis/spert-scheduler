// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { buildSummaryData } from "./schedule-export-service";
import { createActivity } from "./project-service";
import { DEFAULT_SCENARIO_SETTINGS } from "@domain/models/types";
import type { DeterministicSchedule, ScenarioSettings } from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";

/**
 * The schedule export's summary block writes "N working days" beside the on-screen
 * card's figures, and like the card it wrote "1 working days". This is the fourth
 * surface WI-16 pluralises — outside src/ui, which is why the item's enumeration
 * missed it. The existing "13 working days" assertion in schedule-export-service.test.ts
 * stays green and unedited: the plural form is unchanged at every count but one.
 *
 * Fixture: one activity, work-sum 1, span 2 (one idle day on a constraint), and a
 * project-target duration that rounds to 1 — every count the block renders is 1, and
 * the twin below renders every count as 2 so the plural half cannot pass vacuously.
 * Falsified at 1c9b1db: both singular "working day" assertions fail.
 */
const settings: ScenarioSettings = { ...DEFAULT_SCENARIO_SETTINGS, rngSeed: "plurals" };

function params(work: number) {
  const span = work * 2;
  const schedule: DeterministicSchedule = {
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
  };
  const buffer: ScheduleBuffer = {
    deterministicSpan: span,
    projectTargetDuration: work + 0.4, // rounds to `work`
    bufferDays: Math.round(work + 0.4 - span), // −1 for work 1, −2 for work 2
    activityProbabilityTarget: 0.5,
    projectProbabilityTarget: 0.95,
  };
  return {
    projectName: "Plurals",
    scenarioName: "S",
    startDate: "2026-01-05",
    activities: [createActivity("Only task", settings)],
    settings,
    dependencies: [],
    milestones: [],
    dateFormat: "MM/DD/YYYY" as const,
    schedule,
    buffer,
  };
}

const val = (summary: { key: string; value: string }[], k: string) =>
  summary.find((r) => r.key === k)!.value;

describe("schedule export summary — working-day counts pluralise", () => {
  it("writes '1 working day' for a one-day duration and a one-day buffered duration", () => {
    const summary = buildSummaryData(params(1));
    expect(val(summary, "Duration (w/o Buffer)")).toBe("1 working day");
    expect(val(summary, "Duration (w/ Buffer)")).toBe("1 working day");
  });

  it("keeps the plural at two", () => {
    const summary = buildSummaryData(params(2));
    expect(val(summary, "Duration (w/o Buffer)")).toBe("2 working days");
    expect(val(summary, "Duration (w/ Buffer)")).toBe("2 working days");
  });

  // Same-surface siblings (bare "days" beside an integer) — P4(b), pending ruling.
  it("siblings: constraint delay and schedule buffer pluralise on the same block", () => {
    const one = buildSummaryData(params(1));
    expect(val(one, "Constraint Delay")).toBe("1 day");
    expect(val(one, "Schedule Buffer")).toBe("-1 day");
    const two = buildSummaryData(params(2));
    expect(val(two, "Constraint Delay")).toBe("2 days");
    expect(val(two, "Schedule Buffer")).toBe("-2 days");
  });
});
