// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

export type UndoRedoAction = "undo" | "redo";

/**
 * Which store action a Ctrl/Cmd key press asks for, from its `key` and Shift alone.
 * The caller has already checked that Ctrl or Cmd is held, and that the press is not
 * for a text field or an open window (`ProjectPage`'s handler).
 *
 * The letter is read WITHOUT its case (v0.86.5). A browser reports Shift+Z as "Z", so
 * the handler's old `e.key === "z" && e.shiftKey` never matched a real Ctrl+Shift+Z —
 * the redo the keyboard shortcuts window lists — and Caps Lock turned Ctrl+Z into "Z",
 * which undid nothing. The tests had sent `key: "z"` with Shift, which only the Mac
 * browsers that drop Shift from `key` while Cmd is held send. Shift still decides there,
 * so both spellings redo.
 *
 * - Z without Shift: undo.
 * - Z with Shift: redo.
 * - Y without Shift: redo. Y WITH Shift stays unbound, as it was in every browser that
 *   reports Shift+Y as "Y": ignoring case must not newly take Ctrl/Cmd+Shift+Y.
 * - Anything else, a missing key included: `null`, and the page leaves the key alone.
 */
export function undoRedoForKey(key: unknown, shiftKey: boolean): UndoRedoAction | null {
  if (typeof key !== "string") return null;
  const letter = key.toLowerCase();
  if (letter === "z") return shiftKey ? "redo" : "undo";
  if (letter === "y" && !shiftKey) return "redo";
  return null;
}
