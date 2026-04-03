// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState } from "react";
import { useStorage } from "@ui/providers/StorageProvider";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";

export function LocalStorageWarningBanner() {
  const { mode } = useStorage();
  const suppressLocalStorageWarning = usePreferencesStore(
    (s) => s.preferences.suppressLocalStorageWarning
  );
  const [sessionVisible, setSessionVisible] = useState(true);

  const show = sessionVisible && mode === "local" && !(suppressLocalStorageWarning ?? false);
  if (!show) return null;

  return (
    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4 mb-4 flex items-center gap-4 no-print">
      <p className="text-sm text-amber-800 dark:text-amber-200 flex-1">
        <strong>Your data exists only in this browser</strong> and can be lost without
        warning. Export at the end of every session to protect your work.
      </p>
      <button
        onClick={() => setSessionVisible(false)}
        className="shrink-0 px-4 py-1.5 border border-amber-500 dark:border-amber-400 text-amber-700 dark:text-amber-300 text-sm rounded-md hover:bg-amber-50 dark:hover:bg-amber-900/30"
      >
        Got it
      </button>
    </div>
  );
}
