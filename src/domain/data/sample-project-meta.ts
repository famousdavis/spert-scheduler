// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Metadata about the sample project, split out from the fixture itself.
 *
 * `sample-project.ts` is ~65 KB of activity content and is loaded dynamically so
 * it stays out of the main bundle. Anything that needs to know *about* the sample
 * without building it — name collision checks, menu labels — imports from here
 * instead, which is statically safe because this module carries no data.
 */

export const SAMPLE_PROJECT_NAME = "Cloud ERP Solution (Sample)";
