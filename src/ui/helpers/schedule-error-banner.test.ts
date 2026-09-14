// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  getScheduleErrorBanner,
  type ScheduleErrorBanner,
} from "./schedule-error-banner";
import type { ScheduleError } from "@ui/hooks/use-schedule";

/**
 * Unit pins for the schedule-error banner's branch selection.
 *
 * This helper had NO unit test of its own until v0.67.23 — its behaviour was pinned only
 * incidentally, by `import-cycle-characterisation.test.ts` (cycle + calendar branches). The
 * generic branch, which is the one v0.67.23 changes, was pinned by nothing.
 *
 * Typed factory rather than a cast: a cast would disable the check that catches a fixture
 * whose shape has drifted from `ScheduleError`.
 */
function scheduleError(over: Partial<ScheduleError> = {}): ScheduleError {
  return {
    message: "boom",
    isCalendarError: false,
    isCycleError: false,
    ...over,
  };
}

/** The real shape of the defect: the engine's own text for a half-typed 1/1/1 row. */
const ESTIMATE_THROW =
  'Cannot create Triangular distribution for activity "Design": ' +
  "TriangularDistribution: must have a <= c <= b, got a=5, c=1, b=1";

describe("getScheduleErrorBanner", () => {
  it("returns null when there is no error, whatever the validity flag", () => {
    expect(getScheduleErrorBanner(null, true)).toBeNull();
    expect(getScheduleErrorBanner(null, false)).toBeNull();
  });

  describe("the generic (estimates) branch is gated on allActivitiesValid", () => {
    // ⚠️ THE PAIR IS THE POINT. A suppression test alone passes just as well against a
    // function that returns null unconditionally, so the must-SHOW case sits beside the
    // must-HIDE case, on the SAME error object, with only the flag differing. Neither
    // assertion can pass vacuously while the other holds.
    const err = scheduleError({ message: ESTIMATE_THROW });

    it("SUPPRESSES it while every row still reports valid (the half-typed window)", () => {
      expect(getScheduleErrorBanner(err, true)).toBeNull();
    });

    it("SHOWS it once a row reports invalid (the user really did leave it wrong)", () => {
      const banner = getScheduleErrorBanner(err, false);
      expect(banner).not.toBeNull();
      expect(banner!.heading).toBe("Schedule Error");
      expect(banner!.message).toBe(ESTIMATE_THROW);
      expect(banner!.advice).toBe(
        "Check the affected activity's estimates and settings."
      );
    });
  });

  describe("the cycle and calendar branches are NOT gated", () => {
    // ⚠️ These two are the regression this change could most plausibly cause: both arise
    // with estimates that are entirely fine, so `allActivitiesValid` is TRUE in their real
    // conditions. A gate applied one branch too early would silence them both, and the
    // symptom — a blank schedule saying nothing — is exactly what v0.63.0 fixed for cycles.
    const cases: Array<[string, ScheduleError, string]> = [
      ["cycle", scheduleError({ isCycleError: true }), "Dependency Cycle"],
      [
        "calendar",
        scheduleError({ isCalendarError: true }),
        "Calendar Configuration Error",
      ],
    ];

    it.each(cases)(
      "shows the %s branch even when all rows are valid",
      (_label, err, heading) => {
        const banner = getScheduleErrorBanner(err, true);
        expect(banner).not.toBeNull();
        expect(banner!.heading).toBe(heading);
      }
    );

    it("keeps cycle precedence when both flags are somehow set", () => {
      const banner = getScheduleErrorBanner(
        scheduleError({ isCycleError: true, isCalendarError: true }),
        true
      );
      expect(banner!.heading).toBe("Dependency Cycle");
      // The load-bearing half: work-week advice for a circular graph is the wrong page.
      expect(banner!.advice).toMatch(/Dependencies panel/);
    });
  });

  it("never returns a banner with an empty heading, message or advice", () => {
    const shown: ScheduleErrorBanner[] = [
      getScheduleErrorBanner(scheduleError(), false)!,
      getScheduleErrorBanner(scheduleError({ isCycleError: true }), true)!,
      getScheduleErrorBanner(scheduleError({ isCalendarError: true }), true)!,
    ];
    expect(shown).toHaveLength(3);
    for (const b of shown) {
      expect(b.heading.length).toBeGreaterThan(0);
      expect(b.message.length).toBeGreaterThan(0);
      expect(b.advice.length).toBeGreaterThan(0);
    }
  });
});
