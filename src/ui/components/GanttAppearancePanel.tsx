// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useRef, useEffect, useCallback } from "react";
import type { GanttAppearanceSettings } from "@domain/models/types";
import {
  GANTT_COLOR_PRESETS,
  KNOWN_PRESET_KEYS,
  GANTT_STANDARD_COLORS,
} from "@ui/charts/gantt-constants";

interface GanttAppearancePanelProps {
  appearance: GanttAppearanceSettings;
  onChange: (a: GanttAppearanceSettings) => void;
  isDark: boolean;
}

// --- Segmented Control ---

function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
      <div className="inline-flex rounded-md border border-gray-200 dark:border-gray-600 overflow-hidden">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`px-2.5 py-1 text-xs transition-colors ${
              value === opt.value
                ? "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200 font-medium"
                : "bg-white text-gray-600 hover:bg-gray-50 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700"
            }`}
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// --- Color Swatch Picker ---

function ColorSwatchPicker({
  label,
  color,
  onColorChange,
}: {
  label: string;
  color: string | undefined;
  onColorChange: (c: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
        <button
          type="button"
          className="w-5 h-5 rounded border border-gray-300 dark:border-gray-500 cursor-pointer"
          style={{ backgroundColor: color ?? "#3b82f6" }}
          onClick={() => setOpen(!open)}
          title={`Pick ${label.toLowerCase()} color`}
        />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg">
          <div className="grid grid-cols-5 gap-1 mb-2">
            {GANTT_STANDARD_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                className={`w-5 h-5 rounded cursor-pointer ${
                  color === c ? "ring-2 ring-blue-500 ring-offset-1" : ""
                }`}
                style={{ backgroundColor: c }}
                onClick={() => { onColorChange(c); setOpen(false); }}
                title={c}
              />
            ))}
          </div>
          <input
            type="color"
            value={color ?? "#3b82f6"}
            onChange={(e) => { onColorChange(e.target.value); setOpen(false); }}
            className="w-full h-6 cursor-pointer"
          />
        </div>
      )}
    </div>
  );
}

// --- Main Panel ---

export function GanttAppearancePanel({
  appearance,
  onChange,
  isDark,
}: GanttAppearancePanelProps) {
  const update = useCallback(
    (patch: Partial<GanttAppearanceSettings>) => onChange({ ...appearance, ...patch }),
    [appearance, onChange],
  );

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-gray-50 dark:bg-gray-800/50 space-y-3">
      {/* Row 1 — Layout */}
      <div className="flex flex-wrap gap-4 items-end">
        <SegmentedControl
          label="Name Column"
          options={[
            { value: "narrow" as const, label: "Narrow" },
            { value: "normal" as const, label: "Normal" },
            { value: "wide" as const, label: "Wide" },
          ]}
          value={appearance.nameColumnWidth}
          onChange={(v) => update({ nameColumnWidth: v })}
        />
        <SegmentedControl
          label="Font Size"
          options={[
            { value: "small" as const, label: "Small" },
            { value: "normal" as const, label: "Normal" },
            { value: "large" as const, label: "Large" },
            { value: "xl" as const, label: "XL" },
          ]}
          value={appearance.activityFontSize}
          onChange={(v) => update({ activityFontSize: v })}
        />
        <SegmentedControl
          label="Row Size"
          options={[
            { value: "compact" as const, label: "Compact" },
            { value: "normal" as const, label: "Normal" },
            { value: "comfortable" as const, label: "Comfortable" },
          ]}
          value={appearance.rowDensity}
          onChange={(v) => update({ rowDensity: v })}
        />
        <SegmentedControl
          label="Bar Label"
          options={[
            { value: "duration" as const, label: "Duration" },
            { value: "dates" as const, label: "Dates" },
            { value: "none" as const, label: "None" },
          ]}
          value={appearance.barLabel}
          onChange={(v) => update({ barLabel: v })}
        />
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">Shading</span>
          <label className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
            <input
              type="checkbox"
              checked={appearance.weekendShading}
              onChange={(e) => update({ weekendShading: e.target.checked })}
              className="rounded"
            />
            Non-work days
          </label>
        </div>
      </div>

      {/* Row 2 — Colors */}
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-500 dark:text-gray-400">Color Preset</span>
          <div className="flex gap-1.5">
            {KNOWN_PRESET_KEYS.map((key) => {
              const preset = GANTT_COLOR_PRESETS[key]!;
              const colors = isDark ? preset.dark : preset.light;
              return (
                <button
                  key={key}
                  type="button"
                  className={`w-[18px] h-[18px] rounded cursor-pointer ${
                    appearance.colorPreset === key
                      ? "ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-800"
                      : "border border-gray-300 dark:border-gray-500"
                  }`}
                  style={{ backgroundColor: colors.barPlanned }}
                  onClick={() => update({
                    colorPreset: key,
                    customPlannedColor: undefined,
                    customInProgressColor: undefined,
                  })}
                  title={key.charAt(0).toUpperCase() + key.slice(1)}
                />
              );
            })}
          </div>
        </div>
        <ColorSwatchPicker
          label="Planned"
          color={appearance.customPlannedColor ?? (isDark
            ? GANTT_COLOR_PRESETS[appearance.colorPreset]?.dark.barPlanned
            : GANTT_COLOR_PRESETS[appearance.colorPreset]?.light.barPlanned) ?? "#3b82f6"}
          onColorChange={(c) => update({ customPlannedColor: c })}
        />
        <ColorSwatchPicker
          label="In Progress"
          color={appearance.customInProgressColor ?? (isDark
            ? GANTT_COLOR_PRESETS[appearance.colorPreset]?.dark.barInProgress
            : GANTT_COLOR_PRESETS[appearance.colorPreset]?.light.barInProgress) ?? "#f97316"}
          onColorChange={(c) => update({ customInProgressColor: c })}
        />
      </div>
    </div>
  );
}
