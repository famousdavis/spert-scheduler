// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect, useCallback, useMemo } from "react";

/**
 * Buffers an externally-sourced string value in local state while the
 * associated input is focused, preventing remote state updates (Firestore
 * server-ack snapshots, undo, real-time sync from other clients) from
 * overwriting in-progress typing. Commits to the store only on focus loss,
 * change-aware: compares the typed value against the value at focus time
 * (not the live external value), so a no-op blur never triggers onCommit
 * even if an external update arrived while focused.
 *
 * Compatible with imperative .focus() calls (e.g., autoFocus effects) —
 * the native focus event triggers handleFocus before any sync useEffect runs.
 *
 * Works equally for <input> and <textarea> elements.
 *
 * The onCommit callback receives a `controls` object (BufferedFieldControls)
 * as its second argument. Call `controls.reset()` from inside onCommit to
 * resync the buffer to the current externalValue — useful for callers that
 * reject the typed value (e.g., InlineEdit rejecting empty-after-trim) and
 * want the next focus cycle to start from the canonical value rather than
 * the user's discarded input. Distinct from `revertValue()`, which is the
 * Escape-time revert to the focus-time snapshot.
 *
 * CALLER REQUIREMENT: the component using this hook must be keyed on the
 * logical entity's id (e.g., key={activity.id}) so that switching entities
 * remounts the component and re-initializes localValue via useState.
 * Without a key shift, useState(externalValue) retains the prior entity's
 * buffered value.
 *
 * CALL SITE STABILITY: wrap onCommit in useCallback at the call site to
 * avoid rebuilding handleBlur on every parent render.
 *
 * Used by UnifiedActivityRow, BandHeaderRow (v0.46.1), MilestonePanel
 * (milestone name), and InlineEdit (project + scenario rename) (v0.46.2).
 * The ActivityEditModal name/notes were considered and intentionally
 * excluded: the modal uses useState(prop) initializers without a sync
 * useEffect and commits atomically on Save, so it does not exhibit the
 * cloud-sync echo race this hook addresses.
 */
export interface BufferedFieldControls {
  /**
   * Force-resync the buffer to the current externalValue, overriding the
   * focus guard. Call from inside onCommit to discard typed input after a
   * rejected commit (e.g., empty-after-trim).
   *
   * Distinct from revertValue():
   *   - revertValue() resets to the FOCUS-TIME snapshot and sets
   *     suppressNextBlur (for Escape — caller is about to .blur() and
   *     wants to skip the impending commit).
   *   - controls.reset() resets to the CURRENT externalValue without
   *     touching suppressNextBlur (for post-commit rejection — the commit
   *     already ran and decided not to save; we resync the buffer for the
   *     next focus cycle).
   */
  reset: () => void;
}

export interface BufferedField {
  localValue: string;
  /** For the input's onChange handler only. Calling while unfocused will be
   *  silently overwritten by the next external value change via the sync effect. */
  setLocalValue: (v: string) => void;
  handleFocus: () => void;
  handleBlur: () => void;
  /**
   * Sets the suppress flag and queues a state revert to the value at focus
   * time (the focusedSnapshot). The caller MUST call inputEl.blur()
   * immediately after — ordering matters. The blur event fires synchronously;
   * React has not yet committed the setLocalValue update, so the DOM still
   * shows the typed value. Without the suppress flag, handleBlur would read
   * the typed value and commit it, defeating the revert.
   *
   * If blur does not fire after revertValue() (detached element, focus
   * already moved by a parent), the suppress flag stays armed until the next
   * focus cycle, where handleFocus clears it. Any typing between an
   * unanswered revertValue() call and the next blur will be silently
   * discarded.
   */
  revertValue: () => void;
}

export function useBufferedField(
  externalValue: string,
  onCommit: (value: string, controls: BufferedFieldControls) => void,
): BufferedField {
  const [localValue, setLocalValue] = useState(externalValue);
  const isFocused = useRef(false);
  const suppressNextBlur = useRef(false);
  // Snapshot of externalValue at the most recent handleFocus call.
  // handleBlur and revertValue use this rather than live externalValue so
  // that (a) a no-op blur does not commit when an external update arrived
  // while focused, and (b) Escape reverts to what the user saw when they
  // focused, not a collaborator's unseen rename.
  const focusedSnapshot = useRef(externalValue);
  // Tracks the latest externalValue so reset() reads the current value
  // without churning identity on every external update.
  const externalValueRef = useRef(externalValue);
  useEffect(() => {
    externalValueRef.current = externalValue;
  }, [externalValue]);

  useEffect(() => {
    if (!isFocused.current) {
      setLocalValue(externalValue); // eslint-disable-line react-hooks/set-state-in-effect -- intentional: syncs buffer with external value (cloud sync, undo) only when not focused
    }
  }, [externalValue]);

  const handleFocus = useCallback(() => {
    isFocused.current = true;
    focusedSnapshot.current = externalValue;
    suppressNextBlur.current = false; // clear any stale flag from a prior Escape that didn't complete its blur
  }, [externalValue]);

  const reset = useCallback(() => {
    setLocalValue(externalValueRef.current);
  }, []); // stable — externalValueRef.current is read at call time

  // controls is memoized so handleBlur's dep array stays stable.
  // This is load-bearing: controls is in handleBlur's useCallback deps below;
  // without the memo, handleBlur would recreate every render.
  // (Alternative considered: route onCommit through an internal ref inside
  // the hook and return reset directly. Rejected: the controls-as-arg
  // approach keeps the caller's handleCommit dep array clean without
  // hook-internal plumbing the caller cannot see.)
  const controls: BufferedFieldControls = useMemo(() => ({ reset }), [reset]);

  // handleBlur's identity changes whenever localValue or onCommit changes —
  // in practice, on every keystroke and every parent render given the
  // typical inline-arrow caller pattern (mitigated by call-site useCallback).
  // This is acceptable for JSX event handlers. Do NOT put handleBlur in a
  // useEffect dep list.
  const handleBlur = useCallback(() => {
    isFocused.current = false;
    if (suppressNextBlur.current) {
      suppressNextBlur.current = false;
      return;
    }
    // Compare against snapshot, not live externalValue. If an external update
    // arrived while focused (and was suppressed), we still only commit if the
    // user actually typed something different from what they saw at focus time.
    if (localValue !== focusedSnapshot.current) {
      onCommit(localValue, controls);
    }
  }, [localValue, onCommit, controls]); // focusedSnapshot is a ref — not a reactive dep

  const revertValue = useCallback(() => {
    suppressNextBlur.current = true;
    setLocalValue(focusedSnapshot.current); // restore value at focus time
  }, []); // focusedSnapshot is a ref — always reads current value; no deps needed

  return { localValue, setLocalValue, handleFocus, handleBlur, revertValue };
}
