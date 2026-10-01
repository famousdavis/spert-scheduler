// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for "no best without a rival" in the comparison table (WI-60, v0.72.1).
//
// The fix is one guard in highlightBestDisplayed (in src/ui/helpers/comparison-model.ts
// since v0.72.6): a row marks nothing unless at least two of its cells have a value. Each
// straw below names EXACTLY the tests it must fail, and no others — read "K failing;
// named-match K", not merely a non-zero exit. A straw that under-fires looks exactly like a
// test that over-claims, so the expected set is written down here before the run, never
// inferred from it.
//
// T2 is the side that must NOT move: removing the guard (S1) leaves it green, because a
// row with two run scenarios always had a real rival.
const MODEL = new URL("../src/ui/helpers/comparison-model.ts", import.meta.url).pathname;

const T1 = "marks no best in a row where only one scenario has a value";
const T2 = "still marks the better of two run scenarios, and nothing in the unrun one";
// Existing tests whose positive control reads a two-value "Duration (days)" row, and so
// fail when a two-value row stops being marked (S2 only).
const W43_NO_WIN = "carries no best-highlight in any row, so it is never declared the winner";
const W41_MIN = "still highlights exactly the minimum of 'Duration (days)' — the positive control";
const W41_BUFFER = "leaves 'Buffer (days)' unhighlighted even when the two values differ";
// WI-58 (v0.72.5) tests. A flagged scenario does not compete, so a row can hold exactly ONE
// contender beside it, or exactly two:
//   - W58_ONE_FLAGGED and W58_S11 expect NO mark where one contender is left, so they fail with
//     T1 when the guard is gone from the row they read (S1, S3, S4); their unflagged controls
//     expect a mark between two, so they fail under S2 as well.
//   - W58_OTHERS and W58_TIE expect a mark between exactly two contenders (S2 only).
const W58_OTHERS = "does not compete, however low its values; the others still do";
const W58_ONE_FLAGGED = "with two compared and one flagged, marks nothing (WI-60: a best needs two contenders)";
const W58_TIE = "a three-way tie (S10): the two valid scenarios are best in all three rows, the flagged one in none";
const W58_S11 = "a flagged scenario WITH results and the lower values (S11) wins no row, in either column order";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const GUARD =
  "  if (parsed.filter((v) => v !== null).length < 2) return parsed.map(() => null);\n";

/** The same guard, written at one row's call site instead of inside the helper. */
const guardAt = (values) =>
  `highlights: ${values}.filter((v, i) => v !== null && contenders[i]).length < 2 ? ${values}.map(() => null) : highlightBestDisplayed(${values}, "min", contenders),`;

export const testFile = "src/ui/components/ScenarioComparison.test.tsx";
export const mutations = [
  {
    id: "S1  the guard removed  [expect 3: T1, W58_ONE_FLAGGED, W58_S11]",
    file: MODEL,
    find: GUARD,
    replace: "",
    expectFailing: only(T1, W58_ONE_FLAGGED, W58_S11),
  },
  {
    // Every two-value row stops being marked, so each test with a two-value positive
    // control fails with T2. The WI-41 tie test survives: both its Mean cells go unmarked,
    // which is still "the same highlight". The four W58 tests fail at the assertion that
    // reads a row with exactly two contenders.
    id: "S2  the guard written as fewer than THREE  [expect 9: T1, T2, W43_NO_WIN, W41_MIN, W41_BUFFER, W58_OTHERS, W58_ONE_FLAGGED, W58_TIE, W58_S11]",
    file: MODEL,
    find: GUARD,
    replace: GUARD.replace("< 2", "< 3"),
    expectFailing: only(T1, T2, W43_NO_WIN, W41_MIN, W41_BUFFER, W58_OTHERS, W58_ONE_FLAGGED, W58_TIE, W58_S11),
  },
  {
    id: "S3  the guard applied only to Mean  [expect 3: T1 on Duration w/Buffer, W58_ONE_FLAGGED, W58_S11]",
    file: MODEL,
    find: GUARD,
    replace: "",
    also: {
      find: 'highlights: highlightBestDisplayed(meanValues, "min", contenders),',
      replace: guardAt("meanValues"),
    },
    expectFailing: only(T1, W58_ONE_FLAGGED, W58_S11),
  },
  {
    // S3's mirror: T1 must cover each row on its own, not just whichever it asserts first.
    id: "S4  the guard applied only to Duration w/Buffer  [expect 3: T1 on Mean, W58_ONE_FLAGGED, W58_S11]",
    file: MODEL,
    find: GUARD,
    replace: "",
    also: {
      find: 'highlights: highlightBestDisplayed(totalDurationValues, "min", contenders),',
      replace: guardAt("totalDurationValues"),
    },
    expectFailing: only(T1, W58_ONE_FLAGGED, W58_S11),
  },
];
