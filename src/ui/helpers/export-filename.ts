// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { sanitizeFilename } from "./download";

/**
 * Build the download filename for a single-project JSON export.
 *
 * Format: `spert-scheduler-<sanitized project name>-<stamp>.json`
 *
 * The leading `spert-scheduler-` identifies the source app at a glance when the
 * file lands in a Downloads folder beside exports from other tools, and the
 * project name makes each download easy to attribute to its project. The name
 * is run through {@link sanitizeFilename} for cross-platform filename safety
 * (illegal characters → `_`, empty → `Untitled`).
 *
 * @param projectName  Raw project name (may contain spaces or illegal chars).
 * @param stamp        Date/time stamp, e.g. `formatExportTimestamp(new Date())`
 *                     → `2026-06-10T15-48-30` (or a bare `YYYY-MM-DD`).
 */
export function buildProjectExportFilename(
  projectName: string,
  stamp: string
): string {
  return `spert-scheduler-${sanitizeFilename(projectName)}-${stamp}.json`;
}
