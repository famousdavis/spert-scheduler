// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  estimateOrderIssues,
  isSymmetricEstimate,
  logNormalHasNoMean,
  MIN_ABOVE_MOST_LIKELY,
  MOST_LIKELY_ABOVE_MAX,
} from "./estimate-rules";

describe("estimateOrderIssues — the one ordering rule", () => {
  it("is empty for an in-order triple, including every equality", () => {
    const inOrder: Array<[number, number, number]> = [[9, 13, 22], [5, 5, 5], [5, 5, 20], [5, 20, 20], [0, 0, 0]];
    for (const [min, ml, max] of inOrder) {
      expect(estimateOrderIssues(min, ml, max)).toEqual([]);
    }
  });

  it("names each broken half on the cell that carries it, min first", () => {
    expect(estimateOrderIssues(14, 13, 22)).toEqual([{ field: "min", message: MIN_ABOVE_MOST_LIKELY }]);
    expect(estimateOrderIssues(9, 30, 22)).toEqual([{ field: "mostLikely", message: MOST_LIKELY_ABOVE_MAX }]);
    expect(estimateOrderIssues(30, 20, 10).map((i) => i.field)).toEqual(["min", "mostLikely"]);
  });

  // The words every surface shows, reworded in v0.71.1: they used to read "Min must be <= Most
  // Likely", which is how code puts it, not how a person would.
  it("pins the exact words the grid, the summary, the dialog, the Run toast and the CSV importer show", () => {
    expect(MIN_ABOVE_MOST_LIKELY).toBe("Min is above Most Likely");
    expect(MOST_LIKELY_ABOVE_MAX).toBe("Most Likely is above Max");
  });
});

describe("logNormalHasNoMean", () => {
  it("is true only for LogNormal with nothing above zero", () => {
    expect(logNormalHasNoMean("logNormal", 0, 0, 0)).toBe(true);
    expect(logNormalHasNoMean("logNormal", 0, 0, 1)).toBe(false);
    for (const t of ["normal", "triangular", "uniform"] as const) {
      expect(logNormalHasNoMean(t, 0, 0, 0)).toBe(false);
    }
  });
});

describe("isSymmetricEstimate — the one symmetry rule", () => {
  it("calls 0.1 / 0.4 / 0.7 symmetric, which neither float comparison does", () => {
    // 0.1 + 0.7 is 0.7999999999999999 in binary floating point.
    expect(0.1 + 0.7 === 2 * 0.4).toBe(false);
    expect((0.1 + 0.7) / 2 === 0.4).toBe(false);
    expect(isSymmetricEstimate(0.1, 0.4, 0.7)).toBe(true);
  });

  it("holds for every symmetric two-decimal estimate, and for none a cent off-centre", () => {
    let symmetric = 0;
    let offCentre = 0;
    for (let minCents = 0; minCents < 1000; minCents += 3) {
      for (let halfCents = 1; halfCents <= 300; halfCents += 1) {
        const min = minCents / 100;
        const ml = Number(((minCents + halfCents) / 100).toFixed(2));
        const max = Number(((minCents + 2 * halfCents) / 100).toFixed(2));
        // Max one cent further out: min + max − 2·ML is off by exactly a cent.
        const nudged = Number(((minCents + 2 * halfCents + 1) / 100).toFixed(2));
        expect(isSymmetricEstimate(min, ml, max)).toBe(true);
        expect(isSymmetricEstimate(min, ml, nudged)).toBe(false);
        symmetric++;
        offCentre++;
      }
    }
    expect(symmetric + offCentre).toBeGreaterThan(190_000);
  });

  it("is exact on whole numbers: 5 / 10 / 15 is symmetric, 5 / 10 / 16 is not", () => {
    expect(isSymmetricEstimate(5, 10, 15)).toBe(true);
    expect(isSymmetricEstimate(3, 6, 9)).toBe(true);
    expect(isSymmetricEstimate(5, 10, 16)).toBe(false);
    expect(isSymmetricEstimate(5, 5, 5)).toBe(true);
  });
});
