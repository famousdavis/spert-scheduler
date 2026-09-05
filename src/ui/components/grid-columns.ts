// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The activity grid's column definitions.
 *
 * ⚠️ **These used to be two bare width strings, and that was the root of a whole defect
 * class.** The template is consumed positionally by FIVE independent containers — the
 * header, the subheader, the summary row, every activity row (`UnifiedActivityRow`) and
 * the band header row — and **nothing named the columns**, so a change applied to some
 * containers and not others misaligned the grid silently. Three of the five cannot even
 * detect a mistake: the subheader and summary row hold empty cells across the data
 * columns, and `BandHeaderRow` spans `gridColumn: "4 / -2"` over the whole region.
 *
 * Naming them does not change a pixel — the templates below are generated from this list
 * and `grid-columns.test.ts` pins them byte-for-byte — but it means a reorder is one
 * line here instead of a positional edit repeated across files, and `ORDER` gives the
 * alignment guards something to assert against.
 *
 * ⚠️ **Adding or removing a column changes the track count, which `BandHeaderRow`'s
 * `4 / -2` span depends on.** Reordering within the list does not.
 */
export interface GridColumn {
  /** Stable identifier. Not rendered; used by tests and by the constraint insertion. */
  readonly name: string;
  /** CSS grid track size, in template order. */
  readonly width: string;
}

/**
 * Column order and widths, left to right. **This list is the order** — the header, the
 * rows and the export each render their own cells, and they must follow it.
 */
export const GRID_COLUMN_LIST: readonly GridColumn[] = [
  { name: "select", width: "24px" },
  { name: "grip", width: "20px" },
  { name: "name", width: "1fr" },
  { name: "duration", width: "40px" },
  { name: "start", width: "90px" },
  { name: "end", width: "90px" },
  { name: "min", width: "38px" },
  { name: "mostLikely", width: "38px" },
  { name: "max", width: "38px" },
  { name: "distribution", width: "110px" },
  { name: "confidence", width: "96px" },
  { name: "status", width: "110px" },
  { name: "actual", width: "40px" },
  { name: "separator", width: "1px" },
  { name: "src", width: "40px" },
  { name: "trailing", width: "8px" },
];

/** The constraint column, shown in dependency mode, inserted directly after `end`. */
export const CONSTRAINT_COLUMN: GridColumn = { name: "constraint", width: "80px" };

/** Where the constraint column lands when present. */
const CONSTRAINT_INSERT_AFTER = "end";

function withConstraintColumn(columns: readonly GridColumn[]): GridColumn[] {
  const at = columns.findIndex((c) => c.name === CONSTRAINT_INSERT_AFTER);
  // A missing anchor would silently append the column at the end and misalign
  // dependency mode, so fail loudly instead.
  if (at < 0) {
    throw new Error(`grid-columns: no "${CONSTRAINT_INSERT_AFTER}" column to anchor the constraint column to`);
  }
  const out = [...columns];
  out.splice(at + 1, 0, CONSTRAINT_COLUMN);
  return out;
}

/** Column order with the constraint column present (dependency mode). */
export const GRID_COLUMN_LIST_WITH_CONSTRAINT: readonly GridColumn[] =
  withConstraintColumn(GRID_COLUMN_LIST);

const template = (columns: readonly GridColumn[]) => columns.map((c) => c.width).join(" ");

/** Shared CSS grid column template for the activity grid (header + subheader + rows). */
export const GRID_COLUMNS = template(GRID_COLUMN_LIST);

/** Grid column template with constraint column (dependency mode). */
export const GRID_COLUMNS_WITH_CONSTRAINT = template(GRID_COLUMN_LIST_WITH_CONSTRAINT);
