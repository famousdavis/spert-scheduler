// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  estimateOrderIssues,
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
