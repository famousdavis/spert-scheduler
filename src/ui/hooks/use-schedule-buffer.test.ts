// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";

import { useScheduleBuffer } from "./use-schedule-buffer";
import type { SimulationRun } from "@domain/models/types";

/**
 * At 0% coverage before charter §3.2. A three-line `useMemo` guard over
 * `computeScheduleBuffer`; the guard is the only logic it owns, and it was the untested part.
 *
 * Only `percentiles` is read from SimulationRun, so the rest is omitted rather than invented.
 */
const simRun = (percentiles: Record<number, number>): SimulationRun =>
  ({ percentiles }) as unknown as SimulationRun;

const setup = (
  span: number | null,
  results: SimulationRun | undefined,
  activityTarget = 0.5,
  projectTarget = 0.95,
) =>
  renderHook(() => useScheduleBuffer(span, results, activityTarget, projectTarget)).result
    .current;

describe("useScheduleBuffer", () => {
  const RESULTS = simRun({ 50: 20, 95: 28 });

  it("returns null when the deterministic span is null", () => {
    expect(setup(null, RESULTS)).toBeNull();
  });

  it("returns null when there are no simulation results", () => {
    expect(setup(22, undefined)).toBeNull();
  });

  it("computes the buffer from the PROJECT target percentile", () => {
    // 28 (p95) - 22 = 6. If it keyed on the activity target instead it would be 20 - 22 = -2,
    // so this also pins which of the two targets drives the lookup.
    const buffer = setup(22, RESULTS);
    expect(buffer).not.toBeNull();
    expect(buffer!.bufferDays).toBe(6);
    expect(buffer!.projectTargetDuration).toBe(28);
    expect(buffer!.deterministicSpan).toBe(22);
  });

  it("passes both probability targets through for display", () => {
    const buffer = setup(22, RESULTS, 0.5, 0.95);
    expect(buffer!.activityProbabilityTarget).toBe(0.5);
    expect(buffer!.projectProbabilityTarget).toBe(0.95);
  });

  it("returns null when the percentile table has no entry for the project target", () => {
    expect(setup(22, simRun({ 50: 20, 90: 26 }))).toBeNull();
  });

  it("rounds the buffer to whole days", () => {
    expect(setup(22, simRun({ 95: 28.4 }))!.bufferDays).toBe(6);
    expect(setup(22, simRun({ 95: 28.6 }))!.bufferDays).toBe(7);
  });

  it("yields a negative buffer when the deterministic span already exceeds the target", () => {
    // Not a guard the hook applies — recorded so a future "clamp at zero" is a deliberate
    // change rather than an accident.
    expect(setup(30, RESULTS)!.bufferDays).toBe(-2);
  });

  it("returns zero rather than null when the span exactly equals the target duration", () => {
    expect(setup(28, RESULTS)!.bufferDays).toBe(0);
  });
});
