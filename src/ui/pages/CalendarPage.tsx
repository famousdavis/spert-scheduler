import { useEffect } from "react";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { CalendarEditor } from "@ui/components/CalendarEditor";

export function CalendarPage() {
  const { projects, loadProjects } = useProjectStore();

  useEffect(() => {
    if (projects.length === 0) {
      loadProjects();
    }
  }, [projects.length, loadProjects]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Global Calendar</h1>
      <p className="text-sm text-gray-500">
        Configure holidays that apply across all projects. Working days are
        Monday through Friday, excluding holidays listed below.
      </p>

      {projects.length === 0 ? (
        <p className="text-gray-400 text-sm">
          No projects yet. Create a project first to configure its calendar.
        </p>
      ) : (
        <div className="space-y-8">
          {projects.map((project) => (
            <div
              key={project.id}
              className="bg-white border border-gray-200 rounded-lg p-4"
            >
              <h2 className="font-semibold text-gray-900 mb-3">
                {project.name}
              </h2>
              <CalendarEditor
                calendar={project.globalCalendarOverride ?? { holidays: [] }}
                onUpdate={(calendar) => {
                  useProjectStore
                    .getState()
                    .setProjectCalendar(project.id, calendar);
                }}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
