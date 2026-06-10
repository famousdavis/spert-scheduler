// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { sanitizeFilename } from "./download";

/**
 * Build the download filename for a single-project JSON export.
 *
 * Format: `spert-scheduler-<sanitized project name>-<dateISO>.json`
 *
 * The leading `spert-scheduler-` identifies the source app at a glance when the
 * file lands in a Downloads folder beside exports from other tools, and the
 * project name makes each download easy to attribute to its project. The name
 * is run through {@link sanitizeFilename} for cross-platform filename safety
 * (illegal characters → `_`, empty → `Untitled`).
 *
 * @param projectName  Raw project name (may contain spaces or illegal chars).
 * @param dateISO      Date stamp in `YYYY-MM-DD` form (e.g. from `formatDateISO`).
 */
export function buildProjectExportFilename(
  projectName: string,
  dateISO: string
): string {
  return `spert-scheduler-${sanitizeFilename(projectName)}-${dateISO}.json`;
}
