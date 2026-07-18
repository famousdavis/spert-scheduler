// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity, ConstraintType } from "@domain/models/types";

/** Human-readable labels for constraint types. */
export const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  MSO: "Must Start On",
  MFO: "Must Finish On",
  SNET: "Start No Earlier Than",
  SNLT: "Start No Later Than",
  FNET: "Finish No Earlier Than",
  FNLT: "Finish No Later Than",
};

/** Full display label for a constraint type. */
export function constraintLabel(type: ConstraintType): string {
  return CONSTRAINT_LABELS[type];
}

/**
 * True when at least one activity in the list carries a scheduling constraint.
 * Shared by the activity grid (via unified-activity-helpers) and the schedule
 * export formatters so "do constraints apply in sequential mode?" is answered
 * the same way everywhere (v0.52.1 grid rule; exports adopted it in v0.57.3).
 */
export function hasAnyConstraint(activities: Activity[]): boolean {
  return activities.some((a) => a.constraintType != null);
}
