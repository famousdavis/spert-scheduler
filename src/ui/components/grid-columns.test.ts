// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  GRID_COLUMNS,
  GRID_COLUMNS_WITH_CONSTRAINT,
  GRID_COLUMN_LIST,
  GRID_COLUMN_LIST_WITH_CONSTRAINT,
  CONSTRAINT_COLUMN,
  NAME_COLUMN_MIN_PX,
  NAME_COLUMN_MIN_WITH_IDS_PX,
  gridMinWidthPx,
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

// Originally transcribed from grid-columns.ts at a651b9d, before the named list existed,
// to prove the refactor changed nothing. ⚠️ Renamed off that commit in the swap commit:
// a constant named after a sha it no longer holds is the stale-name trap this campaign
// keeps meeting. It is the EXPECTED template; the history lives in this comment.
// ⚠️ UPDATED in the swap commit, which is the ONLY legitimate reason to touch these.
// The 96px/110px pair is transposed because Distribution now precedes Confidence; every
// other track is unchanged, and the total width is identical (the swap is width-neutral,
// which matters because the grid is already at its width limit).
const EXPECTED_TEMPLATE =
  "24px 20px 1fr 40px 90px 90px 38px 38px 38px 110px 96px 110px 40px 1px 40px 8px";
const EXPECTED_TEMPLATE_WITH_CONSTRAINT =
  "24px 20px 1fr 40px 90px 90px 80px 38px 38px 38px 110px 96px 110px 40px 1px 40px 8px";

describe("grid-columns: generating the template changed nothing", () => {
  it("GRID_COLUMNS is byte-identical to the literal it replaced", () => {
    expect(GRID_COLUMNS).toBe(EXPECTED_TEMPLATE);
  });

  it("GRID_COLUMNS_WITH_CONSTRAINT is byte-identical to the literal it replaced", () => {
    expect(GRID_COLUMNS_WITH_CONSTRAINT).toBe(EXPECTED_TEMPLATE_WITH_CONSTRAINT);
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

/**
 * **G4 — the enforced minimum width (WI-8).**
 *
 * The five containers share a template *string*, not a layout. `1fr` is
 * `minmax(auto, 1fr)` and resolves **per container against that container's own
 * content**, so once free space drops below a container's own min-content the track
 * floors there — at a different value in each container — and the columns drift apart.
 * Measured at v0.67.0, at 1024 px and below: subheader and band 0, header 45.63,
 * summary 71.49, activity row 190. Header-to-row drift 144.37 px; worst-case spread
 * across containers 190 px.
 *
 * `gridMinWidthPx` is what removes the disagreement, by holding every container to one
 * width. These tests do **not** re-derive the layout — jsdom has no layout, and that
 * limit is the whole reason WI-8's acceptance is a browser measurement (R32). What they
 * guard is the arithmetic: that the number is **summed from the column list** rather
 * than written down, so it cannot silently rot when a column is added, removed or
 * resized. That rot is the failure this file exists to prevent.
 */
describe("G4 — the enforced minimum width is derived, not hard-coded", () => {
  const sumFixed = (columns: readonly { width: string }[]) =>
    columns
      .filter((c) => c.width.endsWith("px"))
      .reduce((sum, c) => sum + parseFloat(c.width), 0);

  it("leaves room for every fixed track AND the name column's floor", () => {
    for (const [label, list] of [
      ["sequential", GRID_COLUMN_LIST],
      ["dependency", GRID_COLUMN_LIST_WITH_CONSTRAINT],
    ] as const) {
      for (const floor of [NAME_COLUMN_MIN_PX, NAME_COLUMN_MIN_WITH_IDS_PX]) {
        const min = gridMinWidthPx(list, floor);
        // The point of the number: free space at this width is at or above the floor,
        // so every container's `1fr` resolves to the same value instead of flooring
        // at its own min-content.
        expect(min - sumFixed(list), `${label} @ floor ${floor}`).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it("tracks the column list — a wider column widens the minimum by exactly that much", () => {
    // ⚠️ The anti-rot assertion. A hard-coded total would pass every test above and
    // silently under-size the grid the next time a column changed.
    const base = gridMinWidthPx(GRID_COLUMN_LIST, NAME_COLUMN_MIN_PX);
    const widened = GRID_COLUMN_LIST.map((c) =>
      c.name === "status" ? { ...c, width: "150px" } : c,
    );
    expect(gridMinWidthPx(widened, NAME_COLUMN_MIN_PX)).toBe(base + 40);
  });

  it("tracks the track COUNT — an added column adds its width and one gap", () => {
    const seq = gridMinWidthPx(GRID_COLUMN_LIST, NAME_COLUMN_MIN_PX);
    const dep = gridMinWidthPx(GRID_COLUMN_LIST_WITH_CONSTRAINT, NAME_COLUMN_MIN_PX);
    // The constraint column is 80px, and inserting it adds one 4px `gap-1`.
    expect(dep - seq).toBe(parseFloat(CONSTRAINT_COLUMN.width) + 4);
  });

  it("moves with the floor it is given, one for one", () => {
    const a = gridMinWidthPx(GRID_COLUMN_LIST, NAME_COLUMN_MIN_PX);
    const b = gridMinWidthPx(GRID_COLUMN_LIST, NAME_COLUMN_MIN_WITH_IDS_PX);
    // 28px (`w-7`) for the `#N` label plus 4px (`mr-1`) — the measured composition
    // recorded on NAME_COLUMN_MIN_WITH_IDS_PX.
    expect(b - a).toBe(32);
    expect(NAME_COLUMN_MIN_WITH_IDS_PX - NAME_COLUMN_MIN_PX).toBe(32);
  });

  it("the gap and padding it assumes are still the ones the containers declare", () => {
    // ⚠️ `gridMinWidthPx` hard-codes `gap-1` (4px) and `px-1` (8px) because they live in
    // Tailwind classes, not in the column list. Changing a container to `gap-2` would
    // under-size the minimum with nothing else noticing, so pin the classes at source.
    const files = {
      "UnifiedActivityGrid.tsx": 3, // header, subheader, summary
      "UnifiedActivityRow.tsx": 1,
      "BandHeaderRow.tsx": 1,
    };
    let total = 0;
    for (const [file, expected] of Object.entries(files)) {
      const src = readFileSync(new URL(file, import.meta.url), "utf8");
      const found = src.split("grid items-center gap-1 px-1").length - 1;
      expect(found, `${file} declares ${found} grid containers, expected ${expected}`).toBe(
        expected,
      );
      total += found;
    }
    // All five containers, so none can drift onto a different gap unnoticed.
    expect(total).toBe(5);
  });
});
