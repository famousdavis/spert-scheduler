// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import { useMilestoneBuffers } from "./use-milestone-buffers";
import type {
  Activity,
  Milestone,
  ScheduledActivity,
  SimulationRun,
} from "@domain/models/types";

/**
 * `useMilestoneBuffers` was at 0% coverage — one of the fifteen hook/helper files the
 * 2026-08-01 review found untested (charter §3.2). Nothing structural was stopping it:
 * the hook is a pure `useMemo` over its arguments, reaching only `/core` and `/domain`.
 * It had simply never been written.
 *
 * ⚠️ Every expected value below is a LITERAL, hand-derived from the calendar semantics and
 * then confirmed against the real helpers before being written down:
 *
 *   2026-04-06 is a Monday
 *   countWorkingDays(04-06, 04-15) = 7   -> deterministicDuration 8   (the +1 is inclusive)
 *   addWorkingDays(04-15, 4)       = 2026-04-21
 *   countWorkingDays(04-21, 04-24) = 3   · (04-21, 04-28) = 5 · (04-17, 04-21) = 2
 *
 * Recomputing them in the test with the same helpers the hook uses would be a test that
 * cannot fail — it would agree with the implementation no matter what the implementation did.
 */

const PROJECT_START = "2026-04-06"; // Monday
const TARGET = 0.95; // -> percentile key 95

const milestone = (id: string, targetDate: string): Milestone => ({
  id,
  name: `Milestone ${id}`,
  targetDate,
});

const activity = (id: string, milestoneId?: string): Activity =>
  ({
    id,
    name: `Activity ${id}`,
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
    milestoneId,
  }) as Activity;

const scheduled = (activityId: string, endDate: string): ScheduledActivity => ({
  activityId,
  name: `Activity ${activityId}`,
  duration: 5,
  startDate: PROJECT_START,
  endDate,
  isActual: false,
});

/**
 * Only `milestoneResults` is read by the hook, so the rest of SimulationRun is omitted
 * rather than fabricated — a fixture carrying invented percentiles and sample arrays would
 * suggest they matter here.
 */
const simRun = (percentiles: Record<number, number>, milestoneId = "m1"): SimulationRun =>
  ({
    milestoneResults: {
      [milestoneId]: { percentiles, mean: 0, standardDeviation: 0 },
    },
  }) as unknown as SimulationRun;

function render(
  milestones: Milestone[],
  scheduledActivities: ScheduledActivity[],
  activities: Activity[],
  simulationResults?: SimulationRun,
) {
  return renderHook(() =>
    useMilestoneBuffers(
      milestones,
      scheduledActivities,
      activities,
      simulationResults,
      PROJECT_START,
      TARGET,
    ),
  ).result.current;
}

describe("useMilestoneBuffers", () => {
  const M1 = milestone("m1", "2026-04-24"); // Friday
  const ACTS = [activity("a1", "m1"), activity("a2", "m1")];
  const SCHED = [scheduled("a1", "2026-04-10"), scheduled("a2", "2026-04-15")];

  it("returns null when there are no milestones", () => {
    expect(render([], SCHED, ACTS)).toBeNull();
  });

  describe("a milestone with no assigned activities", () => {
    it("reports the target date and a zero duration rather than computing from the schedule", () => {
      const result = render([M1], SCHED, [activity("a9", "other")]);
      const info = result!.get("m1")!;

      expect(info.deterministicEndDate).toBe("2026-04-24"); // the target, not a schedule date
      expect(info.deterministicDuration).toBe(0);
      expect(info.bufferedEndDate).toBeNull();
      expect(info.bufferDays).toBeNull();
      expect(info.slackDays).toBeNull();
      expect(info.health).toBe("green");
    });
  });

  describe("without simulation results", () => {
    it("computes the deterministic end from the LATEST assigned activity", () => {
      const info = render([M1], SCHED, ACTS)!.get("m1")!;
      expect(info.deterministicEndDate).toBe("2026-04-15");
      expect(info.deterministicDuration).toBe(8);
    });

    it("leaves buffer and slack null, and reports green", () => {
      // Worth pinning because it is not obvious: computeMilestoneHealth(null) is "green",
      // so a milestone with no simulation data reads as healthy rather than unknown.
      const info = render([M1], SCHED, ACTS)!.get("m1")!;
      expect(info.bufferDays).toBeNull();
      expect(info.slackDays).toBeNull();
      expect(info.health).toBe("green");
    });

    it("takes the maximum end date regardless of array order", () => {
      const forward = render([M1], SCHED, ACTS)!.get("m1")!;
      const reversed = render([M1], [...SCHED].reverse(), [...ACTS].reverse())!.get("m1")!;
      expect(reversed.deterministicEndDate).toBe(forward.deterministicEndDate);
      expect(reversed.deterministicEndDate).toBe("2026-04-15");
    });

    it("ignores activities assigned to a different milestone", () => {
      const info = render(
        [M1],
        [...SCHED, scheduled("a3", "2026-04-30")],
        [...ACTS, activity("a3", "m2")],
      )!.get("m1")!;
      // 2026-04-30 belongs to m2 and must not become m1's latest end date.
      expect(info.deterministicEndDate).toBe("2026-04-15");
    });

    it("skips an assigned activity that has no scheduled entry", () => {
      const info = render([M1], [scheduled("a1", "2026-04-10")], ACTS)!.get("m1")!;
      expect(info.deterministicEndDate).toBe("2026-04-10");
    });
  });

  describe("with simulation results", () => {
    // percentiles[95] = 12 against a deterministic duration of 8 -> bufferDays 4,
    // and addWorkingDays(2026-04-15, 4) = 2026-04-21.
    const RESULTS = simRun({ 95: 12 });

    it("computes buffer days and the buffered end date", () => {
      const info = render([M1], SCHED, ACTS, RESULTS)!.get("m1")!;
      expect(info.bufferDays).toBe(4);
      expect(info.bufferedEndDate).toBe("2026-04-21");
    });

    it("reports amber for slack inside the green threshold", () => {
      // target 2026-04-24, buffered end 2026-04-21 -> 3 working days of slack.
      const info = render([M1], SCHED, ACTS, RESULTS)!.get("m1")!;
      expect(info.slackDays).toBe(3);
      expect(info.health).toBe("amber");
    });

    it("reports green once slack reaches the five-day threshold", () => {
      const info = render(
        [milestone("m1", "2026-04-28")],
        SCHED,
        ACTS,
        RESULTS,
      )!.get("m1")!;
      expect(info.slackDays).toBe(5);
      expect(info.health).toBe("green");
    });

    it("reports NEGATIVE slack and red when the buffered end is past the target", () => {
      // target 2026-04-17, buffered end 2026-04-21 -> the sign flips.
      const info = render(
        [milestone("m1", "2026-04-17")],
        SCHED,
        ACTS,
        RESULTS,
      )!.get("m1")!;
      expect(info.slackDays).toBe(-2);
      expect(info.health).toBe("red");
    });

    it("leaves buffer null when the percentile table has no entry for the target", () => {
      // computeMilestoneBuffer keys on round(target * 100) = 95; this table has only 90.
      const info = render([M1], SCHED, ACTS, simRun({ 90: 12 }))!.get("m1")!;
      expect(info.bufferDays).toBeNull();
      expect(info.bufferedEndDate).toBeNull();
      expect(info.slackDays).toBeNull();
      // ...but the deterministic side is still computed.
      expect(info.deterministicEndDate).toBe("2026-04-15");
      expect(info.deterministicDuration).toBe(8);
    });

    it("leaves buffer null for a milestone absent from milestoneResults", () => {
      const info = render([M1], SCHED, ACTS, simRun({ 95: 12 }, "someOtherId"))!.get("m1")!;
      expect(info.bufferDays).toBeNull();
      expect(info.slackDays).toBeNull();
    });
  });

  it("returns one entry per milestone, keyed by id", () => {
    const result = render(
      [M1, milestone("m2", "2026-05-01")],
      [...SCHED, scheduled("a3", "2026-04-30")],
      [...ACTS, activity("a3", "m2")],
      simRun({ 95: 12 }),
    );
    expect(result!.size).toBe(2);
    expect(result!.get("m1")!.deterministicEndDate).toBe("2026-04-15");
    expect(result!.get("m2")!.deterministicEndDate).toBe("2026-04-30");
  });
});
