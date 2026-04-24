// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useMemo, useState } from "react";
import type { Activity } from "@domain/models/types";
import {
  computeSensitivityAnalysis,
  type SensitivityResult,
} from "@core/analytics/sensitivity";

interface SensitivityPanelProps {
  activities: Activity[];
}

type SortField = "impact" | "variance" | "cv";

function sortFieldBarColor(sortField: SortField): string {
  if (sortField === "impact") return "bg-blue-500";
  if (sortField === "variance") return "bg-purple-500";
  return "bg-amber-500";
}

function sortFieldBarWidth(
  sortField: SortField,
  impactPct: number,
  variancePct: number,
  coefficientOfVariation: number,
): number {
  if (sortField === "impact") return impactPct;
  if (sortField === "variance") return variancePct;
  return coefficientOfVariation * 100;
}

/**
 * Displays sensitivity analysis results showing which activities
 * contribute most to project uncertainty.
 */
export function SensitivityPanel({ activities }: SensitivityPanelProps) {
  const [sortField, setSortField] = useState<SortField>("impact");
  const [expanded, setExpanded] = useState(false);

  const results = useMemo(
    () => computeSensitivityAnalysis(activities),
    [activities]
  );

  const sortedResults = useMemo(() => {
    const sorted = [...results];
    switch (sortField) {
      case "impact":
        sorted.sort((a, b) => b.impactScore - a.impactScore);
        break;
      case "variance":
        sorted.sort((a, b) => b.varianceContribution - a.varianceContribution);
        break;
      case "cv":
        sorted.sort(
          (a, b) => b.coefficientOfVariation - a.coefficientOfVariation
        );
        break;
    }
    return sorted;
  }, [results, sortField]);

  // Show top 5 or all if expanded
  const displayResults = expanded
    ? sortedResults
    : sortedResults.slice(0, 5);

  if (activities.length === 0) {
    return null;
  }

  // Find max values for bar scaling
  const maxImpact = Math.max(...results.map((r) => r.impactScore), 0.01);
  const maxVariance = Math.max(
    ...results.map((r) => r.varianceContribution),
    0.01
  );

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          Sensitivity Analysis
        </h3>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500 dark:text-gray-400">
            Sort by:
          </label>
          <select
            value={sortField}
            onChange={(e) => setSortField(e.target.value as SortField)}
            className="text-xs px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded focus:outline-none focus:border-blue-400"
          >
            <option value="impact">Impact</option>
            <option value="variance">Variance Contribution</option>
            <option value="cv">Relative Uncertainty</option>
          </select>
        </div>
      </div>

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
        Activities ranked by their contribution to project schedule uncertainty.
      </p>

      <div className="space-y-2">
        {displayResults.map((result, idx) => (
          <SensitivityRow
            key={result.activityId}
            result={result}
            rank={idx + 1}
            maxImpact={maxImpact}
            maxVariance={maxVariance}
            sortField={sortField}
          />
        ))}
      </div>

      {results.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="mt-3 text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
        >
          {expanded
            ? "Show less"
            : `Show all ${results.length} activities`}
        </button>
      )}
    </div>
  );
}

interface SensitivityRowProps {
  result: SensitivityResult;
  rank: number;
  maxImpact: number;
  maxVariance: number;
  sortField: SortField;
}

function SensitivityRow({
  result,
  rank,
  maxImpact,
  maxVariance,
  sortField,
}: SensitivityRowProps) {
  const impactPct = (result.impactScore / maxImpact) * 100;
  const variancePct = (result.varianceContribution / maxVariance) * 100;

  // Color coding based on rank
  let rankColor = "text-gray-500 dark:text-gray-400";
  if (rank <= 3) rankColor = "text-red-600 dark:text-red-400";
  else if (rank <= 5) rankColor = "text-amber-600 dark:text-amber-400";

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      {/* Rank badge */}
      <span
        className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded ${rankColor}`}
      >
        #{rank}
      </span>

      {/* Activity name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
          {result.activityName}
        </p>
        <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
          <span>
            μ={result.meanDuration.toFixed(1)}d
          </span>
          <span>
            σ={result.standardDeviation.toFixed(1)}d
          </span>
          <span>
            CV={Math.round(result.coefficientOfVariation * 100)}%
          </span>
        </div>
      </div>

      {/* Bar visualization */}
      <div className="w-32">
        <div className="h-4 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
          <div
            className={`h-full transition-all ${sortFieldBarColor(sortField)}`}
            style={{
              width: `${sortFieldBarWidth(sortField, impactPct, variancePct, result.coefficientOfVariation)}%`,
            }}
          />
        </div>
        <p className="text-[10px] text-gray-500 dark:text-gray-400 text-right mt-0.5">
          {sortField === "impact" && `+${result.impactScore.toFixed(1)}d`}
          {sortField === "variance" &&
            `${(result.varianceContribution * 100).toFixed(1)}%`}
          {sortField === "cv" &&
            `${(result.coefficientOfVariation * 100).toFixed(0)}%`}
        </p>
      </div>
    </div>
  );
}
