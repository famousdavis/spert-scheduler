// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { DistributionType, RSMLevel } from "@domain/models/types";
import { distributionLabel } from "@domain/helpers/format-labels";

/**
 * **Labels the activity grid uses INSTEAD of the shared ones, and only there.**
 *
 * ⚠️ **These exist because the grid is the one surface with a pixel budget.** Every other
 * surface — the Edit Activity modal, the Bulk toolbar, Preferences, the printed report and
 * the XLSX/CSV export — renders the full wording from `distributionLabel` and `RSM_LABELS`
 * and must keep doing so.
 *
 * ⚠️ **DO NOT "simplify" this by shortening the shared labels instead.** That blast radius
 * was measured at the artefact rather than inferred: driving the real Export CSV button on
 * the sample project produced a 24,510-byte file containing `Triangular` 17 / `LogNormal`
 * 11 / `T-Normal` 10 / `Uniform` 2 — the fixture's distribution mix exactly — and the
 * rendered print report tallied the same four numbers. A shared relabel changes what the
 * user's exported schedule and printed report say. A grid-local one cannot.
 *
 * ✅ **Nothing is hidden by the abbreviation.** The distribution `<select>`'s own dropdown
 * is drawn by the platform from the same `<option>` text, so that one IS abbreviated while
 * open — but the confidence control's dropdown is a fixed 256px portal that keeps the full
 * wording, which is where a user actually chooses a level, and both controls carry the
 * full wording on `title` and `aria-label`.
 */

/**
 * Distribution labels the grid overrides. Anything absent falls through to
 * `distributionLabel`, so a new distribution type gets the shared wording until someone
 * decides it needs its own.
 *
 * ⚠️ **`LogNormal` → `LogNorm` is NOT here for the 6.31px of track it saves.** Its job is
 * the gap between the label's ink and the `<select>`'s native arrow, which is where the
 * recommendation dot lives. At the grid's font that gap is `(track − 25) − (5 + ink)`:
 * with `LogNormal` it is 9.36px, below the 12px affordance floor, and with `LogNorm` it is
 * 20.33px at a 110px track. **The abbreviation and the dot are one change** — ship the dot
 * without this and it has nowhere to sit that does not cover the arrow.
 *
 * ⚠️ `Triangular` (ink 64.33) is the widest label the grid still shows in full, so it — not
 * `LogNorm` — is what sets the distribution track's floor while the dot is in the gap.
 */
const GRID_DISTRIBUTION_LABELS: Partial<Record<DistributionType, string>> = {
  logNormal: "LogNorm",
};

/** The grid's distribution label: its own where it has one, the shared one otherwise. */
export function gridDistributionLabel(dt: DistributionType): string {
  return GRID_DISTRIBUTION_LABELS[dt] ?? distributionLabel(dt);
}

/**
 * Confidence labels for the grid's confidence BUTTON only.
 *
 * The full `RSM_LABELS` need 101.70px of track at their widest (`Near certainty`) and the
 * column is 75px, so three of the ten levels truncated with an ellipsis and no hover
 * reveal. These need 74.42px at their widest, also `Near cert.`, so none truncates.
 *
 * ⚠️ **`Record`, not `Partial<Record>`, deliberately**: a new RSM level must fail `tsc`
 * here rather than silently fall back to a label that does not fit. `High` and `Low`
 * already fit and are unchanged, which is why they look untouched.
 */
export const GRID_RSM_LABELS: Record<RSMLevel, string> = {
  nearCertainty: "Near cert.",
  veryHighConfidence: "V. high",
  highConfidence: "High",
  mediumHighConfidence: "Med-high",
  mediumConfidence: "Med.",
  mediumLowConfidence: "Med-low",
  lowConfidence: "Low",
  veryLowConfidence: "V. low",
  extremelyLowConfidence: "Ex. low",
  guesstimate: "Guess.",
};
