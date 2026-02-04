import { useState, useCallback, useRef, useEffect } from "react";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
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
import {
  RSM_LEVELS,
  RSM_LABELS,
  DISTRIBUTION_TYPES,
  DATE_FORMATS,
} from "@domain/models/types";
import type {
  RSMLevel,
  DistributionType,
  DateFormatPreference,
  ThemePreference,
} from "@domain/models/types";
import { THEME_OPTIONS } from "@domain/models/types";
import {
  ACTIVITY_PERCENTILE_OPTIONS,
  PROJECT_PERCENTILE_OPTIONS,
} from "@ui/helpers/percentile-options";
import { downloadFile } from "@ui/helpers/download";
import { distributionLabel } from "@ui/helpers/format-labels";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { formatDateISO } from "@core/calendar/calendar";

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
  const formatDate = useDateFormat();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [includeSimulationResults, setIncludeSimulationResults] = useState(false);

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
    const json = serializeExport(toExport, { includeSimulationResults });
    const filename = `spert-export-${formatDateISO(new Date())}.json`;
    downloadFile(json, filename, "application/json");
  }, [projects, selectedIds, includeSimulationResults]);

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">Export Projects</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Download selected projects as a JSON file for backup or sharing.
      </p>

      {projects.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">No projects to export.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Select all toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={
                selectedIds.size === projects.length && projects.length > 0
              }
              onChange={toggleAll}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="font-medium">
              {selectedIds.size === projects.length
                ? "Deselect all"
                : "Select all"}
            </span>
          </label>

          {/* Project list */}
          <div className="border border-gray-100 dark:border-gray-700 rounded-md divide-y divide-gray-100 dark:divide-gray-700 max-h-64 overflow-y-auto">
            {projects.map((project) => (
              <label
                key={project.id}
                className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(project.id)}
                  onChange={() => toggleProject(project.id)}
                  className="rounded border-gray-300 dark:border-gray-600"
                />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    {project.name}
                  </span>
                  <span className="ml-2 text-xs text-gray-400 dark:text-gray-500">
                    {project.scenarios.length} scenario
                    {project.scenarios.length !== 1 ? "s" : ""}
                  </span>
                </div>
                <span className="text-xs text-gray-400 dark:text-gray-500">
                  {formatDate(project.createdAt.slice(0, 10))}
                </span>
              </label>
            ))}
          </div>

          {/* Include simulation results checkbox */}
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={includeSimulationResults}
              onChange={(e) => setIncludeSimulationResults(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span>Include simulation results</span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              (larger file)
            </span>
          </label>

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

// -- Theme Labels ------------------------------------------------------------

const THEME_LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

// -- Preferences Section -----------------------------------------------------

function PreferencesSection() {
  const { preferences, updatePreferences, resetPreferences } = usePreferencesStore();

  const handleReset = () => {
    if (window.confirm("Reset all preferences to defaults?")) {
      resetPreferences();
    }
  };

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">Preferences</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Set defaults for new scenarios and display options.
          </p>
        </div>
        <button
          onClick={handleReset}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400"
        >
          Reset to defaults
        </button>
      </div>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Theme */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Theme
          </label>
          <select
            value={preferences.theme ?? "system"}
            onChange={(e) =>
              updatePreferences({
                theme: e.target.value as ThemePreference,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {THEME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {THEME_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {/* Default Trial Count */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Trial Count
          </label>
          <select
            value={preferences.defaultTrialCount}
            onChange={(e) =>
              updatePreferences({
                defaultTrialCount: parseInt(e.target.value, 10),
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {[1000, 5000, 10000, 25000, 50000, 100000, 250000, 500000].map(
              (n) => (
                <option key={n} value={n}>
                  {n.toLocaleString()}
                </option>
              )
            )}
          </select>
        </div>

        {/* Default Distribution Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Distribution Type
          </label>
          <select
            value={preferences.defaultDistributionType}
            onChange={(e) =>
              updatePreferences({
                defaultDistributionType: e.target.value as DistributionType,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {DISTRIBUTION_TYPES.map((dt) => (
              <option key={dt} value={dt}>
                {distributionLabel(dt)}
              </option>
            ))}
          </select>
        </div>

        {/* Default Confidence Level */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Confidence Level
          </label>
          <select
            value={preferences.defaultConfidenceLevel}
            onChange={(e) =>
              updatePreferences({
                defaultConfidenceLevel: e.target.value as RSMLevel,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {RSM_LEVELS.map((level) => (
              <option key={level} value={level}>
                {RSM_LABELS[level]}
              </option>
            ))}
          </select>
        </div>

        {/* Default Activity Target */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Activity Target
          </label>
          <select
            value={preferences.defaultActivityTarget}
            onChange={(e) =>
              updatePreferences({
                defaultActivityTarget: parseFloat(e.target.value),
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {ACTIVITY_PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Default Project Target */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Default Project Target
          </label>
          <select
            value={preferences.defaultProjectTarget}
            onChange={(e) =>
              updatePreferences({
                defaultProjectTarget: parseFloat(e.target.value),
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {PROJECT_PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date Format */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Date Format
          </label>
          <select
            value={preferences.dateFormat}
            onChange={(e) =>
              updatePreferences({
                dateFormat: e.target.value as DateFormatPreference,
              })
            }
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
          >
            {DATE_FORMATS.map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt}
              </option>
            ))}
          </select>
        </div>

        {/* Auto-Run Simulation */}
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={preferences.autoRunSimulation}
              onChange={(e) =>
                updatePreferences({ autoRunSimulation: e.target.checked })
              }
              className="rounded border-gray-300 dark:border-gray-600"
            />
            <span className="font-medium">Auto-run simulation</span>
            <span className="text-gray-500 dark:text-gray-400">
              — automatically re-run after activity changes (500ms debounce)
            </span>
          </label>
        </div>
      </div>
    </section>
  );
}

// -- Storage Section ---------------------------------------------------------

function StorageSection() {
  const { preferences, updatePreferences } = usePreferencesStore();
  const [storageInfo, setStorageInfo] = useState<{
    used: number;
    usedFormatted: string;
  } | null>(null);

  useEffect(() => {
    try {
      let totalSize = 0;
      for (const key in localStorage) {
        if (Object.prototype.hasOwnProperty.call(localStorage, key)) {
          const value = localStorage.getItem(key);
          if (value) {
            // localStorage strings are UTF-16 encoded, so multiply by 2 for byte estimate
            totalSize += value.length * 2;
          }
        }
      }
      const usedKB = totalSize / 1024;
      const usedMB = usedKB / 1024;
      const usedFormatted =
        usedMB >= 1
          ? `${usedMB.toFixed(2)} MB`
          : `${usedKB.toFixed(1)} KB`;
      setStorageInfo({ used: totalSize, usedFormatted });
    } catch {
      setStorageInfo(null);
    }
  }, [preferences.storeFullSimulationData]);

  // Estimate percentage of 5MB limit
  const LIMIT_BYTES = 5 * 1024 * 1024;
  const usagePercent = storageInfo
    ? Math.min(100, (storageInfo.used / LIMIT_BYTES) * 100)
    : 0;

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
        Storage
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Manage how project data is stored locally.
      </p>

      <div className="mt-4 space-y-4">
        {/* Storage usage display */}
        {storageInfo && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-600 dark:text-gray-400">
                Current usage
              </span>
              <span className="font-medium text-gray-900 dark:text-gray-100">
                {storageInfo.usedFormatted}{" "}
                <span className="text-gray-400 dark:text-gray-500 font-normal">
                  / ~5 MB limit
                </span>
              </span>
            </div>
            <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  usagePercent > 80
                    ? "bg-red-500"
                    : usagePercent > 50
                      ? "bg-amber-500"
                      : "bg-blue-500"
                }`}
                style={{ width: `${usagePercent}%` }}
              />
            </div>
          </div>
        )}

        {/* Store full simulation data toggle */}
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={preferences.storeFullSimulationData ?? false}
            onChange={(e) =>
              updatePreferences({ storeFullSimulationData: e.target.checked })
            }
            className="mt-0.5 rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700"
          />
          <div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Store full simulation data
            </span>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              When enabled, stores all trial samples per simulation (~90% more
              storage). Disabling saves space but prevents recalculating
              confidence intervals after reload.
            </p>
          </div>
        </label>
      </div>
    </section>
  );
}

// -- Page Component ----------------------------------------------------------

export function SettingsPage() {
  const { projects, loadProjects, importProjects } = useProjectStore();
  const { loadPreferences: loadPrefs } = usePreferencesStore();

  useEffect(() => {
    if (projects.length === 0) {
      loadProjects();
    }
    loadPrefs();
  }, [projects.length, loadProjects, loadPrefs]);

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Settings</h1>
      <PreferencesSection />
      <StorageSection />
      <ExportSection projects={projects} />
      <ImportSection projects={projects} importProjects={importProjects} />
    </div>
  );
}
