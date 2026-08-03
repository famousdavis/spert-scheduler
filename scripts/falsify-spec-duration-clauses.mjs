// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof that the §3.4 clause-closure tests kill the EXACT mutants that survived the
// baseline run recorded in docs/mutation-baseline-parser.md.
//
// ⚠️ These are not invented mutations. Each one replicates a specific Stryker survivor
// from that run, so a green result here is a direct answer to "did the new tests close
// the clauses?" rather than a general confidence statement. Re-running full Stryker
// would take 5–13 min and permanently touch two config files; this takes seconds and
// answers the same question for the three duration guards.
//
// The baseline's clause table, which is what these six restore:
//
//                 rawX === ""   xVal < 0
//   MIN (L300)    SURVIVED      SURVIVED
//   ML  (L309)    killed        killed
//   MAX (L318)    killed        SURVIVED
//
// D4–D6 are the `< 0` → `<= 0` boundary. Zero is a LEGAL duration
// (z.number().nonnegative(), degenerate estimates v0.53.0), so these are real
// survivors for a valid input, not equivalent mutants.
const P = new URL("../src/core/import/flat-activity-parser.ts", import.meta.url).pathname;

export const testFile = "src/core/import/flat-activity-parser.test.ts";

export const mutations = [
  // -- the deletable clauses (Stryker ConditionalExpression → false) -----------
  {
    id: "D1  MIN's empty-string clause deleted  [was Survived]",
    file: P,
    find: `    if (rawMin === "" || !Number.isInteger(minVal) || minVal < 0) {`,
    replace: `    if (false || !Number.isInteger(minVal) || minVal < 0) {`,
    expectFailing: /empty Min against its own column/,
  },
  {
    id: "D2  MIN's negative clause deleted  [was Survived]",
    file: P,
    find: `    if (rawMin === "" || !Number.isInteger(minVal) || minVal < 0) {`,
    replace: `    if (rawMin === "" || !Number.isInteger(minVal) || false) {`,
    expectFailing: /negative Min against its own column/,
  },
  {
    id: "D3  MAX's negative clause deleted  [was Survived]",
    file: P,
    find: `    if (rawMax === "" || !Number.isInteger(maxVal) || maxVal < 0) {`,
    replace: `    if (rawMax === "" || !Number.isInteger(maxVal) || false) {`,
    expectFailing: /negative Max against its own column/,
  },

  // -- the zero-duration boundary (Stryker EqualityOperator < → <=) ------------
  {
    id: "D4  MIN rejects a legal zero duration  [was Survived]",
    file: P,
    find: `minVal < 0`,
    replace: `minVal <= 0`,
    expectFailing: /zero Min alongside non-zero/,
  },
  {
    id: "D5  ML rejects a legal zero duration  [was Survived]",
    file: P,
    find: `mlVal < 0`,
    replace: `mlVal <= 0`,
    expectFailing: /accepts a zero duration, which is legal/,
  },
  {
    id: "D6  MAX rejects a legal zero duration  [was Survived]",
    file: P,
    find: `maxVal < 0`,
    replace: `maxVal <= 0`,
    expectFailing: /accepts a zero duration, which is legal/,
  },
];
