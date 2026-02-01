import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { NewProjectDialog } from "@ui/components/NewProjectDialog";
import { ProjectTile } from "@ui/components/ProjectTile";

export function ProjectsPage() {
  const {
    projects,
    loadError,
    loadProjects,
    addProject,
    deleteProject,
    reorderProjects,
  } = useProjectStore();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = projects.findIndex((p) => p.id === active.id);
      const newIndex = projects.findIndex((p) => p.id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderProjects(oldIndex, newIndex);
      }
    }
  };

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={projects.map((p) => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <ProjectTile
                  key={project.id}
                  project={project}
                  onNavigate={(id) => navigate(`/project/${id}`)}
                  onDelete={deleteProject}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={handleCreate}
      />
    </div>
  );
}
