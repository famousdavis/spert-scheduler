import { useState, useEffect, useMemo, useCallback } from "react";
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
import { useProjectStore, type LoadError } from "@ui/hooks/use-project-store";
import { NewProjectDialog } from "@ui/components/NewProjectDialog";
import { ProjectTile } from "@ui/components/ProjectTile";
import { downloadFile } from "@ui/helpers/download";

function getErrorTypeLabel(type: LoadError["type"]): string {
  switch (type) {
    case "json_parse":
      return "Corrupted data";
    case "validation":
      return "Invalid data";
    case "migration":
      return "Migration failed";
    case "future_version":
      return "Newer version";
    default:
      return "Unknown error";
  }
}

export function ProjectsPage() {
  const {
    projects,
    loadError,
    loadErrors,
    loadProjects,
    addProject,
    deleteProject,
    reorderProjects,
    archiveProject,
    unarchiveProject,
    getCorruptedProjectRawData,
    removeCorruptedProject,
  } = useProjectStore();
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);

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

  // Separate active and archived projects
  const activeProjects = useMemo(
    () => projects.filter((p) => !p.archived),
    [projects]
  );

  const archivedProjects = useMemo(
    () => projects.filter((p) => p.archived),
    [projects]
  );

  const filteredProjects = useMemo(() => {
    const source = showArchived ? projects : activeProjects;
    if (!searchQuery.trim()) return source;
    const q = searchQuery.toLowerCase();
    return source.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, activeProjects, showArchived, searchQuery]);

  const toggleErrorExpanded = useCallback((projectId: string) => {
    setExpandedErrors((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  }, []);

  const handleExportCorrupted = useCallback(
    (projectId: string) => {
      const raw = getCorruptedProjectRawData(projectId);
      if (raw) {
        const filename = `corrupted-project-${projectId}-${new Date().toISOString().slice(0, 10)}.json`;
        downloadFile(raw, filename, "application/json");
      }
    },
    [getCorruptedProjectRawData]
  );

  const handleDeleteCorrupted = useCallback(
    (projectId: string, projectName?: string) => {
      const displayName = projectName || projectId;
      if (
        window.confirm(
          `Are you sure you want to delete "${displayName}"? This cannot be undone.`
        )
      ) {
        removeCorruptedProject(projectId);
      }
    },
    [removeCorruptedProject]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Projects</h1>
        <button
          onClick={() => setDialogOpen(true)}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          New Project
        </button>
      </div>

      {projects.length > 0 && (
        <div className="flex items-center gap-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          {archivedProjects.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                checked={showArchived}
                onChange={(e) => setShowArchived(e.target.checked)}
                className="rounded border-gray-300 dark:border-gray-600"
              />
              Show archived ({archivedProjects.length})
            </label>
          )}
        </div>
      )}

      {loadError && loadErrors.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30">
            <h2 className="font-semibold text-amber-800 dark:text-amber-200">
              {loadErrors.length === 1
                ? "1 project could not be loaded"
                : `${loadErrors.length} projects could not be loaded`}
            </h2>
          </div>
          <div className="divide-y divide-amber-200 dark:divide-amber-800">
            {loadErrors.map((error) => {
              const isExpanded = expandedErrors.has(error.projectId);
              return (
                <div key={error.projectId} className="px-4 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-amber-900 dark:text-amber-100 truncate">
                          {error.projectName || `Project ${error.projectId.slice(0, 8)}...`}
                        </span>
                        <span className="px-1.5 py-0.5 text-xs bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 rounded">
                          {getErrorTypeLabel(error.type)}
                        </span>
                      </div>
                      <p className="text-sm text-amber-700 dark:text-amber-300 mt-0.5">
                        {error.message}
                      </p>
                      {isExpanded && error.details && (
                        <div className="mt-2 p-2 bg-amber-100 dark:bg-amber-900/50 rounded text-xs font-mono text-amber-800 dark:text-amber-200 whitespace-pre-wrap break-all">
                          {error.details}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {error.details && (
                        <button
                          onClick={() => toggleErrorExpanded(error.projectId)}
                          className="px-2 py-1 text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 hover:bg-amber-200 dark:hover:bg-amber-800 rounded"
                        >
                          {isExpanded ? "Hide details" : "Show details"}
                        </button>
                      )}
                      <button
                        onClick={() => handleExportCorrupted(error.projectId)}
                        className="px-2 py-1 text-xs bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200 hover:bg-amber-300 dark:hover:bg-amber-700 rounded"
                        title="Export raw data for recovery"
                      >
                        Export
                      </button>
                      <button
                        onClick={() =>
                          handleDeleteCorrupted(error.projectId, error.projectName)
                        }
                        className="px-2 py-1 text-xs bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300 hover:bg-red-200 dark:hover:bg-red-800 rounded"
                        title="Delete corrupted project"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {projects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 dark:text-gray-500 text-lg">No projects yet.</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Create a project to get started with probabilistic scheduling.
          </p>
        </div>
      ) : filteredProjects.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400 dark:text-gray-500 text-lg">No matching projects.</p>
          <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
            Try a different search term.
          </p>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={filteredProjects.map((p) => p.id)}
            strategy={rectSortingStrategy}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((project) => (
                <ProjectTile
                  key={project.id}
                  project={project}
                  onNavigate={(id) => navigate(`/project/${id}`)}
                  onDelete={deleteProject}
                  onArchive={archiveProject}
                  onUnarchive={unarchiveProject}
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
