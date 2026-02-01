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
