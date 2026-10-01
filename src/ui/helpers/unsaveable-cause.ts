// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ConstraintMode, ConstraintType } from "@domain/models/types";

/** A reason the Edit Activity window cannot save. */
export type UnsaveableCause = "name" | "negativeEstimate" | "constraintDate" | "constraintMode";

/**
 * Why the Edit Activity window cannot save, if it cannot — the FIRST cause, in the order the user is told.
 * The name comes first because its own message is already on screen beside the field.
 *
 * `null` is exactly the window's `isValid`: it derives that from this, so Save's state and the
 * reasons given for it cannot disagree.
 *
 * ⚠️ `constraintMode` cannot be reached from the window today. Choosing a Type fills an empty Mode
 * with "hard", clearing the Type or "Clear constraint" clears all three, and Mode is a pair of radio
 * buttons, which cannot be unchecked. It stays as a branch so this function is true for every input
 * its signature admits, not only for the ones the window happens to produce.
 */
export function unsaveableCause(
  nameMissing: boolean,
  negativeEstimate: boolean,
  constraintType: ConstraintType | null,
  constraintDate: string | null,
  constraintMode: ConstraintMode | null,
): UnsaveableCause | null {
  if (nameMissing) return "name";
  if (negativeEstimate) return "negativeEstimate";
  if (constraintType && !constraintDate) return "constraintDate";
  if (constraintType && !constraintMode) return "constraintMode";
  return null;
}

/** In the voice of Run's reason under the grid, so the two disabled buttons explain themselves alike. */
const SAVE_BLOCKED_REASON: Record<UnsaveableCause, string> = {
  name: "Save needs a name for this activity.",
  negativeEstimate: "Save needs every estimate to be 0 or more.",
  constraintDate: "Save needs a date for the scheduling constraint.",
  constraintMode: "Save needs a mode for the scheduling constraint.",
};

const UNSAVEABLE_DESCRIPTION: Record<UnsaveableCause, string> = {
  name: "This activity needs a name, so your changes can't be saved. Discarding them can't be undone.",
  negativeEstimate: "An estimate is negative, so your changes can't be saved. Discarding them can't be undone.",
  constraintDate:
    "This activity's constraint needs a date, so your changes can't be saved. Discarding them can't be undone.",
  constraintMode:
    "This activity's constraint needs a mode, so your changes can't be saved. Discarding them can't be undone.",
};

/** The line beside a disabled Save, naming the one cause `unsaveableCause` returned. */
export function saveBlockedReason(cause: UnsaveableCause): string {
  return SAVE_BLOCKED_REASON[cause];
}

/**
 * The "Discard your changes?" prompt's sentence, raised by Escape or a click outside a window that
 * cannot save. It reads the same cause as the line beside Save, so the two cannot disagree.
 */
export function unsaveableDescription(cause: UnsaveableCause): string {
  return UNSAVEABLE_DESCRIPTION[cause];
}
