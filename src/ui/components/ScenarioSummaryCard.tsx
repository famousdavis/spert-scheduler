// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useCallback } from "react";
import { ToggleSwitch } from "./ToggleSwitch";
import type { Activity, ActivityDependency, DeterministicSchedule, Milestone, ScenarioSettings, Calendar, MilestoneBufferInfo } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import {
  parseDateISO,
  addWorkingDays,
  formatDateISO,
} from "@core/calendar/calendar";
import {
  ACTIVITY_PERCENTILE_OPTIONS,
  PROJECT_PERCENTILE_OPTIONS,
} from "@ui/helpers/percentile-options";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { toast } from "@ui/hooks/use-notification-store";
import {
  exportScheduleXlsx,
  exportScheduleCsv,
} from "@app/api/schedule-export-service";
import type { ScheduleExportParams } from "@app/api/schedule-export-service";
import { downloadFile, sanitizeFilename } from "@ui/helpers/download";

interface ScenarioSummaryCardProps {
  startDate: string;
  schedule: DeterministicSchedule | null;
  buffer: ScheduleBuffer | null;
  calendar?: WorkCalendar | Calendar;
  settings: ScenarioSettings;
  hasSimulationResults: boolean;
  onSettingsChange: (updates: Partial<ScenarioSettings>) => void;
  onStartDateChange: (startDate: string) => void;
  onNewSeed: () => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
  milestoneBuffers?: Map<string, MilestoneBufferInfo> | null;
  // Export props
  projectName: string;
  scenarioName: string;
  activities: Activity[];
  dependencies: ActivityDependency[];
  milestones: Milestone[];
  onRunSimulation?: () => void;
}

export function ScenarioSummaryCard({
  startDate,
  schedule,
  buffer,
  calendar,
  settings,
  hasSimulationResults,
  onSettingsChange,
  onStartDateChange,
  onNewSeed,
  isLocked,
  onToggleLock,
  milestoneBuffers,
  projectName,
  scenarioName,
  activities,
  dependencies,
  milestones,
  onRunSimulation,
}: ScenarioSummaryCardProps) {
  const formatDate = useDateFormat();
  const actPct = Math.round(settings.probabilityTarget * 100);
  const projPct = Math.round(settings.projectProbabilityTarget * 100);

  // Local string state for heuristic % inputs — allows free typing, validates on blur
  const [localMinPct, setLocalMinPct] = useState(String(settings.heuristicMinPercent));
  const [localMaxPct, setLocalMaxPct] = useState(String(settings.heuristicMaxPercent));
  useEffect(() => { setLocalMinPct(String(settings.heuristicMinPercent)); }, [settings.heuristicMinPercent]);
  useEffect(() => { setLocalMaxPct(String(settings.heuristicMaxPercent)); }, [settings.heuristicMaxPercent]);

  // Schedule export state
  const dateFormat = usePreferencesStore((s) => s.preferences.dateFormat);
  const [exporting, setExporting] = useState(false);
  const exportDisabled = !hasSimulationResults || !schedule || activities.length === 0;

  const buildExportParams = useCallback((): ScheduleExportParams | null => {
    if (!schedule) return null;
    return { projectName, scenarioName, activities, schedule, buffer, settings, dependencies, milestones, calendar, dateFormat };
  }, [projectName, scenarioName, activities, schedule, buffer, settings, dependencies, milestones, calendar, dateFormat]);

  const handleExportXlsx = useCallback(async () => {
    const params = buildExportParams();
    if (!params) return;
    setExporting(true);
    try {
      const arrayBuffer = await exportScheduleXlsx(params);
      const filename = `${sanitizeFilename(projectName)} - ${sanitizeFilename(scenarioName)} Schedule ${formatDateISO(new Date())}.xlsx`;
      downloadFile(arrayBuffer, filename, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    } finally {
      setExporting(false);
    }
  }, [buildExportParams, projectName, scenarioName]);

  const handleExportCsv = useCallback(() => {
    const params = buildExportParams();
    if (!params) return;
    const csv = exportScheduleCsv(params);
    const filename = `${sanitizeFilename(projectName)} - ${sanitizeFilename(scenarioName)} Schedule ${formatDateISO(new Date())}.csv`;
    downloadFile(csv, filename, "text/csv");
  }, [buildExportParams, projectName, scenarioName]);

  // Compute buffered finish date by adding buffer working days to the deterministic end date
  const bufferedEndDate =
    schedule && buffer && buffer.bufferDays > 0
      ? formatDateISO(
          addWorkingDays(
            parseDateISO(schedule.projectEndDate),
            buffer.bufferDays,
            calendar
          )
        )
      : null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      {/* Lock indicator banner */}
      {isLocked && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md -mt-1 mb-2">
          <span className="text-amber-600 dark:text-amber-400">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </span>
          <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            This scenario is locked — editing is disabled
          </span>
          {onToggleLock && (
            <button
              onClick={onToggleLock}
              className="ml-auto text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium hover:underline"
            >
              Unlock
            </button>
          )}
        </div>
      )}

      {/* Row 1: Dates and duration */}
      <div className="flex items-baseline gap-6 flex-wrap">
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Start
          </span>
          <div>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                if (e.target.value) onStartDateChange(e.target.value);
              }}
              disabled={isLocked}
              className="text-lg font-semibold text-blue-700 dark:text-blue-400 tabular-nums bg-transparent border border-transparent hover:border-gray-300 dark:hover:border-gray-600 focus:border-blue-400 dark:focus:border-blue-400 rounded px-1 -ml-1 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-transparent"
            />
          </div>
        </div>
        <div className="border-l border-gray-200 dark:border-gray-600 self-stretch" />
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Finish w/o Buffer
          </span>
          <p className="text-lg font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
            {schedule ? formatDate(schedule.projectEndDate) : "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Duration
          </span>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {schedule ? (
              <>
                {schedule.totalDurationDays}{" "}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  working days
                </span>
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="border-l border-gray-200 dark:border-gray-600 self-stretch" />
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Finish w/Buffer
          </span>
          <p className="text-lg font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
            {bufferedEndDate ? formatDate(bufferedEndDate) : "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Duration w/Buffer
          </span>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {schedule && buffer && buffer.bufferDays > 0 ? (
              <>
                {schedule.totalDurationDays + buffer.bufferDays}{" "}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  working days
                </span>
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
      </div>

      {/* Row 2: Targets, trials, seed */}
      <div className="flex items-center gap-3 flex-wrap text-sm">
        {/* Targets */}
        <div className="flex items-center gap-1.5">
          <label className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
            Activity
          </label>
          <select
            value={settings.probabilityTarget}
            onChange={(e) =>
              onSettingsChange({
                probabilityTarget: parseFloat(e.target.value),
              })
            }
            disabled={isLocked}
            className="px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm font-medium focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {ACTIVITY_PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <label className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap ml-1.5">
            Project
          </label>
          <select
            value={settings.projectProbabilityTarget}
            onChange={(e) =>
              onSettingsChange({
                projectProbabilityTarget: parseFloat(e.target.value),
              })
            }
            disabled={isLocked}
            className="px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm font-medium focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {PROJECT_PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-l border-gray-200 dark:border-gray-600 h-5" />

        {/* Trials */}
        <div className="flex items-center gap-1.5">
          <label className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
            Trials:
          </label>
          <select
            value={settings.trialCount}
            onChange={(e) =>
              onSettingsChange({
                trialCount: parseInt(e.target.value, 10),
              })
            }
            disabled={isLocked}
            className="px-1 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm font-medium focus:border-blue-400 focus:outline-none tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {[1000, 5000, 10000, 25000, 50000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        {/* Seed */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 dark:text-gray-400 text-xs">Seed:</span>
          <code className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded max-w-[100px] truncate">
            {settings.rngSeed.slice(0, 8)}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(settings.rngSeed);
              toast.success("Seed copied to clipboard");
            }}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
            title="Copy full seed to clipboard"
            aria-label="Copy seed"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={onNewSeed}
            disabled={isLocked}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline"
          >
            New
          </button>
        </div>

        <div className="border-l border-gray-200 dark:border-gray-600 h-5" />

        {/* Heuristic */}
        <div className="flex items-center gap-1.5" title="Heuristic estimation: auto-generate Min and Max estimates from the Most Likely value using percentage multipliers">
          <label className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
            Heuristic:
          </label>
          <ToggleSwitch
            checked={settings.heuristicEnabled}
            onChange={(val) => onSettingsChange({ heuristicEnabled: val })}
            disabled={isLocked}
          />
          <span className="text-gray-500 dark:text-gray-400 text-xs">Min</span>
          <input
            type="number"
            value={localMinPct}
            onChange={(e) => setLocalMinPct(e.target.value)}
            onBlur={() => {
              const val = parseInt(localMinPct, 10);
              if (!isNaN(val) && val >= 1 && val <= 99) {
                onSettingsChange({ heuristicMinPercent: val });
              } else {
                setLocalMinPct(String(settings.heuristicMinPercent));
              }
            }}
            disabled={isLocked || !settings.heuristicEnabled}
            className="w-10 px-1 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            min={1}
            max={99}
            step={1}
          />
          <span className="text-gray-500 dark:text-gray-400 text-xs">%</span>
          <span className="text-gray-500 dark:text-gray-400 text-xs ml-1">Max</span>
          <input
            type="number"
            value={localMaxPct}
            onChange={(e) => setLocalMaxPct(e.target.value)}
            onBlur={() => {
              const val = parseInt(localMaxPct, 10);
              if (!isNaN(val) && val >= 101 && val <= 1000) {
                onSettingsChange({ heuristicMaxPercent: val });
              } else {
                setLocalMaxPct(String(settings.heuristicMaxPercent));
              }
            }}
            disabled={isLocked || !settings.heuristicEnabled}
            className="w-12 px-1 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm text-right tabular-nums focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            min={101}
            max={1000}
            step={1}
          />
          <span className="text-gray-500 dark:text-gray-400 text-xs">%</span>
        </div>

        <div className="border-l border-gray-200 dark:border-gray-600 h-5" />

        {/* Dependencies + Parkinson's Law — grouped to prevent orphan wrapping */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" title="Dependency mode: schedule activities using a dependency graph instead of sequential order">
            <label className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
              Dependencies:
            </label>
            <ToggleSwitch
              checked={settings.dependencyMode}
              onChange={(val) => onSettingsChange({ dependencyMode: val })}
              disabled={isLocked}
            />
          </div>

          <div className="flex items-center gap-1.5" title="Parkinson's Law: when enabled, simulated activity durations are never less than the deterministic (P50) duration">
            <label className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
              Parkinson&apos;s Law:
            </label>
            <ToggleSwitch
              checked={settings.parkinsonsLawEnabled ?? true}
              onChange={(val) => onSettingsChange({ parkinsonsLawEnabled: val })}
              disabled={isLocked}
            />
          </div>
        </div>
      </div>
      {!(settings.parkinsonsLawEnabled ?? true) && (
        <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
          Simulated durations may be shorter than the deterministic schedule.
        </p>
      )}

      {/* Row 3: Schedule Buffer + Export */}
      <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-center gap-2 flex-wrap">
          {buffer ? (
            <>
              <span className="text-xs text-gray-500 dark:text-gray-400">Schedule Buffer:</span>
              <span
                className={`font-semibold tabular-nums ${
                  buffer.bufferDays >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-600 dark:text-red-400"
                }`}
              >
                {buffer.bufferDays > 0 ? "+" : ""}
                {buffer.bufferDays} days
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                (P{actPct} schedule → P{projPct} project confidence)
              </span>
            </>
          ) : hasSimulationResults ? (
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Buffer unavailable — P{projPct} not found in simulation results
            </span>
          ) : (
            <span className="text-xs text-gray-400 dark:text-gray-500 italic">
              {onRunSimulation ? (
                <button
                  type="button"
                  onClick={onRunSimulation}
                  className="text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300 not-italic"
                >
                  Run simulation
                </button>
              ) : (
                "Run simulation"
              )}{" "}
              to calculate schedule buffer
            </span>
          )}

          {/* Export buttons — right-aligned */}
          <div className="flex items-center gap-2 ml-auto no-print">
            <div className="border-l border-gray-200 dark:border-gray-600 h-4" />
            <span className="text-xs text-gray-500 dark:text-gray-400">Export:</span>
            <button
              onClick={handleExportXlsx}
              disabled={exportDisabled || exporting}
              className="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={exportDisabled ? "Run simulation first to enable export" : "Download as formatted Excel file"}
            >
              {exporting ? "Exporting…" : "XLSX"}
            </button>
            <button
              onClick={handleExportCsv}
              disabled={exportDisabled}
              className="px-2 py-0.5 text-xs rounded border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              title={exportDisabled ? "Run simulation first to enable export" : "Download as CSV file"}
            >
              CSV
            </button>
            {exportDisabled && onRunSimulation && (
              <button
                type="button"
                onClick={onRunSimulation}
                className="text-xs text-blue-600 dark:text-blue-400 underline hover:text-blue-800 dark:hover:text-blue-300"
              >
                Run simulation
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Row 4: Milestone Health (only when milestones exist) */}
      {milestoneBuffers && milestoneBuffers.size > 0 && (
        <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
          <span className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Milestones:</span>
          <div className="space-y-0.5">
            {Array.from(milestoneBuffers.values()).map((info) => (
              <div key={info.milestone.id} className="flex items-center gap-2 text-xs">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    info.health === "green"
                      ? "bg-green-500"
                      : info.health === "amber"
                        ? "bg-amber-500"
                        : "bg-red-500"
                  }`}
                />
                <span className="text-gray-700 dark:text-gray-300 font-medium min-w-[120px]">
                  {info.milestone.name}
                  <span className="text-gray-400 dark:text-gray-500 font-normal ml-1">
                    ({formatDate(info.milestone.targetDate)})
                  </span>
                </span>
                {info.bufferDays !== null ? (
                  <>
                    <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                      Buffer: {info.bufferDays}d
                    </span>
                    <span
                      className={`tabular-nums font-medium ${
                        info.slackDays !== null && info.slackDays >= 0
                          ? "text-green-600 dark:text-green-400"
                          : "text-red-600 dark:text-red-400"
                      }`}
                    >
                      Slack: {info.slackDays !== null ? `${info.slackDays >= 0 ? "+" : ""}${info.slackDays}d` : "—"}
                    </span>
                    <span className="text-xs">
                      {info.health === "green" ? "✓" : info.health === "amber" ? "⚠" : "✗ At Risk"}
                    </span>
                  </>
                ) : (
                  <span className="text-gray-400 dark:text-gray-500 italic">
                    Run simulation
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
