// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState } from "react";
import type { RSMLevel, DistributionType, ActivityStatus } from "@domain/models/types";
import { RSM_LEVELS, RSM_LABELS, DISTRIBUTION_TYPES, ACTIVITY_STATUSES } from "@domain/models/types";
import { distributionLabel, statusLabel } from "@domain/helpers/format-labels";

export interface BulkApplyPayload {
  confidenceLevel?: RSMLevel;
  distributionType?: DistributionType;
  status?: ActivityStatus;
  recalculateHeuristic?: boolean;
}

interface BulkActionToolbarProps {
  selectedCount: number;
  onApply: (staged: BulkApplyPayload) => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
  heuristicEnabled?: boolean;
  heuristicMinPercent?: number;
  heuristicMaxPercent?: number;
}

export function BulkActionToolbar({
  selectedCount,
  onApply,
  onBulkDelete,
  onClearSelection,
  heuristicEnabled,
  heuristicMinPercent,
  heuristicMaxPercent,
}: BulkActionToolbarProps) {
  const [stagedConfidence, setStagedConfidence] = useState<RSMLevel | "">("");
  const [stagedDistribution, setStagedDistribution] = useState<DistributionType | "">("");
  const [stagedStatus, setStagedStatus] = useState<ActivityStatus | "">("");

  const hasStaged = stagedConfidence !== "" || stagedDistribution !== "" || stagedStatus !== "";

  const handleApply = () => {
    if (!hasStaged) return;

    const payload: BulkApplyPayload = {};
    if (stagedConfidence) payload.confidenceLevel = stagedConfidence;
    if (stagedDistribution) payload.distributionType = stagedDistribution;
    if (stagedStatus) payload.status = stagedStatus;

    // Prompt for heuristic recalculation when distribution is staged and heuristics are on
    if (stagedDistribution && heuristicEnabled) {
      const confirmed = window.confirm(
        `Recalculate min/max for ${selectedCount} selected activit${selectedCount === 1 ? "y" : "ies"} using current heuristic settings (${heuristicMinPercent ?? 50}% / ${heuristicMaxPercent ?? 200}%)?`
      );
      payload.recalculateHeuristic = confirmed;
    }

    onApply(payload);
    setStagedConfidence("");
    setStagedDistribution("");
    setStagedStatus("");
  };

  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
      <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
        {selectedCount} selected
      </span>

      {/* Confidence level dropdown */}
      <select
        value={stagedConfidence}
        onChange={(e) => setStagedConfidence(e.target.value as RSMLevel | "")}
        className="px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-blue-500"
      >
        <option value="">Set Confidence...</option>
        {RSM_LEVELS.map((level) => (
          <option key={level} value={level}>
            {RSM_LABELS[level]}
          </option>
        ))}
      </select>

      {/* Distribution type dropdown */}
      <select
        value={stagedDistribution}
        onChange={(e) => setStagedDistribution(e.target.value as DistributionType | "")}
        className="px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-blue-500"
      >
        <option value="">Set Distribution...</option>
        {DISTRIBUTION_TYPES.map((dt) => (
          <option key={dt} value={dt}>
            {distributionLabel(dt)}
          </option>
        ))}
      </select>

      {/* Status dropdown */}
      <select
        value={stagedStatus}
        onChange={(e) => setStagedStatus(e.target.value as ActivityStatus | "")}
        className="px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-blue-500"
      >
        <option value="">Set Status...</option>
        {ACTIVITY_STATUSES.map((s) => (
          <option key={s} value={s}>
            {statusLabel(s)}
          </option>
        ))}
      </select>

      {/* Apply button — disabled until at least one dropdown has a selection */}
      <button
        onClick={handleApply}
        disabled={!hasStaged}
        className={`px-3 py-1 text-sm rounded ${
          hasStaged
            ? "bg-blue-600 text-white hover:bg-blue-700"
            : "bg-blue-300 dark:bg-blue-800 text-white opacity-50 cursor-not-allowed"
        }`}
      >
        Apply
      </button>

      <button
        onClick={onBulkDelete}
        className="px-3 py-1 text-red-600 dark:text-red-400 text-sm hover:text-red-800 dark:hover:text-red-300"
      >
        Delete
      </button>

      <button
        onClick={onClearSelection}
        className="px-3 py-1 text-blue-600 dark:text-blue-400 text-sm hover:text-blue-800 dark:hover:text-blue-300"
      >
        Clear
      </button>
    </div>
  );
}
