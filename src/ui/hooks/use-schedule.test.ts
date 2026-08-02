// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";

import { useSchedule } from "./use-schedule";
import { computeSchedule } from "@app/api/schedule-service";
import { CalendarConfigurationError } from "@core/calendar/work-calendar";
import type { Activity, DeterministicSchedule } from "@domain/models/types";

vi.mock("@app/api/schedule-service", () => ({ computeSchedule: vi.fn() }));

/**
 * At 0% coverage before charter §3.2. Tier 1.
 *
 * The scheduling maths lives in `/core` and is well covered. What this hook owns is the
 * error contract, and only that is tested here: it must report EVERY failure — not just
 * calendar misconfigurations — and must flag which kind it was, so callers can show the
 * right advice. `computeSchedule` is mocked because the subject is the try/catch and the
 * callback protocol, not the schedule.
 */

const mockCompute = vi.mocked(computeSchedule);

const activity = (id: string): Activity =>
  ({
    id,
    name: id,
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
  }) as Activity;

const SCHEDULE = { totalDuration: 12 } as unknown as DeterministicSchedule;
const ACTS = [activity("a1")];

const setup = (activities: Activity[], onError?: (e: unknown) => void) =>
  renderHook(() =>
    useSchedule(activities, "2026-04-06", 0.5, undefined, onError as never),
  );

beforeEach(() => {
  mockCompute.mockReset();
});

describe("useSchedule", () => {
  it("returns null and never calls the engine when there are no activities", () => {
    const onError = vi.fn();
    const { result } = setup([], onError);
    expect(result.current).toBeNull();
    expect(mockCompute).not.toHaveBeenCalled();
    // Not a failure, so no error is reported — but nor is a spurious success.
    expect(onError).not.toHaveBeenCalled();
  });

  describe("on success", () => {
    it("returns the schedule and clears any previous error with null", () => {
      mockCompute.mockReturnValue(SCHEDULE);
      const onError = vi.fn();
      const { result } = setup(ACTS, onError);

      expect(result.current).toBe(SCHEDULE);
      expect(onError).toHaveBeenCalledWith(null);
    });

    it("works without an error callback", () => {
      mockCompute.mockReturnValue(SCHEDULE);
      expect(setup(ACTS).result.current).toBe(SCHEDULE);
    });
  });

  describe("on failure", () => {
    it("reports a plain Error with isCalendarError false", () => {
      mockCompute.mockImplementation(() => {
        throw new Error("boom");
      });
      const onError = vi.fn();
      const { result } = setup(ACTS, onError);

      expect(result.current).toBeNull();
      expect(onError).toHaveBeenCalledWith({
        message: "boom",
        isCalendarError: false,
        // The sequential engine builds no dependency graph, so it can never raise one.
        isCycleError: false,
      });
    });

    it("flags a CalendarConfigurationError as a calendar problem", () => {
      // The whole point of the flag: the two cases need different advice in the UI.
      mockCompute.mockImplementation(() => {
        throw new CalendarConfigurationError("no working days configured");
      });
      const onError = vi.fn();
      setup(ACTS, onError);

      expect(onError).toHaveBeenCalledWith({
        message: "no working days configured",
        isCalendarError: true,
        isCycleError: false,
      });
    });

    it("stringifies a non-Error throw rather than losing it", () => {
      mockCompute.mockImplementation(() => {
        throw "just a string";
      });
      const onError = vi.fn();
      setup(ACTS, onError);

      expect(onError).toHaveBeenCalledWith({
        message: "just a string",
        isCalendarError: false,
        isCycleError: false,
      });
    });

    it("does not throw when there is no error callback", () => {
      mockCompute.mockImplementation(() => {
        throw new Error("boom");
      });
      expect(() => setup(ACTS)).not.toThrow();
    });
  });

  it("recomputes when an input changes", () => {
    mockCompute.mockReturnValue(SCHEDULE);
    const { rerender } = renderHook(
      ({ target }) => useSchedule(ACTS, "2026-04-06", target, undefined),
      { initialProps: { target: 0.5 } },
    );
    expect(mockCompute).toHaveBeenCalledTimes(1);

    rerender({ target: 0.8 });
    expect(mockCompute).toHaveBeenCalledTimes(2);
    expect(mockCompute).toHaveBeenLastCalledWith(ACTS, "2026-04-06", 0.8, undefined);
  });

  it("does not recompute when nothing changes", () => {
    mockCompute.mockReturnValue(SCHEDULE);
    const { rerender } = renderHook(() =>
      useSchedule(ACTS, "2026-04-06", 0.5, undefined),
    );
    rerender();
    expect(mockCompute).toHaveBeenCalledTimes(1);
  });
});
