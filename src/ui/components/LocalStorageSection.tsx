// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect } from "react";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";

function resolveUsageBarColor(pct: number): string {
  if (pct > 80) return "bg-red-500";
  if (pct > 50) return "bg-amber-500";
  return "bg-blue-500";
}

export function LocalStorageSection() {
  const storeFullSimulationData = usePreferencesStore((s) => s.preferences.storeFullSimulationData);
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);
  const [storageInfo, setStorageInfo] = useState<{
    used: number;
    usedFormatted: string;
  } | null>(null);

  useEffect(() => {
    try {
      let totalSize = 0;
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          const value = localStorage.getItem(key);
          if (value) {
            // localStorage strings are UTF-16 encoded, so multiply by 2 for byte estimate
            totalSize += value.length * 2;
          }
        }
      }
      const usedKB = totalSize / 1024;
      const usedMB = usedKB / 1024;
      const usedFormatted =
        usedMB >= 1
          ? `${usedMB.toFixed(2)} MB`
          : `${usedKB.toFixed(1)} KB`;
      setStorageInfo({ used: totalSize, usedFormatted }); // eslint-disable-line react-hooks/set-state-in-effect -- reads external localStorage
    } catch {
      setStorageInfo(null);
    }
  }, [storeFullSimulationData]);

  // Estimate percentage of 5MB limit
  const LIMIT_BYTES = 5 * 1024 * 1024;
  const usagePercent = storageInfo
    ? Math.min(100, (storageInfo.used / LIMIT_BYTES) * 100)
    : 0;

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
        Storage
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Manage how project data is stored locally.
      </p>

      <div className="mt-4 space-y-4">
        {/* Storage usage bar */}
        {storageInfo && (
          <div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mb-1">
              <span>{storageInfo.usedFormatted} used</span>
              <span>~5 MB limit</span>
            </div>
            <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${resolveUsageBarColor(usagePercent)}`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Store full simulation data toggle */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={storeFullSimulationData}
            onChange={(e) =>
              updatePreferences({
                storeFullSimulationData: e.target.checked,
              })
            }
            className="mt-1 rounded border-gray-300 dark:border-gray-600"
          />
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Store full simulation data
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              When enabled, raw simulation samples are saved to localStorage.
              This uses significantly more storage but preserves data between
              sessions.
            </p>
          </div>
        </label>
      </div>
    </section>
  );
}
