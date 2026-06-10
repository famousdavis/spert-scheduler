// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { useShallow } from "zustand/react/shallow";
import type { Project } from "@domain/models/types";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { useProjectStore, type LoadError } from "@ui/hooks/use-project-store";
import { NewProjectDialog } from "@ui/components/NewProjectDialog";
import { ProjectTile } from "@ui/components/ProjectTile";
import { ShareProjectModal } from "@ui/components/ShareProjectModal";
import { ImportSection } from "@ui/components/ImportSection";
import { downloadFile } from "@ui/helpers/download";
import { buildProjectExportFilename } from "@ui/helpers/export-filename";
import { canShareProject } from "@ui/helpers/canShareProject";
import { formatExportTimestamp } from "@core/calendar/calendar";
import { serializeExport } from "@app/api/export-import-service";
import { toast } from "@ui/hooks/use-notification-store";

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
  const { user } = useAuth();
  const { mode } = useStorage();
  // Owner uid for new and cloned projects: the current user's uid in cloud
  // mode, null in local mode. Lesson 38 — explicit at the call site so that
  // mode-switching mid-session doesn't trail stale ownership behind it.
  const newProjectOwner = mode === "cloud" && user ? user.uid : null;
  const {
    projects,
    loadError,
    loadErrors,
    loadProjects,
    addProject,
    cloneProject,
    deleteProject,
    reorderProjects,
    archiveProject,
    unarchiveProject,
    updateProjectField,
    getCorruptedProjectRawData,
    removeCorruptedProject,
  } = useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
      loadError: s.loadError,
      loadErrors: s.loadErrors,
      loadProjects: s.loadProjects,
      addProject: s.addProject,
      cloneProject: s.cloneProject,
      deleteProject: s.deleteProject,
      reorderProjects: s.reorderProjects,
      archiveProject: s.archiveProject,
      unarchiveProject: s.unarchiveProject,
      updateProjectField: s.updateProjectField,
      getCorruptedProjectRawData: s.getCorruptedProjectRawData,
      removeCorruptedProject: s.removeCorruptedProject,
    }))
  );

  const handleChangeTileColor = useCallback(
    (id: string, color: string | undefined) => {
      updateProjectField(id, { tileColor: color });
    },
    [updateProjectField]
  );

  const handleClone = useCallback(
    (id: string) => {
      const clone = cloneProject(id, newProjectOwner);
      if (clone) {
        toast.success(`Cloned to "${clone.name}"`);
      }
    },
    [cloneProject, newProjectOwner]
  );
  const navigate = useNavigate();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedErrors, setExpandedErrors] = useState<Set<string>>(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [sharingProject, setSharingProject] = useState<Project | null>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Mouse-only drag (D4): the whole tile is the drag surface, so a KeyboardSensor
  // would conflict with Enter/Space-to-open on the focusable name button.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
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
    const project = addProject(name, newProjectOwner);
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
        const filename = `corrupted-project-${projectId}-${formatExportTimestamp(new Date())}.json`;
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

  const handleExportAll = useCallback(() => {
    const json = serializeExport(activeProjects);
    const filename = `spert-scheduler-export-${formatExportTimestamp(new Date())}.json`;
    downloadFile(json, filename, "application/json");
  }, [activeProjects]);

  // One-click export of a single project from its dashboard tile. Simulation
  // results are excluded to keep the file small (the Settings export default);
  // global user preferences are never bundled into a single-project export.
  const handleExportProject = useCallback(
    (id: string) => {
      const project = projects.find((p) => p.id === id);
      if (!project) return;
      const json = serializeExport([project], { includeSimulationResults: false });
      const filename = buildProjectExportFilename(
        project.name,
        formatExportTimestamp(new Date())
      );
      downloadFile(json, filename, "application/json");
      toast.success(`Exported "${project.name}"`);
    },
    [projects]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Projects</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleExportAll}
            disabled={activeProjects.length === 0}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export All Projects
          </button>
          <button
            onClick={() => setShowImport((v) => !v)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            {showImport ? "Hide Import" : "Import Projects"}
          </button>
          <button
            onClick={() => setDialogOpen(true)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            New Project
          </button>
        </div>
      </div>

      {showImport && (
        <ImportSection projects={projects} />
      )}

      {projects.length > 0 && (
        <div className="flex items-center gap-4">
          <input
            type="text"
            name="searchProjects"
            aria-label="Search projects"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search projects..."
            autoComplete="off"
            className="w-full max-w-xs px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
          />
          {archivedProjects.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <input
                type="checkbox"
                name="showArchivedProjects"
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

      {(() => {
        if (projects.length === 0) {
          return (
            <div className="text-center py-12">
              <p className="text-gray-400 dark:text-gray-500 text-lg">No projects yet.</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                Create a project to get started with probabilistic scheduling.
              </p>
            </div>
          );
        }
        if (filteredProjects.length === 0) {
          return (
            <div className="text-center py-12">
              <p className="text-gray-400 dark:text-gray-500 text-lg">No matching projects.</p>
              <p className="text-gray-400 dark:text-gray-500 text-sm mt-1">
                Try a different search term.
              </p>
            </div>
          );
        }
        return (
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
                  onClone={handleClone}
                  onArchive={archiveProject}
                  onUnarchive={unarchiveProject}
                  onChangeTileColor={handleChangeTileColor}
                  onExport={handleExportProject}
                  onShare={
                    canShareProject(mode, user?.uid, project.owner)
                      ? () => setSharingProject(project)
                      : undefined
                  }
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
        );
      })()}

      <NewProjectDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreate={handleCreate}
      />

      <ShareProjectModal
        project={sharingProject}
        open={sharingProject !== null}
        onOpenChange={(o) => {
          if (!o) setSharingProject(null);
        }}
      />
    </div>
  );
}
