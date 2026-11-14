// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { undoRedoForKey, type UndoRedoAction } from "./undo-keys";

/**
 * The undo/redo key rule as a decision table, every row written out with its expected
 * action — none computed by calling the rule. `key` is what a browser puts in
 * `KeyboardEvent.key`; the caller has already checked that Ctrl or Cmd is held.
 *
 * The rows marked "browser" are the spellings a real keyboard sends and the old handler
 * missed: Shift+Z arrives as "Z", and Caps Lock turns Z and Y into "Z" and "Y" with
 * Shift off. Before v0.86.5 every one of them returned nothing.
 */
const TABLE: ReadonlyArray<[label: string, key: unknown, shiftKey: boolean, expected: UndoRedoAction | null]> = [
  ["z: undo", "z", false, "undo"],
  ["Shift+Z as a browser sends it, 'Z': redo", "Z", true, "redo"],
  ["Shift+Z as a Mac browser that drops Shift with Cmd sends it, 'z': redo", "z", true, "redo"],
  ["Caps Lock z, 'Z' with Shift off: undo", "Z", false, "undo"],
  ["y: redo", "y", false, "redo"],
  ["Caps Lock y, 'Y' with Shift off: redo", "Y", false, "redo"],
  ["Shift+Y as a browser sends it, 'Y': nothing", "Y", true, null],
  ["Shift+Y with Shift dropped, 'y': nothing", "y", true, null],
  ["another letter: nothing", "x", false, null],
  ["another letter with Shift: nothing", "X", true, null],
  ["the modifier's own key: nothing", "Control", false, null],
  ["the Meta key: nothing", "Meta", false, null],
  ["an empty key: nothing", "", false, null],
  ["a word that starts with z: nothing", "Zenkaku", false, null],
  ["a Cyrillic layout's Z key, 'я': nothing (not handled)", "я", false, null],
  ["no key at all: nothing", undefined, false, null],
  ["no key at all, Shift held: nothing", undefined, true, null],
  ["a null key: nothing", null, false, null],
  ["a number: nothing", 26, false, null],
];

describe("undoRedoForKey — which action a Ctrl/Cmd key press asks for", () => {
  it.each(TABLE)("%s", (_label, key, shiftKey, expected) => {
    expect(undoRedoForKey(key, shiftKey)).toBe(expected);
  });

  it("the table covers both actions and the null case", () => {
    const outcomes = new Set(TABLE.map((row) => row[3]));
    expect(outcomes).toEqual(new Set(["undo", "redo", null]));
  });
});
