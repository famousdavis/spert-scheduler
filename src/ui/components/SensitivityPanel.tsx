// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useId, useMemo, useState } from "react";
import type { Activity } from "@domain/models/types";
import { nameOrUnnamed } from "@domain/helpers/display-name";
import {
  computeSensitivityAnalysis,
  type SensitivityResult,
} from "@core/analytics/sensitivity";

interface SensitivityPanelProps {
  activities: Activity[];
  /**
   * The scenario is scheduled by its dependencies (WI-104). Every score below reads an activity's own
   * estimates and nothing of the network, so in this mode a note says so: an activity with slack can
   * rank first and move nothing.
   */
  dependencyMode: boolean;
  /**
   * The `#N` each activity carries in the grid, or null when this project does not show activity
   * numbers — the page's own map, as the validation summary takes it (WI-104).
   */
  activityNumberMap?: Map<string, number> | null;
}

type SortField = "impact" | "variance" | "cv";

/**
 * What each sort ranks by, in words (WI-104). All three read the activity's own estimates alone —
 * `computeSensitivityAnalysis` has no dependency or critical-path term — and the line says so. The
 * line it replaced claimed a "contribution to project schedule uncertainty" none of them measures.
 */
const SORT_DESCRIPTIONS: Record<SortField, string> = {
  impact:
    "Ranks each activity by its own estimates: about how many days its 95th-percentile duration grows if its estimates rise 10%.",
  variance: "Ranks each activity by its own estimates: its share of the variance of every activity ranked here, added together.",
  cv: "Ranks each activity by its own estimates: its standard deviation as a share of its mean.",
};

/** Shown in dependency mode only (WI-104), where a ranking that ignores the network misleads most. */
const DEPENDENCY_NOTE =
  "This ranking does not account for dependencies, so an activity with slack can rank high here without moving the finish date. To see what changing an activity does to the finish, try it in a copy of this scenario and compare the two.";

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

/** The line under the description when some activities cannot be analysed. */
function leftOutLine(count: number): string {
  return count === 1
    ? "1 activity is left out until its estimates are fixed."
    : `${count} activities are left out until their estimates are fixed.`;
}

/**
 * Ranks the activities by measures of their OWN estimates — impact, variance share, relative
 * spread — which take no account of dependencies; a dependency-mode scenario shows a note saying
 * so (WI-104).
 */
export function SensitivityPanel({ activities, dependencyMode, activityNumberMap }: SensitivityPanelProps) {
  const [sortField, setSortField] = useState<SortField>("impact");
  const [expanded, setExpanded] = useState(false);
  const sortId = useId();

  const results = useMemo(
    () => computeSensitivityAnalysis(activities),
    [activities]
  );
  const leftOut = activities.length - results.length;

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
          <label htmlFor={sortId} className="text-xs text-gray-500 dark:text-gray-400">
            Sort by:
          </label>
          <select
            id={sortId}
            name="sensitivitySortField"
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

      <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{SORT_DESCRIPTIONS[sortField]}</p>
      {/* The informational note idiom of WorkDayOverrideEditor's confirm banner and the info toast —
          blue-800 on blue-50, blue-200 on blue-900/30 — at text-sm, with role="note". */}
      {dependencyMode && (
        <div
          role="note"
          className="mb-3 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/30 px-3 py-2 text-sm text-blue-800 dark:text-blue-200"
        >
          {DEPENDENCY_NOTE}
        </div>
      )}
      {leftOut > 0 && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">{leftOutLine(leftOut)}</p>
      )}

      <div className="space-y-2">
        {displayResults.map((result, idx) => (
          <SensitivityRow
            key={result.activityId}
            result={result}
            rank={idx + 1}
            number={activityNumberMap?.get(result.activityId)}
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
  /** The activity's `#N` in the grid, when the project numbers its activities. */
  number?: number;
  maxImpact: number;
  maxVariance: number;
  sortField: SortField;
}

function SensitivityRow({
  result,
  rank,
  number,
  maxImpact,
  maxVariance,
  sortField,
}: SensitivityRowProps) {
  const impactPct = (result.impactScore / maxImpact) * 100;
  const variancePct = (result.varianceContribution / maxVariance) * 100;

  // Color coding based on rank
  let rankColor = "text-gray-500 dark:text-gray-400";
  if (rank <= 3) rankColor = "text-red-600 dark:text-red-400";
  else if (rank <= 5) rankColor = "text-amber-700 dark:text-amber-400";

  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-100 dark:border-gray-700 last:border-b-0">
      {/* Rank badge — the rank alone (WI-104): "#N" is an activity's own number everywhere else on
          the page. A screen reader hears "Rank 1". */}
      <span
        className={`w-6 h-6 flex items-center justify-center text-xs font-bold rounded ${rankColor}`}
      >
        <span className="sr-only">Rank </span>
        {rank}
      </span>

      {/* Activity name — "#N name" as the grid and the validation summary show it (WI-104). The
          number sits outside the truncated span, so a long name can never cut it off, and the
          space is a real text node for a screen reader, as in the summary. */}
      <div className="flex-1 min-w-0">
        <p className="flex items-baseline gap-1.5 text-sm font-medium text-gray-900 dark:text-gray-100">
          {number !== undefined && <span className="shrink-0 tabular-nums">#{number}</span>}
          {number !== undefined && " "}
          <span className="truncate">{nameOrUnnamed(result.activityName)}</span>
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
        <p className="text-xs text-gray-500 dark:text-gray-400 text-right mt-0.5">
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
