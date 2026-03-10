// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type {
  Activity,
  Calendar,
  DeterministicSchedule,
} from "@domain/models/types";
import { computeSchedule } from "@app/api/schedule-service";

/**
 * Memoized deterministic schedule computation.
 * Recomputes only when activities, startDate, probabilityTarget, or calendar change.
 */
export function useSchedule(
  activities: Activity[],
  startDate: string,
  probabilityTarget: number,
  calendar?: Calendar
): DeterministicSchedule | null {
  return useMemo(() => {
    if (activities.length === 0) return null;
    try {
      return computeSchedule(activities, startDate, probabilityTarget, calendar);
    } catch {
      return null;
    }
  }, [activities, startDate, probabilityTarget, calendar]);
}
