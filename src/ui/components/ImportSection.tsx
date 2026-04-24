// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useRef } from "react";
import {
  validateImport,
} from "@app/api/export-import-service";
import type {
  ImportResult,
  ConflictInfo,
} from "@app/api/export-import-service";
import { generateId } from "@app/api/id";
import type { Project } from "@domain/models/types";

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

// -- Component ---------------------------------------------------------------

interface ImportSectionProps {
  projects: Project[];
  importProjects: (projects: Project[], replaceIds?: string[]) => void;
}

function importResultMessage(count: number): string {
  if (count === 0) return "No projects were imported (all skipped).";
  return `Successfully imported ${count} project${count !== 1 ? "s" : ""}.`;
}

export function ImportSection({ projects, importProjects }: ImportSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ImportState>({ step: "idle" });

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Security: Limit file size to prevent memory exhaustion
      const MAX_FILE_SIZE_MB = 10;
      const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
      if (file.size > MAX_FILE_SIZE_BYTES) {
        setImportState({
          step: "error",
          error: `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
          details: `Maximum allowed file size is ${MAX_FILE_SIZE_MB} MB.`,
        });
        e.target.value = "";
        return;
      }

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
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">Import Projects</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
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
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
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
              {importResultMessage(importState.count)}
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
