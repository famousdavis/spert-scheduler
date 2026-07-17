// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { AiOpOutcome, ItemReject, BulkSectionCounts } from "@app/api/ai-batch-service";

// Pure presentation logic for the AI provenance feed, extracted from
// AiActivityFeed.tsx for unit testability and react-refresh hygiene (mirrors
// the auth-errors.ts extraction from AuthProvider). No JSX here.

export type OutcomeTone = "applied" | "partial" | "skipped";

export const OP_LABELS: Record<string, string> = {
  create_activity: "Create activity",
  update_activity_estimate: "Update estimate",
  rename_activity: "Rename activity",
  set_activity_description: "Set description",
  append_activity_note: "Add note",
  add_checklist_items: "Add checklist items",
  add_deliverable_items: "Add deliverable items",
  toggle_checklist_item: "Toggle checklist item",
  toggle_deliverable_item: "Toggle deliverable item",
  create_milestone: "Create milestone",
  update_milestone: "Update milestone",
  assign_milestone: "Assign milestone",
  unassign_milestone: "Unassign milestone",
  create_dependency: "Create dependency",
  remove_dependency: "Remove dependency",
  update_dependency: "Update dependency",
  bulk_create_activities: "Bulk create activities",
  bulk_create_dependencies: "Bulk create dependencies",
  bulk_create_milestones: "Bulk create milestones",
  bulk_assign_milestones: "Bulk assign milestones",
  bulk_update_activities: "Bulk update activities",
  bulk_import_schedule: "Import schedule",
  reorder_activities: "Reorder activities",
};

const REASON_LABELS: Record<string, string> = {
  not_found: "not found",
  duplicate: "duplicate",
  cycle: "would create a cycle",
  cap_exceeded: "limit reached",
  invalid: "invalid",
  value_unchanged: "no change",
  locked: "scenario locked",
  no_open_scenario: "no open scenario",
  would_exceed_length: "too long",
  dependency_mode_off: "dependency mode off",
  unknown_noop: "no change",
  unknown_op: "unknown operation",
  stale_order: "project changed since the AI last read it",
  invalid_order: "duplicate ids in the requested order",
};

// Per-item skip reasons for the bulk `partial` outcome (distinct from the
// whole-op REASON_LABELS above).
const ITEM_REASON_LABELS: Record<ItemReject, string> = {
  cap_exceeded: "limit reached",
  invalid: "invalid",
  duplicate: "duplicate",
  not_found: "not found",
  cycle: "cycle",
  value_unchanged: "no change",
};

const SECTION_ORDER: Array<keyof BulkSectionCounts> = [
  "activities",
  "milestones",
  "assignments",
  "dependencies",
];

/** Aggregate per-item reasons, e.g. "duplicate ×2, cycle ×1". */
export function summarizeItemReasons(items: ReadonlyArray<{ reason: ItemReject }>): string {
  const counts = new Map<ItemReject, number>();
  for (const it of items) counts.set(it.reason, (counts.get(it.reason) ?? 0) + 1);
  return [...counts.entries()]
    .map(([reason, n]) => `${ITEM_REASON_LABELS[reason] ?? reason} ×${n}`)
    .join(", ");
}

/** Per-section applied/total, e.g. "activities 26/27 · milestones 5/5". */
export function summarizeSections(sections: BulkSectionCounts): string {
  const parts: string[] = [];
  for (const key of SECTION_ORDER) {
    const c = sections[key];
    if (c) parts.push(`${key} ${c.applied}/${c.applied + c.skipped}`);
  }
  return parts.join(" · ");
}

/**
 * Render one op outcome to a feed row's status text + tone. Pure — the source
 * of truth the component and its unit tests both consume.
 */
export function describeOutcome(outcome: AiOpOutcome): { text: string; tone: OutcomeTone } {
  if (outcome.status === "applied") return { text: "Applied", tone: "applied" };
  if (outcome.status === "partial") {
    // A `partial` outcome always carries ≥1 skip (zero skips collapse to
    // `applied`, F3-3), so the counts line always names skips.
    const skipped = outcome.skippedItems.length;
    const reasonSummary = summarizeItemReasons(outcome.skippedItems);
    const counts = `${outcome.appliedCount} applied · ${skipped} skipped${
      reasonSummary ? ` (${reasonSummary})` : ""
    }`;
    // Composite imports carry a per-section map so a human reads a cascade as
    // one root cause (e.g. many not_found from a single skipped activity).
    const prefix = outcome.sections ? `${summarizeSections(outcome.sections)} — ` : "";
    return {
      text: prefix + counts,
      tone: outcome.appliedCount > 0 ? "partial" : "skipped",
    };
  }
  return { text: `Skipped — ${REASON_LABELS[outcome.reason] ?? outcome.reason}`, tone: "skipped" };
}
