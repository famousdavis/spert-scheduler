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
