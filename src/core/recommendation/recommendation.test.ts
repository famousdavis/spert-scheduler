// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { DistributionType } from "@domain/models/types";
import { recommendDistribution, suggestDistributionChange } from "./recommendation";

describe("recommendDistribution", () => {
  it("suggests T-Normal for a centred estimate whose range is not wide", () => {
    // min=8, ml=10, max=12: Most Likely exactly in the middle, range 4 against a mean of 10.
    expect(recommendDistribution(8, 10, 12)).toBe("normal");
  });

  it("suggests LogNormal for a right-skewed estimate whose range is wide", () => {
    // min=2, ml=5, max=30: mean 8.67, range 28 — far above 1.5 × the mean.
    expect(recommendDistribution(2, 5, 30)).toBe("logNormal");
    expect(recommendDistribution(1, 2, 100)).toBe("logNormal");
  });

  it("suggests Triangular for moderate asymmetry", () => {
    expect(recommendDistribution(3, 5, 10)).toBe("triangular");
  });

  it("suggests Triangular for a left-skewed estimate", () => {
    expect(recommendDistribution(1, 99, 100)).toBe("triangular");
  });

  it("gives NO suggestion for a point mass (it used to suggest Uniform)", () => {
    // Owner ruling 2026-09-17: every distribution gives that same value (LogNormal cannot be
    // built at zero at all), so there is nothing to suggest. Reversed deliberately from the
    // pre-v0.68.0 "Uniform".
    expect(recommendDistribution(5, 5, 5)).toBeNull();
    expect(recommendDistribution(1, 1, 1)).toBeNull();
    expect(recommendDistribution(0, 0, 0)).toBeNull();
  });

  it("suggests Triangular when Most Likely equals Min or Max (it used to suggest Uniform)", () => {
    // Owner ruling 2026-09-17 (reversed deliberately): the user has put the peak at the end of
    // the range, and only Triangular can put it there. 5/5/20 is the case that matters — the
    // rules below would otherwise send it to LogNormal, because its range is wide.
    expect(recommendDistribution(3, 3, 10)).toBe("triangular");
    expect(recommendDistribution(3, 10, 10)).toBe("triangular");
    expect(recommendDistribution(5, 5, 20)).toBe("triangular");
    expect(recommendDistribution(5, 20, 20)).toBe("triangular");
    // Exact equality, as ruled: a Most Likely just above Min takes the ordinary tests.
    expect(recommendDistribution(5, 5.1, 20)).toBe("logNormal");
  });

  it("never suggests Uniform, anywhere on a dense grid of valid estimates", () => {
    // The return type already excludes Uniform; this holds the runtime to it. Every other
    // outcome must appear, so a grid that never ran, or a function that only ever returned
    // one thing, fails here too. The pre-v0.68.0 rule fails it twice: it answered Uniform
    // whenever Most Likely sat at an end, and never answered "no suggestion".
    const seen = new Set(denseGrid(30).map(([a, b, c]) => String(recommendDistribution(a, b, c))));
    expect([...seen].sort()).toEqual(["logNormal", "normal", "null", "triangular"]);
  });

  it("pins BOTH halves of the floating-point boundary at range / mean = 1.5", () => {
    // ⚠️ Each pin fails a different "tidy" re-expression, and neither alone catches both.
    // 2/5/10: CV computes as 0.30000000000000004, so `cv > 0.3` holds → LogNormal. A strict
    // `range / mean > 1.5` computes exactly 1.5 and answers Triangular — this pin fails it.
    expect(recommendDistribution(2, 5, 10)).toBe("logNormal");
    // 10/25/50: CV computes as exactly 0.3 → Triangular. A `range / mean >= 1.5` (the ruling's
    // literal "NOT narrow") answers LogNormal — this pin fails that one.
    expect(recommendDistribution(10, 25, 50)).toBe("triangular");
  });

  it("puts each case just inside and just outside every threshold on the ruled side", () => {
    // Centred: |p − 0.5| < 0.06, on a range that is not wide (100..200).
    expect(recommendDistribution(100, 145, 200)).toBe("normal"); // p 0.45 — inside
    expect(recommendDistribution(100, 155, 200)).toBe("normal"); // p 0.55 — inside
    expect(recommendDistribution(100, 143, 200)).toBe("triangular"); // p 0.43 — outside
    expect(recommendDistribution(100, 157, 200)).toBe("triangular"); // p 0.57 — outside
    expect(recommendDistribution(100, 144, 200)).toBe("triangular"); // p 0.44 — ON it: falls through
    expect(recommendDistribution(100, 156, 200)).toBe("triangular"); // p 0.56 — ON it: falls through
    // Not wide: range / mean < 1.5, on a centred estimate.
    expect(recommendDistribution(10, 40, 69)).toBe("normal"); // 1.48 — inside
    expect(recommendDistribution(10, 40, 71)).toBe("triangular"); // 1.52 — outside
    // Right-skewed: p < 0.44, on a wide range (0..100).
    expect(recommendDistribution(0, 43, 100)).toBe("logNormal"); // p 0.43 — inside
    expect(recommendDistribution(0, 45, 100)).toBe("triangular"); // p 0.45 — outside
    // Wide: range / mean > 1.5, on a right-skewed estimate (p ≈ 0.25).
    expect(recommendDistribution(20, 35, 81)).toBe("logNormal"); // 1.52 — inside
    expect(recommendDistribution(20, 35, 79)).toBe("triangular"); // 1.48 — outside
  });
});

/** Every valid integer triple 0 ≤ min ≤ ml ≤ max ≤ n. */
function denseGrid(n: number): [number, number, number][] {
  const out: [number, number, number][] = [];
  for (let min = 0; min <= n; min++)
    for (let ml = min; ml <= n; ml++)
      for (let max = ml; max <= n; max++) out.push([min, ml, max]);
  return out;
}

// ---------------------------------------------------------------------------
// The grid's dot — one case per cell of the owner's matrix (2026-09-17)
// ---------------------------------------------------------------------------

const FITS_T_NORMAL =
  "Most Likely sits near the middle of the range, and the range is not wide for the size of the estimate, so a symmetric curve fits these three points.";
const FITS_LOGNORMAL =
  "The range reaches further above Most Likely than below it, and it is wide for the size of the estimate, so a right-skewed curve fits these three points.";
const T_NORMAL_OFF_CENTRE =
  "T-Normal is symmetric, but these three points are not. Triangular follows them as given.";
const LOGNORMAL_NOT_RIGHT =
  "LogNormal is skewed to the right, but these three points are balanced or skewed the other way. Triangular follows them as given.";
const ML_AT_MIN =
  "Most Likely equals Min, so the peak belongs at the end of the range, and only Triangular can put it there.";
const ML_AT_MAX =
  "Most Likely equals Max, so the peak belongs at the end of the range, and only Triangular can put it there.";

type Cell = [string, DistributionType, [number, number, number], DistributionType | null, string | null];

// Columns, left to right: centred & not wide · centred & wide · below the middle & not wide ·
// below the middle & wide · above the middle (incl. Most Likely = Max) · Most Likely = Min.
const MATRIX: Cell[] = [
  ["centred, not wide", "triangular", [8, 10, 12], "normal", FITS_T_NORMAL],
  ["centred, wide", "triangular", [1, 10, 19], null, null],
  ["below middle, not wide", "triangular", [8, 10, 15], null, null],
  ["below middle, wide", "triangular", [2, 5, 20], "logNormal", FITS_LOGNORMAL],
  ["above middle", "triangular", [5, 15, 18], null, null],
  ["Most Likely = Max", "triangular", [5, 20, 20], null, null],
  ["Most Likely = Min", "triangular", [5, 5, 20], null, null],
  ["Most Likely = Min, narrower", "triangular", [5, 5, 10], null, null],

  ["centred, not wide", "normal", [8, 10, 12], null, null],
  ["centred, wide", "normal", [1, 10, 19], null, null],
  ["below middle, not wide", "normal", [8, 10, 15], "triangular", T_NORMAL_OFF_CENTRE],
  ["below middle, wide", "normal", [2, 5, 20], "logNormal", FITS_LOGNORMAL],
  ["above middle", "normal", [5, 15, 18], "triangular", T_NORMAL_OFF_CENTRE],
  ["Most Likely = Max", "normal", [5, 20, 20], "triangular", ML_AT_MAX],
  ["Most Likely = Min", "normal", [5, 5, 20], "triangular", ML_AT_MIN],
  ["Most Likely = Min, narrower", "normal", [5, 5, 10], "triangular", ML_AT_MIN],

  ["centred, not wide", "logNormal", [8, 10, 12], "normal", FITS_T_NORMAL],
  ["centred, wide", "logNormal", [1, 10, 19], "triangular", LOGNORMAL_NOT_RIGHT],
  ["below middle, not wide", "logNormal", [8, 10, 15], null, null],
  ["below middle, wide", "logNormal", [2, 5, 20], null, null],
  ["above middle", "logNormal", [5, 15, 18], "triangular", LOGNORMAL_NOT_RIGHT],
  ["Most Likely = Max", "logNormal", [5, 20, 20], "triangular", ML_AT_MAX],
  ["Most Likely = Min", "logNormal", [5, 5, 20], "triangular", ML_AT_MIN],
  ["Most Likely = Min, narrower", "logNormal", [5, 5, 10], "triangular", ML_AT_MIN],

  ["centred, not wide", "uniform", [8, 10, 12], null, null],
  ["centred, wide", "uniform", [1, 10, 19], null, null],
  ["below middle, not wide", "uniform", [8, 10, 15], null, null],
  ["below middle, wide", "uniform", [2, 5, 20], null, null],
  ["above middle", "uniform", [5, 15, 18], null, null],
  ["Most Likely = Max", "uniform", [5, 20, 20], null, null],
  ["Most Likely = Min", "uniform", [5, 5, 20], null, null],
  ["Most Likely = Min, narrower", "uniform", [5, 5, 10], null, null],
];

describe("suggestDistributionChange — when the grid shows a dot, and what it says", () => {
  it.each(MATRIX)("%s, on a %s row (%j) → %s", (_column, current, [min, ml, max], suggested, reason) => {
    const result = suggestDistributionChange(min, ml, max, current);
    expect(result).toEqual(suggested === null ? null : { suggested, reason });
  });

  it("covers every cell: four rows by the six columns, with both examples where the matrix gives two", () => {
    // A table that silently lost a row would still pass every case above.
    const rows = new Set(MATRIX.map(([, current]) => current));
    expect([...rows].sort()).toEqual(["logNormal", "normal", "triangular", "uniform"]);
    expect(MATRIX).toHaveLength(32);
  });

  it("never shows a dot for a point mass, whatever the row uses", () => {
    // 0/0/0 on a LogNormal row is a broken row (its PERT mean is 0) that used to carry a
    // Uniform dot. After v0.68.0 it has no dot at all — a known, accepted gap.
    for (const current of ["normal", "logNormal", "triangular", "uniform"] as const) {
      expect(suggestDistributionChange(1, 1, 1, current)).toBeNull();
      expect(suggestDistributionChange(0, 0, 0, current)).toBeNull();
    }
    // Positive control, same test: a non-degenerate estimate on the same rows does get a dot.
    expect(suggestDistributionChange(1, 2, 10, "normal")).not.toBeNull();
  });

  it("never shows a dot for an estimate that is not a valid one", () => {
    // No curve fits these, and each sentence describes a valid estimate. 0/1/0 carried a
    // T-Normal dot ("Most Likely sits near the middle of the range") before this was checked.
    expect(suggestDistributionChange(0, 1, 0, "triangular")).toBeNull(); // Most Likely above Max
    expect(suggestDistributionChange(11, 10, 20, "normal")).toBeNull(); // Min above Most Likely
    expect(suggestDistributionChange(5, 5, 3, "logNormal")).toBeNull(); // Max below Min
    expect(suggestDistributionChange(-5, 5, 15, "triangular")).toBeNull(); // negative Min
    // Positive control, same test: the same rows with the triple put back in order do show one.
    expect(suggestDistributionChange(0, 0, 1, "normal")).not.toBeNull();
    expect(suggestDistributionChange(0, 5, 15, "normal")).not.toBeNull();
  });
});
