// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { ToggleSwitch } from "@ui/components/ToggleSwitch";

export function NotificationsSection() {
  const preferences = usePreferencesStore((s) => s.preferences);
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);

  const warnEnabled = !(preferences.suppressLocalStorageWarning ?? false);

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6 space-y-4">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">Notifications</h2>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Warn me on startup when using local storage
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            Shows a caution banner each time the app opens while your data is stored locally in this browser.
          </p>
        </div>
        <ToggleSwitch
          checked={warnEnabled}
          onChange={(val) => updatePreferences({ suppressLocalStorageWarning: !val })}
        />
      </div>
    </section>
  );
}
