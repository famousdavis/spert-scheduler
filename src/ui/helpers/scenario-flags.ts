// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity } from "@domain/models/types";
import { deriveEstimateValidity, parseSavedActivities } from "@ui/hooks/use-estimate-validity";

/** One flagged activity of a scenario's SAVED plan. */
export interface SavedFlaggedRow {
  id: string;
  /** 1-based place in THIS scenario's own activity list — the number its grid and its printout show. */
  position: number;
  name: string;
  /** The validation summary's own words for this activity (the same array it renders). */
  messages: readonly string[];
}

export interface SavedScenarioFlags {
  rows: readonly SavedFlaggedRow[];
  /** At least one flagged row's distribution cannot be built, so the schedule cannot be calculated. */
  anyStops: boolean;
}

/** No row reports: a cell the grid REFUSED to store is never in the saved plan. */
const NO_ROW_REPORTS = new Map<string, never>();

/**
 * What is flagged in a scenario's SAVED activities (WI-58) — for ANY scenario, not only the one on
 * screen. Compare and print describe the saved plan (owner ruling, 2026-09-27): a column or a
 * printout is flagged when its saved activities hold an issue. An entry the grid refused to store — a
 * cleared or negative cell — lives in the row, never in the store, so it marks neither; it shows only
 * on its own screen.
 *
 * The same two functions the page's own validity is built from, so a row is flagged here exactly when
 * the validation summary would list it, with the summary's own messages, and `anyStops` is the same
 * gate the schedule-error banner reads (`flaggedThrower`).
 */
export function savedScenarioFlags(
  activities: readonly Activity[],
  probabilityTarget: number
): SavedScenarioFlags {
  const derived = deriveEstimateValidity(
    activities,
    parseSavedActivities(activities),
    NO_ROW_REPORTS,
    probabilityTarget
  );
  const positions = new Map(activities.map((activity, index) => [activity.id, index + 1]));
  return {
    rows: derived.flaggedRows.map((row) => ({
      id: row.id,
      position: positions.get(row.id) ?? 0,
      name: row.name,
      messages: row.messages,
    })),
    anyStops: derived.flaggedThrower !== null,
  };
}
