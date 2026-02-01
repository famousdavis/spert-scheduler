/**
 * Schedule Buffer Calculation
 *
 * The schedule buffer is the difference between the Monte Carlo percentile
 * at the project probability target and the deterministic schedule total.
 *
 * Example: If the deterministic schedule at P50 per-activity is 200 days,
 * and the Monte Carlo P95 is 232 days, the buffer is 32 days.
 * This buffer represents the contingency needed for project-level confidence.
 */

export interface ScheduleBuffer {
  /** Sum of activity durations from the deterministic schedule (at activity P-target) */
  deterministicTotal: number;
  /** Monte Carlo percentile value at the project probability target */
  projectTargetDuration: number;
  /** projectTargetDuration - deterministicTotal */
  bufferDays: number;
  /** The activity-level probability target used for deterministic scheduling (e.g. 0.50) */
  activityProbabilityTarget: number;
  /** The project-level probability target used for MC lookup (e.g. 0.95) */
  projectProbabilityTarget: number;
}

/**
 * Compute the schedule buffer.
 *
 * @param deterministicTotal - Total working days from the deterministic schedule
 * @param simulationPercentiles - Percentile lookup from Monte Carlo results (e.g. { 50: 198, 85: 220, 95: 232 })
 * @param activityProbabilityTarget - The per-activity probability target (for display)
 * @param projectProbabilityTarget - The project-level probability target (for MC lookup)
 * @returns ScheduleBuffer or null if the required percentile is not available
 */
export function computeScheduleBuffer(
  deterministicTotal: number,
  simulationPercentiles: Record<number, number>,
  activityProbabilityTarget: number,
  projectProbabilityTarget: number
): ScheduleBuffer | null {
  const pctKey = Math.round(projectProbabilityTarget * 100);
  const projectTargetDuration = simulationPercentiles[pctKey];

  if (projectTargetDuration === undefined) {
    return null;
  }

  return {
    deterministicTotal,
    projectTargetDuration,
    bufferDays: Math.round(projectTargetDuration - deterministicTotal),
    activityProbabilityTarget,
    projectProbabilityTarget,
  };
}
