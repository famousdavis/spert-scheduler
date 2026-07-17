// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type { SimulationRun } from "@domain/models/types";
import { computeScheduleBuffer } from "@core/schedule/buffer";
import type { ScheduleBuffer } from "@core/schedule/buffer";

/**
 * Memoized schedule buffer computation.
 * Returns the buffer (difference between the MC project percentile and the
 * deterministic schedule span), or null if simulation results are not available.
 */
export function useScheduleBuffer(
  deterministicSpan: number | null,
  simulationResults: SimulationRun | undefined,
  activityProbabilityTarget: number,
  projectProbabilityTarget: number
): ScheduleBuffer | null {
  return useMemo(() => {
    if (deterministicSpan === null || !simulationResults) return null;
    return computeScheduleBuffer(
      deterministicSpan,
      simulationResults.percentiles,
      activityProbabilityTarget,
      projectProbabilityTarget
    );
  }, [deterministicSpan, simulationResults, activityProbabilityTarget, projectProbabilityTarget]);
}
