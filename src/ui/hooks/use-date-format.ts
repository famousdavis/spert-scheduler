import { useCallback } from "react";
import { formatDateDisplay } from "@core/calendar/calendar";
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
