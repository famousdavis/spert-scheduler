// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect, useRef, useState } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ActivityBand } from "@domain/models/types";
import { BandColorPicker } from "./BandColorPicker";
import { GRID_COLUMNS, GRID_COLUMNS_WITH_CONSTRAINT } from "./grid-columns";

interface BandHeaderRowProps {
  band: ActivityBand;
  locked: boolean;
  dependencyMode: boolean;
  onUpdate: (bandId: string, updates: Partial<ActivityBand>) => void;
  onDelete: (bandId: string) => void;
  autoFocus?: boolean;
}

export function BandHeaderRow({
  band,
  locked,
  dependencyMode,
  onUpdate,
  onDelete,
  autoFocus,
}: BandHeaderRowProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [editValue, setEditValue] = useState(band.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const gridCols = dependencyMode ? GRID_COLUMNS_WITH_CONSTRAINT : GRID_COLUMNS;

  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: band.id, disabled: locked });

  const sortableStyle = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  useEffect(() => {
    if (autoFocus && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    setEditValue(band.name); // eslint-disable-line react-hooks/set-state-in-effect -- syncs local edit buffer with external band.name changes (e.g., cloud sync)
  }, [band.name]);

  const commitName = () => {
    if (editValue !== band.name) {
      onUpdate(band.id, { name: editValue });
    }
  };

  const swatchBg = band.color ?? "transparent";

  return (
    <div
      ref={setNodeRef}
      className={`grid items-center gap-1 px-1 py-1.5 border-b border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 text-sm ${
        isDragging ? "opacity-80 z-10 shadow-md" : ""
      }`}
      style={{
        gridTemplateColumns: gridCols,
        ...sortableStyle,
      }}
    >
      {/* Empty checkbox slot (col 1) */}
      <div />

      {/* Drag handle (col 2) */}
      <div className="flex items-center justify-center">
        {locked ? (
          <span
            className="text-gray-200 dark:text-gray-700 select-none text-base leading-none cursor-not-allowed"
            title="Scenario is locked"
          >
            &#x2261;
          </span>
        ) : (
          <button
            type="button"
            className="text-gray-300 dark:text-gray-600 hover:text-gray-500 dark:hover:text-gray-400 cursor-grab active:cursor-grabbing select-none text-base leading-none"
            title="Drag to reorder"
            aria-label="Drag to reorder section"
            {...attributes}
            {...listeners}
            tabIndex={-1}
          >
            &#x2261;
          </button>
        )}
      </div>

      {/* Color swatch + name (col 3, flex group) */}
      <div className="relative flex items-center gap-1.5 min-w-0">
        {!locked ? (
          <button
            type="button"
            role="button"
            aria-label="Choose section color"
            onClick={(e) => {
              e.stopPropagation();
              setPickerOpen((o) => !o);
            }}
            className="shrink-0 inline-block w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-500"
            style={{ backgroundColor: swatchBg }}
            title="Choose section color"
          />
        ) : (
          <span
            aria-hidden
            className="shrink-0 inline-block w-3.5 h-3.5 rounded-full border border-gray-300 dark:border-gray-500 pointer-events-none"
            style={{ backgroundColor: swatchBg }}
          />
        )}
        {pickerOpen && (
          <BandColorPicker
            currentColor={band.color}
            onSelect={(color) => onUpdate(band.id, { color })}
            onClose={() => setPickerOpen(false)}
          />
        )}
        <input
          ref={nameInputRef}
          id={`band-name-${band.id}`}
          name="bandName"
          type="text"
          autoComplete="off"
          aria-label="Section name"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitName();
              // Move focus to "+ Add Activity" — the most likely next action
              // after naming a section. Tab from there lands on "+ Section".
              const addBtn = document.querySelector<HTMLElement>(
                '[data-field="add-activity"]'
              );
              if (addBtn) {
                addBtn.focus();
              } else {
                nameInputRef.current?.blur();
              }
            } else if (e.key === "Escape") {
              e.preventDefault();
              setEditValue(band.name);
              nameInputRef.current?.blur();
            }
          }}
          readOnly={locked}
          placeholder="Section"
          className="w-full min-w-0 bg-transparent border-0 focus:border-0 focus:ring-0 focus:outline-none px-1 py-0.5 text-sm font-bold text-gray-800 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500"
        />
      </div>

      {/* Empty data-columns region, spans tracks 4..(last-1) */}
      <div style={{ gridColumn: "4 / -2" }} />

      {/* Delete (auto-flows to last track) */}
      <div className="flex items-center justify-center">
        {!locked && (
          <button
            type="button"
            onClick={() => onDelete(band.id)}
            className="text-gray-300 dark:text-gray-600 hover:text-red-500 dark:hover:text-red-400 text-sm transition-colors"
            title="Delete section"
            aria-label="Delete section"
            tabIndex={-1}
          >
            &#10005;
          </button>
        )}
      </div>
    </div>
  );
}
