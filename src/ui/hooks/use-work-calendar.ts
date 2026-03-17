// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import { usePreferencesStore } from "./use-preferences-store";
import { useProjectStore } from "./use-project-store";
import { mergeCalendars } from "@core/calendar/calendar";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import type { WorkCalendar } from "@core/calendar/work-calendar";

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

/**
 * Single assembly point for the project work calendar.
 * Merges preferences (work week config) + global holidays + project holidays + converted work days
 * into a memoized ProjectWorkCalendar instance.
 *
 * This is the ONLY place buildWorkCalendar() should be called in the codebase.
 */
export function useWorkCalendar(projectId: string): WorkCalendar {
  const workDays = usePreferencesStore(
    (s) => s.preferences.workDays ?? DEFAULT_WORK_DAYS
  );
  const globalCalendar = usePreferencesStore(
    (s) => s.preferences.globalCalendar
  );
  const projectCalendarOverride = useProjectStore(
    (s) => s.projects.find((p) => p.id === projectId)?.globalCalendarOverride
  );
  const convertedWorkDays = useProjectStore(
    (s) => s.projects.find((p) => p.id === projectId)?.convertedWorkDays
  );

  return useMemo(() => {
    const merged = mergeCalendars(globalCalendar, projectCalendarOverride);
    return buildWorkCalendar(
      workDays,
      merged?.holidays ?? [],
      convertedWorkDays ?? []
    );
  }, [
    globalCalendar,
    projectCalendarOverride,
    convertedWorkDays,
    workDays,
  ]);
}
