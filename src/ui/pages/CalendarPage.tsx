// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect } from "react";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { CalendarEditor } from "@ui/components/CalendarEditor";
import { ConvertedWorkDaysEditor } from "@ui/components/ConvertedWorkDaysEditor";
import { WEEKDAY_LABELS } from "@domain/models/types";

export function CalendarPage() {
  const { projects, loadProjects } = useProjectStore(
    useShallow((s) => ({ projects: s.projects, loadProjects: s.loadProjects }))
  );
  const globalCalendar = usePreferencesStore((s) => s.preferences.globalCalendar) ?? { holidays: [] };
  const workDays = usePreferencesStore(
    useShallow((s) => s.preferences.workDays)
  ) ?? [1, 2, 3, 4, 5];
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);

  useEffect(() => {
    if (projects.length === 0) {
      loadProjects();
    }
  }, [projects.length, loadProjects]);
  const workDayNames = workDays
    .slice()
    .sort((a, b) => a - b)
    .map((d) => WEEKDAY_LABELS[d])
    .join(", ");

  return (
    <div className="space-y-8">
      {/* Section 1: Company-wide holidays */}
      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Company Holidays
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Holidays configured here apply to all projects. Work days are{" "}
          {workDayNames}, excluding holidays listed below.
        </p>
        <div className="mt-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <CalendarEditor
            calendar={globalCalendar}
            onUpdate={(calendar) => updatePreferences({ globalCalendar: calendar })}
          />
        </div>
      </section>

      {/* Section 2: Per-project holidays + converted work days */}
      {projects.filter((p) => !p.archived).length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Project-Specific Non-Work Days
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Add holidays that apply only to a specific project (e.g., team
            offsite, vendor shutdown). You can also convert specific non-work
            days into work days per project.
          </p>
          <div className="mt-4 space-y-6">
            {projects
              .filter((p) => !p.archived)
              .map((project) => (
                <div
                  key={project.id}
                  className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
                >
                  <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">
                    {project.name}
                  </h3>
                  <CalendarEditor
                    calendar={
                      project.globalCalendarOverride ?? { holidays: [] }
                    }
                    onUpdate={(calendar) => {
                      useProjectStore
                        .getState()
                        .setProjectCalendar(project.id, calendar);
                    }}
                  />
                  <ConvertedWorkDaysEditor
                    projectId={project.id}
                    convertedWorkDays={project.convertedWorkDays ?? []}
                    projectCalendarOverride={project.globalCalendarOverride}
                    onAdd={(date) =>
                      useProjectStore
                        .getState()
                        .addConvertedWorkDay(project.id, date)
                    }
                    onRemove={(date) =>
                      useProjectStore
                        .getState()
                        .removeConvertedWorkDay(project.id, date)
                    }
                  />
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
