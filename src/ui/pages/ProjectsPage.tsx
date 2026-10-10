// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useEffect, useMemo, useCallback, useRef, useId } from "react";
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
import { confirmDialog } from "@ui/hooks/use-confirm-store";
import { NewProjectDialog } from "@ui/components/NewProjectDialog";
import { ProjectTile } from "@ui/components/ProjectTile";
import { ShareProjectModal } from "@ui/components/ShareProjectModal";
import { ImportSection } from "@ui/components/ImportSection";
import { downloadFile } from "@ui/helpers/download";
import { buildProjectExportFilename } from "@ui/helpers/export-filename";
import { canShareProject } from "@ui/helpers/canShareProject";
import { formatExportTimestamp } from "@core/calendar/calendar";
import { serializeExport, serializeRecoveryExport } from "@app/api/export-import-service";
import { toast } from "@ui/hooks/use-notification-store";
import { useCloudCreateBlocked, isCloudCreateBlocked } from "@ui/hooks/use-cloud-create-blocked";
import {
  describedByWhile,
  CLOUD_CREATE_CONTROLS_NOTE,
  SAMPLE_NOT_ADDED_MESSAGE,
} from "@ui/helpers/cloud-create-gate";

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

/**
 * After a tile's Delete, focus the tile that takes its place — the next tile in display order — else
 * the tile before it, else `lastResort` (owner ruling, 2026-10-09; see `lastResortFocus`). A tile takes focus on its
 * keyboard open control, the name button, found by `data-tile-open` inside the grid once the deleted
 * tile has gone. When the grid is gone too (no tile left on display), `grid` is null and `lastResort`
 * is used.
 */
function focusAfterTileDelete(
  grid: HTMLElement | null,
  neighbourId: string | undefined,
  lastResort: HTMLElement | null
): void {
  const opens = grid ? Array.from(grid.querySelectorAll<HTMLElement>("[data-tile-open]")) : [];
  const neighbour = opens.find((el) => el.dataset.tileOpen === neighbourId);
  (neighbour ?? lastResort)?.focus();
}

/**
 * Where focus goes when no tile can take it: the header's New Project (owner ruling, 2026-10-09) — or, while New
 * Project is greyed out during the first cloud load (WI-112), the note under the header, which says why
 * (owner ruling, 2026-10-09). `focus()` on a disabled button does nothing, and focus fell to <body> (measured
 * in review). Asked inside the focus move's microtask, of the button as it is then.
 */
function lastResortFocus(
  newProject: HTMLButtonElement | null,
  note: HTMLElement | null
): HTMLElement | null {
  return newProject?.disabled && note ? note : newProject;
}

export function ProjectsPage() {
  const { user } = useAuth();
  const { mode, storageReady } = useStorage();
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
    loadSampleProject,
    deleteProject,
    reorderProjects,
    archiveProject,
    unarchiveProject,
    updateProjectField,
    getCorruptedProjectRawData,
    removeCorruptedProject,
    cloudDataLoaded,
  } = useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
      loadError: s.loadError,
      loadErrors: s.loadErrors,
      loadProjects: s.loadProjects,
      addProject: s.addProject,
      cloneProject: s.cloneProject,
      loadSampleProject: s.loadSampleProject,
      deleteProject: s.deleteProject,
      reorderProjects: s.reorderProjects,
      archiveProject: s.archiveProject,
      unarchiveProject: s.unarchiveProject,
      updateProjectField: s.updateProjectField,
      getCorruptedProjectRawData: s.getCorruptedProjectRawData,
      removeCorruptedProject: s.removeCorruptedProject,
      cloudDataLoaded: s.cloudDataLoaded,
    }))
  );

  // WI-109: while the user's cloud projects are still on their way, an empty list means "not here
  // yet", not "none". Two existing signals, no new state: `storageReady` is false while a remembered
  // cloud sign-in is being restored (StorageProvider), and `cloudDataLoaded` is false from the start
  // of a cloud load until it ends — on success AND on failure, so a failed load ends this too
  // (use-cloud-sync). ⚠️ It is ONE flag for every cloud load: the re-fetch after invitations are
  // claimed sets it false again, but if the first load ends while that re-fetch is still running it
  // reads true — and an empty Dashboard says "No projects yet." — until the re-fetch lands. Never true
  // when LOCAL storage is the stored choice: `storageReady` is false only when cloud storage was
  // chosen, and `mode` is "cloud" only when signed in to it. It replaces only the EMPTY list below:
  // projects already in the store stay on screen.
  // ⚠️ One window it cannot see: AuthProvider marks auth resolved BEFORE it publishes the user (the
  // profile writes and the ToS check sit between), and in that window a cloud user is
  // indistinguishable from a signed-out one. Closing it needs a new auth-level flag.
  const cloudLoadPending = !storageReady || (mode === "cloud" && !cloudDataLoaded);

  // WI-112: while the first cloud load runs, a project created here would never reach the cloud, so
  // every control that creates one is greyed out and described by one note under the header.
  const createBlocked = useCloudCreateBlocked();
  const createNoteId = useId();
  // The note itself, where focus goes after a Delete while New Project is greyed out (owner ruling, 2026-10-09).
  const createNoteRef = useRef<HTMLParagraphElement>(null);

  const handleChangeTileColor = useCallback(
    (id: string, color: string | undefined) => {
      updateProjectField(id, { tileColor: color });
    },
    [updateProjectField]
  );

  const handleClone = useCallback(
    (id: string) => {
      // WI-112: the commit's own check — the tile's Clone is greyed out while this is true.
      if (createBlocked) return;
      const clone = cloneProject(id, newProjectOwner);
      if (clone) {
        toast.success(`Cloned to "${clone.name}"`);
      }
    },
    [cloneProject, newProjectOwner, createBlocked]
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

  const handleLoadSample = async () => {
    try {
      // WI-112: a press before the first cloud load began can land inside it — on this page, or by then
      // on another. The build asks the gate when it lands, from the store, and adds nothing then; the
      // toast says why on whatever page the user is on (the note is on the Dashboard only).
      const project = await loadSampleProject(newProjectOwner, isCloudCreateBlocked);
      if (!project) {
        toast.error(SAMPLE_NOT_ADDED_MESSAGE);
        return;
      }
      // 8 s, not the 3 s default: this one is read by a room from a projector, and it
      // carries an instruction (audit L3). Every other toast keeps the default.
      toast.success(`Loaded "${project.name}" — run the simulation to see the buffer`, 8000);
      navigate(`/project/${project.id}`);
    } catch {
      toast.error("Couldn't load the sample project. Please try again.");
    }
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

  // The recovery card lists only the projects that are STILL not loaded — every loaded project
  // counts, archived ones included — and its heading counts the same list. Importing a project's
  // recovery file saves the restored project under the same id, but `loadErrors` is refreshed
  // only when this page mounts (`loadProjects` above). So after an import from this page's own
  // Import Projects, the card went on listing the restored project, and its Delete
  // (`removeCorruptedProject` → `repo.removeById`) removed the restored project's stored data:
  // measured in a production build, where the project was gone after a reload.
  const unloadedProjectErrors = useMemo(() => {
    const loaded = new Set(projects.map((p) => p.id));
    return loadErrors.filter((e) => !loaded.has(e.projectId));
  }, [projects, loadErrors]);

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

  // Focus destination after a confirmed corrupted-project delete (see below).
  const newProjectRef = useRef<HTMLButtonElement>(null);
  // The tile grid, where a tile's Delete looks for the neighbour that takes the focus.
  const gridRef = useRef<HTMLDivElement>(null);
  // The note's ref. The note leaves when the gate opens, and if a Delete had sent the focus to it, the
  // focus left with it, to <body> (measured in review): New Project takes it instead. React
  // runs this cleanup before it removes the note, so the note can still be asked whether it has the
  // focus; the move waits for a microtask because the same commit enables New Project only after it.
  // Focus anywhere else stays where it is.
  const attachCreateNote = useCallback((note: HTMLParagraphElement) => {
    createNoteRef.current = note;
    return () => {
      createNoteRef.current = null;
      if (document.activeElement === note) {
        queueMicrotask(() => newProjectRef.current?.focus());
      }
    };
  }, []);

  const handleExportCorrupted = useCallback(
    (projectId: string) => {
      const raw = getCorruptedProjectRawData(projectId);
      if (raw) {
        const filename = `corrupted-project-${projectId}-${formatExportTimestamp(new Date())}.json`;
        downloadFile(serializeRecoveryExport(raw) ?? raw, filename, "application/json");
      }
    },
    [getCorruptedProjectRawData]
  );

  const handleDeleteCorrupted = useCallback(
    async (projectId: string, projectName?: string) => {
      const displayName = projectName || projectId;
      const ok = await confirmDialog.ask({
        title: `Delete "${displayName}"?`,
        description:
          "The unreadable project data is removed from this browser. This cannot be undone — use Export first if you want a copy to recover from.",
        confirmLabel: "Delete",
        destructive: true,
      });
      if (!ok) return;
      removeCorruptedProject(projectId);
      // This card's Delete button goes with the card, and the whole recovery panel goes with
      // the last error, so `ConfirmDialog`'s captured-`activeElement` restore reaches a
      // detached node. "New Project" is the destination because it is the one control on this
      // page that is rendered unconditionally — the second "New Project" further down sits
      // inside the `projects.length === 0` empty state. A ref, not a text lookup: the two
      // buttons share an accessible name. While it is greyed out (WI-112), the note under the
      // header instead (`lastResortFocus`). `queueMicrotask` for the reason recorded in
      // `UnifiedActivityGrid.handleDeleteActivity`.
      queueMicrotask(() => {
        lastResortFocus(newProjectRef.current, createNoteRef.current)?.focus();
      });
    },
    [removeCorruptedProject]
  );

  // A tile's Delete removes the tile, and with it the trash button that opened the confirmation, so
  // the dialog's own focus restore reaches a detached node and focus fell to <body> (measured in
  // Chromium once WI-110 kept the Dashboard on screen). The destination is the neighbour in DISPLAY
  // order, chosen before the delete changes the list (`focusAfterTileDelete`); in a microtask, for the
  // reason the recovery card's Delete above gives. Focusing the neighbour rather than New Project also
  // keeps a long Dashboard where it was: a review measured New Project scrolling it to the top.
  const handleDeleteProject = useCallback(
    (id: string) => {
      const at = filteredProjects.findIndex((p) => p.id === id);
      const neighbourId = (filteredProjects[at + 1] ?? filteredProjects[at - 1])?.id;
      deleteProject(id);
      queueMicrotask(() => {
        focusAfterTileDelete(
          gridRef.current,
          neighbourId,
          lastResortFocus(newProjectRef.current, createNoteRef.current)
        );
      });
    },
    [deleteProject, filteredProjects]
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
            onClick={handleLoadSample}
            disabled={createBlocked}
            {...describedByWhile(createBlocked, createNoteId)}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Load Sample
          </button>
          <button
            ref={newProjectRef}
            onClick={() => setDialogOpen(true)}
            disabled={createBlocked}
            {...describedByWhile(createBlocked, createNoteId)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            New Project
          </button>
        </div>
      </div>

      {createBlocked && (
        // tabIndex -1: not a Tab stop, but focus can be sent here — after a Delete leaves New Project
        // as the destination while it is greyed out — and a screen reader then reads why.
        <p
          ref={attachCreateNote}
          id={createNoteId}
          role="note"
          tabIndex={-1}
          className="text-sm text-right text-amber-700 dark:text-amber-300"
        >
          {CLOUD_CREATE_CONTROLS_NOTE}
        </p>
      )}

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

      {loadError && unloadedProjectErrors.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-amber-200 dark:border-amber-800 bg-amber-100/50 dark:bg-amber-900/30">
            <h2 className="font-semibold text-amber-800 dark:text-amber-200">
              {unloadedProjectErrors.length === 1
                ? "1 project could not be loaded"
                : `${unloadedProjectErrors.length} projects could not be loaded`}
            </h2>
          </div>
          <div className="divide-y divide-amber-200 dark:divide-amber-800">
            {unloadedProjectErrors.map((error) => {
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
                      {/* Export/Delete are recovery actions for DAMAGED data.
                          A future_version project isn't damaged — it's newer
                          than this app build (and for cloud-sourced errors,
                          both buttons would operate on local storage anyway).
                          Offering "Delete" next to a perfectly good, possibly
                          shared project is a footgun; the error resolves
                          itself once the app is updated. (v0.50.1) */}
                      {error.type !== "future_version" && (
                        <>
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
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {(() => {
        if (projects.length === 0 && cloudLoadPending) {
          return (
            <div role="status" className="flex items-center justify-center gap-3 py-12">
              <span
                aria-hidden="true"
                className="inline-block w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"
              />
              <p className="text-gray-500 dark:text-gray-400 text-lg">
                Loading your projects from cloud storage…
              </p>
            </div>
          );
        }
        if (projects.length === 0) {
          return (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 text-lg">No projects yet.</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
                Create a project to get started with probabilistic scheduling — or
                load the sample to explore a fully built schedule first.
              </p>
              <div className="mt-6 flex items-center justify-center gap-3">
                <button
                  onClick={() => setDialogOpen(true)}
                  disabled={createBlocked}
                  {...describedByWhile(createBlocked, createNoteId)}
                  className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  New Project
                </button>
                <button
                  onClick={handleLoadSample}
                  disabled={createBlocked}
                  {...describedByWhile(createBlocked, createNoteId)}
                  className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Load Sample Project
                </button>
              </div>
            </div>
          );
        }
        if (filteredProjects.length === 0) {
          return (
            <div className="text-center py-12">
              <p className="text-gray-500 dark:text-gray-400 text-lg">No matching projects.</p>
              <p className="text-gray-500 dark:text-gray-400 text-sm mt-1">
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
            <div ref={gridRef} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredProjects.map((project) => (
                <ProjectTile
                  key={project.id}
                  project={project}
                  onNavigate={(id) => navigate(`/project/${id}`)}
                  onDelete={handleDeleteProject}
                  onClone={handleClone}
                  cloneUnavailableNoteId={createBlocked ? createNoteId : undefined}
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
        blocked={createBlocked}
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
