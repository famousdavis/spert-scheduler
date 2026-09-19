// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useId, useRef, useState } from "react";
import type React from "react";
import type { EstimateKey } from "@domain/helpers/estimate-rules";
import { NO_DRAFTS, refusedDraftsOnly, type EstimateDrafts } from "./activity-row-helpers";

export interface EstimateField {
  dataField: string;
  activityKey: EstimateKey;
  /** The stored number. Displayed rounded — see EstimateCell. */
  value: number;
  error?: string;
  title: string;
}

interface EstimateInputsProps {
  activityId: string;
  fields: EstimateField[];
  /**
   * Called ONCE as focus leaves the three cells, with everything they hold as typed text — and by
   * Escape with nothing at all, which is a revert to the store. The row commits and reports from it.
   */
  onGroupExit: (drafts: EstimateDrafts) => void;
  /** Enter: move focus out of the group. The row decides where; the blur that follows commits. */
  onLeave: (from: HTMLInputElement) => void;
  onKeyDown: (e: React.KeyboardEvent, field: string) => void;
  disabled?: boolean;
}

const INPUT_CLASS_BASE =
  "w-full px-1 py-1 border rounded text-sm tabular-nums text-right dark:bg-gray-700 dark:text-gray-100 focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";

const INPUT_CLASS_ERROR = "border-red-400 bg-red-50 dark:bg-red-900/30";
const INPUT_CLASS_NORMAL = "border-gray-200 dark:border-gray-600";

/** The `data-field`s of the three cells: focus moving between them stays inside the group. */
const GROUP_FIELDS: ReadonlySet<string> = new Set(["min", "ml", "max"]);

/**
 * A window or app switch, not a move within the page. The input is blurred but stays the page's
 * focused element, and the page has lost focus. MEASURED in Chrome 153 (2026-09-18): switching
 * to another window or another app blurred the input with `document.activeElement` still the input
 * and `document.hasFocus()` false; clicking plain text, a `tabIndex={-1}` button or a scenario tab
 * blurred it with `document.activeElement` already the body and `hasFocus()` true.
 *
 * ⚠️ BOTH halves, never `hasFocus()` alone: jsdom clears the focused element before it fires a
 * blur, so `hasFocus()` reads false during EVERY blur there, and every test would read as a switch.
 */
function isWindowSwitch(input: HTMLInputElement): boolean {
  return document.activeElement === input && !document.hasFocus();
}

/**
 * Does this blur take focus out of the row's three estimate cells?
 *
 * - **Stays:** focus moves to another of the three cells of THIS row — Tab or Shift+Tab between
 *   them, or a click. Keyed on the row as well as the field: Shift+Tab out of Min lands on the
 *   row's own name input, and a click can land on another row's Min.
 * - **Stays, owner's ruling (R214):** a window or app switch. The drafts wait, uncommitted, and the
 *   user carries on when they come back. The accepted cost: a half-typed row whose tab is closed
 *   while away is lost, because it was never saved.
 * - **Leaves:** everything else — including a NULL `relatedTarget`, which is what a click on
 *   something that cannot take focus gives. Never refuse null: it is the commonest exit there is
 *   (R186). Whether the activity still exists when the commit lands is the store's check, not this.
 */
function leavesGroup(e: React.FocusEvent<HTMLInputElement>, activityId: string): boolean {
  const next = e.relatedTarget;
  if (next instanceof HTMLElement && next.dataset.rowId === activityId && GROUP_FIELDS.has(next.dataset.field ?? "")) {
    return false;
  }
  return !isWindowSwitch(e.currentTarget);
}

/**
 * One estimate cell (Min / Most Likely / Max). It holds no state: the GROUP holds the drafts
 * (v0.70.0, WI-50), because the three cells commit together when focus leaves them.
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
 * The rule now, in one line: **follow the store unless the user has typed since the group was
 * entered.**
 *
 *   no draft   the store wins — always, focused or not
 *   a draft    the user has typed; their text wins until they leave the GROUP (it was "the cell"
 *              until v0.70.0) — and a REFUSED draft outlives the exit, below
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
 * `1` back. The guard that stops it lives in the group commit (`commitEstimateGroup`) and
 * compares what is on screen — the typed number and the stored one, both rounded.
 */
function EstimateCell({
  activityId,
  field,
  draft,
  onDraft,
  onFocus,
  onBlur,
  onKeyDown,
  disabled,
}: {
  activityId: string;
  field: EstimateField;
  draft: string | undefined;
  onDraft: (key: EstimateKey, text: string) => void;
  onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
  onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>, field: string) => void;
  disabled?: boolean;
}) {
  const stored = String(Math.round(field.value));
  const errorId = useId();

  return (
    <>
      <input
        data-row-id={activityId}
        data-field={field.dataField}
        name={`estimate-${field.dataField}`}
        aria-label={field.title}
        type="number"
        value={draft ?? stored}
        onChange={(e) => onDraft(field.activityKey, e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={(e) => onKeyDown(e, field.dataField)}
        disabled={disabled}
        className={`${INPUT_CLASS_BASE} ${field.error ? INPUT_CLASS_ERROR : INPUT_CLASS_NORMAL}`}
        step="1"
        min="0"
        title={field.error ?? field.title}
        {...invalidAria(field.error, errorId)}
      />
      {/* v0.69.0 — the red is announced, not only painted: the message a sighted user reads in
          the title, as text the input is described by. SCREEN-READER ONLY on purpose: a visible
          line would grow the row, and a row that grows under a press moves every row below it. */}
      {field.error && (
        <span id={errorId} className="sr-only">
          {field.error}
        </span>
      )}
    </>
  );
}

/**
 * `aria-invalid` and `aria-describedby` for a red cell, nothing for a clean one — spread onto
 * the input, so the cell gains no conditional of its own.
 */
function invalidAria(
  error: string | undefined,
  errorId: string
): { "aria-invalid"?: true; "aria-describedby"?: string } {
  return error ? { "aria-invalid": true, "aria-describedby": errorId } : {};
}

/**
 * The three estimate cells as ONE GROUP (v0.70.0, WI-50). What is typed into any of them is held
 * here, and nothing is written or checked while focus moves between them; when focus leaves the
 * group the row commits all of it at once — one write, one undo frame — and only then is anything
 * flagged. Enter commits and leaves; Escape reverts all three to the store.
 *
 * ⚠️ NO WRAPPER ELEMENT, so no single `focusout` to listen for: the cells are DIRECT CSS-grid
 * children of the row, and `grid-column-alignment.test.tsx` asserts that structure. Each cell's own
 * blur decides whether focus left the group (`leavesGroup`).
 */
export function EstimateInputs({
  activityId,
  fields,
  onGroupExit,
  onLeave,
  onKeyDown,
  disabled,
}: EstimateInputsProps) {
  const [drafts, setDrafts] = useState<EstimateDrafts>(NO_DRAFTS);
  // Escape reverts and then blurs, and that blur runs with the drafts Escape has just cleared still
  // in hand — state set in the keydown has not rendered yet — so without this it would commit
  // exactly what Escape cancelled: WI-29's defect. The name field solves the same race the same way
  // (`useBufferedField`'s `suppressNextBlur`). Cleared on focus, in case the blur never came.
  const skipNextExit = useRef(false);

  const handleDraft = (key: EstimateKey, text: string) => {
    setDrafts((prev) => ({ ...prev, [key]: text }));
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    skipNextExit.current = false;
    e.target.select();
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (skipNextExit.current) {
      skipNextExit.current = false;
      return;
    }
    if (!leavesGroup(e, activityId)) return;
    // Synchronously, in this blur, through the row's props of THIS render: a scenario tab takes
    // focus before its click switches the scenario, so the commit lands in the scenario being left.
    onGroupExit(drafts);
    setDrafts(refusedDraftsOnly(drafts));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, dataField: string) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onLeave(e.currentTarget);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      skipNextExit.current = true;
      setDrafts(NO_DRAFTS);
      onGroupExit(NO_DRAFTS);
      e.currentTarget.blur();
      return;
    }
    onKeyDown(e, dataField);
  };

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
            draft={drafts[f.activityKey]}
            onDraft={handleDraft}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            disabled={disabled}
          />
        </div>
      ))}
    </>
  );
}
