import { describe, it, expect } from "vitest";
import {
  ACTIVITY_PERCENTILE_OPTIONS,
  PROJECT_PERCENTILE_OPTIONS,
} from "./percentile-options";

describe("percentile options", () => {
  it("ACTIVITY_PERCENTILE_OPTIONS has 10 items from P50 to P95", () => {
    expect(ACTIVITY_PERCENTILE_OPTIONS).toHaveLength(10);
    expect(ACTIVITY_PERCENTILE_OPTIONS[0]!.label).toBe("P50");
    expect(ACTIVITY_PERCENTILE_OPTIONS[0]!.value).toBe(0.5);
    expect(
      ACTIVITY_PERCENTILE_OPTIONS[ACTIVITY_PERCENTILE_OPTIONS.length - 1]!.label
    ).toBe("P95");
    expect(
      ACTIVITY_PERCENTILE_OPTIONS[ACTIVITY_PERCENTILE_OPTIONS.length - 1]!.value
    ).toBe(0.95);
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
