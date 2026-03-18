// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useCallback } from "react";
import { formatDateDisplay, formatDateShort } from "@core/calendar/calendar";
import { usePreferencesStore } from "./use-preferences-store";

/**
 * Returns a memoized date formatting function pre-configured with the
 * user's preferred date format from settings.
 */
export function useDateFormat() {
  const dateFormat = usePreferencesStore((s) => s.preferences.dateFormat);
  return useCallback(
    (isoDate: string) => formatDateDisplay(isoDate, dateFormat),
    [dateFormat]
  );
}

/**
 * Returns a memoized short date formatting function for constraint badges.
 * Produces compact dates like "Apr 7", "7 Apr", or "04-07".
 */
export function useDateFormatShort() {
  const dateFormat = usePreferencesStore((s) => s.preferences.dateFormat);
  return useCallback(
    (isoDate: string) => formatDateShort(isoDate, dateFormat),
    [dateFormat]
  );
}
