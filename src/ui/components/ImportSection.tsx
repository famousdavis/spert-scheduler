// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Project } from "@domain/models/types";
import type {
  ConflictInfo,
  ImportOutcome,
} from "@app/api/export-import-service";
import type { StorageMode } from "@ui/providers/StorageProvider";
import { useImportState } from "@ui/hooks/use-import-state";

interface ImportSectionProps {
  projects: Project[];
}

const RADIO_LABEL: Record<"skip" | "replace" | "copy", string> = {
  skip: "Skip",
  replace: "Replace existing",
  copy: "Import as copy",
};

function importDoneBanner(
  outcome: ImportOutcome,
  total: number,
  mode: StorageMode
): { text: string; hasErrors: boolean; cloudSyncActive: boolean } {
  const { added, replaced, copied, skipped, driftSkipped, errors } = outcome;
  const hasSuccess = added + replaced + copied > 0;
  const hasErrors = errors.length > 0;
  const allDrift =
    !hasSuccess && !hasErrors && skipped === 0 && driftSkipped.length > 0;
  let text: string;
  if (allDrift) {
    const n = driftSkipped.length;
    text = `All ${n} project${n !== 1 ? "s were" : " was"} skipped — your project list changed while the preview was open.`;
  } else if (!hasSuccess && !hasErrors) {
    text = `No projects were imported — all ${total} skipped.`;
  } else {
    const parts: string[] = [];
    if (added > 0) parts.push(`${added} added`);
    if (replaced > 0) parts.push(`${replaced} replaced`);
    if (copied > 0) parts.push(`${copied} copied as new`);
    if (errors.length > 0) parts.push(`${errors.length} failed (storage)`);
    if (skipped > 0) parts.push(`${skipped} skipped`);
    text = `${hasErrors ? "Import finished with errors" : "Import complete"}: ${parts.join(", ")}.`;
  }
  const cloudSyncActive = mode === "cloud" && hasSuccess;
  return { text, hasErrors, cloudSyncActive };
}

export function ImportSection({ projects }: ImportSectionProps) {
  const {
    importState,
    mode,
    cloudDataLoaded,
    applyPreferences,
    toggleApplyPreferences,
    fileInputRef,
    previewHeadingRef,
    handleFileChange,
    updateDecision,
    handleConfirmImport,
    cancelImport,
  } = useImportState({ currentProjects: projects });

  const cloudPending = mode === "cloud" && !cloudDataLoaded;

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
        Import Projects
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Upload a previously exported JSON file to restore or add projects.
      </p>

      <div className="mt-4 space-y-4">
        <input
          ref={fileInputRef}
          type="file"
          id="projectImportFile"
          name="projectImportFile"
          aria-label="Project import JSON file"
          accept=".json"
          onChange={handleFileChange}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={cloudPending}
          className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Choose File
        </button>

        {cloudPending && (
          <div
            role="note"
            className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3"
          >
            <p className="text-sm text-amber-700 dark:text-amber-300">
              Cloud projects are still loading. The button above will enable
              when loading is complete.
            </p>
          </div>
        )}

        {importState.step === "error" && (
          <div
            role="alert"
            aria-live="assertive"
            className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-md p-3"
          >
            <p className="text-sm font-medium text-red-800 dark:text-red-200">
              {importState.error}
            </p>
            {importState.details && (
              <p className="mt-1 text-xs text-red-700 dark:text-red-300">
                {importState.details}
              </p>
            )}
            <button
              type="button"
              onClick={cancelImport}
              className="mt-2 text-sm text-red-700 dark:text-red-300 hover:text-red-900 dark:hover:text-red-100 underline"
            >
              Try another file
            </button>
          </div>
        )}

        {importState.step === "applying" && (
          <div
            aria-busy="true"
            aria-label="Applying import…"
            className="flex items-center gap-2 p-3"
          >
            <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Applying import…
            </span>
          </div>
        )}

        {importState.step === "preview" && (
          <div
            role="region"
            aria-labelledby="import-preview-heading"
            onKeyDown={(e) => {
              if (e.key === "Escape") cancelImport();
            }}
            className="space-y-3"
          >
            <h3
              ref={previewHeadingRef}
              tabIndex={-1}
              id="import-preview-heading"
              className="text-sm font-semibold text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            >
              Review Import
            </h3>

            {importState.cloudRefreshed &&
              (() => {
                const diff = importState.cloudRefreshDiff;
                const parts: string[] = [];
                if (diff?.vanished)
                  parts.push(
                    `${diff.vanished} conflict${diff.vanished !== 1 ? "s" : ""} no longer apply — those projects will be imported as new`
                  );
                if (diff?.newConflicts)
                  parts.push(
                    `${diff.newConflicts} new conflict${diff.newConflicts !== 1 ? "s" : ""} detected`
                  );
                if (diff?.kindChanged)
                  parts.push(
                    `${diff.kindChanged} conflict${diff.kindChanged !== 1 ? "s" : ""} changed type`
                  );
                const urgent = (diff?.vanished ?? 0) > 0;
                return (
                  <div
                    role="note"
                    aria-live={urgent ? "assertive" : "polite"}
                    className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3"
                  >
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      Your cloud projects finished loading.
                      {parts.length > 0 && ` ${parts.join("; ")}.`}{" "}
                      Your "Replace preferences" setting was reset — re-check
                      if intended. Cancel and review, or confirm if the
                      conflict list looks correct.
                    </p>
                  </div>
                );
              })()}

            {importState.preferences !== undefined && (
              <div
                role="note"
                className="rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3"
              >
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  Preferences included
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                  This file includes user preferences (date format, default
                  percentiles, trial count, and other settings). By default,
                  your current preferences are kept. Checking the box below
                  will overwrite all your preference settings and cannot be
                  undone.
                </p>
                <label
                  htmlFor="applyPreferences"
                  className="flex items-center gap-2 mt-2 text-sm text-amber-700 dark:text-amber-300 cursor-pointer"
                >
                  <input
                    id="applyPreferences"
                    name="applyPreferences"
                    type="checkbox"
                    checked={applyPreferences}
                    onChange={toggleApplyPreferences}
                  />
                  Replace my preferences with values from this file
                </label>
              </div>
            )}

            {importState.projects.filter(
              (p) =>
                !importState.decisions.some(
                  (d) => d.importedProjectId === p.id
                )
            ).length > 0 && (
              <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-md p-4">
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  Ready to import:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {importState.projects
                    .filter(
                      (p) =>
                        !importState.decisions.some(
                          (d) => d.importedProjectId === p.id
                        )
                    )
                    .map((p) => (
                      <li
                        key={p.id}
                        className="text-sm text-green-700 dark:text-green-300"
                      >
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

            {importState.decisions.length > 0 && (
              <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-md p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {importState.decisions.length} conflict
                  {importState.decisions.length !== 1 ? "s" : ""} to resolve:
                </p>
                {importState.decisions.map((decision) => {
                  const sourceConflict: ConflictInfo | undefined =
                    decision.kind === "id"
                      ? importState.conflicts.find(
                          (c) =>
                            c.importedProject.id === decision.importedProjectId
                        )
                      : importState.nameConflicts.find(
                          (c) =>
                            c.importedProject.id === decision.importedProjectId
                        );
                  if (!sourceConflict) return null;
                  const labelId = `conflict-label-${decision.importedProjectId}`;
                  return (
                    <div
                      key={decision.importedProjectId}
                      className="bg-white dark:bg-gray-800 rounded p-3 border border-amber-100 dark:border-amber-900"
                    >
                      <p
                        id={labelId}
                        className="text-sm font-medium text-gray-900 dark:text-gray-100"
                      >
                        {sourceConflict.importedProject.name}{" "}
                        <span className="text-xs text-amber-600 dark:text-amber-400">
                          (
                          {decision.kind === "id" ? "ID match" : "Name match"}:
                          "{sourceConflict.existingProject.name}")
                        </span>
                      </p>
                      <div
                        role="radiogroup"
                        aria-labelledby={labelId}
                        className="mt-2 flex flex-wrap gap-4"
                      >
                        {(["skip", "replace", "copy"] as const).map((opt) => (
                          <label
                            key={opt}
                            className="flex items-center gap-1.5 text-xs text-gray-600 dark:text-gray-300 cursor-pointer"
                          >
                            <input
                              type="radio"
                              name={`conflict-${decision.importedProjectId}`}
                              checked={decision.action === opt}
                              onChange={() =>
                                updateDecision(
                                  decision.importedProjectId,
                                  opt
                                )
                              }
                              className="text-blue-600"
                            />
                            {RADIO_LABEL[opt]}
                          </label>
                        ))}
                      </div>
                      {decision.action === "replace" && (
                        <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                          ⚠ Existing project content (scenarios, activities)
                          will be replaced. Sharing settings, creation date,
                          and archived status are preserved. Consider "Import
                          as copy" to keep both.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={handleConfirmImport}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
              >
                Confirm Import
              </button>
              <button
                type="button"
                onClick={cancelImport}
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-800 dark:hover:text-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {importState.step === "done" &&
          (() => {
            const { text, hasErrors, cloudSyncActive } = importDoneBanner(
              importState.outcome,
              importState.total,
              mode
            );
            return (
              <div
                role={hasErrors ? "alert" : "status"}
                aria-live={hasErrors ? "assertive" : "polite"}
                className={`border rounded-md p-3 ${hasErrors ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20" : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"}`}
              >
                <p
                  className={`text-sm font-medium ${hasErrors ? "text-amber-800 dark:text-amber-200" : "text-green-800 dark:text-green-200"}`}
                >
                  {text}
                </p>
                {cloudSyncActive && (
                  <p className="mt-1 text-xs text-green-700 dark:text-green-300">
                    Cloud sync running in background.
                  </p>
                )}
                {importState.outcome.errors.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    {importState.outcome.errors.length} project
                    {importState.outcome.errors.length !== 1 ? "s" : ""} could
                    not be saved to local storage. Your data is in memory but
                    may not persist after reload
                    {mode === "cloud"
                      ? " (cloud sync may recover this)"
                      : ""}
                    .
                  </p>
                )}
                {importState.outcome.driftSkipped.length > 0 && (
                  <p className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                    {importState.outcome.driftSkipped.length} project
                    {importState.outcome.driftSkipped.length !== 1 ? "s" : ""}{" "}
                    were skipped because conflicts emerged after the preview
                    opened.
                  </p>
                )}
                <button
                  type="button"
                  onClick={cancelImport}
                  className="mt-2 text-sm underline text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Import another file
                </button>
              </div>
            );
          })()}
      </div>
    </section>
  );
}
