import type { Activity, ActivityDependency } from "@domain/models/types";
import { buildDependencyGraph } from "@core/schedule/dependency-graph";
import { LEFT_MARGIN } from "./gantt-constants";

export const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/**
 * Date string → X coordinate mapping.
 * Uses timestamp ratio within the date range.
 * @param leftMargin Override for print layout (defaults to interactive LEFT_MARGIN)
 */
export function dateToX(
  dateStr: string,
  minTimestamp: number,
  dateRange: number,
  chartAreaWidth: number,
  leftMargin: number = LEFT_MARGIN,
): number {
  const ts = new Date(dateStr + "T00:00:00").getTime();
  if (dateRange === 0) return leftMargin + chartAreaWidth / 2;
  const ratio = (ts - minTimestamp) / dateRange;
  return leftMargin + ratio * chartAreaWidth;
}

/** Long-form date label: "June 23, 2026" */
export function longDateLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${MONTH_FULL[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** Compact tick label: "Mar 16" for day-level ticks, "Apr '26" for month-level. */
export function compactLabel(d: Date, includeDay: boolean): string {
  const mon = MONTH_ABBR[d.getMonth()];
  if (!includeDay) return `${mon} '${String(d.getFullYear()).slice(2)}`;
  return `${mon} ${d.getDate()}`;
}

/** Date → ISO string "YYYY-MM-DD" (local time). */
export function toISO(d: Date): string {
  return (
    d.getFullYear() +
    "-" +
    String(d.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(d.getDate()).padStart(2, "0")
  );
}

/**
 * Generate tick marks for the time axis.
 * Chooses daily/weekly/biweekly/monthly ticks depending on date range.
 */
export function generateTicks(
  startDate: string,
  endDate: string,
): { x: string; label: string }[] {
  const start = new Date(startDate + "T00:00:00");
  const end = new Date(endDate + "T00:00:00");
  const rangeDays = (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
  const ticks: { x: string; label: string }[] = [];

  if (rangeDays <= 14) {
    // Daily ticks
    const d = new Date(start);
    while (d <= end) {
      ticks.push({ x: toISO(d), label: compactLabel(d, true) });
      d.setDate(d.getDate() + 1);
    }
  } else if (rangeDays <= 60) {
    // Weekly ticks (Monday)
    const d = new Date(start);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d <= end) {
      ticks.push({ x: toISO(d), label: compactLabel(d, true) });
      d.setDate(d.getDate() + 7);
    }
  } else if (rangeDays <= 180) {
    // Biweekly ticks (every other Monday)
    const d = new Date(start);
    while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
    while (d <= end) {
      ticks.push({ x: toISO(d), label: compactLabel(d, true) });
      d.setDate(d.getDate() + 14);
    }
  } else {
    // Monthly ticks (1st of month) — label without day
    const d = new Date(start.getFullYear(), start.getMonth() + 1, 1);
    while (d <= end) {
      ticks.push({ x: toISO(d), label: compactLabel(d, false) });
      d.setMonth(d.getMonth() + 1);
    }
  }

  return ticks;
}

/**
 * Order activities by topological sort when in dependency mode,
 * fall back to array order otherwise.
 */
export function buildOrderedActivities(
  activities: Activity[],
  dependencies: ActivityDependency[],
  dependencyMode: boolean,
): Activity[] {
  if (!dependencyMode || dependencies.length === 0) return activities;
  try {
    const actIds = activities.map((a) => a.id);
    const graph = buildDependencyGraph(actIds, dependencies);
    const orderMap = new Map(
      graph.topologicalOrder.map((id, idx) => [id, idx]),
    );
    return [...activities].sort(
      (a, b) => (orderMap.get(a.id) ?? 0) - (orderMap.get(b.id) ?? 0),
    );
  } catch {
    return activities;
  }
}
