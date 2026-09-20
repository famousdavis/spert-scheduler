// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { flushSync } from "react-dom";

/**
 * Reveal the grid, then jump to an activity's name cell and focus it.
 *
 * Extracted from `ValidationSummary` in v0.71.3 (WI-15), unchanged, so the schedule-error banner's
 * new link runs the SAME code rather than a second copy of it. Both carry the two details below,
 * and a reimplementation would carry neither.
 *
 * ⚠️ EXPAND FIRST, AND SYNCHRONOUSLY, inside the click handler. Since v0.71.0 the grid collapses
 * and the collapse is remembered per project, so a caller above the grid cannot assume the rows are
 * laid out. MEASURED with the grid collapsed: the row IS still in the DOM and `querySelector` finds
 * it, but its rect is 0x0 and `scrollIntoView()` + `focus()` then do NOTHING AT ALL — no scroll, no
 * focus, `document.activeElement` left on `<body>`. The failure is silent: no throw, no warning,
 * just a link that does nothing on exactly the projects where someone collapsed the grid to look at
 * the Gantt. `flushSync` lays the rows out before the lines below look for one.
 *
 * ⚠️ The `if (el)` is not defensive padding. The caller's id comes from a HELD value
 * (`useHeldWhilePointerDown`), so during one press it can name a row that has just been deleted.
 */
export function scrollToActivity(activityId: string, revealGrid: () => void): void {
  flushSync(revealGrid);
  const el = document.querySelector<HTMLElement>(
    `[data-row-id="${activityId}"][data-field="name"]`
  );
  if (el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.focus();
  }
}
