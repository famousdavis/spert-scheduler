// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect } from "react";
import {
  RSM_LEVELS,
  RSM_LABELS,
  DISTRIBUTION_TYPES,
  DATE_FORMATS,
  THEME_OPTIONS,
  WEEKDAY_LABELS,
} from "@domain/models/types";
import type {
  RSMLevel,
  DistributionType,
  DateFormatPreference,
  ThemePreference,
} from "@domain/models/types";
import {
  ACTIVITY_PERCENTILE_OPTIONS,
  PROJECT_PERCENTILE_OPTIONS,
} from "@ui/helpers/percentile-options";
import { distributionLabel } from "@domain/helpers/format-labels";
import { useShallow } from "zustand/react/shallow";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";

const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

export function PreferencesSection() {
  const { preferences, updatePreferences, resetPreferences } = usePreferencesStore(
    useShallow((s) => ({
      preferences: s.preferences,
      updatePreferences: s.updatePreferences,
      resetPreferences: s.resetPreferences,
    }))
  );

  // Local string state for heuristic % inputs — allows free typing, validates on blur
  const [localMinPct, setLocalMinPct] = useState(String(preferences.defaultHeuristicMinPercent));
  const [localMaxPct, setLocalMaxPct] = useState(String(preferences.defaultHeuristicMaxPercent));
  useEffect(() => { setLocalMinPct(String(preferences.defaultHeuristicMinPercent)); }, [preferences.defaultHeuristicMinPercent]); // eslint-disable-line react-hooks/set-state-in-effect
  useEffect(() => { setLocalMaxPct(String(preferences.defaultHeuristicMaxPercent)); }, [preferences.defaultHeuristicMaxPercent]); // eslint-disable-line react-hooks/set-state-in-effect

  const handleReset = () => {
    if (window.confirm("Reset all preferences to defaults?")) {
      resetPreferences();
    }
  };

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">Preferences</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Set defaults for new scenarios and display options.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
        >
          Reset to defaults
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Theme */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Theme
          </label>
          <select
            value={preferences.theme ?? "system"}
            onChange={(e) =>
              updatePreferences({
                theme: e.target.value as ThemePreference,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {/* Default Trial Count */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Trial Count
          </label>
          <select
            value={preferences.defaultTrialCount}
            onChange={(e) =>
              updatePreferences({
                defaultTrialCount: parseInt(e.target.value, 10),
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {[1000, 5000, 10000, 25000, 50000].map(
              (n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              )
            )}
          </select>
        </div>

        {/* Default Distribution Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Distribution Type
          </label>
          <select
            value={preferences.defaultDistributionType}
            onChange={(e) =>
              updatePreferences({
                defaultDistributionType: e.target.value as DistributionType,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {DISTRIBUTION_TYPES.map((dt) => (
              <option key={dt} value={dt}>
                {distributionLabel(dt)}
              </option>
            ))}
          </select>
        </div>

        {/* Default Confidence Level */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Confidence Level
          </label>
          <select
            value={preferences.defaultConfidenceLevel}
            onChange={(e) =>
              updatePreferences({
                defaultConfidenceLevel: e.target.value as RSMLevel,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {RSM_LEVELS.map((level) => (
              <option key={level} value={level}>
                {RSM_LABELS[level]}
              </option>
            ))}
          </select>
        </div>

        {/* Default Activity Target */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Activity Target
          </label>
          <select
            value={preferences.defaultActivityTarget}
            onChange={(e) =>
              updatePreferences({
                defaultActivityTarget: parseFloat(e.target.value),
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {ACTIVITY_PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Default Project Target */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Project Target
          </label>
          <select
            value={preferences.defaultProjectTarget}
            onChange={(e) =>
              updatePreferences({
                defaultProjectTarget: parseFloat(e.target.value),
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {PROJECT_PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date Format */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date Format
          </label>
          <select
            value={preferences.dateFormat}
            onChange={(e) =>
              updatePreferences({
                dateFormat: e.target.value as DateFormatPreference,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {DATE_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt}
              </option>
            ))}
          </select>
        </div>

        {/* Work Days */}
        {(() => {
          const workDays = preferences.workDays ?? [1, 2, 3, 4, 5];
          const workDaySet = new Set(workDays);
          const toggleDay = (day: number) => {
            if (workDaySet.has(day)) {
              if (workDaySet.size <= 1) return; // prevent empty
              updatePreferences({ workDays: workDays.filter((d) => d !== day) });
            } else {
              updatePreferences({ workDays: [...workDays, day].sort((a, b) => a - b) });
            }
          };
          return (
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Work Days
              </label>
              <div className="flex items-center gap-1.5">
                {WEEKDAY_LABELS.map((label, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => toggleDay(i)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                      workDaySet.has(i)
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 hover:bg-blue-200 dark:hover:bg-blue-900/60"
                        : "bg-gray-100 text-gray-400 dark:bg-gray-700 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-600"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {workDays.length === 1 && (
                <p className="mt-1.5 text-xs text-amber-600 dark:text-amber-400">
                  This creates a one-day work week.
                </p>
              )}
            </div>
          );
        })()}

        {/* Dependencies Enabled */}
        <div className="flex items-center gap-3 sm:col-span-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Enable Dependencies by Default
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={preferences.defaultDependencyMode}
            onClick={() =>
              updatePreferences({ defaultDependencyMode: !preferences.defaultDependencyMode })
            }
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${
              preferences.defaultDependencyMode
                ? "bg-blue-600"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                preferences.defaultDependencyMode ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Use dependency-aware scheduling for new scenarios
          </span>
        </div>

        {/* Heuristic Enabled + Min/Max % */}
        <div className="flex items-center gap-3 flex-wrap sm:col-span-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Enable Heuristic by Default
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={preferences.defaultHeuristicEnabled}
            onClick={() =>
              updatePreferences({ defaultHeuristicEnabled: !preferences.defaultHeuristicEnabled })
            }
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${
              preferences.defaultHeuristicEnabled
                ? "bg-blue-600"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                preferences.defaultHeuristicEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Auto-calculate min/max from Most Likely for new scenarios
          </span>
          <div className="flex items-center gap-2 ml-2">
            <label className="text-xs text-gray-500 dark:text-gray-400">Min %</label>
            <input
              type="number"
              value={localMinPct}
              onChange={(e) => setLocalMinPct(e.target.value)}
              onBlur={() => {
                const val = parseInt(localMinPct, 10);
                if (!isNaN(val) && val >= 1 && val <= 99) {
                  updatePreferences({ defaultHeuristicMinPercent: val });
                } else {
                  setLocalMinPct(String(preferences.defaultHeuristicMinPercent));
                }
              }}
              className="w-16 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              min={1}
              max={99}
              step={1}
            />
            <label className="text-xs text-gray-500 dark:text-gray-400">Max %</label>
            <input
              type="number"
              value={localMaxPct}
              onChange={(e) => setLocalMaxPct(e.target.value)}
              onBlur={() => {
                const val = parseInt(localMaxPct, 10);
                if (!isNaN(val) && val >= 101 && val <= 1000) {
                  updatePreferences({ defaultHeuristicMaxPercent: val });
                } else {
                  setLocalMaxPct(String(preferences.defaultHeuristicMaxPercent));
                }
              }}
              className="w-20 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              min={101}
              max={1000}
              step={1}
            />
          </div>
        </div>

        {/* Parkinson's Law Enabled */}
        <div className="flex items-center gap-3 sm:col-span-2">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Enable Parkinson&apos;s Law by Default
          </label>
          <button
            type="button"
            role="switch"
            aria-checked={preferences.defaultParkinsonsLawEnabled}
            onClick={() =>
              updatePreferences({ defaultParkinsonsLawEnabled: !preferences.defaultParkinsonsLawEnabled })
            }
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-1 ${
              preferences.defaultParkinsonsLawEnabled
                ? "bg-blue-600"
                : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform ${
                preferences.defaultParkinsonsLawEnabled ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Clamp simulated activity durations to at least the deterministic (P50) duration for new scenarios
          </span>
        </div>

        {/* Auto-Run Simulation */}
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={preferences.autoRunSimulation}
              onChange={(e) =>
                updatePreferences({ autoRunSimulation: e.target.checked })
              }
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="font-medium">Auto-run simulation</span>
            <span className="text-gray-500 dark:text-gray-400">
              — automatically re-run after activity changes (500ms debounce)
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}
