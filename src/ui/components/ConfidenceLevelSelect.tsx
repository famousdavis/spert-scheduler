// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { RSMLevel } from "@domain/models/types";
import { RSM_LEVELS, RSM_LABELS, RSM_DESCRIPTIONS } from "@domain/models/types";
import {
  CONFIDENCE_INERT_TITLES,
  type ConfidenceInertReason,
} from "@domain/helpers/confidence-applies";
import { GRID_RSM_LABELS } from "./grid-labels";

interface ConfidenceLevelSelectProps {
  value: RSMLevel;
  onChange: (level: RSMLevel) => void;
  disabled?: boolean;
  "data-row-id"?: string;
  "data-field"?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  tabIndex?: number;
  /**
   * Why the level cannot apply to this activity, or null when it can. The trigger then shows
   * a dash and names no level. The caller also disables the control; the dash keys on THIS,
   * not on `disabled`, because a locked T-Normal row is disabled and still shows its level.
   */
  inertReason?: ConfidenceInertReason | null;
}

/** The trigger's accessible name where Confidence cannot apply: it must not announce a level. */
const INERT_ARIA_LABEL = "Confidence: not applicable";

/**
 * What the trigger shows, says on hover, and announces. A module-level helper rather than
 * ternaries in the component: a nested `disabled ? (zeroRange ? … : …) : …` trips
 * `sonarjs/no-nested-conditional`.
 */
function triggerLabels(
  value: RSMLevel,
  inertReason: ConfidenceInertReason | null | undefined
): { text: string; title: string; ariaLabel: string } {
  if (inertReason) {
    return { text: "—", title: CONFIDENCE_INERT_TITLES[inertReason], ariaLabel: INERT_ARIA_LABEL };
  }
  return { text: GRID_RSM_LABELS[value], title: RSM_LABELS[value], ariaLabel: RSM_LABELS[value] };
}

function confidenceOptionClass(isHighlighted: boolean, isSelected: boolean): string {
  if (isHighlighted) return "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
  if (isSelected) return "bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300";
  return "dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30";
}

/**
 * The description under each level. On the highlighted row's blue tint the lighter grey measured
 * 4.44:1 in light mode, under the 4.5:1 that 12px text needs, so that row takes the next grey down
 * (6.94:1). Dark mode already passes there (5.22:1) and keeps its grey.
 */
function confidenceDescriptionClass(isHighlighted: boolean): string {
  return isHighlighted ? "text-xs text-gray-600 dark:text-gray-400" : "text-xs text-gray-500 dark:text-gray-400";
}

/** The levels whose full label contains `filter`, ignoring case: all ten when it is empty. */
function levelsMatching(filter: string): readonly RSMLevel[] {
  if (!filter) return RSM_LEVELS;
  const lower = filter.toLowerCase();
  return RSM_LEVELS.filter((level) => RSM_LABELS[level].toLowerCase().includes(lower));
}

/** Where the highlight starts: on the row's current level if `levels` shows it, else the first. */
function startIndex(levels: readonly RSMLevel[], value: RSMLevel): number {
  return Math.max(0, levels.indexOf(value));
}

export function ConfidenceLevelSelect({
  value,
  onChange,
  disabled,
  "data-row-id": dataRowId,
  "data-field": dataField,
  onKeyDown,
  tabIndex = -1,
  inertReason,
}: ConfidenceLevelSelectProps) {
  const labels = triggerLabels(value, inertReason);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(0);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const filterInputRef = useRef<HTMLInputElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [position, setPosition] = useState<{ top: number; left: number; openUp: boolean }>({
    top: 0,
    left: 0,
    openUp: false,
  });

  // Auto-focus the filter input when dropdown opens
  useEffect(() => {
    if (open && filterInputRef.current) {
      // Small delay to ensure portal is rendered
      requestAnimationFrame(() => filterInputRef.current?.focus());
    }
  }, [open]);

  // Filter levels by label match
  const filteredLevels = useMemo(() => levelsMatching(filter), [filter]);

  // Scroll highlighted option into view. Keyed on `open` too: the list is new on every open
  // and starts at the top, while the highlight can open on the same index it closed on,
  // which alone would not re-run this.
  useEffect(() => {
    optionRefs.current[highlightIdx]?.scrollIntoView({ block: "nearest" });
  }, [open, highlightIdx]);

  // Calculate dropdown position when opening
  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;

    const rect = buttonRef.current.getBoundingClientRect();
    const dropdownHeight = 288; // max-h-72 = 18rem = 288px
    const viewportHeight = window.innerHeight;
    const spaceBelow = viewportHeight - rect.bottom;
    const spaceAbove = rect.top;

    // Open upward if not enough space below and more space above
    const openUp = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;

    setPosition({
      top: openUp ? rect.top - dropdownHeight : rect.bottom + 4,
      left: rect.right - 256, // 256px = w-64
      openUp,
    });
  }, [open]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [open]);

  // Close on scroll outside dropdown (dropdown position would be stale)
  useEffect(() => {
    if (!open) return;
    const handleScroll = (e: Event) => {
      // Don't close if scrolling inside the dropdown
      if (dropdownRef.current?.contains(e.target as Node)) {
        return;
      }
      setOpen(false);
    };
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [open]);

  // The filter and highlight are set here, in the handlers, never by an effect: an effect runs
  // after the render, so one keyed on the filter would undo the highlight chosen below — and
  // reopening a list that was closed while filtered changes the filter.
  const toggleOpen = () => {
    if (disabled) return;
    if (!open) {
      // Open unfiltered, on the level the button shows.
      setFilter("");
      setHighlightIdx(startIndex(RSM_LEVELS, value));
    }
    setOpen(!open);
  };

  // Keep the current level highlighted while it still matches, else the first match.
  const changeFilter = (next: string) => {
    setFilter(next);
    setHighlightIdx(startIndex(levelsMatching(next), value));
  };

  const selectLevel = (level: RSMLevel) => {
    // Choosing the level the row already has changes nothing, so it writes nothing: no undo
    // step, no save, and the simulation results stay. A native <select> behaves the same.
    if (level !== value) onChange(level);
    setOpen(false);
    // Return focus to the trigger button
    buttonRef.current?.focus();
  };

  const handleFilterKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIdx((prev) =>
        prev < filteredLevels.length - 1 ? prev + 1 : prev
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIdx((prev) => (prev > 0 ? prev - 1 : prev));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filteredLevels.length > 0) {
        selectLevel(filteredLevels[highlightIdx] ?? filteredLevels[0]!);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
      buttonRef.current?.focus();
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        data-row-id={dataRowId}
        data-field={dataField}
        onClick={toggleOpen}
        onKeyDown={onKeyDown}
        disabled={disabled}
        title={labels.title}
        aria-label={labels.ariaLabel}
        className={`w-full px-1 py-1 border border-gray-200 dark:border-gray-600 rounded text-sm text-left focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 dark:text-gray-100 truncate ${
          disabled ? "opacity-40 cursor-not-allowed" : ""
        }`}
        tabIndex={disabled ? -1 : tabIndex}
      >
        {/* ⚠️ The BUTTON is the only place the short label appears. The dropdown below
            (`RSM_LABELS`), its filter, the Edit Activity modal, the Bulk toolbar,
            Preferences, print and export all keep the full wording — see
            `grid-labels.ts` for why that boundary is load-bearing. The full wording is
            still on this button's `title` and `aria-label`, so nothing is lost: only
            the 75px of track is. Where Confidence cannot apply, all three name no level. */}
        {labels.text}
      </button>
      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            className="fixed z-[9999] w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-72 overflow-hidden flex flex-col"
            style={{
              top: position.top,
              left: position.left,
            }}
          >
            {/* Filter input */}
            <div className="p-1.5 border-b border-gray-200 dark:border-gray-700 shrink-0">
              <input
                ref={filterInputRef}
                type="text"
                name="confidenceLevelFilter"
                autoComplete="off"
                aria-label="Filter confidence levels"
                value={filter}
                onChange={(e) => changeFilter(e.target.value)}
                onKeyDown={handleFilterKeyDown}
                className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:border-blue-400 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Type to filter…"
              />
            </div>
            {/* Options list */}
            <div className="overflow-y-auto">
              {filteredLevels.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No matches
                </p>
              ) : (
                filteredLevels.map((level, i) => {
                  const isHighlighted = i === highlightIdx;
                  const isSelected = level === value;
                  return (
                    <button
                      key={level}
                      ref={(el) => { optionRefs.current[i] = el; }}
                      type="button"
                      onClick={() => selectLevel(level)}
                      onMouseEnter={() => setHighlightIdx(i)}
                      className={`w-full text-left px-3 py-2 ${confidenceOptionClass(isHighlighted, isSelected)}`}
                    >
                      <p className="text-sm font-medium">{RSM_LABELS[level]}</p>
                      <p className={confidenceDescriptionClass(isHighlighted)}>
                        {RSM_DESCRIPTIONS[level]}
                      </p>
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
