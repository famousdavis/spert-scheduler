// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  getScheduleErrorBanner,
  type ScheduleErrorBanner,
} from "./schedule-error-banner";
import type { ScheduleError } from "@ui/hooks/use-schedule";
import type { FlaggedThrower } from "@ui/hooks/use-estimate-validity";

/**
 * Unit pins for the schedule-error banner's branch selection.
 *
 * This helper had NO unit test of its own until v0.67.23 — its behaviour was pinned only
 * incidentally, by `import-cycle-characterisation.test.ts` (cycle + calendar branches). The
 * generic branch, which is the one v0.67.23 changes, was pinned by nothing.
 *
 * Typed factories rather than casts: a cast would disable the check that catches a fixture
 * whose shape has drifted from `ScheduleError` or `FlaggedThrower`.
 */
function scheduleError(over: Partial<ScheduleError> = {}): ScheduleError {
  return {
    message: "boom",
    isCalendarError: false,
    isCycleError: false,
    ...over,
  };
}

/**
 * A flagged activity that cannot be built. The default is the measured Triangular case: the
 * sample project's row #1 with Most Likely typed above Max.
 */
function thrower(over: Partial<FlaggedThrower> = {}): FlaggedThrower {
  return {
    id: "act-1",
    name: "Project Mobilization & Governance",
    messages: ["Most Likely is above Max"],
    min: 9,
    mostLikely: 30,
    max: 22,
    ...over,
  };
}

/**
 * The Uniform row measured at v0.71.2, and THE case this file exists to protect.
 *
 * The engine fails it on Min > Max (`UniformDistribution: must have a <= b, got a=30, b=28`)
 * while the validation summary reports Min > Most Likely — `estimateOrderIssues` never states
 * Min > Max at all. Both are true and they are DIFFERENT rules. While the banner quoted the
 * engine that was dismissible as noise; in plain English, two rules about one row, 550 px apart,
 * leave a reader who is new to this unable to tell which one to fix.
 */
function uniformThrower(): FlaggedThrower {
  return thrower({
    id: "act-3",
    name: "Environment Provisioning (Dev/Test/Prod)",
    messages: ["Min is above Most Likely"],
    min: 30,
    mostLikely: 9,
    max: 28,
  });
}

const NUMBERS = new Map([
  ["act-1", 1],
  ["act-3", 3],
]);

describe("getScheduleErrorBanner", () => {
  it("returns null when there is no error, whatever the flagged thrower", () => {
    expect(getScheduleErrorBanner(null, null)).toBeNull();
    expect(getScheduleErrorBanner(null, thrower())).toBeNull();
  });

  describe("the generic (estimates) branch is gated on a FLAGGED activity that cannot be built", () => {
    // ⚠️ THE PAIR IS THE POINT. A suppression test alone passes just as well against a
    // function that returns null unconditionally, so the must-SHOW case sits beside the
    // must-HIDE case, on the SAME error object, with only the second argument differing.
    // Neither assertion can pass vacuously while the other holds.
    const err = scheduleError({ message: "the engine's own first throw" });

    it("SUPPRESSES it when no flagged activity throws (the half-typed window)", () => {
      expect(getScheduleErrorBanner(err, null)).toBeNull();
    });

    it("SHOWS it for a flagged thrower, naming that activity and its numbers", () => {
      const banner = getScheduleErrorBanner(err, thrower(), NUMBERS);
      expect(banner).not.toBeNull();
      expect(banner!.heading).toBe("Schedule Error");
      expect(banner!.message).toBe(
        "Most Likely is above Max. This activity has Min 9, Most Likely 30 and Max 22."
      );
      expect(banner!.advice).toBe(
        "The schedule cannot be calculated until this activity's estimates are fixed."
      );
      expect(banner!.link).toEqual({
        activityId: "act-1",
        label: "#1 Project Mobilization & Governance",
      });
    });

    it("never repeats the ENGINE's words — the row's message is the summary's, not the error's", () => {
      // v0.71.3: the banner used to print `error.message`'s successor verbatim. The engine's
      // text must not reach the user through this branch at all.
      const banner = getScheduleErrorBanner(
        scheduleError({
          message:
            'Cannot create Triangular distribution for activity "Project Mobilization & Governance": ' +
            "TriangularDistribution: must have a <= c <= b, got a=9, c=30, b=22",
        }),
        thrower(),
        NUMBERS
      );
      expect(banner!.message).not.toMatch(/TriangularDistribution/);
      expect(banner!.message).not.toMatch(/Cannot create/);
      expect(banner!.message).not.toMatch(/a <= c <= b/);
    });
  });

  describe("it states no rule the validation summary does not state", () => {
    // ⚠️ The whole point of building `message` from the thrower's own `messages`. Asserted on the
    // Uniform row, because that is the one where the engine's rule and the summary's DIVERGE — a
    // wording checked only against Triangular looks fine and ships the defect.
    it("leads with the summary's own words, verbatim", () => {
      for (const t of [thrower(), uniformThrower()]) {
        const banner = getScheduleErrorBanner(scheduleError(), t, NUMBERS);
        expect(banner!.message.startsWith(t.messages.join("; ") + ".")).toBe(true);
      }
    });

    it("does not tell the Uniform row about Min vs Max, which the summary never mentions", () => {
      const banner = getScheduleErrorBanner(scheduleError(), uniformThrower(), NUMBERS);
      expect(banner!.message).toBe(
        "Min is above Most Likely. This activity has Min 30, Most Likely 9 and Max 28."
      );
      // The rule the ENGINE would have stated, in each phrasing it could take.
      expect(banner!.message).not.toMatch(/Min is above Max/);
      expect(banner!.message).not.toMatch(/must have a <= b/);
      // And the advice is silent on ordering, so it cannot contradict the summary either.
      expect(banner!.advice).not.toMatch(/Most Likely/);
    });

    it("joins every message when a row breaks both halves of the rule", () => {
      const banner = getScheduleErrorBanner(
        scheduleError(),
        thrower({ messages: ["Min is above Most Likely", "Most Likely is above Max"], min: 30, mostLikely: 9, max: 5 }),
        NUMBERS
      );
      expect(banner!.message).toBe(
        "Min is above Most Likely; Most Likely is above Max. This activity has Min 30, Most Likely 9 and Max 5."
      );
    });

    it("carries a LogNormal zero-mean row without inventing ordering advice for it", () => {
      // 0/0/0 is IN order, so any sentence about Min <= Most Likely <= Max would be a non-sequitur.
      const banner = getScheduleErrorBanner(
        scheduleError(),
        thrower({ messages: ["A LogNormal activity needs an estimate above zero"], min: 0, mostLikely: 0, max: 0 }),
        NUMBERS
      );
      expect(banner!.message).toBe(
        "A LogNormal activity needs an estimate above zero. This activity has Min 0, Most Likely 0 and Max 0."
      );
      expect(banner!.advice).not.toMatch(/order/i);
    });
  });

  describe("the link", () => {
    it("falls back to the bare name when the project is not numbering rows", () => {
      expect(getScheduleErrorBanner(scheduleError(), thrower())!.link).toEqual({
        activityId: "act-1",
        label: "Project Mobilization & Governance",
      });
      expect(getScheduleErrorBanner(scheduleError(), thrower(), null)!.link!.label).toBe(
        "Project Mobilization & Governance"
      );
    });

    it("is absent on the cycle and calendar branches — neither is about one activity", () => {
      expect(getScheduleErrorBanner(scheduleError({ isCycleError: true }), null)!.link).toBeUndefined();
      expect(getScheduleErrorBanner(scheduleError({ isCalendarError: true }), null)!.link).toBeUndefined();
    });
  });

  it("rounds the numbers, because the grid's cells round", () => {
    // The store may hold a fraction. A banner reading 8.6 beside a cell reading 9 is its
    // own defect, so the banner shows what the cell shows.
    const banner = getScheduleErrorBanner(
      scheduleError(),
      thrower({ min: 8.6, mostLikely: 30.4, max: 21.5 }),
      NUMBERS
    );
    expect(banner!.message).toBe(
      "Most Likely is above Max. This activity has Min 9, Most Likely 30 and Max 22."
    );
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

    it("still shows the engine's own message, which is the right text for these two", () => {
      // v0.71.3 stopped the GENERIC branch quoting the engine. These two are not about one
      // activity, and their messages are already readable, so they are deliberately untouched.
      const banner = getScheduleErrorBanner(
        scheduleError({ message: "cannot compute topological order", isCycleError: true }),
        null
      );
      expect(banner!.message).toBe("cannot compute topological order");
    });

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
      getScheduleErrorBanner(scheduleError(), thrower(), NUMBERS)!,
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
