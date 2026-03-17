// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo } from "react";
import type { Project } from "@domain/models/types";
import {
  exportScheduleXlsx,
  exportScheduleCsv,
} from "@app/api/schedule-export-service";
import type { ScheduleExportParams } from "@app/api/schedule-export-service";
import { downloadFile } from "@ui/helpers/download";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useDateFormat } from "@ui/hooks/use-date-format";
import {
  formatDateISO,
  mergeCalendars,
} from "@core/calendar/calendar";
import {
  computeDeterministicSchedule,
  computeDependencySchedule,
} from "@core/schedule/deterministic";
import { computeScheduleBuffer } from "@core/schedule/buffer";

interface ScheduleExportSectionProps {
  projects: Project[];
}

export function ScheduleExportSection({ projects }: ScheduleExportSectionProps) {
  const formatDate = useDateFormat();
  const dateFormat = usePreferencesStore((s) => s.preferences.dateFormat);
  const globalCalendar = usePreferencesStore((s) => s.preferences.globalCalendar);

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [exporting, setExporting] = useState(false);

  const selectedProject = projects.find((p) => p.id === selectedProjectId);
  const selectedScenario = selectedProject?.scenarios.find(
    (s) => s.id === selectedScenarioId
  );

  // Eligible scenarios: must have simulation results
  const eligibleScenarios = useMemo(
    () => selectedProject?.scenarios.filter((s) => s.simulationResults) ?? [],
    [selectedProject]
  );

  const handleProjectChange = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);
      setSelectedScenarioId("");
    },
    []
  );

  const buildParams = useCallback((): ScheduleExportParams | null => {
    if (!selectedProject || !selectedScenario || !selectedScenario.simulationResults) return null;

    const calendar = mergeCalendars(globalCalendar, selectedProject.globalCalendarOverride);
    const settings = selectedScenario.settings;

    const schedule = settings.dependencyMode
      ? computeDependencySchedule(
          selectedScenario.activities,
          selectedScenario.dependencies,
          selectedScenario.startDate,
          settings.probabilityTarget,
          calendar,
          selectedScenario.milestones
        )
      : computeDeterministicSchedule(
          selectedScenario.activities,
          selectedScenario.startDate,
          settings.probabilityTarget,
          calendar
        );

    const buffer = computeScheduleBuffer(
      schedule.totalDurationDays,
      selectedScenario.simulationResults.percentiles,
      settings.probabilityTarget,
      settings.projectProbabilityTarget
    );

    return {
      projectName: selectedProject.name,
      scenarioName: selectedScenario.name,
      activities: selectedScenario.activities,
      schedule,
      buffer,
      settings,
      dependencies: selectedScenario.dependencies,
      milestones: selectedScenario.milestones,
      calendar,
      dateFormat,
    };
  }, [selectedProject, selectedScenario, globalCalendar, dateFormat]);

  const handleExportXlsx = useCallback(async () => {
    const params = buildParams();
    if (!params) return;
    setExporting(true);
    try {
      const arrayBuffer = await exportScheduleXlsx(params);
      const filename = `${params.projectName} - ${params.scenarioName} Schedule ${formatDateISO(new Date())}.xlsx`;
      downloadFile(arrayBuffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } finally {
      setExporting(false);
    }
  }, [buildParams]);

  const handleExportCsv = useCallback(() => {
    const params = buildParams();
    if (!params) return;
    const csv = exportScheduleCsv(params);
    const filename = `${params.projectName} - ${params.scenarioName} Schedule ${formatDateISO(new Date())}.csv`;
    downloadFile(csv, filename, "text/csv");
  }, [buildParams]);

  const canExport = !!selectedScenario?.simulationResults;

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
        Schedule Export
      </h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
        Download an activity schedule as a formatted XLSX or plain CSV file.
      </p>

      {projects.length === 0 ? (
        <p className="mt-4 text-sm text-gray-400 dark:text-gray-500">
          No projects available.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {/* Project selector */}
          <label className="block text-sm text-gray-700 dark:text-gray-300">
            <span className="font-medium">Project</span>
            <select
              value={selectedProjectId}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
            >
              <option value="">Select a project…</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          {/* Scenario selector */}
          {selectedProject && (
            <label className="block text-sm text-gray-700 dark:text-gray-300">
              <span className="font-medium">Scenario</span>
              {eligibleScenarios.length === 0 ? (
                <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                  No scenarios with simulation results. Run a simulation first.
                </p>
              ) : (
                <select
                  value={selectedScenarioId}
                  onChange={(e) => setSelectedScenarioId(e.target.value)}
                  className="mt-1 block w-full rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                >
                  <option value="">Select a scenario…</option>
                  {eligibleScenarios.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} — {formatDate(s.startDate)}
                    </option>
                  ))}
                </select>
              )}
            </label>
          )}

          {/* Export buttons */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleExportXlsx}
              disabled={!canExport || exporting}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? "Exporting…" : "Export XLSX"}
            </button>
            <button
              onClick={handleExportCsv}
              disabled={!canExport}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Export CSV
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
