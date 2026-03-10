// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Activity,
  Calendar,
  DeterministicSchedule,
} from "@domain/models/types";
import { computeDeterministicSchedule } from "@core/schedule/deterministic";

/**
 * Compute a deterministic schedule for a scenario.
 * Thin wrapper around the core engine for UI consumption.
 */
export function computeSchedule(
  activities: Activity[],
  startDate: string,
  probabilityTarget: number,
  calendar?: Calendar
): DeterministicSchedule {
  return computeDeterministicSchedule(
    activities,
    startDate,
    probabilityTarget,
    calendar
  );
}
