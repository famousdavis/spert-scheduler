// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { formatDateISO, addWorkingDays, parseDateISO } from "@core/calendar/calendar";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { Calendar } from "@domain/models/types";

export type RAGColor = "green" | "amber" | "red" | "gray";

export interface TargetRAGParams {
  /** ISO date string for the project target finish date */
  targetFinishDate: string | null | undefined;
  /** Simulation percentile map (percentile → duration in working days) */
  percentiles: Record<number, number> | null | undefined;
  /** ISO date string for the scenario start date */
  startDate: string | null | undefined;
  /** Green threshold percentile (e.g., 80 for P80) */
  greenPct: number;
  /** Amber threshold percentile (e.g., 50 for P50) */
  amberPct: number;
  /** Work calendar for date math */
  calendar?: WorkCalendar | Calendar;
}

/**
 * Compute the RAG (Red/Amber/Green) schedule health color for a target finish date.
 *
 * - Green: simulation finishes at the green percentile on or before the target date
 * - Amber: simulation finishes at the amber percentile on or before the target date
 * - Red: simulation exceeds the target even at the amber percentile
 * - Gray: insufficient data (no target, no simulation, or missing percentile)
 */
export function computeTargetRAGColor(params: TargetRAGParams): RAGColor {
  const { targetFinishDate, percentiles, startDate, greenPct, amberPct, calendar } = params;

  if (!targetFinishDate || !percentiles || !startDate) return "gray";

  const greenDuration = percentiles[greenPct];
  const amberDuration = percentiles[amberPct];
  if (greenDuration == null || amberDuration == null) return "gray";

  const greenFinish = formatDateISO(addWorkingDays(parseDateISO(startDate), greenDuration, calendar));
  const amberFinish = formatDateISO(addWorkingDays(parseDateISO(startDate), amberDuration, calendar));

  if (greenFinish <= targetFinishDate) return "green";
  if (amberFinish <= targetFinishDate) return "amber";
  return "red";
}
