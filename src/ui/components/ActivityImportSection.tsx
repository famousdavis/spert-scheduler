// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  useTransition,
} from "react";
import { Link } from "react-router-dom";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { toast } from "@ui/hooks/use-notification-store";
import {
  importActivitiesFromCSV,
  parseClipboardTable,
  getDefaultScenarioName,
} from "@app/api/csv-import-service";
import { parseFlatActivityTable } from "@core/import/flat-activity-parser";
import type { CSVParseResult, CSVImportError } from "@core/import/types";
import { generateId } from "@app/api/id";
import type { Project, Scenario, ScenarioSettings } from "@domain/models/types";
import { DEFAULT_SCENARIO_SETTINGS, SCHEMA_VERSION } from "@domain/models/types";

// -- State machine ------------------------------------------------------------

type ActivityImportState =
  | { step: "idle" }
  | { step: "error"; error: string; details?: string }
  | { step: "preview"; result: CSVParseResult; defaultName: string }
  | { step: "done"; count: number; projectId: string; projectName: string };

// -- Props --------------------------------------------------------------------

interface ActivityImportSectionProps {
  projects: Project[];
  importProjects: (projects: Project[], replaceIds?: string[]) => void;
  importScenarioToProject: (projectId: string, scenario: Scenario) => void;
}

// -- Component ----------------------------------------------------------------

export function ActivityImportSection({
  projects,
  importProjects,
  importScenarioToProject,
}: ActivityImportSectionProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importState, setImportState] = useState<ActivityImportState>({
    step: "idle",
  });
  const [pasteText, setPasteText] = useState("");
  const [autoPreview, setAutoPreview] = useState(true);
  const [scenarioName, setScenarioName] = useState("");
  const [targetProjectId, setTargetProjectId] = useState<string | "new">("new");
  const [_isPending, startTransition] = useTransition();

  const preferences = usePreferencesStore((s) => s.preferences);

  // -- Auto-preview on paste with debounce ------------------------------------

  useEffect(() => {
    if (!autoPreview || !pasteText.trim()) return;

    const timer = setTimeout(() => {
      startTransition(() => {
        try {
          const rows = parseClipboardTable(pasteText);
          const result = parseFlatActivityTable(rows, generateId);
          const name = getDefaultScenarioName("clipboard");
          setImportState({ step: "preview", result, defaultName: name });
          setScenarioName(name);
        } catch (err) {
          setImportState({
            step: "error",
            error: err instanceof Error ? err.message : "Failed to parse pasted data.",
          });
        }
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [pasteText, autoPreview]);

  // -- CSV file upload --------------------------------------------------------

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const result = await importActivitiesFromCSV(file);
        const name = getDefaultScenarioName("file", file.name);

        if (result.errors.length > 0 && result.activities.length === 0 && result.noHeaderDetected) {
          setImportState({
            step: "preview",
            result,
            defaultName: name,
          });
        } else if (result.errors.length > 0 && result.activities.length === 0) {
          setImportState({
            step: "error",
            error: result.errors[0]!.message,
            details: result.errors.slice(1).map((e) => e.message).join("; "),
          });
        } else {
          setImportState({ step: "preview", result, defaultName: name });
          setScenarioName(name);
        }
      } catch (err) {
        setImportState({
          step: "error",
          error: err instanceof Error ? err.message : "Failed to read file.",
        });
      }

      e.target.value = "";
    },
    []
  );

  // -- Manual parse button (when auto-preview is off) -------------------------

  const handleManualParse = useCallback(() => {
    if (!pasteText.trim()) return;
    startTransition(() => {
      try {
        const rows = parseClipboardTable(pasteText);
        const result = parseFlatActivityTable(rows, generateId);
        const name = getDefaultScenarioName("clipboard");
        setImportState({ step: "preview", result, defaultName: name });
        setScenarioName(name);
      } catch (err) {
        setImportState({
          step: "error",
          error: err instanceof Error ? err.message : "Failed to parse pasted data.",
        });
      }
    });
  }, [pasteText]);

  // -- "Assume default column order" retry ------------------------------------

  const handleAssumeDefaultOrder = useCallback(() => {
    startTransition(() => {
      try {
        let rows: string[][];
        if (pasteText.trim()) {
          rows = parseClipboardTable(pasteText);
        } else {
          // Re-parse not possible for file without storing raw rows
          // This path should only fire for paste
          return;
        }
        const result = parseFlatActivityTable(rows, generateId, {
          assumeDefaultColumnOrder: true,
        });
        const name = getDefaultScenarioName("clipboard");
        setImportState({ step: "preview", result, defaultName: name });
        setScenarioName(name);
      } catch (err) {
        setImportState({
          step: "error",
          error: err instanceof Error ? err.message : "Failed to parse data.",
        });
      }
    });
  }, [pasteText]);

  // -- Commit -----------------------------------------------------------------

  const handleCommit = useCallback(() => {
    if (importState.step !== "preview") return;
    const { result } = importState;
    if (result.errors.length > 0) return;

    const finalName = scenarioName.trim() || importState.defaultName;

    // Build scenario settings from user preferences
    const settings: ScenarioSettings = {
      ...DEFAULT_SCENARIO_SETTINGS,
      defaultConfidenceLevel: preferences.defaultConfidenceLevel,
      defaultDistributionType: preferences.defaultDistributionType,
      trialCount: preferences.defaultTrialCount,
      probabilityTarget: preferences.defaultActivityTarget,
      projectProbabilityTarget: preferences.defaultProjectTarget,
      parkinsonsLawEnabled: preferences.defaultParkinsonsLawEnabled ?? true,
      dependencyMode: result.dependencies.length > 0
        ? true
        : (preferences.defaultDependencyMode ?? false),
      rngSeed: generateId(),
    };

    const scenario: Scenario = {
      id: generateId(),
      name: finalName,
      startDate: new Date().toISOString().slice(0, 10),
      activities: result.activities,
      dependencies: result.dependencies,
      milestones: [],
      settings,
    };

    let committedProjectId: string;
    let committedProjectName: string;

    if (targetProjectId === "new") {
      // Create new project
      const projectId = generateId();
      const project: Project = {
        id: projectId,
        name: finalName,
        createdAt: new Date().toISOString(),
        schemaVersion: SCHEMA_VERSION,
        scenarios: [scenario],
      };
      importProjects([project]);
      committedProjectId = projectId;
      committedProjectName = finalName;
      toast.success(
        `Imported ${result.activities.length} activities into new project "${finalName}".`
      );
    } else {
      // Add to existing project — check 20-scenario limit
      const target = projects.find((p) => p.id === targetProjectId);
      if (!target) {
        toast.error("Target project not found.");
        return;
      }
      if (target.scenarios.length >= 20) {
        toast.error(
          "This project already has 20 scenarios (the maximum). Please remove a scenario or create a new project."
        );
        return;
      }
      importScenarioToProject(targetProjectId, scenario);
      committedProjectId = targetProjectId;
      committedProjectName = target.name;
      toast.success(
        `Imported ${result.activities.length} activities into "${target.name}".`
      );
    }

    setImportState({
      step: "done",
      count: result.activities.length,
      projectId: committedProjectId,
      projectName: committedProjectName,
    });
  }, [
    importState,
    scenarioName,
    targetProjectId,
    projects,
    preferences,
    importProjects,
    importScenarioToProject,
  ]);

  // -- Keyboard shortcut: ⌘↵ / Ctrl↵ to commit --------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        handleCommit();
      }
    },
    [handleCommit]
  );

  // -- Reset ------------------------------------------------------------------

  const resetImport = () => {
    setImportState({ step: "idle" });
    setPasteText("");
    setScenarioName("");
    setTargetProjectId("new");
  };

  // -- Render -----------------------------------------------------------------

  const previewResult =
    importState.step === "preview" ? importState.result : null;
  const allErrors = previewResult
    ? [...previewResult.errors, ...previewResult.warnings].sort(
        (a, b) => a.row - b.row
      )
    : [];

  const nonArchivedProjects = projects.filter((p) => !p.archived);

  return (
    <section
      className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
            Import Activities from Spreadsheet
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Upload a CSV file or paste data from a spreadsheet to create a new scenario.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 ml-4">
          <a
            href="/spert-activity-import-template.csv"
            download="spert-activity-import-template.csv"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            Download template
          </a>
          <a
            href="/SPERTScheduler_Import_Quick_Reference_Guide.pdf"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            Import guide (PDF)
          </a>
        </div>
      </div>

      <div className="mt-4 space-y-4">
        {/* -- CSV File Upload ------------------------------------------------ */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileChange}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
          >
            Choose CSV File
          </button>
        </div>

        {/* -- Clipboard Paste ------------------------------------------------ */}
        <div>
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Or paste from spreadsheet:
            </span>
            <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
              <input
                type="checkbox"
                checked={autoPreview}
                onChange={(e) => setAutoPreview(e.target.checked)}
                className="text-blue-600 rounded"
              />
              Auto-preview on paste
            </label>
          </div>
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder={"Paste tab-separated data here (copy rows from Excel or Google Sheets)…"}
            rows={5}
            className="w-full text-sm font-mono border border-gray-300 dark:border-gray-600 rounded-md p-3 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
          />
          {!autoPreview && pasteText.trim() && (
            <button
              onClick={handleManualParse}
              className="mt-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              Parse Data
            </button>
          )}
        </div>

        {/* -- Error state ---------------------------------------------------- */}
        {importState.step === "error" && (
          <div className="border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 rounded-md p-4">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">
              {importState.error}
            </p>
            {importState.details && (
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {importState.details}
              </p>
            )}
            <button
              onClick={resetImport}
              className="mt-2 text-sm text-red-700 dark:text-red-400 hover:text-red-900 dark:hover:text-red-300 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* -- Preview state -------------------------------------------------- */}
        {importState.step === "preview" && previewResult && (
          <div className="space-y-4">
            {/* Summary line (aria-live region) */}
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="text-sm text-gray-700 dark:text-gray-300"
            >
              {previewResult.activities.length} activities ·{" "}
              {previewResult.dependencies.length} dependencies ·{" "}
              <span
                className={
                  previewResult.errors.length === 0
                    ? "text-emerald-600 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }
              >
                {previewResult.errors.length} errors
              </span>{" "}
              · {previewResult.warnings.length} warnings
            </div>

            {/* "No header detected" escape hatch */}
            {previewResult.noHeaderDetected && (
              <div className="border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 rounded-md p-3">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  No recognizable header row found.
                </p>
                <button
                  onClick={handleAssumeDefaultOrder}
                  className="mt-2 text-sm text-amber-700 dark:text-amber-400 hover:underline"
                >
                  Treat first row as data and assume default column order
                </button>
              </div>
            )}

            {/* Preview table */}
            {(previewResult.activities.length > 0 || allErrors.length > 0) && (
              <div className="max-h-64 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        Row
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        Activity
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">
                        Issue
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {renderPreviewRows(previewResult)}
                  </tbody>
                </table>
              </div>
            )}

            {/* Global errors (row 0) */}
            {previewResult.errors
              .filter((e) => e.row === 0)
              .map((e, i) => (
                <div
                  key={`global-err-${i}`}
                  className="text-sm text-rose-600 dark:text-rose-400"
                >
                  {e.message}
                </div>
              ))}

            {/* Commit Settings */}
            {previewResult.errors.length === 0 &&
              previewResult.activities.length > 0 && (
                <div className="border border-gray-200 dark:border-gray-700 rounded-md p-4 space-y-3 bg-gray-50 dark:bg-gray-700/30">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Commit Settings
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Scenario Name
                      </label>
                      <input
                        type="text"
                        value={scenarioName}
                        onChange={(e) => setScenarioName(e.target.value)}
                        maxLength={200}
                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div className="sm:w-56">
                      <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1">
                        Add to project
                      </label>
                      <select
                        value={targetProjectId}
                        onChange={(e) => setTargetProjectId(e.target.value)}
                        className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded-md px-3 py-1.5 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="new">Create new project</option>
                        {nonArchivedProjects.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleCommit}
                      className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
                    >
                      Import Activities
                    </button>
                    <button
                      onClick={resetImport}
                      className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                    >
                      Cancel
                    </button>
                    <span className="text-xs text-gray-400 dark:text-gray-500 ml-auto hidden sm:inline">
                      {navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+Enter
                      to import
                    </span>
                  </div>
                </div>
              )}
          </div>
        )}

        {/* -- Done state ----------------------------------------------------- */}
        {importState.step === "done" && (
          <div className="border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20 rounded-md p-4">
            <p className="text-sm font-medium text-green-800 dark:text-green-300">
              {importState.count === 0
                ? "No activities were imported."
                : `Successfully imported ${importState.count} ${importState.count === 1 ? "activity" : "activities"}.`}
            </p>
            <div className="mt-2 flex items-center gap-4">
              <Link
                to={`/project/${importState.projectId}`}
                className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                Open {importState.projectName}
              </Link>
              <button
                onClick={resetImport}
                className="text-sm text-green-700 dark:text-green-400 hover:text-green-900 dark:hover:text-green-300 underline"
              >
                Import another
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// -- Preview table row builder ------------------------------------------------

function renderPreviewRows(result: CSVParseResult) {
  // Build a map of row → errors/warnings
  const rowIssues = new Map<number, CSVImportError[]>();
  for (const e of [...result.errors, ...result.warnings]) {
    if (e.row === 0) continue; // global errors rendered separately
    const existing = rowIssues.get(e.row) ?? [];
    existing.push(e);
    rowIssues.set(e.row, existing);
  }

  // Show rows with issues, plus a summary of valid activities
  const issueRows: React.ReactNode[] = [];
  const sortedIssueRows = [...rowIssues.entries()].sort(
    ([a], [b]) => a - b
  );

  for (const [rowNum, issues] of sortedIssueRows) {
    const isError = issues.some((i) => i.severity === "error");
    issueRows.push(
      <tr key={`row-${rowNum}`}>
        <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400 tabular-nums">
          {rowNum}
        </td>
        <td className="px-3 py-1.5">
          {isError ? (
            <span className="text-rose-500" title="Error">
              ✗
            </span>
          ) : (
            <span className="text-amber-500" title="Warning">
              ⚠
            </span>
          )}
        </td>
        <td className="px-3 py-1.5 text-gray-900 dark:text-gray-100">
          {issues[0]?.column ?? "—"}
        </td>
        <td className="px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400">
          {issues.map((i) => i.message).join("; ")}
        </td>
      </tr>
    );
  }

  // Show valid activity count as a summary row
  if (result.activities.length > 0) {
    issueRows.unshift(
      <tr key="valid-summary">
        <td className="px-3 py-1.5 text-gray-500 dark:text-gray-400">—</td>
        <td className="px-3 py-1.5">
          <span className="text-emerald-500" title="Valid">
            ✓
          </span>
        </td>
        <td
          className="px-3 py-1.5 text-gray-900 dark:text-gray-100"
          colSpan={2}
        >
          {result.activities.length} valid{" "}
          {result.activities.length === 1 ? "activity" : "activities"} ready
          to import
        </td>
      </tr>
    );
  }

  return issueRows;
}
