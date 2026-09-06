// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from "react";
import type React from "react";

interface EstimateField {
  dataField: string;
  activityKey: string;
  /** The stored number. Displayed rounded — see EstimateCell. */
  value: number;
  error?: string;
  title: string;
}

interface EstimateInputsProps {
  activityId: string;
  fields: EstimateField[];
  onBlur: (field: string, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent, field: string) => void;
  disabled?: boolean;
}

const INPUT_CLASS_BASE =
  "w-full px-1 py-1 border rounded text-sm tabular-nums text-right dark:bg-gray-700 dark:text-gray-100 focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

const INPUT_CLASS_ERROR = "border-red-400 bg-red-50 dark:bg-red-900/30";
const INPUT_CLASS_NORMAL = "border-gray-200 dark:border-gray-600";

/**
 * One estimate cell (Min / Most Likely / Max).
 *
 * ⚠️ v0.67.2 — CONTROLLED, and it used to be uncontrolled (`defaultValue`). That is the
 * whole of WI-2 and it was not a cosmetic change. React writes `element.value` once at
 * mount for an uncontrolled input, which sets the browser's dirty-value flag from birth;
 * every later `defaultValue` change updates only the ATTRIBUTE. So the cell stopped
 * following the store the instant it mounted — Undo, Redo, the Edit Activity modal, bulk
 * heuristic recalculation, AI Connect and cloud echo all moved the number underneath a
 * cell that went on showing the old one. Then the next blur committed that old one back
 * over the store: clicking a cell and clicking away silently rewrote the project.
 *
 * The rule now, in one line: **follow the store unless the user has typed since focusing.**
 *
 *   `draft === null`  the store wins — always, focused or not
 *   `draft !== null`  the user has typed; their text wins until they leave the cell
 *
 * Keeping the store while focused-but-untouched (rather than snapshotting at focus, the
 * way `useBufferedField` does for text) is deliberate: a snapshot taken at focus is still
 * correct on the first blur but re-commits the suppressed stale value on the SECOND
 * focus/blur cycle, with the user having typed nothing at all. There is nothing to protect
 * until something has been typed.
 *
 * ⚠️ WHAT IS NOT REUSED, AND WHY. `useBufferedField` is this repo's pattern for exactly
 * this shape, and it is deliberately not used here for the reason above; a value-bearing
 * `key` (what the Actual-duration input beside this one uses) is the other candidate and
 * was rejected because a remount inside the blur microtask lands focus on `<body>` —
 * measured in Chromium — so clicking from ML straight into Min or Max with the heuristic
 * on would lose the user's click. Neither file was modified.
 *
 * ⚠️ DELIBERATE RESIDUE (R40, owner's decision): the cell displays `Math.round(value)`
 * while the store may hold a fraction — `computeHeuristic` stores `0.75` for a row added
 * with the heuristic on. A cell showing `1` over a stored `0.75` is CORRECT and is not to
 * be "fixed": whole numbers are what this grid shows. What was wrong was committing that
 * `1` back. The guard that stops it lives in `UnifiedActivityRow`'s `validateAndUpdate`
 * and compares the rounded stored number, i.e. what is on screen — not the raw one.
 */
function EstimateCell({
  activityId,
  field,
  onBlur,
  onKeyDown,
  disabled,
}: {
  activityId: string;
  field: EstimateField;
  onBlur: (field: string, value: string) => void;
  onKeyDown: (e: React.KeyboardEvent, field: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const stored = String(Math.round(field.value));

  return (
    <input
      data-row-id={activityId}
      data-field={field.dataField}
      name={`estimate-${field.dataField}`}
      aria-label={field.title}
      type="number"
      value={draft ?? stored}
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.target.select()}
      onBlur={(e) => {
        const raw = e.currentTarget.value;
        // Reported on EVERY blur, unchanged from before v0.67.2 — including a blur that
        // typed nothing. The row needs it to mark the field touched and to re-report
        // validity; what v0.67.2 removed is the store WRITE, and that removal lives in
        // the row so the touched/validity sequence does not move with it.
        onBlur(field.activityKey, raw);
        // Back to following the store — unless the entry cannot be read as a number,
        // which in practice means the user cleared the field. That is flagged and left
        // on screen exactly as typed (v0.63.1): restoring the stored number here would
        // silently undo work the user deliberately did.
        setDraft(Number.isNaN(parseFloat(raw)) ? raw : null);
      }}
      onKeyDown={(e) => onKeyDown(e, field.dataField)}
      disabled={disabled}
      className={`${INPUT_CLASS_BASE} ${field.error ? INPUT_CLASS_ERROR : INPUT_CLASS_NORMAL}`}
      step="1"
      min="0"
      title={field.error ?? field.title}
    />
  );
}

export function EstimateInputs({
  activityId,
  fields,
  onBlur,
  onKeyDown,
  disabled,
}: EstimateInputsProps) {
  return (
    <>
      {fields.map((f) => (
        // Keyed on the activity as well as the field so a cell can never carry a draft
        // across to a different activity. Not value-bearing: nothing here changes when
        // an estimate changes, so a store write updates the cell in place rather than
        // remounting it and dropping the focus.
        <div key={`${activityId}-${f.dataField}`}>
          <EstimateCell
            activityId={activityId}
            field={f}
            onBlur={onBlur}
            onKeyDown={onKeyDown}
            disabled={disabled}
          />
        </div>
      ))}
    </>
  );
}
