// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Falsification spec for "no best without a rival" in the comparison table (WI-60, v0.72.1).
//
// The fix is one guard in highlightBestDisplayed: a row marks nothing unless at least two
// of its cells have a value. Each straw below names EXACTLY the tests it must fail, and no
// others — read "K failing; named-match K", not merely a non-zero exit. A straw that
// under-fires looks exactly like a test that over-claims, so the expected set is written
// down here before the run, never inferred from it.
//
// T2 is the side that must NOT move: removing the guard (S1) leaves it green, because a
// row with two run scenarios always had a real rival.
const COMPONENT = new URL("../src/ui/components/ScenarioComparison.tsx", import.meta.url).pathname;

const T1 = "marks no best in a row where only one scenario has a value";
const T2 = "still marks the better of two run scenarios, and nothing in the unrun one";
// Existing tests whose positive control reads a two-value "Duration (days)" row, and so
// fail when a two-value row stops being marked (S2 only).
const W43_NO_WIN = "carries no best-highlight in any row, so it is never declared the winner";
const W41_MIN = "still highlights exactly the minimum of 'Duration (days)' — the positive control";
const W41_BUFFER = "leaves 'Buffer (days)' unhighlighted even when the two values differ";

const escape = (s) => s.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Matches exactly these test titles, as the verbose reporter prints them. */
const only = (...titles) => new RegExp(`> (?:${titles.map(escape).join("|")})$`);

const GUARD =
  "  if (parsed.filter((v) => v !== null).length < 2) return parsed.map(() => null);\n";

/** The same guard, written at one row's call site instead of inside the helper. */
const guardAt = (values) =>
  `highlights: ${values}.filter((v) => v !== null).length < 2 ? ${values}.map(() => null) : highlightBestDisplayed(${values}, "min"),`;

export const testFile = "src/ui/components/ScenarioComparison.test.tsx";
export const mutations = [
  {
    id: "S1  the guard removed  [expect 1: T1]",
    file: COMPONENT,
    find: GUARD,
    replace: "",
    expectFailing: only(T1),
  },
  {
    // Every two-value row stops being marked, so each test with a two-value positive
    // control fails with T2. The WI-41 tie test survives: both its Mean cells go unmarked,
    // which is still "the same highlight".
    id: "S2  the guard written as fewer than THREE  [expect 5: T1, T2, W43_NO_WIN, W41_MIN, W41_BUFFER]",
    file: COMPONENT,
    find: GUARD,
    replace: GUARD.replace("< 2", "< 3"),
    expectFailing: only(T1, T2, W43_NO_WIN, W41_MIN, W41_BUFFER),
  },
  {
    id: "S3  the guard applied only to Mean  [expect 1: T1, on Duration w/Buffer]",
    file: COMPONENT,
    find: GUARD,
    replace: "",
    also: {
      find: 'highlights: highlightBestDisplayed(meanValues, "min"),',
      replace: guardAt("meanValues"),
    },
    expectFailing: only(T1),
  },
  {
    // S3's mirror: T1 must cover each row on its own, not just whichever it asserts first.
    id: "S4  the guard applied only to Duration w/Buffer  [expect 1: T1, on Mean]",
    file: COMPONENT,
    find: GUARD,
    replace: "",
    also: {
      find: 'highlights: highlightBestDisplayed(totalDurationValues, "min"),',
      replace: guardAt("totalDurationValues"),
    },
    expectFailing: only(T1),
  },
];
