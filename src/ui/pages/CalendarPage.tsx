import { useEffect } from "react";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { CalendarEditor } from "@ui/components/CalendarEditor";

export function CalendarPage() {
  const { projects, loadProjects } = useProjectStore();
  const { preferences, updatePreferences } = usePreferencesStore();

  useEffect(() => {
    if (projects.length === 0) {
      loadProjects();
    }
  }, [projects.length, loadProjects]);

  const globalCalendar = preferences.globalCalendar ?? { holidays: [] };

  return (
    <div className="space-y-8">
      {/* Section 1: Company-wide holidays */}
      <section>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          Company Holidays
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Holidays configured here apply to all projects. Working days are
          Monday through Friday, excluding holidays listed below.
        </p>
        <div className="mt-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <CalendarEditor
            calendar={globalCalendar}
            onUpdate={(calendar) => updatePreferences({ globalCalendar: calendar })}
          />
        </div>
      </section>

      {/* Section 2: Per-project holidays */}
      {projects.filter((p) => !p.archived).length > 0 && (
        <section>
          <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Project-Specific Non-Work Days
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Add holidays that apply only to a specific project (e.g., team
            offsite, vendor shutdown).
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
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}
