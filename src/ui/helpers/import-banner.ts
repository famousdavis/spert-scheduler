// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ImportOutcome } from "@app/api/export-import-service";
import type { StorageMode } from "@ui/providers/StorageProvider";

export interface ImportBanner {
  text: string;
  hasErrors: boolean;
  cloudSyncActive: boolean;
}

/**
 * The per-outcome fragments of a successful-ish import summary, in display order.
 * Only non-zero counts appear, so "1 added, 2 skipped" never reads "0 replaced".
 */
function buildParts(outcome: ImportOutcome): string[] {
  const { added, replaced, copied, skipped, errors } = outcome;
  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (replaced > 0) parts.push(`${replaced} replaced`);
  if (copied > 0) parts.push(`${copied} copied as new`);
  if (errors.length > 0) parts.push(`${errors.length} failed (storage)`);
  if (skipped > 0) parts.push(`${skipped} skipped`);
  return parts;
}

/**
 * The trailing data-quality note, or "" when there is nothing to say.
 *
 * Separate from `buildParts` on purpose: the itemised counts describe what the IMPORT did
 * (added / replaced / skipped / failed), whereas a broken dependency graph is a property of
 * the DATA that arrived — every one of these projects imported successfully. Its own function
 * because folding it inline took `importDoneBanner` to cognitive complexity 16, one over the
 * threshold, and raising the accepted baseline to absorb a finding this change introduced is
 * exactly what the quality charter forbids.
 */
function dependencyNote(count: number): string {
  if (count <= 0) return "";
  const projects = count !== 1 ? "projects have" : "project has";
  const them = count !== 1 ? "them" : "it";
  return ` ${count} imported ${projects} dependency problems — open ${them} to see the details.`;
}

/**
 * Summarise an import for the done-banner.
 *
 * Three shapes, in precedence order:
 *  - everything was auto-skipped as drift → say so explicitly, because the user
 *    chose nothing and would otherwise see a bare "0 imported" with no cause;
 *  - nothing succeeded and nothing failed → a plain all-skipped message;
 *  - otherwise → the itemised counts, headed by whether any storage write failed.
 *
 * `cloudSyncActive` is true only when something actually landed AND the user is in
 * cloud mode: a purely-skipped import triggers no sync and must not claim one.
 */
export function importDoneBanner(
  outcome: ImportOutcome,
  total: number,
  mode: StorageMode,
  /**
   * Imported projects carrying a broken dependency graph. REQUIRED, not optional:
   * an optional parameter defaulting to 0 would let a new call site silently claim a
   * clean import. Reported, never acted on — those projects imported unmodified.
   */
  dependencyIssueCount: number
): ImportBanner {
  const { added, replaced, copied, skipped, driftSkipped, errors } = outcome;
  const hasSuccess = added + replaced + copied > 0;
  const hasErrors = errors.length > 0;
  const allDrift =
    !hasSuccess && !hasErrors && skipped === 0 && driftSkipped.length > 0;

  let text: string;
  if (allDrift) {
    const n = driftSkipped.length;
    text = `All ${n} project${n !== 1 ? "s were" : " was"} skipped — your project list changed while the preview was open.`;
  } else if (!hasSuccess && !hasErrors) {
    text = `No projects were imported — all ${total} skipped.`;
  } else {
    const heading = hasErrors ? "Import finished with errors" : "Import complete";
    text = `${heading}: ${buildParts(outcome).join(", ")}.`;
  }

  // Only when something actually landed: a count can survive from the preview while every
  // affected project was skipped, and "1 imported project has..." would then be false.
  if (hasSuccess) text += dependencyNote(dependencyIssueCount);

  return { text, hasErrors, cloudSyncActive: mode === "cloud" && hasSuccess };
}
