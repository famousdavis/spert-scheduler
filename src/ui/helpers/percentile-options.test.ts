// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  ACTIVITY_PERCENTILE_OPTIONS,
  PROJECT_PERCENTILE_OPTIONS,
} from "./percentile-options";

describe("percentile options", () => {
  it("ACTIVITY_PERCENTILE_OPTIONS has 12 items from P30 to P95", () => {
    expect(ACTIVITY_PERCENTILE_OPTIONS).toHaveLength(12);
    expect(ACTIVITY_PERCENTILE_OPTIONS[0]!.label).toBe("P30");
    expect(ACTIVITY_PERCENTILE_OPTIONS[0]!.value).toBe(0.3);
    expect(
      ACTIVITY_PERCENTILE_OPTIONS[ACTIVITY_PERCENTILE_OPTIONS.length - 1]!.label
    ).toBe("P95");
    expect(
      ACTIVITY_PERCENTILE_OPTIONS[ACTIVITY_PERCENTILE_OPTIONS.length - 1]!.value
    ).toBe(0.95);
  });

  it("ACTIVITY_PERCENTILE_OPTIONS offers P30 and P40 below P50", () => {
    expect(ACTIVITY_PERCENTILE_OPTIONS.slice(0, 3)).toEqual([
      { value: 0.3, label: "P30" },
      { value: 0.4, label: "P40" },
      { value: 0.5, label: "P50" },
    ]);
  });

  it("PROJECT_PERCENTILE_OPTIONS still starts at P50 — P30/P40 are activity-only", () => {
    const labels = PROJECT_PERCENTILE_OPTIONS.map((o) => o.label);
    expect(labels).not.toContain("P30");
    expect(labels).not.toContain("P40");
    expect(Math.min(...PROJECT_PERCENTILE_OPTIONS.map((o) => o.value))).toBe(0.5);
  });

  it("PROJECT_PERCENTILE_OPTIONS has 14 items from P50 to P99", () => {
    expect(PROJECT_PERCENTILE_OPTIONS).toHaveLength(14);
    expect(PROJECT_PERCENTILE_OPTIONS[0]!.label).toBe("P50");
    expect(PROJECT_PERCENTILE_OPTIONS[0]!.value).toBe(0.5);
    expect(
      PROJECT_PERCENTILE_OPTIONS[PROJECT_PERCENTILE_OPTIONS.length - 1]!.label
    ).toBe("P99");
    expect(
      PROJECT_PERCENTILE_OPTIONS[PROJECT_PERCENTILE_OPTIONS.length - 1]!.value
    ).toBe(0.99);
  });

  it("all options have numeric value and string label", () => {
    for (const opt of [
      ...ACTIVITY_PERCENTILE_OPTIONS,
      ...PROJECT_PERCENTILE_OPTIONS,
    ]) {
      expect(typeof opt.value).toBe("number");
      expect(typeof opt.label).toBe("string");
      expect(opt.label).toMatch(/^P\d+$/);
    }
  });

  it("values are monotonically increasing", () => {
    for (const options of [
      ACTIVITY_PERCENTILE_OPTIONS,
      PROJECT_PERCENTILE_OPTIONS,
    ]) {
      for (let i = 1; i < options.length; i++) {
        expect(options[i]!.value).toBeGreaterThan(options[i - 1]!.value);
      }
    }
  });
});
