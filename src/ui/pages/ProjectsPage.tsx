import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { NewProjectDialog } from "@ui/components/NewProjectDialog";

export function ProjectsPage() {
  const { projects, loadError, loadProjects, addProject, deleteProject } =
    useProjectStore();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleCreate = (name: string) => {
    const project = addProject(name);
    navigate(`/project/${project.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Projects</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          New Project
        </button>
      </div>

      {loadError && (
        <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm text-amber-700">
          Some projects could not be loaded. They may have been created with an
          incompatible version.
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 text-lg">No projects yet.</p>
          <p className="text-gray-400 text-sm mt-1">
            Create a project to get started with probabilistic scheduling.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {projects.map((project) => (
            <div
              key={project.id}
              className="flex items-center justify-between bg-white border border-gray-200 rounded-lg p-4 hover:border-blue-300 cursor-pointer transition-colors"
              onClick={() => navigate(`/project/${project.id}`)}
            >
              <div>
                <h2 className="font-semibold text-gray-900">{project.name}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {project.scenarios.length} scenario
                  {project.scenarios.length !== 1 ? "s" : ""} | Created{" "}
                  {new Date(project.createdAt).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`Delete "${project.name}"?`)) {
                    deleteProject(project.id);
                  }
                }}
                className="text-gray-400 hover:text-red-500 text-sm px-2"
              >
                Delete
              </button>
            </div>
          ))}
        </div>
      )}

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={handleCreate}
      />
    </div>
  );
}
