// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { UserPreferences } from "@domain/models/types";

const RAG_OPTIONS = [10, 25, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95];

interface ScheduleHealthSectionProps {
  greenPct: number;
  amberPct: number;
  onUpdate: (updates: Partial<UserPreferences>) => void;
}

/**
 * Finish Target — Schedule Health threshold dropdowns.
 * Extracted from PreferencesSection for readability.
 */
export function ScheduleHealthSection({ greenPct, amberPct, onUpdate }: ScheduleHealthSectionProps) {
  const greenTooLow = greenPct <= 10;
  const amberOptions = RAG_OPTIONS.filter((p) => p < greenPct);

  return (
    <div className="sm:col-span-2">
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        Finish Target — Schedule Health
      </label>
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Green at</span>
          <select
            value={greenPct}
            onChange={(e) => {
              const newGreen = parseInt(e.target.value, 10);
              const updates: Partial<UserPreferences> = { targetFinishGreenPct: newGreen };
              // Auto-correct: if green <= current amber, lower amber
              if (newGreen <= amberPct) {
                const largestBelow = RAG_OPTIONS.filter((p) => p < newGreen).pop();
                if (largestBelow != null) {
                  updates.targetFinishAmberPct = largestBelow;
                }
              }
              onUpdate(updates);
            }}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
          >
            {RAG_OPTIONS.map((p) => (
              <option key={p} value={p}>P{p}</option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Amber at</span>
          <select
            value={amberPct}
            onChange={(e) => {
              onUpdate({ targetFinishAmberPct: parseInt(e.target.value, 10) });
            }}
            disabled={greenTooLow}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none disabled:opacity-50"
          >
            {amberOptions.map((p) => (
              <option key={p} value={p}>P{p}</option>
            ))}
          </select>
        </div>
      </div>
      {greenTooLow ? (
        <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
          Green must be P25 or greater so that Amber has a valid option below it.
        </p>
      ) : (
        <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
          Target date is green if the simulation finishes by that percentile, amber if within the amber threshold, red otherwise.
        </p>
      )}
    </div>
  );
}
