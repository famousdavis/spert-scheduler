import { useCallback } from "react";
import type { SimulationRun } from "@domain/models/types";
import { cdf } from "@core/analytics/analytics";
import { exportSimulationCSV } from "@app/api/csv-export-service";
import { downloadFile } from "@ui/helpers/download";
import { HistogramChart } from "@ui/charts/HistogramChart";
import { CDFChart } from "@ui/charts/CDFChart";
import { PercentileTable } from "@ui/charts/PercentileTable";

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
  projectName?: string;
  scenarioName?: string;
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
  projectName,
  scenarioName,
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
    const filename = `spert-simulation-${new Date().toISOString().slice(0, 10)}.csv`;
    downloadFile(csv, filename, "text/csv;charset=utf-8;");
  }, [simulationResults, scenarioName, projectName]);

  // Activity percentile value for the confidence band visualization
  const activityPercentileValue =
    actPct !== undefined && simulationResults
      ? simulationResults.percentiles[actPct]
      : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-lg font-semibold text-gray-900">
            Monte Carlo Simulation
          </h3>
          {autoRunEnabled && (
            <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
              Auto-run
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {simulationResults && (
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 border border-gray-300 text-gray-600 rounded text-sm hover:bg-gray-50"
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
        <p className="text-gray-400 text-sm">
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
          <div className="flex justify-between text-xs text-gray-500">
            <span>Running...</span>
            <span>
              {progress.completed.toLocaleString()} /{" "}
              {progress.total.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
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
        <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-700">
          Simulation failed: {error}
        </div>
      )}

      {/* Results */}
      {simulationResults && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500">Mean</p>
              <p className="text-lg font-semibold tabular-nums">
                {simulationResults.mean.toFixed(1)} days
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500">Std Dev</p>
              <p className="text-lg font-semibold tabular-nums">
                {simulationResults.standardDeviation.toFixed(1)} days
              </p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-lg p-3">
              <p className="text-xs text-green-600">P{targetPct}</p>
              <p className="text-lg font-semibold text-green-700 tabular-nums">
                {simulationResults.percentiles[targetPct]?.toFixed(1) ?? "—"} days
              </p>
            </div>
            <div className="bg-white border border-gray-200 rounded-lg p-3">
              <p className="text-xs text-gray-500">Trials</p>
              <p className="text-lg font-semibold tabular-nums">
                {simulationResults.trialCount.toLocaleString()}
              </p>
              {elapsedMs != null && (
                <p className="text-xs text-gray-400">
                  in {elapsedMs.toFixed(0)}ms
                </p>
              )}
            </div>
          </div>

          {/* Charts */}
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Distribution Histogram
              </h4>
              <HistogramChart
                bins={simulationResults.histogramBins}
                mean={simulationResults.mean}
                percentileTarget={probabilityTarget}
                percentileValue={
                  simulationResults.percentiles[targetPct] ?? simulationResults.mean
                }
                activityPercentileValue={activityPercentileValue}
                exportFilename={`${projectName || 'project'}-${scenarioName || 'scenario'}-histogram`}
              />
            </div>
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Cumulative Distribution
              </h4>
              <CDFChart
                points={cdf(
                  new Float64Array(simulationResults.samples),
                  500
                )}
                probabilityTarget={probabilityTarget}
                percentileValue={
                  simulationResults.percentiles[targetPct] ?? simulationResults.mean
                }
                exportFilename={`${projectName || 'project'}-${scenarioName || 'scenario'}-cdf`}
              />
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
