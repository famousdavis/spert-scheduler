// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { flushSync } from "react-dom";
import type { ActivityProblem } from "@ui/hooks/use-estimate-validity";

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
}

export function ValidationSummary({ rows, onRevealGrid }: ValidationSummaryProps) {
  if (rows.length === 0) return null;

  const scrollToActivity = (activityId: string) => {
    // ⚠️ EXPAND FIRST, AND SYNCHRONOUSLY, here in the handler. A collapsed grid is `display: none`,
    // and Chrome can neither scroll to nor focus a cell inside it: the click did nothing, and focus
    // stayed here. `flushSync` lays the rows out before the lines below look for one.
    flushSync(onRevealGrid);
    const el = document.querySelector<HTMLElement>(
      `[data-row-id="${activityId}"][data-field="name"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  };

  // `[overflow-anchor:none]`: this box sits above the grid, and it must never become the
  // browser's scroll anchor — its own growth or removal would then move the grid (v0.69.0).
  return (
    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-1.5 [overflow-anchor:none]">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        {rows.length} activit{rows.length === 1 ? "y has" : "ies have"}{" "}
        validation errors
      </p>
      <ul className="space-y-1">
        {rows.map((row) => (
          <li key={row.id} className="text-sm text-amber-700 dark:text-amber-300">
            <button
              onClick={() => scrollToActivity(row.id)}
              className="text-amber-800 dark:text-amber-200 font-medium hover:underline"
            >
              {row.name}
            </button>
            : {row.messages.join("; ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
