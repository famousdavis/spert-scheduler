// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { parseFlatActivityTable } from "./flat-activity-parser";

// Deterministic ID generator for predictable assertions
function makeIdGen() {
  let counter = 0;
  return () => `uuid-${++counter}`;
}

// Helper: build a valid row
function validRow(
  id: string,
  name: string,
  min: string,
  ml: string,
  max: string,
  confidence: string,
  distribution = "normal",
  status = "planned",
  predecessors = ""
): string[] {
  return [id, name, min, ml, max, confidence, distribution, status, predecessors];
}

const HEADER_ROW = [
  "Activity ID",
  "Activity Name",
  "Optimistic (Min)",
  "Most Likely",
  "Pessimistic (Max)",
  "Confidence Level",
  "Distribution",
  "Status",
  "Predecessors",
];

// =============================================================================
// Header Tests
// =============================================================================

describe("Header resolution", () => {
  it("parses with canonical header names", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(1);
    expect(result.activities[0]!.name).toBe("Task 1");
  });

  it("parses with header aliases (case-insensitive, spacing)", () => {
    const rows = [
      ["id", "task", "min", "ml", "max", "confidence level"],
      validRow("A1", "Task 1", "2", "4", "8", "Medium").slice(0, 6),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(1);
  });

  it("errors on missing required header", () => {
    const rows = [
      ["Activity ID", "Activity Name", "Optimistic (Min)"],
      ["A1", "Task", "3"],
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("Missing required column");
    expect(result.errors[0]!.message).toContain("mostLikely");
  });

  it("silently ignores extra unknown columns", () => {
    const rows = [
      [...HEADER_ROW, "Notes", "Priority"],
      [...validRow("A1", "Task 1", "2", "4", "8", "Medium"), "some note", "P1"],
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(1);
  });

  it("handles ghost trailing empty columns", () => {
    const rows = [
      [...HEADER_ROW, "", "", ""],
      [...validRow("A1", "Task 1", "2", "4", "8", "Medium"), "", "", ""],
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(1);
  });
});

// =============================================================================
// Normalization Tests
// =============================================================================

describe("Normalization", () => {
  it("normalizes confidence level variants", () => {
    const variants = ["medium", "Medium", "MEDIUM", "Medium Confidence"];
    // "Medium Confidence" normalizes to "mediumconfidence" which is NOT in the map
    // Only the first 3 should work; the 4th should error
    for (const variant of variants.slice(0, 3)) {
      const rows = [HEADER_ROW, validRow("A1", "Task", "2", "4", "8", variant)];
      const result = parseFlatActivityTable(rows, makeIdGen());
      expect(result.errors).toHaveLength(0);
      expect(result.activities[0]!.confidenceLevel).toBe("mediumConfidence");
    }
  });

  it("errors on unrecognized confidence level with accepted values list", () => {
    const rows = [HEADER_ROW, validRow("A1", "Task", "2", "4", "8", "SuperHigh")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("Unrecognized confidence level");
    expect(result.errors[0]!.message).toContain("Accepted values");
  });

  it("normalizes distribution variants", () => {
    const cases: [string, string][] = [
      ["Normal", "normal"],
      ["logNormal", "logNormal"],
      ["Log Normal", "logNormal"],
      ["TRIANGULAR", "triangular"],
    ];
    for (const [input, expected] of cases) {
      const rows = [HEADER_ROW, validRow("A1", "Task", "2", "4", "8", "Medium", input)];
      const result = parseFlatActivityTable(rows, makeIdGen());
      expect(result.errors).toHaveLength(0);
      expect(result.activities[0]!.distributionType).toBe(expected);
    }
  });

  it("warns on unrecognized distribution and defaults to normal", () => {
    const rows = [HEADER_ROW, validRow("A1", "Task", "2", "4", "8", "Medium", "beta")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain("Unrecognized distribution");
    expect(result.activities[0]!.distributionType).toBe("normal");
  });

  it("normalizes status variants", () => {
    const cases: [string, string][] = [
      ["Planned", "planned"],
      ["In Progress", "inProgress"],
      ["inprogress", "inProgress"],
      ["COMPLETE", "complete"],
    ];
    for (const [input, expected] of cases) {
      const rows = [HEADER_ROW, validRow("A1", "Task", "2", "4", "8", "Medium", "normal", input)];
      const result = parseFlatActivityTable(rows, makeIdGen());
      expect(result.errors).toHaveLength(0);
      expect(result.activities[0]!.status).toBe(expected);
    }
  });

  it("warns on unrecognized status and defaults to planned", () => {
    const rows = [HEADER_ROW, validRow("A1", "Task", "2", "4", "8", "Medium", "normal", "archived")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]!.message).toContain("Unrecognized status");
    expect(result.activities[0]!.status).toBe("planned");
  });
});

// =============================================================================
// Data Validation Tests
// =============================================================================

describe("Data validation", () => {
  it("imports all valid rows cleanly", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Define Requirements", "2", "4", "8", "Medium"),
      validRow("A2", "Architecture Design", "3", "5", "9", "High"),
      validRow("A3", "Build API", "5", "8", "15", "Low"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(3);
  });

  it("flags duplicate Activity IDs on both rows", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      validRow("A1", "Task 2", "3", "5", "9", "High"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    const dupErrors = result.errors.filter((e) => e.message.includes("Duplicate"));
    expect(dupErrors.length).toBe(2); // both rows flagged
  });

  it("errors on min > mostLikely", () => {
    const rows = [HEADER_ROW, validRow("A1", "Task", "10", "4", "15", "Medium")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("Min must be <= Most Likely"))).toBe(true);
  });

  it("errors on mostLikely > max", () => {
    const rows = [HEADER_ROW, validRow("A1", "Task", "2", "10", "5", "Medium")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.some((e) => e.message.includes("Most Likely must be <= Max"))).toBe(true);
  });

  it("errors on non-integer duration", () => {
    const rows = [HEADER_ROW, validRow("A1", "Task", "2.5", "4", "8", "Medium")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]!.message).toContain("non-negative integer");
  });

  it("errors on negative duration", () => {
    const rows = [HEADER_ROW, validRow("A1", "Task", "-1", "4", "8", "Medium")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("errors on activity name > 200 chars", () => {
    const longName = "A".repeat(201);
    const rows = [HEADER_ROW, validRow("A1", longName, "2", "4", "8", "Medium")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Dependency Tests
// =============================================================================

describe("Dependency resolution", () => {
  it("builds correct ActivityDependency objects", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      validRow("A2", "Task 2", "3", "5", "9", "Medium", "normal", "planned", "A1"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.dependencies).toHaveLength(1);
    expect(result.dependencies[0]!.type).toBe("FS");
    expect(result.dependencies[0]!.lagDays).toBe(0);
  });

  it("errors on unknown predecessor", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium", "normal", "planned", "A99"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("not found");
    expect(result.errors[0]!.message).toContain("A99");
  });

  it("errors on self-dependency", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium", "normal", "planned", "A1"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("cannot depend on itself");
  });

  it("detects cycle with enriched activity names and row numbers", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium", "normal", "planned", "A2"),
      validRow("A2", "Task 2", "3", "5", "9", "Medium", "normal", "planned", "A1"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors.some((e) => e.message.includes("cycle") || e.message.includes("Cycle"))).toBe(true);
    // Should contain row context
    const cycleError = result.errors.find((e) => e.message.toLowerCase().includes("cycle"))!;
    expect(cycleError.message).toContain("Row");
  });

  it("parses lag: A1+3, A2-2, no lag", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      validRow("A2", "Task 2", "3", "5", "9", "Medium"),
      validRow("A3", "Task 3", "1", "2", "3", "Medium", "normal", "planned", "A1+3,A2-2"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.dependencies).toHaveLength(2);
    const dep1 = result.dependencies.find((d) => d.lagDays === 3);
    const dep2 = result.dependencies.find((d) => d.lagDays === -2);
    expect(dep1).toBeDefined();
    expect(dep2).toBeDefined();
  });

  it("accepts lag at limits: A1+365 and A1-365", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      validRow("A2", "Task 2", "3", "5", "9", "Medium", "normal", "planned", "A1+365"),
      validRow("A3", "Task 3", "1", "2", "3", "Medium", "normal", "planned", "A1-365"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.dependencies).toHaveLength(2);
  });

  it("errors on lag beyond limit: A1+366", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      validRow("A2", "Task 2", "3", "5", "9", "Medium", "normal", "planned", "A1+366"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("between -365 and 365");
  });

  it("handles multiple predecessors: A1,A2+1,A3", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      validRow("A2", "Task 2", "3", "5", "9", "Medium"),
      validRow("A3", "Task 3", "1", "2", "3", "Medium"),
      validRow("A4", "Task 4", "2", "3", "5", "Medium", "normal", "planned", "A1,A2+1,A3"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.dependencies).toHaveLength(3);
  });
});

// =============================================================================
// Limit Tests
// =============================================================================

describe("Limits", () => {
  it("accepts 500 activities", () => {
    const rows = [HEADER_ROW];
    for (let i = 1; i <= 500; i++) {
      rows.push(validRow(`A${i}`, `Task ${i}`, "1", "2", "3", "Medium"));
    }
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(500);
  });

  it("errors on 501 activities", () => {
    const rows = [HEADER_ROW];
    for (let i = 1; i <= 501; i++) {
      rows.push(validRow(`A${i}`, `Task ${i}`, "1", "2", "3", "Medium"));
    }
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors.some((e) => e.message.includes("500"))).toBe(true);
  });

  it("errors on more than 2000 dependencies", () => {
    // Create 100 activities with 21 predecessors each = 2100 deps
    const rows = [HEADER_ROW];
    for (let i = 1; i <= 100; i++) {
      rows.push(validRow(`A${i}`, `Task ${i}`, "1", "2", "3", "Medium"));
    }
    // Add 21 predecessor refs from each of A22-A100 to create >2000 deps
    // Actually: build 2001 deps by having many activities depend on A1
    const bigRows = [HEADER_ROW];
    for (let i = 1; i <= 2002; i++) {
      bigRows.push(validRow(`A${i}`, `Task ${i}`, "1", "2", "3", "Medium"));
    }
    // Make A2..A2002 all depend on A1: that's 2001 deps
    for (let i = 1; i < bigRows.length; i++) {
      if (i > 1) {
        bigRows[i] = validRow(`A${i}`, `Task ${i}`, "1", "2", "3", "Medium", "normal", "planned", "A1");
      }
    }
    const result = parseFlatActivityTable(bigRows, makeIdGen());
    expect(result.errors.some((e) => e.message.includes("2,000"))).toBe(true);
  });
});

// =============================================================================
// Encoding & Format Tests
// =============================================================================

describe("Encoding and format", () => {
  it("handles UTF-8 non-ASCII activity names", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Développer l'API", "2", "4", "8", "Medium"),
      validRow("A2", "テスト計画", "3", "5", "9", "High"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(2);
    expect(result.activities[0]!.name).toBe("Développer l'API");
    expect(result.activities[1]!.name).toBe("テスト計画");
  });

  it("warns on Activity ID matching month-abbreviation date pattern", () => {
    const rows = [HEADER_ROW, validRow("1-Mar", "Task", "2", "4", "8", "Medium")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.warnings.some((w) => w.message.includes("Excel-converted date"))).toBe(true);
    // Should still parse (warning, not error)
    expect(result.activities).toHaveLength(1);
  });

  it("warns on Activity ID matching full date pattern", () => {
    const rows = [HEADER_ROW, validRow("1/15/2026", "Task", "2", "4", "8", "Medium")];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.warnings.some((w) => w.message.includes("looks like a date"))).toBe(true);
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe("Edge cases", () => {
  it("filters empty rows interspersed in data", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      ["", "", "", "", "", "", "", "", ""],
      validRow("A2", "Task 2", "3", "5", "9", "High"),
      ["  ", "  ", "  "],
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(2);
  });

  it("skips comment rows", () => {
    const rows = [
      HEADER_ROW,
      ["# This is a comment"],
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      ["# Another comment", "ignored", "data"],
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(1);
  });

  it("handles all activities with no predecessors", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      validRow("A2", "Task 2", "3", "5", "9", "High"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.dependencies).toHaveLength(0);
  });

  it("supports assumeDefaultColumnOrder option (no header row)", () => {
    const rows = [
      validRow("A1", "Task 1", "2", "4", "8", "Medium"),
      validRow("A2", "Task 2", "3", "5", "9", "High", "normal", "planned", "A1"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen(), {
      assumeDefaultColumnOrder: true,
    });
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(2);
    expect(result.dependencies).toHaveLength(1);
  });

  it("sets noHeaderDetected when first row looks like data but has no header", () => {
    // First row has numeric values in position 2 but no valid headers
    const rows = [
      ["A1", "Task 1", "2", "4", "8", "Medium"],
      ["A2", "Task 2", "3", "5", "9", "High"],
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.noHeaderDetected).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("returns error on completely empty input", () => {
    const result = parseFlatActivityTable([], makeIdGen());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("No data");
  });

  it("handles file with only comments and empty rows", () => {
    const rows = [
      HEADER_ROW,
      ["# comment 1"],
      ["", "", ""],
      ["# comment 2"],
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(0);
  });

  it("defaults distribution to normal when column is absent", () => {
    const rows = [
      ["Activity ID", "Activity Name", "Optimistic (Min)", "Most Likely", "Pessimistic (Max)", "Confidence Level"],
      ["A1", "Task 1", "2", "4", "8", "Medium"],
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities[0]!.distributionType).toBe("normal");
  });

  it("defaults status to planned when column is absent", () => {
    const rows = [
      ["Activity ID", "Activity Name", "Optimistic (Min)", "Most Likely", "Pessimistic (Max)", "Confidence Level"],
      ["A1", "Task 1", "2", "4", "8", "Medium"],
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities[0]!.status).toBe("planned");
  });

  it("allows empty confidence for triangular and uniform distributions", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "", "triangular"),
      validRow("A2", "Task 2", "1", "1", "3", "", "uniform"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(0);
    expect(result.activities).toHaveLength(2);
    expect(result.activities[0]!.distributionType).toBe("triangular");
    expect(result.activities[1]!.distributionType).toBe("uniform");
  });

  it("errors on empty confidence for normal and logNormal distributions", () => {
    const rows = [
      HEADER_ROW,
      validRow("A1", "Task 1", "2", "4", "8", "", "normal"),
    ];
    const result = parseFlatActivityTable(rows, makeIdGen());
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toContain("required");
    expect(result.errors[0]!.message).toContain("T-Normal");
  });
});
