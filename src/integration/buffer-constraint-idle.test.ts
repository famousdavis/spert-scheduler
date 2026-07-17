// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  computeDeterministicSchedule,
  computeDependencySchedule,
  computeDependencyDurations,
} from "@core/schedule/deterministic";
import { runMonteCarloSimulation, runDependencyTrials } from "@core/simulation/monte-carlo";
import { computeStandardPercentiles, sortSamples } from "@core/analytics/analytics";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
import { computeScheduleBuffer, computeMilestoneBuffer } from "@core/schedule/buffer";
import {
  durationToFinishDateISO,
  addWorkingDays,
  formatDateISO,
  parseDateISO,
  countWorkingDays,
} from "@core/calendar/calendar";
import type { Activity, ActivityDependency } from "@domain/models/types";

/**
 * End-to-end: the span-based schedule buffer agrees with the Percentile Summary
 * date and the arithmetic work + constraint delay + buffer = round(P) closes exactly
 * once constraint idle enters the schedule. SNET/MSO only (merge-order-independent
 * with the MFO/FNET engine PR). A Monday start keeps effStart === startDate.
 */

const startDate = "2026-01-05"; // Monday

function makeActivity(overrides: Partial<Activity> & { id: string; name: string }): Activity {
  return {
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "triangular",
    status: "planned",
    ...overrides,
  };
}

describe("buffer ↔ constraint-idle end-to-end agreement (SNET)", () => {
  it("sequential: buffered finish equals the Percentile Summary date and the arithmetic closes exactly", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Design" }),
      makeActivity({
        id: "a2",
        name: "Build",
        constraintType: "SNET",
        constraintDate: "2026-03-02", // Monday, far past the natural finish → binding idle
        constraintMode: "hard",
      }),
    ];
    const schedule = computeDeterministicSchedule(activities, startDate, 0.5);
    const params = buildSimulationParams(activities, false, 0.5, [], [], startDate, undefined, true);
    const run = runMonteCarloSimulation({
      activities,
      trialCount: 4000,
      rngSeed: "idle-seq",
      deterministicDurations: params.deterministicDurations,
      sequentialConstraints: params.sequentialConstraints,
    });

    const buffer = computeScheduleBuffer(schedule.spanDays, run.percentiles, 0.5, 0.95)!;
    expect(buffer).not.toBeNull();

    const roundP = Math.round(buffer.projectTargetDuration);
    // Buffered finish (shared helper) === the Percentile Summary conversion for round(P).
    const bufferedFinish = durationToFinishDateISO(startDate, buffer.projectTargetDuration)!;
    expect(bufferedFinish).toBe(
      formatDateISO(addWorkingDays(parseDateISO(startDate), roundP - 1))
    );
    // Exact three-term decomposition (Appendix 1 identity).
    const constraintDelay = buffer.deterministicSpan - schedule.totalDurationDays;
    expect(schedule.totalDurationDays + constraintDelay + buffer.bufferDays).toBe(roundP);
    // The idle is real — SNET pushed the finish well past the work content.
    expect(constraintDelay).toBeGreaterThan(0);
    expect(schedule.spanDays).toBeGreaterThan(schedule.totalDurationDays);
  });

  it("dependency: same structural agreement via the milestone-aware constraint path", () => {
    const activities: Activity[] = [
      makeActivity({ id: "a1", name: "Design" }),
      makeActivity({
        id: "a2",
        name: "Build",
        constraintType: "SNET",
        constraintDate: "2026-03-02",
        constraintMode: "hard",
      }),
    ];
    const deps: ActivityDependency[] = [
      { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
    ];
    const schedule = computeDependencySchedule(activities, deps, startDate, 0.5);
    // Match the deterministic constraint date's working-day offset (both starts are working days).
    const snetOffset = countWorkingDays(parseDateISO(startDate), parseDateISO("2026-03-02"));
    const { samples } = runDependencyTrials({
      activities,
      dependencies: deps,
      trialCount: 4000,
      rngSeed: "idle-dep",
      deterministicDurationMap: computeDependencyDurations(activities, 0.5),
      constraintMap: new Map([["a2", { type: "SNET", offsetFromStart: snetOffset, mode: "hard" }]]),
    });
    sortSamples(samples);
    const percentiles = computeStandardPercentiles(samples);

    const buffer = computeScheduleBuffer(schedule.spanDays, percentiles, 0.5, 0.95)!;
    const roundP = Math.round(buffer.projectTargetDuration);
    const bufferedFinish = durationToFinishDateISO(startDate, buffer.projectTargetDuration)!;
    expect(bufferedFinish).toBe(
      formatDateISO(addWorkingDays(parseDateISO(startDate), roundP - 1))
    );
    const constraintDelay = buffer.deterministicSpan - schedule.totalDurationDays;
    expect(schedule.totalDurationDays + constraintDelay + buffer.bufferDays).toBe(roundP);
    expect(constraintDelay).toBeGreaterThan(0);
  });

  it("a low-binding SNET leaves the P95 buffered finish unchanged but raises P5", () => {
    // a1 varies over [6, 10] (triangular floored to its P50); a2 is fixed at 5. A SNET on
    // a2 at offset 8 (Thu 2026-01-15) binds only trials where a1 finishes before day 8 —
    // the lower tail — leaving the upper tail (and the P95-based buffered finish) exactly
    // untouched. Automated analogue of the owner's live experiment.
    const fixedA2 = { min: 5, mostLikely: 5, max: 5 as number };
    const constrained: Activity[] = [
      makeActivity({ id: "a1", name: "A" }),
      makeActivity({
        id: "a2",
        name: "B",
        ...fixedA2,
        constraintType: "SNET",
        constraintDate: "2026-01-15",
        constraintMode: "hard",
      }),
    ];
    const plain: Activity[] = [
      makeActivity({ id: "a1", name: "A" }),
      makeActivity({ id: "a2", name: "B", ...fixedA2 }),
    ];

    const withRun = runMonteCarloSimulation({
      activities: constrained,
      trialCount: 10000,
      rngSeed: "invariance",
      deterministicDurations: buildSimulationParams(constrained, false, 0.5, [], [], startDate, undefined, true).deterministicDurations,
      sequentialConstraints: buildSimulationParams(constrained, false, 0.5, [], [], startDate, undefined, true).sequentialConstraints,
    });
    const withoutRun = runMonteCarloSimulation({
      activities: plain,
      trialCount: 10000,
      rngSeed: "invariance",
      deterministicDurations: buildSimulationParams(plain, false, 0.5, [], [], startDate, undefined, true).deterministicDurations,
    });

    // Upper tail untouched: identical P95, so the buffered finish would agree.
    expect(withRun.percentiles[95]!).toBe(withoutRun.percentiles[95]!);
    // Lower tail lifted by the floor.
    expect(withRun.percentiles[5]!).toBeGreaterThanOrEqual(withoutRun.percentiles[5]!);
    expect(withRun.percentiles[5]!).toBeGreaterThan(withoutRun.percentiles[5]!);
  });

  it("milestone buffer uses the identical span-based arithmetic (non-regression)", () => {
    // computeMilestoneBuffer is untouched by 0.54.1; it already takes a span-based
    // deterministic duration and the milestone percentiles. Same identity as the project level.
    const S = 40; // milestone span-based deterministic duration (working days)
    const milestonePercentiles: Record<number, number> = { 95: 52.7 };
    const result = computeMilestoneBuffer(S, milestonePercentiles, 0.95)!;
    expect(result.bufferedDuration).toBe(Math.round(52.7)); // 53
    expect(result.bufferDays).toBe(Math.round(52.7) - S); // 53 − 40 = 13
    expect(S + result.bufferDays).toBe(result.bufferedDuration);
  });
});
