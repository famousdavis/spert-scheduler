// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  applyForwardConstraint,
  applyForwardConstraintInt,
  applyBackwardConstraint,
  detectConstraintConflict,
} from "./constraint-utils";
import { formatDateShort } from "@core/calendar/calendar";
import { applyMigrations } from "@infrastructure/persistence/migrations";
import { ActivitySchema } from "@domain/schemas/project.schema";
import type { ConstraintType } from "@domain/models/types";

// -- Helper: no calendar (Mon-Fri implied by default addWorkingDays) ----------

describe("constraint-utils", () => {
  // =========================================================================
  // Forward pass — date domain (deterministic)
  // =========================================================================

  describe("applyForwardConstraint", () => {
    // MSO: ES = constraintDate; EF = ES + duration
    it("MSO hard: pins ES to constraint date and recomputes EF", () => {
      const result = applyForwardConstraint(
        "2026-04-01", "2026-04-08", 5,
        "MSO", "2026-04-06", "hard",
        "a1", "Task A",
      );
      expect(result.es).toBe("2026-04-06");
      // addWorkingDays(Apr 6 Mon, 4) → Apr 10 Fri (inclusive end)
      expect(result.ef).toBe("2026-04-10");
      expect(result.conflict).toBeNull(); // no conflict: esNet (Apr 1) <= constraintDate (Apr 6)
    });

    it("MSO hard: produces conflict when esNet > constraintDate", () => {
      const result = applyForwardConstraint(
        "2026-04-10", "2026-04-17", 5,
        "MSO", "2026-04-06", "hard",
        "a1", "Task A",
      );
      expect(result.es).toBe("2026-04-06");
      expect(result.conflict).not.toBeNull();
      expect(result.conflict!.severity).toBe("error");
      expect(result.conflict!.constraintType).toBe("MSO");
    });

    // MFO: EF = constraintDate; ES = EF − duration
    it("MFO hard: pins EF and back-calculates ES", () => {
      const result = applyForwardConstraint(
        "2026-04-01", "2026-04-08", 5,
        "MFO", "2026-04-10", "hard",
        "a1", "Task A",
      );
      expect(result.ef).toBe("2026-04-10");
      // subtractWorkingDays(Apr 10 Fri, 4) → Apr 6 Mon (inclusive end)
      expect(result.es).toBe("2026-04-06");
      expect(result.conflict).toBeNull();
    });

    it("MFO hard: produces conflict when efNet > constraintDate", () => {
      const result = applyForwardConstraint(
        "2026-04-06", "2026-04-15", 5,
        "MFO", "2026-04-10", "hard",
        "a1", "Task A",
      );
      expect(result.conflict).not.toBeNull();
      expect(result.conflict!.severity).toBe("error");
    });

    // SNET: ES = max(ES_net, constraintDate)
    it("SNET hard: pushes ES to constraint date when binding", () => {
      const result = applyForwardConstraint(
        "2026-04-01", "2026-04-08", 5,
        "SNET", "2026-04-06", "hard",
        "a1", "Task A",
      );
      expect(result.es).toBe("2026-04-06");
      // addWorkingDays(Apr 6 Mon, 4) → Apr 10 Fri (inclusive end)
      expect(result.ef).toBe("2026-04-10");
      expect(result.conflict).toBeNull();
    });

    it("SNET hard: no effect when esNet >= constraintDate", () => {
      const result = applyForwardConstraint(
        "2026-04-10", "2026-04-17", 5,
        "SNET", "2026-04-06", "hard",
        "a1", "Task A",
      );
      expect(result.es).toBe("2026-04-10");
    });

    // FNET: EF = max(EF_net, constraintDate); ES = EF − duration
    it("FNET hard: pushes EF and slides ES right when binding", () => {
      const result = applyForwardConstraint(
        "2026-04-01", "2026-04-08", 5,
        "FNET", "2026-04-17", "hard",
        "a1", "Task A",
      );
      expect(result.ef).toBe("2026-04-17");
      // subtractWorkingDays(Apr 17 Fri, 4) → Apr 13 Mon (inclusive end)
      expect(result.es).toBe("2026-04-13");
      expect(result.conflict).toBeNull();
    });

    it("FNET hard: no effect when efNet >= constraintDate", () => {
      const result = applyForwardConstraint(
        "2026-04-13", "2026-04-20", 5,
        "FNET", "2026-04-17", "hard",
        "a1", "Task A",
      );
      expect(result.ef).toBe("2026-04-20");
      // subtractWorkingDays(Apr 20 Mon, 4) → Apr 14 Tue (inclusive end)
      expect(result.es).toBe("2026-04-14");
    });

    // SNLT/FNLT: no forward-pass effect
    it("SNLT hard: no forward-pass effect", () => {
      const result = applyForwardConstraint(
        "2026-04-01", "2026-04-08", 5,
        "SNLT", "2026-04-06", "hard",
        "a1", "Task A",
      );
      expect(result.es).toBe("2026-04-01");
      expect(result.ef).toBe("2026-04-08");
      expect(result.conflict).toBeNull();
    });

    it("FNLT hard: no forward-pass effect", () => {
      const result = applyForwardConstraint(
        "2026-04-01", "2026-04-08", 5,
        "FNLT", "2026-04-10", "hard",
        "a1", "Task A",
      );
      expect(result.es).toBe("2026-04-01");
      expect(result.ef).toBe("2026-04-08");
    });

    // Soft constraints: no forward-pass effect for any type
    const allTypes: ConstraintType[] = ["MSO", "MFO", "SNET", "SNLT", "FNET", "FNLT"];
    for (const ct of allTypes) {
      it(`${ct} soft: no forward-pass effect`, () => {
        const result = applyForwardConstraint(
          "2026-04-01", "2026-04-08", 5,
          ct, "2026-04-06", "soft",
          "a1", "Task A",
        );
        expect(result.es).toBe("2026-04-01");
        expect(result.ef).toBe("2026-04-08");
        expect(result.conflict).toBeNull();
      });
    }
  });

  // =========================================================================
  // Forward pass — integer domain (Monte Carlo)
  // =========================================================================

  describe("applyForwardConstraintInt", () => {
    it("MSO hard: clamps ES to constraint offset", () => {
      const result = applyForwardConstraintInt(5, 10, 5, "MSO", 8, "hard", 0);
      expect(result.es).toBe(8);
      expect(result.ef).toBe(13);
    });

    it("MSO hard: no effect when esNet >= constraintOffset", () => {
      const result = applyForwardConstraintInt(10, 15, 5, "MSO", 8, "hard", 0);
      expect(result.es).toBe(10);
      expect(result.ef).toBe(15);
    });

    it("MFO hard: pins EF and back-calculates ES", () => {
      const result = applyForwardConstraintInt(5, 10, 5, "MFO", 12, "hard", 0);
      expect(result.ef).toBe(12);
      expect(result.es).toBe(7); // 12 - 5
    });

    it("MFO hard: temporal inversion guard — ES floored to maxPredEF", () => {
      // Long duration: ES = EF - duration = 12 - 15 = -3, but maxPredEF = 5
      const result = applyForwardConstraintInt(5, 20, 15, "MFO", 12, "hard", 5);
      expect(result.ef).toBe(12);
      expect(result.es).toBe(5); // max(-3, 5) = 5
    });

    it("SNET hard: clamps ES to constraint offset", () => {
      const result = applyForwardConstraintInt(3, 8, 5, "SNET", 7, "hard", 0);
      expect(result.es).toBe(7);
      expect(result.ef).toBe(12);
    });

    it("FNET hard: clamps EF and back-calculates ES", () => {
      const result = applyForwardConstraintInt(3, 8, 5, "FNET", 15, "hard", 0);
      expect(result.ef).toBe(15);
      expect(result.es).toBe(10); // 15 - 5
    });

    it("FNET hard: temporal inversion guard", () => {
      const result = applyForwardConstraintInt(3, 8, 12, "FNET", 15, "hard", 5);
      expect(result.ef).toBe(15);
      expect(result.es).toBe(5); // max(15-12=3, 5) = 5
    });

    it("SNLT hard: no per-trial effect", () => {
      const result = applyForwardConstraintInt(5, 10, 5, "SNLT", 3, "hard", 0);
      expect(result.es).toBe(5);
      expect(result.ef).toBe(10);
    });

    it("FNLT hard: no per-trial effect", () => {
      const result = applyForwardConstraintInt(5, 10, 5, "FNLT", 8, "hard", 0);
      expect(result.es).toBe(5);
      expect(result.ef).toBe(10);
    });

    for (const ct of ["MSO", "MFO", "SNET", "SNLT", "FNET", "FNLT"] as ConstraintType[]) {
      it(`${ct} soft: no per-trial effect`, () => {
        const result = applyForwardConstraintInt(5, 10, 5, ct, 8, "soft", 0);
        expect(result.es).toBe(5);
        expect(result.ef).toBe(10);
      });
    }
  });

  // =========================================================================
  // Backward pass — date domain (deterministic)
  // =========================================================================

  describe("applyBackwardConstraint", () => {
    it("SNLT hard: clamps LS to min(lsNet, constraintDate)", () => {
      const result = applyBackwardConstraint(
        "2026-04-10", "2026-04-17", 5,
        "SNLT", "2026-04-06", "hard",
      );
      expect(result.ls).toBe("2026-04-06");
      // addWorkingDays(Apr 6 Mon, 4) → Apr 10 Fri (inclusive end)
      expect(result.lf).toBe("2026-04-10");
    });

    it("SNLT hard: no effect when lsNet <= constraintDate", () => {
      const result = applyBackwardConstraint(
        "2026-04-03", "2026-04-10", 5,
        "SNLT", "2026-04-06", "hard",
      );
      expect(result.ls).toBe("2026-04-03");
      // addWorkingDays(Apr 3 Fri, 4) → Apr 9 Thu (inclusive end)
      expect(result.lf).toBe("2026-04-09");
    });

    it("FNLT hard: clamps LF to min(lfNet, constraintDate)", () => {
      const result = applyBackwardConstraint(
        "2026-04-06", "2026-04-17", 5,
        "FNLT", "2026-04-10", "hard",
      );
      expect(result.lf).toBe("2026-04-10");
      // subtractWorkingDays(Apr 10 Fri, 4) → Apr 6 Mon (inclusive end)
      expect(result.ls).toBe("2026-04-06");
    });

    it("MSO hard: pins LS to constraintDate", () => {
      const result = applyBackwardConstraint(
        "2026-04-10", "2026-04-17", 5,
        "MSO", "2026-04-06", "hard",
      );
      expect(result.ls).toBe("2026-04-06");
      // addWorkingDays(Apr 6 Mon, 4) → Apr 10 Fri (inclusive end)
      expect(result.lf).toBe("2026-04-10");
    });

    it("MFO hard: pins LF to constraintDate", () => {
      const result = applyBackwardConstraint(
        "2026-04-06", "2026-04-17", 5,
        "MFO", "2026-04-10", "hard",
      );
      expect(result.lf).toBe("2026-04-10");
      // subtractWorkingDays(Apr 10 Fri, 4) → Apr 6 Mon (inclusive end)
      expect(result.ls).toBe("2026-04-06");
    });

    it("SNET hard: no backward-pass effect", () => {
      const result = applyBackwardConstraint(
        "2026-04-06", "2026-04-13", 5,
        "SNET", "2026-04-10", "hard",
      );
      expect(result.ls).toBe("2026-04-06");
      expect(result.lf).toBe("2026-04-13");
    });

    it("FNET hard: no backward-pass effect", () => {
      const result = applyBackwardConstraint(
        "2026-04-06", "2026-04-13", 5,
        "FNET", "2026-04-10", "hard",
      );
      expect(result.ls).toBe("2026-04-06");
      expect(result.lf).toBe("2026-04-13");
    });

    for (const ct of ["MSO", "MFO", "SNET", "SNLT", "FNET", "FNLT"] as ConstraintType[]) {
      it(`${ct} soft: no backward-pass effect`, () => {
        const result = applyBackwardConstraint(
          "2026-04-06", "2026-04-13", 5,
          ct, "2026-04-10", "soft",
        );
        expect(result.ls).toBe("2026-04-06");
        expect(result.lf).toBe("2026-04-13");
      });
    }
  });

  // =========================================================================
  // Conflict detection
  // =========================================================================

  describe("detectConstraintConflict", () => {
    it("MSO hard: conflict when esNet > constraintDate", () => {
      const result = detectConstraintConflict(
        "2026-04-10", "2026-04-17", "2026-04-10", "2026-04-17",
        "MSO", "2026-04-06", "hard",
        "a1", "Task A",
      );
      expect(result).not.toBeNull();
      expect(result!.severity).toBe("error");
      expect(result!.type).toBe("constraint-conflict");
      expect(result!.message).toContain("Must Start On");
    });

    it("MSO hard: no conflict when esNet <= constraintDate", () => {
      const result = detectConstraintConflict(
        "2026-04-01", "2026-04-08", "2026-04-10", "2026-04-17",
        "MSO", "2026-04-06", "hard",
        "a1", "Task A",
      );
      expect(result).toBeNull();
    });

    it("MFO hard: conflict when efNet > constraintDate", () => {
      const result = detectConstraintConflict(
        "2026-04-06", "2026-04-15", "2026-04-06", "2026-04-15",
        "MFO", "2026-04-10", "hard",
        "a1", "Task A",
      );
      expect(result).not.toBeNull();
      expect(result!.message).toContain("Must Finish On");
    });

    it("SNLT hard: conflict when lsNet > constraintDate", () => {
      const result = detectConstraintConflict(
        "2026-04-01", "2026-04-08", "2026-04-10", "2026-04-17",
        "SNLT", "2026-04-06", "hard",
        "a1", "Task A",
      );
      expect(result).not.toBeNull();
      expect(result!.message).toContain("Start No Later Than");
    });

    it("FNLT hard: conflict when lfNet > constraintDate", () => {
      const result = detectConstraintConflict(
        "2026-04-01", "2026-04-08", "2026-04-06", "2026-04-17",
        "FNLT", "2026-04-10", "hard",
        "a1", "Task A",
      );
      expect(result).not.toBeNull();
      expect(result!.message).toContain("Finish No Later Than");
    });

    it("SNET hard: no direct conflict (push-later only)", () => {
      const result = detectConstraintConflict(
        "2026-04-01", "2026-04-08", "2026-04-10", "2026-04-17",
        "SNET", "2026-04-20", "hard",
        "a1", "Task A",
      );
      expect(result).toBeNull();
    });

    it("FNET hard: no direct conflict (push-later only)", () => {
      const result = detectConstraintConflict(
        "2026-04-01", "2026-04-08", "2026-04-10", "2026-04-17",
        "FNET", "2026-04-20", "hard",
        "a1", "Task A",
      );
      expect(result).toBeNull();
    });

    // Soft violations
    it("MSO soft: violation when esNet !== constraintDate", () => {
      const result = detectConstraintConflict(
        "2026-04-10", "2026-04-17", "2026-04-10", "2026-04-17",
        "MSO", "2026-04-06", "soft",
        "a1", "Task A",
      );
      expect(result).not.toBeNull();
      expect(result!.severity).toBe("warning");
      expect(result!.type).toBe("constraint-violation");
    });

    it("MSO soft: no violation when esNet === constraintDate", () => {
      const result = detectConstraintConflict(
        "2026-04-06", "2026-04-13", "2026-04-06", "2026-04-13",
        "MSO", "2026-04-06", "soft",
        "a1", "Task A",
      );
      expect(result).toBeNull();
    });

    it("SNET soft: violation when esNet < constraintDate", () => {
      const result = detectConstraintConflict(
        "2026-04-01", "2026-04-08", "2026-04-10", "2026-04-17",
        "SNET", "2026-04-06", "soft",
        "a1", "Task A",
      );
      expect(result).not.toBeNull();
      expect(result!.severity).toBe("warning");
    });

    it("SNLT soft: violation when lsNet > constraintDate", () => {
      const result = detectConstraintConflict(
        "2026-04-01", "2026-04-08", "2026-04-10", "2026-04-17",
        "SNLT", "2026-04-06", "soft",
        "a1", "Task A",
      );
      expect(result).not.toBeNull();
    });
  });
});

// =========================================================================
// Schema migration tests
// =========================================================================

describe("v10→v11 migration", () => {
  it("adds null constraint fields to activities", () => {
    const v10: unknown = {
      id: "p1",
      name: "Test",
      createdAt: "2026-01-01T00:00:00Z",
      schemaVersion: 10,
      scenarios: [{
        id: "s1",
        name: "Baseline",
        startDate: "2026-01-01",
        activities: [
          { id: "a1", name: "Task", min: 1, mostLikely: 2, max: 3,
            confidenceLevel: "mediumConfidence", distributionType: "normal",
            status: "planned" },
        ],
        dependencies: [],
        milestones: [],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 10000, rngSeed: "seed",
          probabilityTarget: 0.5, projectProbabilityTarget: 0.95,
        },
      }],
    };

    const result = applyMigrations(v10, 10, 11) as Record<string, unknown>;
    expect(result.schemaVersion).toBe(11);

    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const activities = scenarios[0]!.activities as Array<Record<string, unknown>>;
    expect(activities[0]!.constraintType).toBeNull();
    expect(activities[0]!.constraintDate).toBeNull();
    expect(activities[0]!.constraintMode).toBeNull();
  });

  it("normalizes partial constraint state to all-null", () => {
    const v10: unknown = {
      id: "p1", name: "Test", createdAt: "2026-01-01T00:00:00Z",
      schemaVersion: 10,
      scenarios: [{
        id: "s1", name: "Baseline", startDate: "2026-01-01",
        activities: [
          { id: "a1", name: "Task", min: 1, mostLikely: 2, max: 3,
            confidenceLevel: "mediumConfidence", distributionType: "normal",
            status: "planned",
            constraintType: "MSO", constraintDate: null, constraintMode: null },
        ],
        dependencies: [], milestones: [],
        settings: {
          defaultConfidenceLevel: "mediumConfidence",
          defaultDistributionType: "normal",
          trialCount: 10000, rngSeed: "seed",
          probabilityTarget: 0.5, projectProbabilityTarget: 0.95,
        },
      }],
    };

    const result = applyMigrations(v10, 10, 11) as Record<string, unknown>;
    const scenarios = result.scenarios as Array<Record<string, unknown>>;
    const activities = scenarios[0]!.activities as Array<Record<string, unknown>>;
    // Partial state normalized to all-null
    expect(activities[0]!.constraintType).toBeNull();
    expect(activities[0]!.constraintDate).toBeNull();
    expect(activities[0]!.constraintMode).toBeNull();
  });
});

// =========================================================================
// Zod superRefine tests
// =========================================================================

describe("ActivitySchema constraint validation", () => {
  const base = {
    id: "a1", name: "Task", min: 1, mostLikely: 2, max: 3,
    confidenceLevel: "mediumConfidence" as const,
    distributionType: "normal" as const,
    status: "planned" as const,
  };

  it("accepts all-null constraint fields", () => {
    const result = ActivitySchema.safeParse({
      ...base,
      constraintType: null,
      constraintDate: null,
      constraintMode: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all-set constraint fields", () => {
    const result = ActivitySchema.safeParse({
      ...base,
      constraintType: "MSO",
      constraintDate: "2026-04-06",
      constraintMode: "hard",
    });
    expect(result.success).toBe(true);
  });

  it("accepts omitted constraint fields", () => {
    const result = ActivitySchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("rejects partial constraint state: type set, others null", () => {
    const result = ActivitySchema.safeParse({
      ...base,
      constraintType: "MSO",
      constraintDate: null,
      constraintMode: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects partial constraint state: type and date set, mode null", () => {
    const result = ActivitySchema.safeParse({
      ...base,
      constraintType: "MSO",
      constraintDate: "2026-04-06",
      constraintMode: null,
    });
    expect(result.success).toBe(false);
  });
});

// =========================================================================
// formatDateShort tests
// =========================================================================

describe("formatDateShort", () => {
  it("MM/DD/YYYY → 'Apr 7'", () => {
    expect(formatDateShort("2026-04-07", "MM/DD/YYYY")).toBe("Apr 7");
  });

  it("DD/MM/YYYY → '7 Apr'", () => {
    expect(formatDateShort("2026-04-07", "DD/MM/YYYY")).toBe("7 Apr");
  });

  it("YYYY/MM/DD → '04/07'", () => {
    expect(formatDateShort("2026-04-07", "YYYY/MM/DD")).toBe("04/07");
  });

  it("handles single-digit months", () => {
    expect(formatDateShort("2026-01-15", "MM/DD/YYYY")).toBe("Jan 15");
  });

  it("handles December", () => {
    expect(formatDateShort("2026-12-25", "DD/MM/YYYY")).toBe("25 Dec");
  });

  it("YYYY/MM/DD preserves zero-padding", () => {
    expect(formatDateShort("2026-01-05", "YYYY/MM/DD")).toBe("01/05");
  });
});
