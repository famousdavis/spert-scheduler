// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Calendar } from "@domain/models/types";
import type { EstimateKey } from "@domain/helpers/estimate-rules";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { countWorkingDays, parseDateISO, isWorkingDay } from "@core/calendar/calendar";
import { computeHeuristic } from "@core/estimation/heuristic";

/**
 * Focus a field in a specific activity row by data attributes.
 */
export function focusField(rowId: string, field: string): boolean {
  const el = document.querySelector<HTMLElement>(
    `[data-row-id="${rowId}"][data-field="${field}"]`
  );
  if (el) {
    el.focus();
    return true;
  }
  return false;
}

/**
 * Focus the Name field of the next activity row.
 * If on the last row, focus the add-activity button instead.
 */
export function focusNextRow(currentRowId: string, activities: string[]): boolean {
  const idx = activities.indexOf(currentRowId);
  if (idx >= 0 && idx < activities.length - 1) {
    return focusField(activities[idx + 1]!, "name");
  }
  // Focus the add-activity button if last row
  const addBtn = document.querySelector<HTMLElement>(
    '[data-field="add-activity"]'
  );
  if (addBtn) {
    addBtn.focus();
    return true;
  }
  return false;
}

/**
 * Focus the last editable field of the previous activity row.
 * Tries "actual" first (for complete rows), then the hint field, then "max".
 */
export function focusPrevRow(
  currentRowId: string,
  activities: string[],
  lastFieldHint?: string
): boolean {
  const idx = activities.indexOf(currentRowId);
  if (idx > 0) {
    const prevRowId = activities[idx - 1]!;
    // Try to focus "actual" first (if prev row is complete), then hint, then "max"
    if (focusField(prevRowId, "actual")) {
      return true;
    }
    if (lastFieldHint && focusField(prevRowId, lastFieldHint)) {
      return true;
    }
    return focusField(prevRowId, "max");
  }
  return false;
}

/**
 * Compute elapsed working days from a scheduled start date to today.
 * Inclusive of both start and today (if today is a working day).
 * Returns at least 1.
 *
 * Accepts both `WorkCalendar` (class with `isWorkDay`) and `Calendar`
 * (plain data object) because callers may have either form depending on
 * context — `countWorkingDays` and `isWorkingDay` handle both internally.
 */
export function computeElapsedDays(
  scheduledStartDate: string | undefined,
  calendar?: WorkCalendar | Calendar
): number {
  if (!scheduledStartDate) return 1;
  const start = parseDateISO(scheduledStartDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (start > today) return 1; // future start → default 1
  const elapsed =
    countWorkingDays(start, today, calendar) +
    (isWorkingDay(today, calendar) ? 1 : 0);
  return Math.max(1, elapsed);
}

export const ENTER_A_NUMBER = "Enter a number.";
export const ENTER_ZERO_OR_MORE = "Enter 0 or more.";

/**
 * Why an estimate cell's entry cannot be stored — or `null` when it can. The grid row refuses
 * the entry at the blur and flags the cell; the cell keeps the text on screen (v0.63.1's rule).
 *
 * - Not a number — in practice a CLEARED cell (v0.63.1).
 * - A NEGATIVE number (v0.69.0). Until then `-5` was stored, and the next load rejected the
 *   whole project: estimates are `nonnegative()` in the schema every load gate uses. `-0` is 0.
 */
export function refuseEstimateEntry(raw: string): string | null {
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed)) return ENTER_A_NUMBER;
  return parsed < 0 ? ENTER_ZERO_OR_MORE : null;
}

const ESTIMATE_KEYS: readonly EstimateKey[] = ["min", "mostLikely", "max"];

/**
 * What a row's three estimate cells hold as typed text, by field (v0.70.0). A field is absent
 * while its cell shows the store — nothing typed since the group was entered, or since the last
 * exit settled it.
 */
export type EstimateDrafts = Partial<Record<EstimateKey, string>>;

export const NO_DRAFTS: EstimateDrafts = {};

/** The heuristic's two percentages, for a scenario that has it switched on. */
export interface HeuristicPercents {
  minPercent: number;
  maxPercent: number;
}

/** What one exit from the three estimate cells writes, and what it refuses to store. */
export interface EstimateGroupCommit {
  /** The fields to write, each a whole number; `null` when nothing on screen changes. */
  updates: Partial<Record<EstimateKey, number>> | null;
  /** The cells holding an entry that cannot be stored, with each cell's message. */
  refused: Partial<Record<EstimateKey, string>>;
}

/**
 * THE GROUP COMMIT (v0.70.0, WI-50): what the row writes when focus leaves its three estimate
 * cells, decided from everything typed during the visit at once. Until v0.70.0 each cell committed
 * on its own blur, against two stale siblings, so typing 11 into Min of a 5-10-20 row saved 11/10/20
 * — flagged — at the first Tab.
 *
 * - **A refused entry is never written** (a cleared cell since v0.63.1, a negative one since
 *   v0.69.0). It keeps its text on screen and is reported by field. ⚠️ THIS BRANCH IS PROTECTED:
 *   before v0.63.1 a cleared cell did NOTHING — no commit, no report, no error — while the cell
 *   showed empty and the store held the old number. Restoring the stored number instead was
 *   considered and rejected: it silently undoes what the user deliberately did. Pinned by
 *   `UnifiedActivityRow.blur.test.tsx`'s "reports the cleared field as invalid instead of doing
 *   nothing" and "flags the cleared field so the user can see something happened".
 * - **A typed number is written only when the number on screen changes (R40)** — the typed value
 *   and the stored one BOTH rounded, because the cell shows whole numbers while the store may hold a
 *   fraction (`computeHeuristic` gives 0.75). Rounded on one side only, `5.4` typed over a stored `5`
 *   writes a no-op, and a stored `0.75` under a cell showing `1` is rewritten by a look.
 * - **Typed values beat the heuristic (R185.7).** With it on and Most Likely changed, it fills only
 *   the cells that hold nothing typed — so Most Likely alone recomputes Min and Max, and Most Likely
 *   with a typed Min keeps the Min. A refused cell holds typed text too, so it is not filled: a
 *   cleared cell stays empty and flagged (R185.5).
 *
 * An out-of-order triple IS written: it is saved and flagged from the saved data (v0.63.1's
 * commit-and-flag, v0.69.0's derived flag). Module scope and pure, so the row stays a caller.
 */
export function commitEstimateGroup(
  stored: Readonly<Record<EstimateKey, number>>,
  drafts: EstimateDrafts,
  heuristic: HeuristicPercents | null
): EstimateGroupCommit {
  const typed: Partial<Record<EstimateKey, number>> = {};
  const refused: Partial<Record<EstimateKey, string>> = {};
  for (const key of ESTIMATE_KEYS) {
    const raw = drafts[key];
    if (raw === undefined) continue;
    const refusal = refuseEstimateEntry(raw);
    if (refusal === null) typed[key] = Math.round(parseFloat(raw));
    else refused[key] = refusal;
  }
  const updates = { ...heuristicFill(stored, drafts, typed.mostLikely, heuristic), ...changedOnScreen(stored, typed) };
  return { updates: Object.keys(updates).length > 0 ? updates : null, refused };
}

/** The heuristic's Min and Max for a changed Most Likely, for the cells holding nothing typed. */
function heuristicFill(
  stored: Readonly<Record<EstimateKey, number>>,
  drafts: EstimateDrafts,
  mostLikely: number | undefined,
  heuristic: HeuristicPercents | null
): Partial<Record<EstimateKey, number>> {
  if (heuristic === null || mostLikely === undefined || mostLikely === Math.round(stored.mostLikely)) return {};
  const computed = computeHeuristic(mostLikely, heuristic.minPercent, heuristic.maxPercent);
  const fill: Partial<Record<EstimateKey, number>> = {};
  if (drafts.min === undefined) fill.min = Math.round(computed.min);
  if (drafts.max === undefined) fill.max = Math.round(computed.max);
  return fill;
}

/** The typed values that change the number on screen — both sides rounded (R40). */
function changedOnScreen(
  stored: Readonly<Record<EstimateKey, number>>,
  typed: Partial<Record<EstimateKey, number>>
): Partial<Record<EstimateKey, number>> {
  const changed: Partial<Record<EstimateKey, number>> = {};
  for (const key of ESTIMATE_KEYS) {
    const value = typed[key];
    if (value !== undefined && value !== Math.round(stored[key])) changed[key] = value;
  }
  return changed;
}

/**
 * The drafts that outlive a group exit: the refused ones, which stay on screen, red, until they are
 * typed over or Escape reverts the group (v0.63.1's rule). Everything else goes back to following the
 * store. `NO_DRAFTS` itself when none survive, so settling an ordinary exit sets no new state.
 */
export function refusedDraftsOnly(drafts: EstimateDrafts): EstimateDrafts {
  const kept: EstimateDrafts = {};
  for (const key of ESTIMATE_KEYS) {
    const text = drafts[key];
    if (text !== undefined && refuseEstimateEntry(text) !== null) kept[key] = text;
  }
  return Object.keys(kept).length > 0 ? kept : NO_DRAFTS;
}
