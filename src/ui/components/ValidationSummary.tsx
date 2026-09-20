// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ActivityProblem } from "@ui/hooks/use-estimate-validity";
import { scrollToActivity } from "@ui/helpers/scroll-to-activity";

interface ValidationSummaryProps {
  /**
   * The flagged activities, already worked out by `useEstimateValidity` from the SAME parse that
   * paints the red cells and gates Run (v0.69.0). This component used to re-parse the activities
   * it was handed; now it renders what it is given, which is what lets the page HOLD its input
   * while a pointer is down — a re-parse of live activities would drop a just-repaired row
   * mid-click, and the summary's removal would move the grid under the click.
   */
  rows: readonly ActivityProblem[];
  /** Shows the grid, which may be collapsed (v0.71.0). Called before the jump, synchronously. */
  onRevealGrid: () => void;
  /**
   * The `#N` each activity carries in the grid, or null when this project does not show activity
   * numbers (v0.71.1). The page's own map, so a number here is the number on screen — and when the
   * grid shows none, neither does this list, rather than a number matching nothing.
   */
  activityNumberMap?: Map<string, number> | null;
}

export function ValidationSummary({ rows, onRevealGrid, activityNumberMap }: ValidationSummaryProps) {
  if (rows.length === 0) return null;

  // `[overflow-anchor:none]`: this box sits above the grid, and it must never become the
  // browser's scroll anchor — its own growth or removal would then move the grid (v0.69.0).
  return (
    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-1.5 [overflow-anchor:none]">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        {rows.length} activit{rows.length === 1 ? "y has" : "ies have"}{" "}
        validation errors
      </p>
      {/* v0.71.1 — the line leads with the activity's number, then its name, then what is wrong with
          it. The name is capped at half the line and truncated with the whole of it on hover, so the
          problem always starts on the first line: an activity named up to the field's 200 characters
          used to fill the width and push its own problem onto the third line. The number is outside
          that cap and can never be truncated, and it stays inside the button, so the whole line is
          one click target. */}
      <ul className="space-y-1">
        {rows.map((row) => {
          const number = activityNumberMap?.get(row.id);
          return (
            <li key={row.id} className="flex items-baseline text-sm text-amber-700 dark:text-amber-300">
              <button
                type="button"
                onClick={() => scrollToActivity(row.id, onRevealGrid)}
                title={row.name}
                className="flex items-baseline gap-1.5 max-w-[50%] shrink-0 text-amber-800 dark:text-amber-200 font-medium hover:underline"
              >
                {/* ⚠️ The space is a real text node, not the flex gap: without it a screen reader
                    announces "#4Tamber sounding". A flex container drops whitespace-only children
                    from the layout, so it costs nothing on screen. */}
                {number != null && <span className="shrink-0 tabular-nums">#{number}</span>}
                {number != null && " "}
                <span className="truncate">{row.name}</span>
              </button>
              <span className="min-w-0">: {row.messages.join("; ")}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
