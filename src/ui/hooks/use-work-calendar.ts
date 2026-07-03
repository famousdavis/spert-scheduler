// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import { usePreferencesStore } from "./use-preferences-store";
import { useProjectStore } from "./use-project-store";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import type { WorkCalendar } from "@core/calendar/work-calendar";

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

/**
 * Single assembly point for the project work calendar.
 * Combines preferences (work week config + global holidays) with the project's
 * own holidays, converted work days, and forced work days (global-holiday
 * overrides) into a memoized ProjectWorkCalendar instance. The global/project
 * holiday merge happens inside buildWorkCalendar, which also filters
 * forcedWorkDays against project holidays (project holidays are absolute).
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
  const forcedWorkDays = useProjectStore(
    (s) => s.projects.find((p) => p.id === projectId)?.forcedWorkDays
  );

  return useMemo(
    () =>
      buildWorkCalendar(
        workDays,
        globalCalendar?.holidays ?? [],
        convertedWorkDays ?? [],
        {
          forcedWorkDays: forcedWorkDays ?? [],
          projectHolidays: projectCalendarOverride?.holidays ?? [],
        }
      ),
    [
      globalCalendar,
      projectCalendarOverride,
      convertedWorkDays,
      forcedWorkDays,
      workDays,
    ]
  );
}
