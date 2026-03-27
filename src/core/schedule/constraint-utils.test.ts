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

// ===========================================================================
// Gap 4 — Boundary equality tests for constraint comparisons
// ===========================================================================

describe("applyForwardConstraint — boundary equality", () => {
  it("MSO hard: no conflict when esNet equals constraintDate", () => {
    // esNet === constraintDate → no conflict (> not >=)
    const result = applyForwardConstraint(
      "2026-04-06", "2026-04-10", 5,
      "MSO", "2026-04-06", "hard",
      "a1", "Task A",
    );
    expect(result.conflict).toBeNull();
    expect(result.es).toBe("2026-04-06");
  });

  it("MSO hard: conflict when esNet is one day after constraintDate", () => {
    const result = applyForwardConstraint(
      "2026-04-07", "2026-04-11", 5,
      "MSO", "2026-04-06", "hard",
      "a1", "Task A",
    );
    expect(result.conflict).not.toBeNull();
  });

  it("MFO hard: no conflict when efNet equals constraintDate", () => {
    // efNet === constraintDate → no conflict
    const result = applyForwardConstraint(
      "2026-04-06", "2026-04-10", 5,
      "MFO", "2026-04-10", "hard",
      "a1", "Task A",
    );
    expect(result.conflict).toBeNull();
  });

  it("MFO hard: conflict when efNet is one day after constraintDate", () => {
    const result = applyForwardConstraint(
      "2026-04-06", "2026-04-11", 5,
      "MFO", "2026-04-10", "hard",
      "a1", "Task A",
    );
    expect(result.conflict).not.toBeNull();
  });

  it("SNET hard: no push when esNet equals constraintDate", () => {
    // constraintDate === esNet → no push (> not >=)
    const result = applyForwardConstraint(
      "2026-04-06", "2026-04-10", 5,
      "SNET", "2026-04-06", "hard",
      "a1", "Task A",
    );
    expect(result.es).toBe("2026-04-06");
  });

  it("SNET hard: pushes when constraintDate is one day after esNet", () => {
    const result = applyForwardConstraint(
      "2026-04-06", "2026-04-10", 5,
      "SNET", "2026-04-07", "hard",
      "a1", "Task A",
    );
    expect(result.es).toBe("2026-04-07");
  });

  it("FNET hard: no push when efNet equals constraintDate", () => {
    const result = applyForwardConstraint(
      "2026-04-06", "2026-04-10", 5,
      "FNET", "2026-04-10", "hard",
      "a1", "Task A",
    );
    expect(result.es).toBe("2026-04-06");
    expect(result.ef).toBe("2026-04-10");
  });

  it("FNET hard: pushes when constraintDate is one day after efNet", () => {
    const result = applyForwardConstraint(
      "2026-04-06", "2026-04-10", 5,
      "FNET", "2026-04-13", "hard",
      "a1", "Task A",
    );
    expect(result.ef).toBe("2026-04-13");
  });

  it("SNLT/FNLT hard: no forward-pass effect at boundary", () => {
    for (const type of ["SNLT", "FNLT"] as const) {
      const result = applyForwardConstraint(
        "2026-04-06", "2026-04-10", 5,
        type, "2026-04-06", "hard",
        "a1", "Task A",
      );
      expect(result.es).toBe("2026-04-06");
      expect(result.ef).toBe("2026-04-10");
      expect(result.conflict).toBeNull();
    }
  });

  it("soft constraint: no forward-pass effect regardless of dates", () => {
    for (const type of ["MSO", "MFO", "SNET", "FNET", "SNLT", "FNLT"] as const) {
      const result = applyForwardConstraint(
        "2026-04-06", "2026-04-10", 5,
        type, "2026-04-01", "soft",
        "a1", "Task A",
      );
      expect(result.es).toBe("2026-04-06");
      expect(result.ef).toBe("2026-04-10");
      expect(result.conflict).toBeNull();
    }
  });
});

describe("applyForwardConstraintInt — boundary equality", () => {
  it("MSO hard: es at boundary equals constraintOffset", () => {
    // esNet === constraintOffset → es = max(5, 5) = 5
    const result = applyForwardConstraintInt(5, 10, 5, "MSO", 5, "hard", 0);
    expect(result.es).toBe(5);
  });

  it("MSO hard: es pushed when constraintOffset > esNet", () => {
    const result = applyForwardConstraintInt(5, 10, 5, "MSO", 8, "hard", 0);
    expect(result.es).toBe(8);
  });

  it("MFO hard: maxPredEF clamp at exact boundary", () => {
    // ef = 5; es = 5-3=2; es = max(2, maxPredEF=2) = 2
    const result = applyForwardConstraintInt(5, 8, 3, "MFO", 5, "hard", 2);
    expect(result.es).toBe(2);
    expect(result.ef).toBe(5);
  });

  it("MFO hard: maxPredEF clamp raises es above computed", () => {
    // ef = 5; es = 5-3=2; es = max(2, maxPredEF=4) = 4
    const result = applyForwardConstraintInt(5, 8, 3, "MFO", 5, "hard", 4);
    expect(result.es).toBe(4);
  });

  it("FNET hard: ef pushed when constraintOffset > efNet", () => {
    const result = applyForwardConstraintInt(5, 8, 3, "FNET", 12, "hard", 3);
    expect(result.ef).toBe(12);
    expect(result.es).toBe(9); // 12 - 3
  });

  it("FNET hard: no push when constraintOffset equals efNet", () => {
    const result = applyForwardConstraintInt(5, 8, 3, "FNET", 8, "hard", 3);
    expect(result.ef).toBe(8);
    expect(result.es).toBe(5);
  });

  it("soft mode returns unchanged values for all constraint types", () => {
    for (const type of ["MSO", "MFO", "SNET", "FNET", "SNLT", "FNLT"] as const) {
      const result = applyForwardConstraintInt(5, 10, 5, type, 3, "soft", 0);
      expect(result.es).toBe(5);
      expect(result.ef).toBe(10);
    }
  });
});

describe("detectConstraintConflict — boundary equality", () => {
  it("hard SNLT: no conflict when lsNet equals constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-06", "2026-04-10",
      "SNLT", "2026-04-06", "hard",
      "a1", "Task A",
    );
    expect(result).toBeNull();
  });

  it("hard SNLT: conflict when lsNet is one day after constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-08", "2026-04-12",
      "SNLT", "2026-04-07", "hard",
      "a1", "Task A",
    );
    expect(result).not.toBeNull();
  });

  it("hard FNLT: no conflict when lfNet equals constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-06", "2026-04-10",
      "FNLT", "2026-04-10", "hard",
      "a1", "Task A",
    );
    expect(result).toBeNull();
  });

  it("hard FNLT: conflict when lfNet is one day after constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-06", "2026-04-11",
      "FNLT", "2026-04-10", "hard",
      "a1", "Task A",
    );
    expect(result).not.toBeNull();
  });

  it("soft SNET: no violation when esNet equals constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-06", "2026-04-10",
      "SNET", "2026-04-06", "soft",
      "a1", "Task A",
    );
    expect(result).toBeNull();
  });

  it("soft SNET: violation when esNet is before constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-06", "2026-04-10",
      "SNET", "2026-04-07", "soft",
      "a1", "Task A",
    );
    expect(result).not.toBeNull();
  });

  it("soft SNLT: no violation when lsNet equals constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-06", "2026-04-10",
      "SNLT", "2026-04-06", "soft",
      "a1", "Task A",
    );
    expect(result).toBeNull();
  });

  it("soft MSO: no violation when esNet equals constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-06", "2026-04-10",
      "MSO", "2026-04-06", "soft",
      "a1", "Task A",
    );
    expect(result).toBeNull();
  });

  it("soft MFO: no violation when efNet equals constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-06", "2026-04-10",
      "MFO", "2026-04-10", "soft",
      "a1", "Task A",
    );
    expect(result).toBeNull();
  });

  it("soft MFO: violation when efNet differs from constraintDate", () => {
    const result = detectConstraintConflict(
      "2026-04-06", "2026-04-10",
      "2026-04-06", "2026-04-10",
      "MFO", "2026-04-09", "soft",
      "a1", "Task A",
    );
    expect(result).not.toBeNull();
  });
});
