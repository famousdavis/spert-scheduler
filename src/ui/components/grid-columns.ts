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

/**
 * Layout constants that live in the container classNames, not in this list.
 *
 * ⚠️ **These are duplicated from Tailwind classes in three files** — the header, subheader
 * and summary containers in `UnifiedActivityGrid.tsx`, plus `UnifiedActivityRow.tsx` and
 * `BandHeaderRow.tsx` — which all carry `gap-1 px-1`. `grid-columns.test.ts` asserts those
 * classes are still present, because a change from `gap-1` to `gap-2` would silently rot
 * `gridMinWidthPx` below with nothing else noticing.
 */
const GRID_GAP_PX = 4; // Tailwind `gap-1`
const GRID_PADDING_X_PX = 8; // Tailwind `px-1`, both sides

/**
 * Minimum width the `name` column needs before it stops shrinking.
 *
 * ⚠️ **Measured in a browser, not derived** — `1fr` is `minmax(auto, 1fr)`, and the `auto`
 * floor is the cell's min-content, which only a real layout engine can tell you. jsdom has
 * no layout, so no test in this suite can re-derive these two numbers; they were taken with
 * the app running and are recorded here with their composition so a future reader can check
 * them rather than trust them.
 *
 * Composition (WI-8, measured at v0.67.0):
 *   190 = the name `<input>`'s intrinsic width 170 + the edit-pencil gutter 20 (`pr-5`)
 *   222 = 190 + the `#N` label 28 (`w-7`) + 4 (`mr-1`)
 *
 * ⚠️ **The input dominates, and `min-w-0` does not prevent it.** `min-w-0` governs flex
 * *shrinking*; it does not stop the input contributing its intrinsic width to the flex
 * container's min-content when `flex-basis` is 0. Trimming the cell's chrome is therefore
 * not a way to lower these numbers.
 */
export const NAME_COLUMN_MIN_PX = 190;

/** As `NAME_COLUMN_MIN_PX`, but with the `#N` label shown (Show Activity IDs). */
export const NAME_COLUMN_MIN_WITH_IDS_PX = 222;

/**
 * The width below which the grid must scroll rather than shrink.
 *
 * ⚠️ **This is the fix for WI-8, and the reason it is computed rather than written down.**
 * The five containers share a template *string*, not a layout: `1fr` is `minmax(auto, 1fr)`
 * and resolves **per container against that container's own content**. When free space falls
 * below a container's own min-content the track floors there instead, and the containers
 * floor at *different* values — measured at v0.67.0: subheader and band 0, header 45.63,
 * summary 71.49, activity row 190. So the columns drift apart, by up to 190 px.
 *
 * Holding every container to this width keeps free space at or above the largest floor, so
 * every `1fr` resolves to the same number and the containers cannot disagree. Above this
 * width nothing changes — the min-width is simply not in effect.
 *
 * Summing the list rather than hard-coding the total is what stops this rotting the next
 * time a column is added, removed or resized.
 */
export function gridMinWidthPx(
  columns: readonly GridColumn[],
  nameColumnMinPx: number
): number {
  const fixed = columns
    .filter((c) => c.width.endsWith("px"))
    .reduce((sum, c) => sum + parseFloat(c.width), 0);
  const gaps = (columns.length - 1) * GRID_GAP_PX;
  return fixed + gaps + GRID_PADDING_X_PX + nameColumnMinPx;
}
