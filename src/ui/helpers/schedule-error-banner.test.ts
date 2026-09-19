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

/** A FLAGGED activity's own build message — a different row from the engine's first thrower. */
const FLAGGED_THROW =
  'Cannot create Triangular distribution for activity "Build": ' +
  "TriangularDistribution: must have a <= c <= b, got a=14, c=13, b=22";

describe("getScheduleErrorBanner", () => {
  it("returns null when there is no error, whatever the flagged thrower", () => {
    expect(getScheduleErrorBanner(null, null)).toBeNull();
    expect(getScheduleErrorBanner(null, FLAGGED_THROW)).toBeNull();
  });

  describe("the generic (estimates) branch is gated on a FLAGGED activity that cannot be built", () => {
    // ⚠️ THE PAIR IS THE POINT. A suppression test alone passes just as well against a
    // function that returns null unconditionally, so the must-SHOW case sits beside the
    // must-HIDE case, on the SAME error object, with only the second argument differing.
    // Neither assertion can pass vacuously while the other holds.
    const err = scheduleError({ message: ESTIMATE_THROW });

    it("SUPPRESSES it when no flagged activity throws (the half-typed window)", () => {
      expect(getScheduleErrorBanner(err, null)).toBeNull();
    });

    it("SHOWS it for a flagged thrower — with THAT activity's message, not the engine's first", () => {
      // v0.69.0: the engine names whichever row threw first, which can be the row being typed.
      // The banner must name the flagged row, so the message comes from the second argument.
      const banner = getScheduleErrorBanner(err, FLAGGED_THROW);
      expect(banner).not.toBeNull();
      expect(banner!.heading).toBe("Schedule Error");
      expect(banner!.message).toBe(FLAGGED_THROW);
      expect(banner!.message).not.toBe(ESTIMATE_THROW);
      expect(banner!.advice).toBe(
        "Check the affected activity's estimates and settings."
      );
    });
  });

  describe("the cycle and calendar branches are NOT gated", () => {
    // ⚠️ These two are the regression this change could most plausibly cause: both arise
    // with estimates that are entirely fine, so no activity is flagged in their real
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
      "shows the %s branch even when no activity is flagged",
      (_label, err, heading) => {
        const banner = getScheduleErrorBanner(err, null);
        expect(banner).not.toBeNull();
        expect(banner!.heading).toBe(heading);
      }
    );

    it("keeps cycle precedence when both flags are somehow set", () => {
      const banner = getScheduleErrorBanner(
        scheduleError({ isCycleError: true, isCalendarError: true }),
        null
      );
      expect(banner!.heading).toBe("Dependency Cycle");
      // The load-bearing half: work-week advice for a circular graph is the wrong page.
      expect(banner!.advice).toMatch(/Dependencies panel/);
    });
  });

  it("never returns a banner with an empty heading, message or advice", () => {
    const shown: ScheduleErrorBanner[] = [
      getScheduleErrorBanner(scheduleError(), FLAGGED_THROW)!,
      getScheduleErrorBanner(scheduleError({ isCycleError: true }), null)!,
      getScheduleErrorBanner(scheduleError({ isCalendarError: true }), null)!,
    ];
    expect(shown).toHaveLength(3);
    for (const b of shown) {
      expect(b.heading.length).toBeGreaterThan(0);
      expect(b.message.length).toBeGreaterThan(0);
      expect(b.advice.length).toBeGreaterThan(0);
    }
  });
});
