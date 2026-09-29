// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for the symmetry grid asserting once (WI-86, v0.72.8).
//
// The grid test used to make two `expect` calls per triple — 200,400 of them — and now checks
// each triple with a plain comparison, keeps the first few that break the rule, and asserts once
// after the loops. Each straw below names EXACTLY the tests it must fail, and no others — read
// "K failing; named-match K", not merely a non-zero exit. A straw that under-fires looks exactly
// like a test that over-claims, so the expected set is written down here before the run, never
// inferred from it.
//
// Scope is the WHOLE suite: Beta-PERT, the suggestion dot and the sparkline read the same
// predicate, so S1 and S2 fail tests in four other files, each named below. (A passing run's
// verbose output measured 559,612 bytes, inside the runner's 1 MiB buffer.)
//
// The two neighbours in the grid's own file are the sides that must NOT move: "always
// symmetric" (S1) leaves the 0.1 / 0.4 / 0.7 test green, because it asserts symmetric; "never
// symmetric with a fraction" (S2) leaves the whole-number test green. Which half of the grid
// failed shows in its message: S1 lists triples "a cent off-centre but was called symmetric",
// S2 triples "symmetric but was not called symmetric", and S3 fails on the count, listing none.
const RULES = new URL("../src/domain/helpers/estimate-rules.ts", import.meta.url).pathname;
const TEST = new URL("../src/domain/helpers/estimate-rules.test.ts", import.meta.url).pathname;

// estimate-rules.test.ts
const T_GRID = "holds for every symmetric two-decimal estimate, and for none a cent off-centre";
const T_FLOAT = "calls 0.1 / 0.4 / 0.7 symmetric, which neither float comparison does";
const T_WHOLE = "is exact on whole numbers: 5 / 10 / 15 is symmetric, 5 / 10 / 16 is not";
// beta-pert.test.ts. Its SD test survives S1: Beta(β, β) has exactly the level's SD.
const BP_REFERENCE = "matches the independent reference at every level, to 1e-9 days";
const BP_AT_LEAST_ONE = "keeps α and β at 1 or above at every level and every p in [0, 1]";
const BP_STORED = "take the stored β exactly, and their median is the midpoint exactly";
const BP_NOT_LATE = "never schedules a symmetric row a day late — integer and two-decimal triples, every level";
// recommendation.test.ts
const REC_ROUGHLY = "keeps roughly for the rest of T-Normal's band: off-centre by a day, and by a stored fraction";
const REC_EXACTLY = "says exactly symmetric where the estimate is — including 0.1 / 0.4 / 0.7";
// DistributionSparkline.test.tsx. S2's 5 / 5.5 / 6 takes the clamped cubic and stays finite.
const SPARK_PEAK = "peaks exactly at Most Likely, at the top of the box";
const SPARK_J = "is a J with a FINITE peak at Min when Most Likely equals Min";
const SPARK_NAN = "never draws a NaN, at any level, for any in-order estimate";
// grid-cell-display.test.tsx
const GRID_ROUGHLY = "says roughly, not exactly, for an estimate inside T-Normal's band that is not symmetric";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const RULE =
  "  return Math.abs(min + max - 2 * mostLikely) <= 4 * Number.EPSILON * Math.max(1, Math.abs(max));";
const SIGNATURE =
  "export function isSymmetricEstimate(min: number, mostLikely: number, max: number): boolean {\n";

export const testFile = "src/";
export const mutations = [
  {
    // Every asymmetric Beta-PERT takes the symmetric shape, and every T-Normal suggestion says
    // "exactly". A Most Likely at an end then peaks at a density of 0, and the sparkline divides
    // by it.
    id: "S1  the rule calls everything symmetric  [expect 9: T_GRID (off-centre half), T_WHOLE, BP_REFERENCE, BP_AT_LEAST_ONE, REC_ROUGHLY, SPARK_PEAK, SPARK_J, SPARK_NAN, GRID_ROUGHLY]",
    file: RULES,
    find: RULE,
    replace: "  return true;",
    expectFailing: only(
      T_GRID,
      T_WHOLE,
      BP_REFERENCE,
      BP_AT_LEAST_ONE,
      REC_ROUGHLY,
      SPARK_PEAK,
      SPARK_J,
      SPARK_NAN,
      GRID_ROUGHLY
    ),
  },
  {
    // A symmetric estimate with a fraction loses Beta-PERT's exact shape and exact midpoint, and
    // 0.1 / 0.4 / 0.7 loses "exactly". Whole-number estimates are untouched.
    id: "S2  the rule calls nothing with a fraction symmetric  [expect 5: T_GRID (symmetric half), T_FLOAT, BP_STORED, BP_NOT_LATE, REC_EXACTLY]",
    file: RULES,
    find: SIGNATURE,
    replace: `${SIGNATURE}  if (![min, mostLikely, max].every(Number.isInteger)) return false;\n`,
    expectFailing: only(T_GRID, T_FLOAT, BP_STORED, BP_NOT_LATE, REC_EXACTLY),
  },
  {
    // The grid walked for one Min only: 600 triples, every one of them right, so only the
    // count guard can fail. Without it, an empty list would pass on a grid barely walked.
    id: "S3  the outer loop cut to one iteration  [expect 1: T_GRID, on the count]",
    file: TEST,
    find: "for (let minCents = 0; minCents < 1000; minCents += 3) {",
    replace: "for (let minCents = 0; minCents < 1; minCents += 3) {",
    expectFailing: only(T_GRID),
  },
];
