// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Type surface for scripts/falsify.mjs, so its guard test
// (src/integration/falsify-runner.test.ts) type-checks under `tsc -b`.
//
// Hand-written on purpose, matching scripts/measure-complexity.d.mts. The alternative
// was `allowJs` in tsconfig.app.json, which would widen what the app build reads for
// the sake of one dev-tool import.

/**
 * Total tests vitest reported, or **null when there was no summary line at all**.
 *
 * The null case is the whole point: a file that fails to transform produces an error and
 * no summary, and returning 0 there would be indistinguishable from "ran fine, nothing
 * failed" — the defect this module exists to prevent.
 */
export function parseTestTotal(out: string): number | null;

/** Test names vitest's verbose reporter marked as failed. */
export function parseFailedNames(out: string): string[];

/** Why a mutated run could not be interpreted, or `{ ok: true }` if it can be. */
export interface RunComparability {
  ok: boolean;
  /** Present whenever `ok` is false, so an abort is never silent. */
  reason?: string;
}

/**
 * Is a mutated run comparable to the baseline at all?
 *
 * Answers only "can this run be interpreted", never "did the mutation survive". A run
 * that executed a different number of tests than the baseline — or produced no summary —
 * is not weaker evidence, it is NO evidence, and must stop the tool rather than flow
 * into a verdict.
 */
export function checkRunComparable(
  baselineTotal: number,
  mutantTotal: number | null,
): RunComparability;
