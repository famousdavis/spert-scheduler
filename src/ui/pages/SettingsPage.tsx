import { useState, useCallback, useRef, useEffect } from "react";
import { useProjectStore } from "@ui/hooks/use-project-store";
import {
  serializeExport,
  validateImport,
} from "@app/api/export-import-service";
import type {
  ImportResult,
  ConflictInfo,
} from "@app/api/export-import-service";
import { generateId } from "@app/api/id";
import type { Project } from "@domain/models/types";

// -- Helpers -----------------------------------------------------------------

function downloadJson(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

function todayISO(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// -- Conflict resolution types -----------------------------------------------

type ConflictAction = "skip" | "replace" | "copy";

interface ConflictDecision {
  conflict: ConflictInfo;
  action: ConflictAction;
}

// -- Import state machine ----------------------------------------------------

type ImportState =
  | { step: "idle" }
  | { step: "error"; error: string; details?: string }
  | {
      step: "preview";
      projects: Project[];
      conflicts: ConflictInfo[];
      decisions: ConflictDecision[];
    }
  | { step: "done"; count: number };

// -- Export Section ----------------------------------------------------------

interface ExportSectionProps {
  projects: Project[];
}

function ExportSection({ projects }: ExportSectionProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleProject = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === projects.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(projects.map((p) => p.id)));
    }
  };

  const handleExport = useCallback(() => {
    const toExport = projects.filter((p) => selectedIds.has(p.id));
    if (toExport.length === 0) return;
    const json = serializeExport(toExport);
    const filename = `spert-export-${todayISO()}.json`;
    downloadJson(json, filename);
  }, [projects, selectedIds]);

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600">Export Projects</h2>
      <p className="mt-1 text-sm text-gray-500">
        Download selected projects as a JSON file for backup or sharing.
      </p>

      {projects.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400">No projects to export.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Select all toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={
                selectedIds.size === projects.length && projects.length > 0
              }
              onChange={toggleAll}
              className="rounded border-gray-300"
            />
            <span className="font-medium">
              {selectedIds.size === projects.length
                ? "Deselect all"
                : "Select all"}
            </span>
          </label>

          {/* Project list */}
          <div className="border border-gray-100 rounded-md divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {projects.map((project) => (
              <label
                key={project.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(project.id)}
                  onChange={() => toggleProject(project.id)}
                  className="rounded border-gray-300"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900">
                    {project.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-400">
                    {project.scenarios.length} scenario
                    {project.scenarios.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-xs text-gray-400">
                  {formatDate(project.createdAt)}
                </span>
              </label>
            ))}
          </div>

          {/* Export button */}
          <button
            onClick={handleExport}
            disabled={selectedIds.size === 0}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export {selectedIds.size > 0 ? `(${selectedIds.size})` : ""}
          </button>
        </div>
      )}
    </section>
  );
}

// -- Import Section ----------------------------------------------------------

interface ImportSectionProps {
  projects: Project[];
  importProjects: (projects: Project[], replaceIds?: string[]) => void;
}

function ImportSection({ projects, importProjects }: ImportSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState>({ step: "idle" });

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        const result: ImportResult = validateImport(text, projects);

        if (!result.success) {
          setImportState({
            step: "error",
            error: result.error,
            details: result.details,
          });
        } else {
          const decisions: ConflictDecision[] = result.conflicts.map((c) => ({
            conflict: c,
            action: "skip" as ConflictAction,
          }));
          setImportState({
            step: "preview",
            projects: result.projects,
            conflicts: result.conflicts,
            decisions,
          });
        }
      };
      reader.readAsText(file);

      // Reset the input so the same file can be re-selected
      e.target.value = "";
    },
    [projects]
  );

  const updateConflictDecision = (index: number, action: ConflictAction) => {
    setImportState((prev) => {
      if (prev.step !== "preview") return prev;
      const decisions = [...prev.decisions];
      decisions[index] = { ...decisions[index]!, action };
      return { ...prev, decisions };
    });
  };

  const handleConfirmImport = useCallback(() => {
    if (importState.step !== "preview") return;

    const { projects: importedProjects, decisions } = importState;

    const finalProjects: Project[] = [];
    const replaceIds: string[] = [];

    for (const project of importedProjects) {
      const decision = decisions.find(
        (d) => d.conflict.importedProject.id === project.id
      );

      if (!decision) {
        finalProjects.push(project);
      } else if (decision.action === "skip") {
        continue;
      } else if (decision.action === "replace") {
        replaceIds.push(project.id);
        finalProjects.push(project);
      } else if (decision.action === "copy") {
        finalProjects.push({ ...project, id: generateId() });
      }
    }

    if (finalProjects.length > 0) {
      importProjects(finalProjects, replaceIds);
    }

    setImportState({ step: "done", count: finalProjects.length });
  }, [importState, importProjects]);

  const resetImport = () => setImportState({ step: "idle" });

  return (
    <section className="bg-white border border-gray-200 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600">Import Projects</h2>
      <p className="mt-1 text-sm text-gray-500">
        Upload a previously exported JSON file to restore or add projects.
      </p>

      <div className="mt-4 space-y-4">
        {/* File input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 border border-gray-300 text-gray-700 text-sm rounded-md hover:bg-gray-50"
        >
          Choose File
        </button>

        {/* Error state */}
        {importState.step === "error" && (
          <div className="border border-red-200 bg-red-50 rounded-md p-4">
            <p className="text-sm font-medium text-red-800">
              {importState.error}
            </p>
            {importState.details && (
              <p className="mt-1 text-xs text-red-600">
                {importState.details}
              </p>
            )}
            <button
              onClick={resetImport}
              className="mt-2 text-sm text-red-700 hover:text-red-900 underline"
            >
              Try another file
            </button>
          </div>
        )}

        {/* Preview state */}
        {importState.step === "preview" && (
          <div className="space-y-4">
            {/* Non-conflicting projects */}
            {importState.projects.filter(
              (p) =>
                !importState.conflicts.some(
                  (c) => c.importedProject.id === p.id
                )
            ).length > 0 && (
              <div className="border border-green-200 bg-green-50 rounded-md p-4">
                <p className="text-sm font-medium text-green-800">
                  Ready to import:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {importState.projects
                    .filter(
                      (p) =>
                        !importState.conflicts.some(
                          (c) => c.importedProject.id === p.id
                        )
                    )
                    .map((p) => (
                      <li key={p.id} className="text-sm text-green-700">
                        {p.name}{" "}
                        <span className="text-green-500 text-xs">
                          ({p.scenarios.length} scenario
                          {p.scenarios.length !== 1 ? "s" : ""})
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            )}

            {/* Conflicts */}
            {importState.decisions.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 rounded-md p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800">
                  {importState.decisions.length} project
                  {importState.decisions.length !== 1 ? "s" : ""} already
                  exist{importState.decisions.length === 1 ? "s" : ""}:
                </p>
                {importState.decisions.map((decision, index) => (
                  <div
                    key={decision.conflict.importedProject.id}
                    className="bg-white rounded p-3 border border-amber-100"
                  >
                    <p className="text-sm font-medium text-gray-900">
                      {decision.conflict.importedProject.name}
                    </p>
                    <div className="mt-2 flex gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="radio"
                          name={`conflict-${index}`}
                          checked={decision.action === "skip"}
                          onChange={() =>
                            updateConflictDecision(index, "skip")
                          }
                          className="text-blue-600"
                        />
                        Skip
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="radio"
                          name={`conflict-${index}`}
                          checked={decision.action === "replace"}
                          onChange={() =>
                            updateConflictDecision(index, "replace")
                          }
                          className="text-blue-600"
                        />
                        Replace existing
                      </label>
                      <label className="flex items-center gap-1.5 text-xs text-gray-600">
                        <input
                          type="radio"
                          name={`conflict-${index}`}
                          checked={decision.action === "copy"}
                          onChange={() =>
                            updateConflictDecision(index, "copy")
                          }
                          className="text-blue-600"
                        />
                        Import as copy
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleConfirmImport}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              >
                Confirm Import
              </button>
              <button
                onClick={resetImport}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Done state */}
        {importState.step === "done" && (
          <div className="border border-green-200 bg-green-50 rounded-md p-4">
            <p className="text-sm font-medium text-green-800">
              {importState.count === 0
                ? "No projects were imported (all skipped)."
                : `Successfully imported ${importState.count} project${importState.count !== 1 ? "s" : ""}.`}
            </p>
            <button
              onClick={resetImport}
              className="mt-2 text-sm text-green-700 hover:text-green-900 underline"
            >
              Import another file
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

// -- Page Component ----------------------------------------------------------

export function SettingsPage() {
  const { projects, loadProjects, importProjects } = useProjectStore();

  useEffect(() => {
    if (projects.length === 0) {
      loadProjects();
    }
  }, [projects.length, loadProjects]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <ExportSection projects={projects} />
      <ImportSection projects={projects} importProjects={importProjects} />
    </div>
  );
}
