// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect } from "react";
import { PROJECT_TILE_COLORS } from "@domain/models/types";

interface TileColorPickerProps {
  value: string | undefined;
  onChange: (color: string | undefined) => void;
}

/**
 * Compact swatch button + popover for picking a muted project tile color.
 * Used in the ProjectTile action row. Click opens a grid of preset swatches
 * plus a "None" option to clear the color.
 */
export function TileColorPicker({ value, onChange }: TileColorPickerProps) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleDocClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [open]);

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setOpen((o) => !o);
  };

  const handleSelect = (hex: string | undefined) => (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(hex);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={handleToggle}
        className="p-1 flex items-center justify-center text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 transition-colors"
        title="Set tile color"
        aria-label="Set tile color"
      >
        <span
          className="inline-block w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-500"
          style={{ backgroundColor: value ?? "transparent" }}
        />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-20 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg p-2 w-44"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="grid grid-cols-4 gap-1.5">
            {PROJECT_TILE_COLORS.map((c) => {
              const selected = value?.toLowerCase() === c.hex.toLowerCase();
              return (
                <button
                  key={c.hex}
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
            onClick={handleSelect(undefined)}
            className="mt-2 w-full text-xs text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 py-1 rounded border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            None
          </button>
        </div>
      )}
    </div>
  );
}
