// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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

  it("labels a would_exceed_length item skip as 'too long' (bulk_append_notes)", () => {
    const outcome: AiOpOutcome = {
      status: "partial",
      appliedCount: 5,
      skippedItems: [{ index: 0, id: "a0", reason: "would_exceed_length" }],
    };
    expect(describeOutcome(outcome).text).toContain("too long ×1");
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

  it("labels the Phase 4 bulk op", () => {
    expect(OP_LABELS.bulk_append_notes).toBe("Bulk add notes");
  });
});

// The composite `partial` render (per-section prefix + cascade reason summary)
// and the whole-op dependency_mode_off skip render are already covered above by
// the "composite cascade (P0.1 example)" and "whole-op skip" cases — the Phase-1
// formatter shipped those paths, so Phase 2 (the first live composite producer)
// adds no formatter code, only these labels.

// WI-150 release C — the progress write in the feed.
describe("the progress write in the feed", () => {
  it("is labelled Record progress", () => {
    expect(OP_LABELS.bulk_set_activity_progress).toBe("Record progress");
  });
  it("names each skipped entry by its activity, with its reason in its own words (Review 37, G2; W9) — none reads 'invalid'", () => {
    const outcome: AiOpOutcome = {
      status: "partial",
      appliedCount: 1,
      skippedItems: [
        { index: 0, id: "a", name: "Build", reason: "date_after_today" },
        { index: 1, id: "b", name: "Test", reason: "dates_on_planned" },
        { index: 2, id: "c", name: "Train", reason: "finish_while_in_progress" },
        { index: 3, id: "d", name: "Deploy", reason: "needs_both_dates" },
        { index: 4, id: "e", name: "Design", reason: "already_started" },
        { index: 5, id: "f", name: "Spec", reason: "already_complete" },
        { index: 6, id: "g", name: "Pilot", reason: "date_recorded" },
        { index: 7, id: "h", name: "Kickoff", reason: "before_start_date" },
        { index: 8, id: "i", name: "Review", reason: "dates_out_of_order" },
        { index: 9, id: "j", name: "Launch", reason: "finish_without_start" },
        { index: 10, id: "x9", name: "x9", reason: "not_found" },
      ],
    };
    expect(describeOutcome(outcome)).toEqual({
      text: "1 applied · 11 skipped: Build (date after today), Test (dates on an activity still Planned), Train (finish while In Progress), Deploy (not started: Complete needs both dates), Design (already started: only you can set it back to Planned), Spec (already Complete: only you can reopen it), Pilot (a different date is already recorded: only you can change it), Kickoff (start before the scenario's Start), Review (finish before start), Launch (finish without a start), x9 (not found)",
      tone: "partial",
    });
  });
  it("an op that does not name its skipped entries is still tallied by reason", () => {
    const outcome: AiOpOutcome = { status: "partial", appliedCount: 0, skippedItems: [{ index: 0, id: "a", reason: "date_after_today" }, { index: 1, id: "b", reason: "date_after_today" }] };
    expect(describeOutcome(outcome).text).toBe("0 applied · 2 skipped (date after today ×2)");
  });
  it("a whole-op skip with a progress reason has its words too", () => {
    expect(describeOutcome({ status: "skipped", reason: "already_started" }).text).toBe("Skipped — already started: only you can set it back to Planned");
  });
  it("says when no Planned dates were kept (Review 34, F7), shortened and joined with '; ' — never a second pair of parentheses (W7)", () => {
    expect(describeOutcome({ status: "applied", noPlanKept: 1 }).text)
      .toBe("Applied; no Planned dates kept: the schedule could not be calculated");
    expect(describeOutcome({ status: "applied", noPlanKept: 2 }).text)
      .toBe("Applied; no Planned dates kept: the schedule could not be calculated");
    const partial = describeOutcome({ status: "partial", appliedCount: 1, skippedItems: [{ index: 1, id: "z", name: "z", reason: "not_found" }], noPlanKept: 1 }).text;
    expect(partial).toBe("1 applied · 1 skipped: z (not found); no Planned dates kept: the schedule could not be calculated");
    expect(partial).not.toContain(") (");
  });
});
