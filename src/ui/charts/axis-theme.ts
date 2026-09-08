// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Theme-aware styling for Recharts cartesian axis tick labels.
 *
 * ⚠️ THE DEFECT THIS CLOSES IS THAT THE TICKS WERE IDENTICAL IN BOTH THEMES.
 * No chart set a tick fill, so Recharts' `CartesianAxis` default applied: it
 * builds the tick props as `{ stroke: 'none', fill: stroke }`, and `stroke`
 * defaults to `#666`. So every tick label rendered `rgb(102,102,102)` in light
 * AND dark — 5.74 against white, but 2.55 against the charts' `gray-800`
 * surface, well under AA.
 *
 * ⚠️ SET `tick.fill`, NEVER THE AXIS `stroke` PROP. Because the tick colour is
 * DERIVED from `stroke`, moving `stroke` looks like it fixes the labels — and
 * it does, while also recolouring the axis LINES, an unrequested visual change
 * on six charts in both themes. `tickTextProps` is spread AFTER `fill: stroke`,
 * so a `tick={{ fill }}` overrides the label and leaves the line alone. Both
 * edits look correct in review and only one is.
 *
 * ⚠️ Cited by symbol deliberately. Recharts ships several builds whose line
 * numbers disagree (`stroke: '#666'` sits at lib/:59 and es6/:53; `fill: stroke`
 * at :340 and :334), so a line citation is wrong for whichever build the next
 * reader opens.
 *
 * Light moves too, and on purpose: 5.74 -> 7.56. The projector this work is
 * for is the worst case for a mid-grey, and these become palette tokens rather
 * than a magic hex in the process. Dark goes 2.55 -> 5.64.
 */
export const AXIS_TICK_FILL_LIGHT = "#4a5565"; // gray-600
export const AXIS_TICK_FILL_DARK = "#99a1af"; // gray-400

/**
 * 12px is the on-screen floor (WI-10) — Tailwind's own smallest step. The ticks
 * were 11.
 */
export const AXIS_TICK_FONT_SIZE = 12;

export function axisTick(isDark: boolean): { fontSize: number; fill: string } {
  return {
    fontSize: AXIS_TICK_FONT_SIZE,
    fill: isDark ? AXIS_TICK_FILL_DARK : AXIS_TICK_FILL_LIGHT,
  };
}
