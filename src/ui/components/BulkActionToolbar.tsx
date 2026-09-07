// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState } from "react";
import type { RSMLevel, DistributionType, ActivityStatus } from "@domain/models/types";
import { RSM_LEVELS, RSM_LABELS, DISTRIBUTION_TYPES, ACTIVITY_STATUSES } from "@domain/models/types";
import { distributionLabel, statusLabel } from "@domain/helpers/format-labels";
import { confirmDialog } from "@ui/hooks/use-confirm-store";

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

  const handleApply = async () => {
    if (!hasStaged) return;

    const payload: BulkApplyPayload = {};
    if (stagedConfidence) payload.confidenceLevel = stagedConfidence;
    if (stagedDistribution) payload.distributionType = stagedDistribution;
    if (stagedStatus) payload.status = stagedStatus;

    // WI-6c — ⚠️ THIS IS NOT A CONFIRMATION, AND THE COPY HAS TO SAY SO. Cancel does not
    // abort: it means "apply the distribution, keep the existing min/max". `onApply` runs on
    // BOTH answers, so the answer is DATA, not permission — hence `destructive: false`, a
    // `cancelLabel` naming the other outcome rather than "Cancel", and a description whose
    // first sentence is that the apply happens either way. The native browser prompt this
    // replaced could say none of that: one string, and two buttons it did not get to name.
    //
    // ⚠️ That sentence deliberately does NOT spell the old API's name. The campaign's census
    // greps this repo for that literal, and a prose mention here would have replaced the call
    // row one-for-one — leaving the count flat against a migration that really happened. It
    // did, until this comment was reworded.
    //
    // The variable is named for the MEANING of the boolean, not its shape — `ask()` returns
    // `Promise<boolean>` here as everywhere, but true/false is recalculate/keep, not yes/no.
    if (stagedDistribution && heuristicEnabled) {
      // ⚠️ `?? 50` is NOT a typo for the shipped default of 75. It is WI-27's fallback, which
      // the owner declined as affecting a population of one, and it is self-consistent for
      // that user. Do not "correct" it to 75.
      const shouldRecalculate = await confirmDialog.ask({
        title: `Recalculate min/max for ${selectedCount} selected activit${selectedCount === 1 ? "y" : "ies"}?`,
        description:
          `The ${distributionLabel(stagedDistribution)} distribution is applied either way. ` +
          `Recalculating also replaces each activity's min and max from its most likely value ` +
          `using your current heuristic settings (${heuristicMinPercent ?? 50}% / ${heuristicMaxPercent ?? 200}%). ` +
          `Keeping them leaves the existing min and max untouched.`,
        confirmLabel: "Recalculate",
        cancelLabel: "Keep current min/max",
        destructive: false,
      });
      payload.recalculateHeuristic = shouldRecalculate;
    }

    onApply(payload);
    // ⚠️ These three stay BELOW `onApply` deliberately. Moving them above the `await` would
    // visibly empty the dropdowns behind the open dialog. Left here they are correct for a
    // consumer whose `onApply` leaves this toolbar mounted, and moot in the shipped wiring
    // where it does not: the grid's `handleBulkApply` ends in an unconditional
    // `clearSelection()`, so React commits the reset and the unmount together and the staged
    // state is discarded either way. Correct under both lifetimes — that is why they stay.
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
        name="bulkConfidence"
        aria-label="Set confidence level for selected activities"
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
        name="bulkDistribution"
        aria-label="Set distribution for selected activities"
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
        name="bulkStatus"
        aria-label="Set status for selected activities"
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
