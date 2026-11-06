// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// -- AI op contract ----------------------------------------------------------
// The op/payload/outcome vocabulary shared by the AI batch pipeline
// (ai-batch-service.ts dispatcher, ai-op-handlers.ts singular handlers,
// ai-bulk-handlers.ts bulk handlers). Types plus the tiny result constructors —
// no domain logic lives here.

import type { Scenario, RSMLevel, DistributionType, DependencyType, ActivityStatus, Calendar } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";

// -- Op contract -------------------------------------------------------------
// Every op carries an optional `scenarioId`. Dependency ops require it at the
// tool layer; all others resolve against the open scenario when omitted. It is
// optional in the type so `op.payload.scenarioId` reads uniformly across the
// union.

export interface CreateActivityPayload {
  scenarioId?: string;
  id: string;
  name: string;
  min: number;
  mostLikely: number;
  max: number;
  confidenceLevel?: RSMLevel;
  distributionType?: DistributionType;
  description?: string;
}

export interface UpdateEstimatePayload {
  scenarioId?: string;
  id: string;
  min?: number;
  mostLikely?: number;
  max?: number;
  confidenceLevel?: RSMLevel;
  distributionType?: DistributionType;
}

export interface RenameActivityPayload {
  scenarioId?: string;
  id: string;
  name: string;
}

export interface SetDescriptionPayload {
  scenarioId?: string;
  id: string;
  // Typed as `string`, but drained raw from Firestore (no client Zod) — the
  // handler still guards `typeof` before trusting it. Empty string clears.
  description: string;
}

export interface AppendNotePayload {
  scenarioId?: string;
  id: string;
  text: string;
}

export interface AddItemsPayload {
  scenarioId?: string;
  id: string;
  items: Array<{ id: string; text: string }>;
}

export interface ToggleItemPayload {
  scenarioId?: string;
  id: string;
  itemId: string;
  completed: boolean;
}

export interface CreateMilestonePayload {
  scenarioId?: string;
  id: string;
  name: string;
  targetDate: string;
}

export interface UpdateMilestonePayload {
  scenarioId?: string;
  id: string;
  name?: string;
  targetDate?: string;
}

export interface AssignMilestonePayload {
  scenarioId?: string;
  activityId: string;
  milestoneId?: string | null;
}

export interface CreateDependencyPayload {
  scenarioId?: string;
  fromActivityId: string;
  toActivityId: string;
  type?: DependencyType;
  lagDays?: number;
}

export interface RemoveDependencyPayload {
  scenarioId?: string;
  fromActivityId: string;
  toActivityId: string;
}

export interface UpdateDependencyPayload {
  scenarioId?: string;
  fromActivityId: string;
  toActivityId: string;
  lagDays?: number;
  type?: DependencyType;
}

// -- Bulk op payloads (Phase 1) ----------------------------------------------
// Domain-typed views of the structurally-parsed payloads. The dispatcher parses
// each raw payload with the matching structural schema (ai-bulk-schemas.ts),
// then casts to these types at that single boundary — sound because the enum
// fields (confidenceLevel/distributionType/type) are re-validated per item in
// the cores (a bad value reads as an `invalid` item, never a corrupt apply).

export interface BulkActivityItem {
  id: string;
  name: string;
  min: number;
  mostLikely: number;
  max: number;
  confidenceLevel?: RSMLevel;
  distributionType?: DistributionType;
  description?: string;
  // Bulk-only convenience field: an initial note seeded after the create
  // applies. The singular create tool has no note field.
  note?: string;
}

export interface BulkCreateActivitiesPayload {
  scenarioId?: string;
  activities: BulkActivityItem[];
}

export interface BulkDependencyItem {
  fromActivityId: string;
  toActivityId: string;
  type?: DependencyType;
  lagDays?: number;
}

export interface BulkCreateDependenciesPayload {
  // Required at the tool layer; optional here so `op.payload.scenarioId` reads
  // uniformly across the union (matches CreateDependencyPayload).
  scenarioId?: string;
  dependencies: BulkDependencyItem[];
}

export interface BulkMilestoneItem {
  id: string;
  name: string;
  targetDate: string;
}

export interface BulkCreateMilestonesPayload {
  scenarioId?: string;
  milestones: BulkMilestoneItem[];
}

export interface BulkAssignmentItem {
  activityId: string;
  milestoneId: string;
}

export interface BulkAssignMilestonesPayload {
  scenarioId?: string;
  assignments: BulkAssignmentItem[];
}

// -- Bulk op payloads (Phase 2) ----------------------------------------------

// The updatable-field subset shared by the singular update handlers and the 2A
// bulk path. Every field optional (absent = unchanged); `id` lives on the item
// / is passed separately to the core.
export interface UpdateActivityFields {
  name?: string;
  min?: number;
  mostLikely?: number;
  max?: number;
  confidenceLevel?: RSMLevel;
  distributionType?: DistributionType;
  description?: string;
}

export interface BulkUpdateActivityItem extends UpdateActivityFields {
  id: string;
}

export interface BulkUpdateActivitiesPayload {
  scenarioId?: string;
  updates: BulkUpdateActivityItem[];
}

// Composite import (2B): four optional sections, each reusing a Phase-1 item
// shape. Absent ≠ empty is preserved by the structural schema (optional, no
// `.min`).
export interface BulkImportSchedulePayload {
  scenarioId?: string;
  activities?: BulkActivityItem[];
  milestones?: BulkMilestoneItem[];
  assignments?: BulkAssignmentItem[];
  dependencies?: BulkDependencyItem[];
}

// Reorder (Phase 3): the full current activity-id list, in the desired order.
// Whole-op by nature — no per-item outcomes.
export interface ReorderActivitiesPayload {
  scenarioId?: string;
  orderedActivityIds: string[];
}

// Bulk append notes (Phase 4): append one note to each of many EXISTING
// activities. Item mirrors AppendNotePayload minus scenarioId. Flat single-array
// shape (like Phase 1/2A) — one `text` per activity, one `partial` outcome.
export interface BulkAppendNoteItem {
  id: string;
  text: string;
}

export interface BulkAppendNotesPayload {
  scenarioId?: string;
  notes: BulkAppendNoteItem[];
}

// WI-150 release C — record progress: one entry per EXISTING activity, its Status and/or its
// Actual Start and Actual Finish. NEVER a Planned date: the app keeps the Planned pair itself, by
// the one Status rule, when a row leaves Planned. Add-only (owner, R650 ruling 6d): an entry records
// only what is not yet recorded, so it can never set a row back or change a recorded date.
export interface BulkSetProgressItem {
  id: string;
  status?: ActivityStatus;
  actualStartDate?: string;
  actualFinishDate?: string;
}

export interface BulkSetActivityProgressPayload {
  scenarioId?: string;
  updates: BulkSetProgressItem[];
}

// WI-162 — Sections (in code, bands). `beforeActivityId` is what the snapshot's `sections` shows: the
// activity the header sits directly above, or null = after the last activity. Colours travel by
// swatch name; `BulkSection` above means a part of the composite import, not one of these.
export interface BulkCreateSectionItem {
  id: string;
  name: string;
  beforeActivityId: string | null;
  color?: string;
}

export interface BulkCreateSectionsPayload {
  scenarioId?: string;
  sections: BulkCreateSectionItem[];
}

/** The `color` that clears a Section's colour, and what the snapshot shows for a Section with none. */
export const NO_SECTION_COLOR = "none";

/** Only the fields sent change. `color: "none"` clears the colour. */
export interface BulkUpdateSectionItem {
  id: string;
  name?: string;
  beforeActivityId?: string | null;
  color?: string;
}

export interface BulkUpdateSectionsPayload {
  scenarioId?: string;
  updates: BulkUpdateSectionItem[];
}

export interface DeleteSectionsPayload {
  scenarioId?: string;
  ids: string[];
}

/**
 * WI-150 release C: what the browser that drains a batch adds to it. `today` is read from that
 * browser's clock at drain (the bound: no recorded date after it); `calendar` is the project's work
 * calendar as the page assembles it. The core never reads the clock.
 */
export interface AiBatchContext {
  today: string;
  calendar?: WorkCalendar | Calendar;
}

type AiOpVariant =
  | { seq: number; op: "create_activity"; payload: CreateActivityPayload }
  | { seq: number; op: "update_activity_estimate"; payload: UpdateEstimatePayload }
  | { seq: number; op: "rename_activity"; payload: RenameActivityPayload }
  | { seq: number; op: "set_activity_description"; payload: SetDescriptionPayload }
  | { seq: number; op: "append_activity_note"; payload: AppendNotePayload }
  | { seq: number; op: "add_checklist_items"; payload: AddItemsPayload }
  | { seq: number; op: "add_deliverable_items"; payload: AddItemsPayload }
  | { seq: number; op: "toggle_checklist_item"; payload: ToggleItemPayload }
  | { seq: number; op: "toggle_deliverable_item"; payload: ToggleItemPayload }
  | { seq: number; op: "create_milestone"; payload: CreateMilestonePayload }
  | { seq: number; op: "update_milestone"; payload: UpdateMilestonePayload }
  | { seq: number; op: "assign_milestone"; payload: AssignMilestonePayload }
  | { seq: number; op: "unassign_milestone"; payload: AssignMilestonePayload }
  | { seq: number; op: "create_dependency"; payload: CreateDependencyPayload }
  | { seq: number; op: "remove_dependency"; payload: RemoveDependencyPayload }
  | { seq: number; op: "update_dependency"; payload: UpdateDependencyPayload }
  | { seq: number; op: "bulk_create_activities"; payload: BulkCreateActivitiesPayload }
  | { seq: number; op: "bulk_create_dependencies"; payload: BulkCreateDependenciesPayload }
  | { seq: number; op: "bulk_create_milestones"; payload: BulkCreateMilestonesPayload }
  | { seq: number; op: "bulk_assign_milestones"; payload: BulkAssignMilestonesPayload }
  | { seq: number; op: "bulk_update_activities"; payload: BulkUpdateActivitiesPayload }
  | { seq: number; op: "bulk_import_schedule"; payload: BulkImportSchedulePayload }
  | { seq: number; op: "reorder_activities"; payload: ReorderActivitiesPayload }
  | { seq: number; op: "bulk_append_notes"; payload: BulkAppendNotesPayload }
  | { seq: number; op: "bulk_set_activity_progress"; payload: BulkSetActivityProgressPayload }
  | { seq: number; op: "bulk_create_sections"; payload: BulkCreateSectionsPayload }
  | { seq: number; op: "bulk_update_sections"; payload: BulkUpdateSectionsPayload }
  | { seq: number; op: "delete_sections"; payload: DeleteSectionsPayload };

/**
 * An op as drained. `createdOn` (WI-150 release C, Review 34 R4): the LOCAL date, in the draining
 * browser, of the op's server `createdAt` — the day the AI sent it. A progress date the op leaves
 * out is taken from that day, so an op queued on Friday and drained on Monday records Friday.
 */
export type AiOp = AiOpVariant & { createdOn?: string };

export type AiSkipReason =
  | "not_found"
  | "duplicate"
  | "cycle"
  | "cap_exceeded"
  | "invalid"
  | "value_unchanged"
  | "locked"
  | "no_open_scenario"
  | "would_exceed_length"
  | "dependency_mode_off"
  | "stale_order"
  | "invalid_order"
  | "unknown_noop"
  | "unknown_op"
  // WI-150 release C — the progress write's refusals (Review 34, W9: each its own label). Ruling 5:
  // needs_both_dates. Ruling 6d, add-only: already_started, already_complete, date_recorded.
  | "dates_on_planned"
  | "finish_while_in_progress"
  | "needs_both_dates"
  | "already_started"
  | "already_complete"
  | "date_recorded"
  | "date_after_today"
  | "before_start_date"
  | "dates_out_of_order"
  | "finish_without_start"
  // WI-162 — the Section writes' own three; every other Section refusal shares a reason above.
  | "anchor_not_found"
  | "section_limit"
  | "section_exists";

// Per-item skip reasons for the `partial` outcome. Widened (P0.1) so the shared
// item-level cores can surface the full vocabulary through the bulk handlers.
// ItemReject ⊂ AiSkipReason, so a core reason lifts to a singular `skip()`
// directly; the bulk path narrows via toItemReject().
export type ItemReject =
  | "cap_exceeded"
  | "invalid"
  | "duplicate"
  | "not_found"
  | "cycle"
  | "value_unchanged"
  | "would_exceed_length"
  | "dates_on_planned"
  | "finish_while_in_progress"
  | "needs_both_dates"
  | "already_started"
  | "already_complete"
  | "date_recorded"
  | "date_after_today"
  | "before_start_date"
  | "dates_out_of_order"
  | "finish_without_start"
  | "anchor_not_found"
  | "section_limit"
  | "section_exists";

export type BulkSection = "activities" | "milestones" | "assignments" | "dependencies";

export interface SkippedItem {
  // Section-local when `section` is present, else the payload-array index.
  index: number;
  // activities/milestones → the item's id; assignments → the activityId;
  // dependencies → "fromActivityId->toActivityId".
  id?: string;
  reason: ItemReject;
  section?: BulkSection;
  /**
   * WI-150 release C (Review 37, G2): what the feed calls this entry — the activity's name, or the id
   * the AI sent when no activity has it. Set by the progress write and (WI-162) the Section writes,
   * which name the Section, on every entry they skip.
   */
  name?: string;
}

export interface SectionCount {
  applied: number;
  skipped: number;
}

export interface BulkSectionCounts {
  activities?: SectionCount;
  milestones?: SectionCount;
  assignments?: SectionCount;
  dependencies?: SectionCount;
}

/**
 * WI-162 (owner, R674): what a Section delete took, for its row in Recent AI activity: the scenario's
 * name and each Section's, as the feed names them. Set only by `delete_sections`, and only when it
 * took at least one. These stay in the browser: the drain writes no outcome back to the relay.
 */
export interface DeletedSections {
  scenarioName: string;
  names: string[];
}

export type AiOpOutcome =
  // `noPlanKept` (WI-150 release C, Review 34 F7): how many activities left Planned with NO Planned
  // dates kept, because the schedule could not be calculated — as the grid's toast says. Set only by
  // the progress write, and only when non-zero.
  | { status: "applied"; noPlanKept?: number; deletedSections?: DeletedSections }
  | { status: "skipped"; reason: AiSkipReason }
  | {
      status: "partial";
      appliedCount: number;
      skippedItems: SkippedItem[];
      // Composite-only producer (bulk_import_schedule, Phase 2). Never set by
      // handleAddItems or the single-array bulk handlers.
      sections?: BulkSectionCounts;
      noPlanKept?: number;
      deletedSections?: DeletedSections;
    };

/** What a bulk op that reached its entries can come to: the two outcomes `bulkOutcome` gives. */
export type BulkOutcome = Exclude<AiOpOutcome, { status: "skipped" }>;

export type AiOpResult = { op: AiOp; outcome: AiOpOutcome };

export type OpResult = { scenario: Scenario; outcome: AiOpOutcome };

export const skip = (scenario: Scenario, reason: AiSkipReason): OpResult => ({
  scenario,
  outcome: { status: "skipped", reason },
});
export const applied = (scenario: Scenario): OpResult => ({
  scenario,
  outcome: { status: "applied" },
});

export type CoreResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; reason: AiSkipReason };

export const accept = (scenario: Scenario): CoreResult => ({ ok: true, scenario });
export const reject = (reason: AiSkipReason): CoreResult => ({ ok: false, reason });

/**
 * Narrow a core reason to an ItemReject for the bulk `partial` outcome. The
 * seven ItemReject members -- including would_exceed_length, added for
 * bulk_append_notes -- pass through; anything else (the whole-op-only
 * reasons, etc.) is defensively mapped to `invalid`.
 *
 * would_exceed_length is genuinely reachable from bulk_append_notes (it
 * targets EXISTING activities whose notes may already be long). It reaches
 * this function from no other current caller, for two different reasons:
 * handleBulkUpdateActivities's description-update path requires an incoming
 * description over 2000 chars, which the client doesn't cap but the server
 * contract does (unreachable given a well-formed op, not separately tested);
 * the bulk-create / bulk-import note-seeding paths call the SAME producer
 * (appendNoteCore) but discard its failure before calling this function at
 * all (ai-bulk-handlers.ts:78, :186) -- reachable-but-discarded, not
 * unreachable.
 */
export function toItemReject(reason: AiSkipReason): ItemReject {
  switch (reason) {
    case "cap_exceeded":
    case "invalid":
    case "duplicate":
    case "not_found":
    case "cycle":
    case "value_unchanged":
    case "would_exceed_length":
    case "dates_on_planned":
    case "finish_while_in_progress":
    case "needs_both_dates":
    case "already_started":
    case "already_complete":
    case "date_recorded":
    case "date_after_today":
    case "before_start_date":
    case "dates_out_of_order":
    case "finish_without_start":
    case "anchor_not_found":
    case "section_limit":
    case "section_exists":
      return reason;
    default:
      return "invalid";
  }
}
