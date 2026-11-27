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

/**
 * The sample's name, "Sample: " and the sample's own name (v0.89.0, the SPERT® Suite's rule for every app with a
 * sample; contract §7, "Load Sample"). Until v0.89.0 it was "Cloud ERP Solution (Sample)". Samples already stored keep
 * whatever name they were given.
 */
export const SAMPLE_PROJECT_NAME = "Sample: Cloud ERP Solution";

/**
 * The name a newly loaded sample takes: `SAMPLE_PROJECT_NAME`, or, when a project already has that exact name, the
 * first of "… (2)", "… (3)", … that none has. The lowest free number wins, so a base that is free again is reused.
 * `existing` is every project's name, archived ones included (the store passes its whole list). Only an exact match
 * takes a name: a clone, "Sample: Cloud ERP Solution (Copy)", takes neither the base nor a number.
 */
export function sampleProjectName(existing: readonly string[]): string {
  const taken = new Set(existing);
  if (!taken.has(SAMPLE_PROJECT_NAME)) return SAMPLE_PROJECT_NAME;
  let n = 2;
  while (taken.has(`${SAMPLE_PROJECT_NAME} (${n})`)) n++;
  return `${SAMPLE_PROJECT_NAME} (${n})`;
}
