// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo } from "react";
import type { SimulationRun } from "@domain/models/types";
import { cdf, lookupProbability } from "@core/analytics/analytics";
import { exportSimulationCSV } from "@app/api/csv-export-service";
import { downloadFile } from "@ui/helpers/download";
import { formatDateISO } from "@core/calendar/calendar";
import { HistogramChart } from "@ui/charts/HistogramChart";
import { CDFChart } from "@ui/charts/CDFChart";
import { PercentileTable } from "@ui/charts/PercentileTable";

function healthColor(pct: number, greenPct: number, amberPct: number): string {
  if (pct >= greenPct) return "#16a34a";
  if (pct >= amberPct) return "#f59e0b";
  return "#dc2626";
}

interface SimulationPanelProps {
  simulationResults: SimulationRun | undefined;
  probabilityTarget: number;
  activityProbabilityTarget?: number;
  isRunning: boolean;
  progress: { completed: number; total: number } | null;
  error: string | null;
  elapsedMs: number | null;
  allActivitiesValid: boolean;
  hasActivities: boolean;
  autoRunEnabled?: boolean;
  deterministicDuration?: number;
  projectName?: string;
  scenarioName?: string;
  formatDurationAsDate?: (days: number) => string;
  dateToWorkingDays?: (targetDateISO: string) => number | null;
  targetFinishGreenPct?: number;
  targetFinishAmberPct?: number;
  onRun: () => void;
  onCancel: () => void;
}

export function SimulationPanel({
  simulationResults,
  probabilityTarget,
  activityProbabilityTarget,
  isRunning,
  progress,
  error,
  elapsedMs,
  allActivitiesValid,
  hasActivities,
  autoRunEnabled,
  deterministicDuration,
  projectName,
  scenarioName,
  formatDurationAsDate,
  dateToWorkingDays,
  targetFinishGreenPct = 80,
  targetFinishAmberPct = 50,
  onRun,
  onCancel,
}: SimulationPanelProps) {
  const targetPct = Math.round(probabilityTarget * 100);
  const actPct = activityProbabilityTarget
    ? Math.round(activityProbabilityTarget * 100)
    : undefined;
  const canRun = hasActivities && allActivitiesValid && !isRunning;

  const handleExportCSV = useCallback(() => {
    if (!simulationResults) return;
    const csv = exportSimulationCSV(
      simulationResults,
      scenarioName ?? "Scenario",
      projectName ?? "Project"
    );
    const filename = `spert-simulation-${formatDateISO(new Date())}.csv`;
    downloadFile(csv, filename, "text/csv;charset=utf-8;");
  }, [simulationResults, scenarioName, projectName]);

  // Activity percentile value for the confidence band visualization
  const activityPercentileValue =
    actPct !== undefined && simulationResults
      ? simulationResults.percentiles[actPct]
      : undefined;

  // Date probability lookup state
  const [targetDate, setTargetDate] = useState("");
  const targetLookup = useMemo(() => {
    if (!targetDate || !dateToWorkingDays || !simulationResults?.samples?.length) return null;
    const days = dateToWorkingDays(targetDate);
    if (days == null || days <= 0) return null;
    const probability = lookupProbability(simulationResults.samples, days);
    const pct = probability * 100;
    const dateLabel = formatDurationAsDate?.(days) ?? "";
    const color = healthColor(pct, targetFinishGreenPct, targetFinishAmberPct);
    const suffix = dateLabel ? ` by ${dateLabel}` : "";
    return { days, probability: pct, label: `${Math.round(pct)}%${suffix}`, color };
  }, [targetDate, dateToWorkingDays, simulationResults, formatDurationAsDate, targetFinishGreenPct, targetFinishAmberPct]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Monte Carlo Simulation
          </h3>
          {autoRunEnabled && (
            <span className="text-[10px] bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-medium">
              Auto-run
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {simulationResults && (
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 rounded text-sm hover:bg-gray-50 dark:hover:bg-gray-700"
            >
              Export CSV
            </button>
          )}
          {isRunning ? (
            <button
              onClick={onCancel}
              className="px-4 py-1.5 bg-red-500 text-white rounded text-sm hover:bg-red-600"
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={onRun}
              disabled={!canRun}
              className="px-4 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Run Simulation
            </button>
          )}
        </div>
      </div>

      {!hasActivities && (
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          Add activities to run a simulation.
        </p>
      )}

      {!allActivitiesValid && hasActivities && (
        <p className="text-amber-600 text-sm">
          Fix validation errors in activities before running simulation.
        </p>
      )}

      {/* Progress */}
      {isRunning && progress && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>Running...</span>
            <span>
              {progress.completed.toLocaleString()} /{" "}
              {progress.total.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all"
              style={{
                width: `${(progress.completed / progress.total) * 100}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded p-3 text-sm text-red-700 dark:text-red-400">
          Simulation failed: {error}
        </div>
      )}

      {/* Results */}
      {simulationResults && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Mean</p>
              <p className="text-lg font-semibold tabular-nums dark:text-gray-100">
                {simulationResults.mean.toFixed(1)} days
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Standard Deviation</p>
              <p className="text-lg font-semibold tabular-nums dark:text-gray-100">
                {simulationResults.standardDeviation.toFixed(1)} days
              </p>
            </div>
            <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <p className="text-xs text-green-600 dark:text-green-400">P{targetPct}</p>
              <p className="text-lg font-semibold text-green-700 dark:text-green-400 tabular-nums">
                {simulationResults.percentiles[targetPct]?.toFixed(1) ?? "—"} days
              </p>
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">Trials</p>
              <p className="text-lg font-semibold tabular-nums dark:text-gray-100">
                {simulationResults.trialCount.toLocaleString()}
              </p>
              {elapsedMs != null && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  in {elapsedMs.toFixed(0)}ms
                </p>
              )}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 pb-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Distribution Histogram{" "}
                <span className="font-normal italic text-gray-400 dark:text-gray-500">
                  (outlier values &gt; P99 omitted)
                </span>
              </h4>
              <HistogramChart
                bins={simulationResults.histogramBins}
                mean={simulationResults.mean}
                percentileTarget={probabilityTarget}
                percentileValue={
                  simulationResults.percentiles[targetPct] ?? simulationResults.mean
                }
                activityPercentileValue={activityPercentileValue}
                deterministicDuration={deterministicDuration}
              />
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 pb-2">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Cumulative Distribution
              </h4>
              {dateToWorkingDays && simulationResults.samples.length > 0 && (
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-gray-500 dark:text-gray-400 whitespace-nowrap">
                    Finish by:
                  </label>
                  <input
                    type="date"
                    value={targetDate}
                    onChange={(e) => setTargetDate(e.target.value)}
                    className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-amber-400 focus:outline-none"
                  />
                  {targetLookup && (
                    <span className="text-xs font-medium whitespace-nowrap" style={{ color: targetLookup.color }}>
                      {Math.round(targetLookup.probability)}% probability
                    </span>
                  )}
                </div>
              )}
              {simulationResults.samples.length > 0 ? (
                <CDFChart
                  points={cdf(
                    new Float64Array(simulationResults.samples),
                    1000
                  )}
                  probabilityTarget={probabilityTarget}
                  percentileValue={
                    simulationResults.percentiles[targetPct] ?? simulationResults.mean
                  }
                  formatDurationAsDate={formatDurationAsDate}
                  targetDuration={targetLookup?.days}
                  targetProbability={targetLookup?.probability}
                  targetLabel={targetLookup?.label}
                  targetColor={targetLookup?.color}
                />
              ) : (
                <div className="flex items-center justify-center h-[300px] text-sm text-gray-400 dark:text-gray-500">
                  Re-run simulation to view CDF (sample data not stored)
                </div>
              )}
            </div>
          </div>

          {/* Percentile Table */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 max-w-md">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Percentile Summary
            </h4>
            <PercentileTable
              percentiles={simulationResults.percentiles}
              probabilityTarget={probabilityTarget}
              samples={simulationResults.samples}
            />
          </div>
        </div>
      )}
    </div>
  );
}
