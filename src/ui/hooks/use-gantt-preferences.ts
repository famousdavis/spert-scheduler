// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useCallback } from "react";
import type { GanttViewMode } from "@domain/models/types";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";

/**
 * Consolidated hook for Gantt chart preferences.
 * Replaces 5 individual usePreferencesStore selectors + useCallback wrappers.
 */
export function useGanttPreferences() {
  const viewMode: GanttViewMode = usePreferencesStore((s) => s.preferences.ganttViewMode) ?? "deterministic";
  const showToday = usePreferencesStore((s) => s.preferences.ganttShowToday) ?? true;
  const showCriticalPath = usePreferencesStore((s) => s.preferences.ganttShowCriticalPath) ?? true;
  const showProjectName = usePreferencesStore((s) => s.preferences.ganttShowProjectName) ?? false;
  const showArrows = usePreferencesStore((s) => s.preferences.ganttShowArrows) ?? true;
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);

  const setViewMode = useCallback(
    (mode: GanttViewMode) => updatePreferences({ ganttViewMode: mode }),
    [updatePreferences],
  );
  const setShowToday = useCallback(
    (v: boolean) => updatePreferences({ ganttShowToday: v }),
    [updatePreferences],
  );
  const setShowCriticalPath = useCallback(
    (v: boolean) => updatePreferences({ ganttShowCriticalPath: v }),
    [updatePreferences],
  );
  const setShowProjectName = useCallback(
    (v: boolean) => updatePreferences({ ganttShowProjectName: v }),
    [updatePreferences],
  );
  const setShowArrows = useCallback(
    (v: boolean) => updatePreferences({ ganttShowArrows: v }),
    [updatePreferences],
  );

  return {
    viewMode, showToday, showCriticalPath, showProjectName, showArrows,
    setViewMode, setShowToday, setShowCriticalPath, setShowProjectName, setShowArrows,
  } as const;
}
