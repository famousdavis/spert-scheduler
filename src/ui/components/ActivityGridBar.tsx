// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

interface ActivityGridBarProps {
  /** Activities only — section headers are not counted. */
  activityCount: number;
  /** How many rows the validation summary lists: the page's HELD count, so the two always agree. */
  flaggedCount: number;
  collapsed: boolean;
  /** The id of the region this bar shows and hides. */
  controls: string;
  onToggle: () => void;
}

/**
 * The activity grid's header row, and its collapse toggle (v0.71.0). It is the grid card's first
 * row in both states, so the toggle never moves and a second click always finds it.
 *
 * Built like the Milestones and Dependencies headers, chevron first (the owner's ruling). The
 * chevron is their SVG, hidden from screen readers: a ▸/▾ CHARACTER would be read aloud as part of
 * the button's name, and `aria-expanded` already says which state it is in. While collapsed it also counts the flagged rows, so hiding the
 * grid never hides a problem; expanded, the red cells and the summary above it say so.
 *
 * ⚠️ DELIBERATELY NOT `[overflow-anchor:none]`, although everything else above the grid is. This bar
 * moves WITH the grid, so while it is the browser's scroll anchor the grid stays still. Excluded,
 * a "Show" after scrolling away and back anchors on what is below instead, and the grid opens ABOVE
 * that anchor: measured, it pushed this bar 2,290 px off the top of the screen.
 */
export function ActivityGridBar({
  activityCount,
  flaggedCount,
  collapsed,
  controls,
  onToggle,
}: ActivityGridBarProps) {
  return (
    // Collapsed, this row is the whole card, so its own bottom rule would double the card's border.
    <div
      className={
        collapsed
          ? "flex items-center px-4 py-2"
          : "flex items-center px-4 py-2 border-b border-gray-200 dark:border-gray-700"
      }
    >
      <button
        type="button"
        aria-expanded={!collapsed}
        aria-controls={controls}
        onClick={onToggle}
        className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
      >
        <svg
          className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-90"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span>Activities ({activityCount})</span>
        <span className="font-normal text-gray-500 dark:text-gray-400">{collapsed ? "Show" : "Hide"}</span>
        {collapsed && flaggedCount > 0 && (
          <span className="font-medium text-amber-700 dark:text-amber-300">· {flaggedCount} flagged</span>
        )}
      </button>
    </div>
  );
}
