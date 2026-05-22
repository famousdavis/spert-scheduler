// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

// Kept intentionally separate from TileColorPicker — expected to diverge for
// Level 3 band row-tinting. See Activity Bands plan v0.45.0 before merging.

import { useEffect, useRef } from "react";
import { PROJECT_TILE_COLORS } from "@domain/models/types";

interface BandColorPickerProps {
  currentColor: string | undefined;
  onSelect: (color: string | undefined) => void;
  onClose: () => void;
}

export function BandColorPicker({
  currentColor,
  onSelect,
  onClose,
}: BandColorPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [onClose]);

  const handleSelect = (hex: string | undefined) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect(hex);
    onClose();
  };

  const noneSelected = currentColor === undefined;

  return (
    <div
      ref={containerRef}
      className="absolute left-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-2 w-44"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="grid grid-cols-4 gap-1.5">
        {PROJECT_TILE_COLORS.map((c) => {
          const selected =
            currentColor?.toLowerCase() === c.hex.toLowerCase();
          return (
            <button
              key={c.hex}
              type="button"
              role="button"
              onClick={handleSelect(c.hex)}
              title={c.name}
              aria-label={c.name}
              className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                selected
                  ? "border-gray-900 dark:border-gray-100"
                  : "border-gray-200 dark:border-gray-600"
              }`}
              style={{ backgroundColor: c.hex }}
            />
          );
        })}
      </div>
      <button
        type="button"
        role="button"
        onClick={handleSelect(undefined)}
        aria-label="No color (default)"
        className={`mt-2 w-full text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 py-1 rounded border ${
          noneSelected
            ? "border-gray-900 dark:border-gray-100"
            : "border-gray-200 dark:border-gray-600"
        } hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-center gap-1.5`}
      >
        <span
          className="inline-block w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-500 relative overflow-hidden"
          style={{ backgroundColor: "transparent" }}
          aria-hidden
        >
          <span
            className="absolute left-1/2 top-1/2 w-full h-px bg-gray-400 dark:bg-gray-500"
            style={{
              transform: "translate(-50%, -50%) rotate(-45deg)",
            }}
          />
        </span>
        None
      </button>
    </div>
  );
}
