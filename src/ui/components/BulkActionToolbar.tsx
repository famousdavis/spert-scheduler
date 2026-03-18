// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { RSMLevel, DistributionType } from "@domain/models/types";
import { RSM_LEVELS, RSM_LABELS, DISTRIBUTION_TYPES } from "@domain/models/types";
import { distributionLabel } from "@domain/helpers/format-labels";

interface BulkActionToolbarProps {
  selectedCount: number;
  incompleteSelectedCount: number;
  onBulkConfidenceChange: (level: RSMLevel) => void;
  onBulkDistributionChange: (dt: DistributionType) => void;
  onBulkComplete: () => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
}

export function BulkActionToolbar({
  selectedCount,
  incompleteSelectedCount,
  onBulkConfidenceChange,
  onBulkDistributionChange,
  onBulkComplete,
  onBulkDelete,
  onClearSelection,
}: BulkActionToolbarProps) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 border-b border-blue-200 dark:border-blue-800">
      <span className="text-sm text-blue-700 dark:text-blue-300 font-medium">
        {selectedCount} selected
      </span>

      {/* Confidence level dropdown */}
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onBulkConfidenceChange(e.target.value as RSMLevel);
            e.target.value = "";
          }
        }}
        className="px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-blue-500"
      >
        <option value="" disabled>Set Confidence...</option>
        {RSM_LEVELS.map((level) => (
          <option key={level} value={level}>
            {RSM_LABELS[level]}
          </option>
        ))}
      </select>

      {/* Distribution type dropdown */}
      <select
        defaultValue=""
        onChange={(e) => {
          if (e.target.value) {
            onBulkDistributionChange(e.target.value as DistributionType);
            e.target.value = "";
          }
        }}
        className="px-2 py-1 text-sm border border-blue-300 dark:border-blue-600 rounded bg-white dark:bg-gray-700 dark:text-gray-100 focus:outline-none focus:border-blue-500"
      >
        <option value="" disabled>Set Distribution...</option>
        {DISTRIBUTION_TYPES.map((dt) => (
          <option key={dt} value={dt}>
            {distributionLabel(dt)}
          </option>
        ))}
      </select>

      {incompleteSelectedCount > 0 && (
        <button
          onClick={onBulkComplete}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Mark Complete
        </button>
      )}

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
