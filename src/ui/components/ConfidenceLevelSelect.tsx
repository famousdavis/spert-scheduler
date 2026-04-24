// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import type { RSMLevel } from "@domain/models/types";
import { RSM_LEVELS, RSM_LABELS, RSM_DESCRIPTIONS } from "@domain/models/types";

interface ConfidenceLevelSelectProps {
  value: RSMLevel;
  onChange: (level: RSMLevel) => void;
  disabled?: boolean;
  "data-row-id"?: string;
  "data-field"?: string;
  onKeyDown?: (e: React.KeyboardEvent) => void;
  tabIndex?: number;
}

function confidenceOptionClass(isHighlighted: boolean, isSelected: boolean): string {
  if (isHighlighted) return "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400";
  if (isSelected) return "bg-blue-50/50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300";
  return "dark:text-gray-100 hover:bg-blue-50 dark:hover:bg-blue-900/30";
}

export function ConfidenceLevelSelect({
  value,
  onChange,
  disabled,
  "data-row-id": dataRowId,
  "data-field": dataField,
  onKeyDown,
  tabIndex = -1,
}: ConfidenceLevelSelectProps) {
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

  // Reset filter and highlight when opening
  useEffect(() => {
    if (open) {
      setFilter(""); // eslint-disable-line react-hooks/set-state-in-effect -- intentional state reset on open
      setHighlightIdx(0);
    }
  }, [open]);

  // Auto-focus the filter input when dropdown opens
  useEffect(() => {
    if (open && filterInputRef.current) {
      // Small delay to ensure portal is rendered
      requestAnimationFrame(() => filterInputRef.current?.focus());
    }
  }, [open]);

  // Filter levels by label match
  const filteredLevels = useMemo(() => {
    if (!filter) return RSM_LEVELS;
    const lower = filter.toLowerCase();
    return RSM_LEVELS.filter((level) =>
      RSM_LABELS[level].toLowerCase().includes(lower)
    );
  }, [filter]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightIdx(0); // eslint-disable-line react-hooks/set-state-in-effect -- derived state reset
  }, [filter]);

  // Scroll highlighted option into view
  useEffect(() => {
    optionRefs.current[highlightIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx]);

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

  const selectLevel = (level: RSMLevel) => {
    onChange(level);
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
        onClick={() => { if (!disabled) setOpen(!open); }}
        onKeyDown={onKeyDown}
        disabled={disabled}
        title={disabled ? "Confidence only applies to T-Normal and LogNormal distributions" : undefined}
        className={`w-full px-1 py-1 border border-gray-200 dark:border-gray-600 rounded text-sm text-left focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 dark:text-gray-100 truncate ${
          disabled ? "opacity-40 cursor-not-allowed" : ""
        }`}
        tabIndex={disabled ? -1 : tabIndex}
      >
        {RSM_LABELS[value]}
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
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                onKeyDown={handleFilterKeyDown}
                className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:border-blue-400 focus:outline-none placeholder-gray-400 dark:placeholder-gray-500"
                placeholder="Type to filter…"
              />
            </div>
            {/* Options list */}
            <div className="overflow-y-auto">
              {filteredLevels.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
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
                      <p className="text-xs text-gray-500 dark:text-gray-400">
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
