// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { AiOpOutcome, AiSkipReason, ItemReject, BulkSectionCounts, DeletedSections, SkippedItem } from "@app/api/ai-batch-service";
import { SECTION_CAP } from "@domain/models/types";

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
  bulk_append_notes: "Bulk add notes",
  bulk_set_activity_progress: "Record progress",
  bulk_create_sections: "Add sections",
  bulk_update_sections: "Update sections",
  delete_sections: "Delete sections",
};

// WI-150 release C (Review 34, W9): the progress write's refusals, each in its own words — shared
// by the whole-op and the per-item tables below, so the two cannot drift. Worded as the screen
// shows them (Review 37, W2: the scenario's date is labelled "Start"). The add-only refusals (owner,
// R650 ruling 6d) say whose the change is: the user's, in the grid or the Edit Activity window.
const PROGRESS_REASON_LABELS = {
  dates_on_planned: "dates on an activity still Planned",
  finish_while_in_progress: "finish while In Progress",
  needs_both_dates: "not started: Complete needs both dates",
  already_started: "already started: only you can set it back to Planned",
  already_complete: "already Complete: only you can reopen it",
  date_recorded: "a different date is already recorded: only you can change it",
  date_after_today: "date after today",
  before_start_date: "start before the scenario's Start",
  dates_out_of_order: "finish before start",
  finish_without_start: "finish without a start",
} as const;

// WI-162: the Section writes' own three, shared by both tables like the progress reasons. "not found"
// alone would read as the Section's, on an entry whose Section is fine and whose activity is missing;
// "duplicate" would read as "same name" (two Sections may share one), and "already exists" says the
// entry is there. An activity's own refusal stays "duplicate".
const SECTION_REASON_LABELS = {
  anchor_not_found: "activity not found",
  section_limit: `limit of ${SECTION_CAP} Sections reached`,
  section_exists: "already exists",
} as const;

/** WI-162 (R674): the most Sections a delete's row names; the rest read "and N more". */
const DELETED_NAMES_SHOWN = 10;

// Typed by the union since WI-150 release C (W9), so a new reason without its label fails `tsc`.
const REASON_LABELS: Record<AiSkipReason, string> = {
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
  ...PROGRESS_REASON_LABELS,
  ...SECTION_REASON_LABELS,
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
  would_exceed_length: "too long",
  ...PROGRESS_REASON_LABELS,
  ...SECTION_REASON_LABELS,
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
 * WI-150 release C (Review 34, F7; shortened, owner, R650 ruling 8): the progress write took
 * activities out of Planned while the schedule could not be calculated, so no Planned dates were
 * kept — the grid's toast, in the feed. Joined with "; ", never a second pair of parentheses
 * (Review 37, interactions W2 = verification W7).
 */
function noPlanNote(outcome: { noPlanKept?: number }): string {
  return (outcome.noPlanKept ?? 0) > 0 ? "; no Planned dates kept: the schedule could not be calculated" : "";
}

/**
 * WI-150 release C (Review 37, G2): each skipped entry by its activity and its reason, when the op
 * names every entry it skips (the progress write does); `undefined` otherwise.
 */
function namedSkips(items: readonly SkippedItem[]): string | undefined {
  if (items.some((i) => i.name === undefined)) return undefined;
  return items.map((i) => `${i.name} (${ITEM_REASON_LABELS[i.reason] ?? i.reason})`).join(", ");
}

/** What follows the counts: the named entries, else the reasons tallied, e.g. " (duplicate ×2)". */
function skipDetail(items: readonly SkippedItem[]): string {
  const named = namedSkips(items);
  if (named) return `: ${named}`;
  const reasonSummary = summarizeItemReasons(items);
  return reasonSummary ? ` (${reasonSummary})` : "";
}

/** WI-162 (owner, R674): what a Section delete took and where, e.g. "Deleted from Baseline: Phase 1, Testing". */
function deletedLine({ scenarioName, names }: DeletedSections): string {
  const more = names.length - DELETED_NAMES_SHOWN;
  const tail = more > 0 ? ` and ${more} more` : "";
  return `Deleted from ${scenarioName}: ${names.slice(0, DELETED_NAMES_SHOWN).join(", ")}${tail}`;
}

/**
 * Render one op outcome to a feed row's status text + tone. Pure — the source
 * of truth the component and its unit tests both consume.
 */
export function describeOutcome(outcome: AiOpOutcome): { text: string; tone: OutcomeTone } {
  if (outcome.status === "applied") {
    const lead = outcome.deletedSections ? deletedLine(outcome.deletedSections) : "Applied";
    return { text: `${lead}${noPlanNote(outcome)}`, tone: "applied" };
  }
  if (outcome.status === "partial") {
    // A `partial` outcome always carries ≥1 skip (zero skips collapse to
    // `applied`, F3-3), so the counts line always names skips.
    const skipped = outcome.skippedItems.length;
    const lead = outcome.deletedSections ? deletedLine(outcome.deletedSections) : `${outcome.appliedCount} applied`;
    const counts = `${lead} · ${skipped} skipped${skipDetail(outcome.skippedItems)}`;
    // Composite imports carry a per-section map so a human reads a cascade as
    // one root cause (e.g. many not_found from a single skipped activity).
    const prefix = outcome.sections ? `${summarizeSections(outcome.sections)} — ` : "";
    return {
      text: prefix + counts + noPlanNote(outcome),
      tone: outcome.appliedCount > 0 ? "partial" : "skipped",
    };
  }
  // `?? reason`: an op drained raw from Firestore can name a reason this build does not know.
  return { text: `Skipped — ${REASON_LABELS[outcome.reason] ?? outcome.reason}`, tone: "skipped" };
}
