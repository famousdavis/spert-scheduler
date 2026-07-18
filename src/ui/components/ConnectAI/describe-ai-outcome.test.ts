// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { describeOutcome, summarizeSections, OP_LABELS } from "./describe-ai-outcome";
import type { AiOpOutcome } from "@app/api/ai-batch-service";

describe("describeOutcome", () => {
  it("renders an applied outcome", () => {
    expect(describeOutcome({ status: "applied" })).toEqual({ text: "Applied", tone: "applied" });
  });

  it("renders a whole-op skip with its label", () => {
    expect(describeOutcome({ status: "skipped", reason: "dependency_mode_off" })).toEqual({
      text: "Skipped — dependency mode off",
      tone: "skipped",
    });
  });

  it("renders a partial with an aggregated per-item reason summary", () => {
    const outcome: AiOpOutcome = {
      status: "partial",
      appliedCount: 12,
      skippedItems: [
        { index: 0, reason: "duplicate" },
        { index: 1, reason: "duplicate" },
        { index: 2, reason: "cycle" },
      ],
    };
    const { text, tone } = describeOutcome(outcome);
    expect(text).toBe("12 applied · 3 skipped (duplicate ×2, cycle ×1)");
    expect(tone).toBe("partial");
  });

  it("uses the skipped tone when nothing applied", () => {
    const outcome: AiOpOutcome = {
      status: "partial",
      appliedCount: 0,
      skippedItems: [{ index: 0, reason: "duplicate" }],
    };
    expect(describeOutcome(outcome).tone).toBe("skipped");
  });

  it("prefixes a per-section summary for a composite cascade (P0.1 example)", () => {
    // 1 invalid activity cascading 2 assignments + 4 edges as not_found (F3-8).
    const outcome: AiOpOutcome = {
      status: "partial",
      appliedCount: 34,
      sections: {
        activities: { applied: 26, skipped: 1 },
        milestones: { applied: 5, skipped: 0 },
        assignments: { applied: 8, skipped: 2 },
        dependencies: { applied: 30, skipped: 4 },
      },
      skippedItems: [
        { index: 0, section: "activities", id: "a0", reason: "invalid" },
        { index: 0, section: "assignments", id: "a0", reason: "not_found" },
        { index: 1, section: "assignments", id: "a1", reason: "not_found" },
        { index: 0, section: "dependencies", id: "a0->a3", reason: "not_found" },
        { index: 1, section: "dependencies", id: "a0->a4", reason: "not_found" },
        { index: 2, section: "dependencies", id: "a0->a5", reason: "not_found" },
        { index: 3, section: "dependencies", id: "a0->a6", reason: "not_found" },
      ],
    };
    const { text } = describeOutcome(outcome);
    expect(text).toContain(
      "activities 26/27 · milestones 5/5 · assignments 8/10 · dependencies 30/34 — "
    );
    expect(text).toContain("not found ×6");
    expect(text).toContain("invalid ×1");
  });
});

describe("summarizeSections", () => {
  it("emits only the present sections, in canonical order", () => {
    expect(
      summarizeSections({ dependencies: { applied: 3, skipped: 1 }, activities: { applied: 2, skipped: 0 } })
    ).toBe("activities 2/2 · dependencies 3/4");
  });
});

describe("OP_LABELS", () => {
  it("labels every Phase 1 bulk op", () => {
    expect(OP_LABELS.bulk_create_activities).toBe("Bulk create activities");
    expect(OP_LABELS.bulk_create_dependencies).toBe("Bulk create dependencies");
    expect(OP_LABELS.bulk_create_milestones).toBe("Bulk create milestones");
    expect(OP_LABELS.bulk_assign_milestones).toBe("Bulk assign milestones");
  });

  it("labels the Phase 2 bulk ops", () => {
    expect(OP_LABELS.bulk_update_activities).toBe("Bulk update activities");
    expect(OP_LABELS.bulk_import_schedule).toBe("Import schedule");
  });
});

// The composite `partial` render (per-section prefix + cascade reason summary)
// and the whole-op dependency_mode_off skip render are already covered above by
// the "composite cascade (P0.1 example)" and "whole-op skip" cases — the Phase-1
// formatter shipped those paths, so Phase 2 (the first live composite producer)
// adds no formatter code, only these labels.
