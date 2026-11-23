// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from "react";
import { useStorage } from "@ui/providers/StorageProvider";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";

/**
 * The reminder that this browser holds the only copy of the user's data. Its return every session
 * is deliberate (owner, 2026-09-05): local storage is not as durable as a database, and the user
 * must be reminded to back up. Settings → Notifications is the opt-out.
 */
export function LocalStorageWarningBanner() {
  const { mode } = useStorage();
  const suppressLocalStorageWarning = usePreferencesStore(
    (s) => s.preferences.suppressLocalStorageWarning
  );
  const [sessionVisible, setSessionVisible] = useState(true);

  const show = sessionVisible && mode === "local" && !(suppressLocalStorageWarning ?? false);
  if (!show) return null;

  return (
    // The frame's caution notice (`.sf-notice--caution`, contract §3, v0.88.0): colours, padding, radius and the 28 px
    // outlined "Got it" are the stylesheet's.
    <div className="sf-notice sf-notice--caution no-print [overflow-anchor:none]">
      <p>
        <strong>Your data exists only in this browser</strong> and can be lost without
        warning. Export at the end of every session to protect your work.
      </p>
      <button type="button" onClick={() => setSessionVisible(false)} className="sf-notice-dismiss">
        Got it
      </button>
    </div>
  );
}
