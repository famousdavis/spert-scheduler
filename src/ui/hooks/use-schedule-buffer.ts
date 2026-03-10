// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type { SimulationRun } from "@domain/models/types";
import { computeScheduleBuffer } from "@core/schedule/buffer";
import type { ScheduleBuffer } from "@core/schedule/buffer";

/**
 * Memoized schedule buffer computation.
 * Returns the buffer (difference between MC project percentile and deterministic total),
 * or null if simulation results are not available.
 */
export function useScheduleBuffer(
  deterministicTotal: number | null,
  simulationResults: SimulationRun | undefined,
  activityProbabilityTarget: number,
  projectProbabilityTarget: number
): ScheduleBuffer | null {
  return useMemo(() => {
    if (deterministicTotal === null || !simulationResults) return null;
    return computeScheduleBuffer(
      deterministicTotal,
      simulationResults.percentiles,
      activityProbabilityTarget,
      projectProbabilityTarget
    );
  }, [deterministicTotal, simulationResults, activityProbabilityTarget, projectProbabilityTarget]);
}
