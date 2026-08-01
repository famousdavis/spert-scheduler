// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Type surface for scripts/measure-complexity.mjs, so its guard test
// (src/integration/measure-complexity.test.ts) type-checks under `tsc -b`.
//
// Hand-written on purpose. The alternative was `allowJs` in tsconfig.app.json, which
// would widen what the app build reads for the sake of one dev-tool import.

/** One function's cognitive-complexity measurement. */
export interface ComplexityRow {
  /** 1-indexed line the function starts on. */
  line: number;
  /** 1-indexed column, needed because two functions can start on the same line. */
  column: number;
  /** Cognitive complexity, parsed from the sonarjs message. */
  cc: number;
  /** Best-effort identifier, or `L<line>` when the line has no resolvable name. */
  name: string;
  /**
   * True when an in-file `eslint-disable` hides this finding from `npm run lint`.
   * Measured regardless — that is the point of the two-pass design.
   */
  suppressed: boolean;
}

/**
 * Per-function cognitive complexity for a source string, highest first.
 * `filePath` decides which ESLint config block applies, so it must be a real in-repo
 * path (or a synthetic sibling of one) with the right extension.
 *
 * Throws on a parse failure rather than returning an empty array, because "no messages"
 * and "every function measures 0" are otherwise indistinguishable.
 */
export function measure(code: string, filePath: string): Promise<ComplexityRow[]>;
