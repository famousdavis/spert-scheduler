// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  GRID_COLUMNS,
  GRID_COLUMNS_WITH_CONSTRAINT,
  GRID_COLUMN_LIST,
  GRID_COLUMN_LIST_WITH_CONSTRAINT,
  CONSTRAINT_COLUMN,
} from "./grid-columns";

/**
 * **Byte-identity proof for the `grid-columns` refactor (v0.67.0).**
 *
 * The two templates were bare literal strings; they are now generated from a named
 * column list. **That refactor must change nothing**, so the literals below are the
 * exact strings from `a651b9d`, transcribed before the change, and the generated
 * templates must equal them character for character.
 *
 * ⚠️ **These literals are the PRE-refactor values and are load-bearing as such.** When a
 * column order or width genuinely changes, this file changes **in that commit** — never
 * to make a refactor pass. A refactor that needs this file edited is not a refactor.
 */

// Transcribed from grid-columns.ts at a651b9d, before the list existed.
const LITERAL_AT_a651b9d =
  "24px 20px 1fr 40px 90px 90px 38px 38px 38px 96px 110px 110px 40px 1px 40px 8px";
const LITERAL_WITH_CONSTRAINT_AT_a651b9d =
  "24px 20px 1fr 40px 90px 90px 80px 38px 38px 38px 96px 110px 110px 40px 1px 40px 8px";

describe("grid-columns: generating the template changed nothing", () => {
  it("GRID_COLUMNS is byte-identical to the literal it replaced", () => {
    expect(GRID_COLUMNS).toBe(LITERAL_AT_a651b9d);
  });

  it("GRID_COLUMNS_WITH_CONSTRAINT is byte-identical to the literal it replaced", () => {
    expect(GRID_COLUMNS_WITH_CONSTRAINT).toBe(LITERAL_WITH_CONSTRAINT_AT_a651b9d);
  });
});

describe("grid-columns: the named list is well formed", () => {
  it("names are unique — the list is addressable by name", () => {
    const names = GRID_COLUMN_LIST.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("the constraint column is inserted after `end`, not appended", () => {
    const names = GRID_COLUMN_LIST_WITH_CONSTRAINT.map((c) => c.name);
    expect(names[names.indexOf("end") + 1]).toBe(CONSTRAINT_COLUMN.name);
    // ⚠️ Appending would still produce the right track COUNT while misaligning every
    // column after `end` — a count check cannot see it, so assert the position.
    expect(names[names.length - 1]).toBe("trailing");
  });

  it("adding the constraint column changes the track count by exactly one", () => {
    // BandHeaderRow spans `gridColumn: "4 / -2"`, which is relative to the track count.
    expect(GRID_COLUMN_LIST_WITH_CONSTRAINT).toHaveLength(GRID_COLUMN_LIST.length + 1);
  });

  it("every column declares a non-empty width", () => {
    for (const c of GRID_COLUMN_LIST_WITH_CONSTRAINT) {
      expect(c.width, `column "${c.name}" has no width`).toMatch(/\S/);
    }
  });
});
