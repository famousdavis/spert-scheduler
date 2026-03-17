// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback } from "react";
import type {
  Activity,
  ActivityDependency,
  Calendar,
  DeterministicSchedule,
  Milestone,
  ScenarioSettings,
} from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import {
  exportScheduleXlsx,
  exportScheduleCsv,
} from "@app/api/schedule-export-service";
import type { ScheduleExportParams } from "@app/api/schedule-export-service";
import { downloadFile } from "@ui/helpers/download";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { formatDateISO } from "@core/calendar/calendar";

interface ScheduleExportButtonProps {
  projectName: string;
  scenarioName: string;
  activities: Activity[];
  schedule: DeterministicSchedule | null;
  buffer: ScheduleBuffer | null;
  settings: ScenarioSettings;
  dependencies: ActivityDependency[];
  milestones: Milestone[];
  calendar?: Calendar;
  hasSimulationResults: boolean;
  onRunSimulation?: () => void;
}

export function ScheduleExportButton({
  projectName,
  scenarioName,
  activities,
  schedule,
  buffer,
  settings,
  dependencies,
  milestones,
  calendar,
  hasSimulationResults,
  onRunSimulation,
}: ScheduleExportButtonProps) {
  const dateFormat = usePreferencesStore((s) => s.preferences.dateFormat);
  const [exporting, setExporting] = useState(false);
  const [activeFormat, setActiveFormat] = useState<"xlsx" | "csv">("xlsx");

  const disabled = !hasSimulationResults || !schedule || activities.length === 0;

  const buildParams = useCallback((): ScheduleExportParams | null => {
    if (!schedule) return null;
    return {
      projectName,
      scenarioName,
      activities,
      schedule,
      buffer,
      settings,
      dependencies,
      milestones,
      calendar,
      dateFormat,
    };
  }, [
    projectName, scenarioName, activities, schedule, buffer,
    settings, dependencies, milestones, calendar, dateFormat,
  ]);

  const handleExportXlsx = useCallback(async () => {
    setActiveFormat("xlsx");
    const params = buildParams();
    if (!params) return;
    setExporting(true);
    try {
      const arrayBuffer = await exportScheduleXlsx(params);
      const filename = `${projectName} - ${scenarioName} Schedule ${formatDateISO(new Date())}.xlsx`;
      downloadFile(arrayBuffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } finally {
      setExporting(false);
    }
  }, [buildParams, projectName, scenarioName]);

  const handleExportCsv = useCallback(() => {
    setActiveFormat("csv");
    const params = buildParams();
    if (!params) return;
    const csv = exportScheduleCsv(params);
    const filename = `${projectName} - ${scenarioName} Schedule ${formatDateISO(new Date())}.csv`;
    downloadFile(csv, filename, "text/csv");
  }, [buildParams, projectName, scenarioName]);

  return (
    <div className="flex items-center gap-2 no-print">
      <span className="text-sm text-gray-500 dark:text-gray-400">Export Schedule:</span>
      <button
        onClick={handleExportXlsx}
        disabled={disabled || exporting}
        className={`px-3 py-1.5 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
          activeFormat === "xlsx"
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        }`}
        title={disabled ? "Run simulation first to enable export" : "Download as formatted Excel file"}
      >
        {exporting ? "Exporting…" : "XLSX"}
      </button>
      <button
        onClick={handleExportCsv}
        disabled={disabled}
        className={`px-3 py-1.5 text-sm rounded-md disabled:opacity-50 disabled:cursor-not-allowed ${
          activeFormat === "csv"
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
        }`}
        title={disabled ? "Run simulation first to enable export" : "Download as CSV file"}
      >
        CSV
      </button>
      {disabled && (
        <span className="text-xs italic">
          {onRunSimulation ? (
            <>
              <button
                type="button"
                onClick={onRunSimulation}
                className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300"
              >
                Run simulation
              </button>
              <span className="text-gray-500 dark:text-gray-400"> to enable</span>
            </>
          ) : (
            <span className="text-blue-600 dark:text-blue-400">Run simulation to enable</span>
          )}
        </span>
      )}
    </div>
  );
}
