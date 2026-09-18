// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import type { DistributionType } from "@domain/models/types";
import { computeHeuristic } from "@core/estimation/heuristic";
import { recommendDistribution } from "./recommendation";

/**
 * **v0.68.0 changed the suggestion on purpose in exactly two places. This file proves it
 * changed NOWHERE ELSE.**
 *
 * The two ruled changes (owner, 2026-09-17): a point mass now gets no suggestion, and Most
 * Likely at Min or Max now gets Triangular — both used to get Uniform. The pre-v0.68.0 rule
 * also took the activity's own Confidence level; v0.68.0 fixes it at Medium, so this compares
 * against that rule AT MEDIUM.
 *
 * ⚠️ THE ORACLE IS FROZEN AND MUST STAY FROZEN. `preV068AtMedium` below is a copy of the
 * pre-v0.68.0 arithmetic, typed out rather than calling `spert.ts`. An oracle that called the
 * live helpers would move WITH any change to them, and "the new code agrees with itself"
 * proves nothing. Before the change it was run against the live four-argument function over
 * all three grids below, and differed on 0 of 352,891 triples.
 *
 * ⚠️ What it guards: it PASSES on the pre-v0.68.0 code's arithmetic, so it catches an
 * OVER-change — a re-expressed threshold, inlined arithmetic, a changed constant. It does not
 * show the ruled changes happened; `recommendation.test.ts` does that.
 */
function preV068AtMedium(min: number, ml: number, max: number): DistributionType {
  const mean = (min + 4 * ml + max) / 6;
  const sd = (max - min) * 0.2;
  if (ml === min || ml === max) return "uniform";
  const skew = sd === 0 ? 0 : (mean - ml) / sd;
  const cv = mean === 0 ? 0 : sd / mean;
  if (Math.abs(skew) < 0.1 && cv < 0.3) return "normal";
  if (skew > 0.1 && cv > 0.3) return "logNormal";
  return "triangular";
}

type Triple = readonly [number, number, number];

/** Every valid integer triple 0 ≤ min ≤ ml ≤ max ≤ n. */
function* validTriples(n: number): Generator<Triple> {
  for (let min = 0; min <= n; min++)
    for (let ml = min; ml <= n; ml++)
      for (let max = ml; max <= n; max++) yield [min, ml, max];
}

/**
 * Every OUT-OF-ORDER integer triple in 0..n (min > ml, or ml > max). They reach the function
 * — the AI create path calls it before its schema check — and they are the only place that
 * inlining the arithmetic shows: it drops `spert.ts`'s zero guards and moves 420 of these
 * while every valid triple still agrees.
 */
function* outOfOrderTriples(n: number): Generator<Triple> {
  for (let min = 0; min <= n; min++)
    for (let ml = 0; ml <= n; ml++)
      for (let max = 0; max <= n; max++) if (min > ml || ml > max) yield [min, ml, max];
}

/** Fractional estimates in the shape the heuristic writes: min and max as percentages of ml. */
function* heuristicTriples(): Generator<Triple> {
  for (let ml = 1; ml <= 60; ml++)
    for (let minPct = 10; minPct <= 100; minPct++)
      for (let maxPct = 100; maxPct <= 400; maxPct += 5) {
        const { min, max } = computeHeuristic(ml, minPct, maxPct);
        yield [min, ml, max];
      }
}

type Change = "same" | "point mass" | "was Uniform" | "UNEXPECTED";

/** A difference is allowed only in a ruled class, and only to the ruled answer. */
function classify([min, ml, max]: Triple): Change {
  const before = preV068AtMedium(min, ml, max);
  const after = recommendDistribution(min, ml, max);
  if (after === before) return "same";
  if (ml === min && ml === max) return after === null ? "point mass" : "UNEXPECTED";
  if (before === "uniform") return after === "triangular" ? "was Uniform" : "UNEXPECTED";
  return "UNEXPECTED";
}

function census(grid: Iterable<Triple>) {
  const counts: Partial<Record<Change, number>> = {};
  const unexpected: string[] = [];
  for (const t of grid) {
    const change = classify(t);
    counts[change] = (counts[change] ?? 0) + 1;
    if (change === "UNEXPECTED") unexpected.push(t.join("/"));
  }
  return { counts, unexpected };
}

describe("recommendDistribution changed only where the owner ruled it would", () => {
  // Each test pairs the assertion with its own positive control: the exact size of every
  // class, which proves the grid was swept and the ruled changes were SEEN, not skipped.

  it("valid integer estimates, 0..40", () => {
    const { counts, unexpected } = census(validTriples(40));
    expect(unexpected).toEqual([]);
    expect(counts).toEqual({ same: 10_660, "point mass": 41, "was Uniform": 1_640 });
  });

  it("out-of-order integer triples, 0..20", () => {
    const { counts, unexpected } = census(outOfOrderTriples(20));
    expect(unexpected).toEqual([]);
    expect(counts).toEqual({ same: 7_070, "was Uniform": 420 });
  });

  it("heuristic-shaped fractional estimates", () => {
    const { counts, unexpected } = census(heuristicTriples());
    expect(unexpected).toEqual([]);
    expect(counts).toEqual({ same: 324_000, "point mass": 60, "was Uniform": 9_000 });
  });
});
