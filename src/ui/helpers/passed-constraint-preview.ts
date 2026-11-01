// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  Activity,
  Calendar,
  ConstraintConflict,
  ConstraintMode,
  ConstraintType,
  DeterministicSchedule,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { activityEndDate, activityStartDate, formatDateISO, parseDateISO } from "@core/calendar/calendar";
import { resolveDataDate, scenarioDataDate, startSetsConstraintAside } from "@core/schedule/recorded-progress";
import { applyForwardConstraint } from "@core/schedule/constraint-utils";
import { nameOrUnnamed } from "@domain/helpers/display-name";

export interface ConstraintDraft {
  type: ConstraintType;
  date: string;
  mode: ConstraintMode;
}

/**
 * WI-154 (Review 35, interactions E4 and verification E5) — the Edit Activity window's Constraint
 * line for a hard Must Start On or Must Finish On whose date has passed, on an activity that has not
 * started, in a scenario that holds a record. The schedule does not hold such a date: it starts the
 * activity no earlier than today (owner, R639, decision 2). So the window must never say "Constraint
 * date held".
 *  - The constraint as saved: the schedule's own red words for the row — the page's, exactly.
 *  - A draft not yet saved: the same words for what the schedule will do, which needs no guess at
 *    the activity's other links: no earlier than today.
 * And once the Status draft has started (Review 36, E1), whatever the activity's stored Status: the
 * start it records sets a start constraint aside — a Complete one's finish constraint too — so the
 * page will show no conflict for it, and nor does the window. An In Progress forecast finish still
 * meets its hard finish constraint, from the start it records, in the page's words (the rule
 * `placeRecordedRow` applies).
 * `undefined` for anything else, which keeps the window's preview as it was.
 */
export function passedConstraintPreview(args: {
  activity: Activity | undefined;
  draftStatus: Activity["status"];
  draft: ConstraintDraft;
  schedule: DeterministicSchedule | undefined;
  activities: Activity[];
  scenarioStartDate: string | undefined;
  durationDays: number;
  today: string;
  calendar?: WorkCalendar | Calendar;
  /** The Actual Start the window will save, when its Status draft has started. */
  draftActualStart?: string;
}): ConstraintConflict | null | undefined {
  const { activity, draft } = args;
  if (activity && args.draftStatus !== "planned") return startedPreview(activity, args);
  if (!activity || activity.status !== "planned" || !args.scenarioStartDate) return undefined;
  if (draft.mode !== "hard" || (draft.type !== "MSO" && draft.type !== "MFO")) return undefined;
  const floor = resolveDataDate(scenarioDataDate(args.activities, args.today), args.scenarioStartDate, args.calendar);
  if (!floor) return undefined;
  const saved = activity.constraintType === draft.type && activity.constraintDate === draft.date && activity.constraintMode === draft.mode;
  if (saved) return args.schedule?.constraintConflicts?.find((c) => c.activityId === activity.id && c.passed);
  const start = draft.type === "MSO"
    ? parseDateISO(draft.date)
    : activityStartDate(parseDateISO(draft.date), args.durationDays, args.calendar);
  if (start >= floor.date) return undefined;
  const name = nameOrUnnamed(activity.name);
  const dateISO = formatDateISO(floor.date);
  const when = dateISO === floor.today ? `today, ${dateISO}` : `${dateISO}, the next working day`;
  const message = draft.type === "MFO"
    ? `${name}: Must Finish On ${draft.date} cannot be met: ${name} has not started, so the schedule will start it no earlier than ${when}.`
    : `${name}: Must Start On ${draft.date} has passed, and ${name} has not started, so the schedule will start it no earlier than ${when}.`;
  return {
    type: "constraint-conflict", activityId: activity.id, activityName: activity.name,
    constraintType: draft.type, constraintDate: draft.date, constraintMode: "hard",
    computedDate: dateISO, deltaWorkingDays: 0, severity: "error", message, passed: true,
  };
}

/** The Status draft has started: the page's rule for a recorded start (see above). */
function startedPreview(
  activity: Activity,
  args: { draftStatus: Activity["status"]; draft: ConstraintDraft; durationDays: number; draftActualStart?: string; calendar?: WorkCalendar | Calendar },
): ConstraintConflict | null | undefined {
  const { draft } = args;
  if (startSetsConstraintAside(draft.type, args.draftStatus === "complete")) return null;
  if (draft.mode !== "hard" || !args.draftActualStart) return undefined;
  const end = activityEndDate(parseDateISO(args.draftActualStart), args.durationDays, args.calendar);
  return applyForwardConstraint(
    args.draftActualStart, formatDateISO(end), args.durationDays, draft.type, draft.date, "hard", activity.id, activity.name, args.calendar,
  ).conflict;
}
