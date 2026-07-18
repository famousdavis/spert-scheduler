// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

// -- AI op contract ----------------------------------------------------------
// The op/payload/outcome vocabulary shared by the AI batch pipeline
// (ai-batch-service.ts dispatcher, ai-op-handlers.ts singular handlers,
// ai-bulk-handlers.ts bulk handlers). Types plus the tiny result constructors —
// no domain logic lives here.

import type { Scenario, RSMLevel, DistributionType, DependencyType } from "@domain/models/types";

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

export type AiOp =
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
  | { seq: number; op: "reorder_activities"; payload: ReorderActivitiesPayload };

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
  | "unknown_op";

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
  | "value_unchanged";

export type BulkSection = "activities" | "milestones" | "assignments" | "dependencies";

export interface SkippedItem {
  // Section-local when `section` is present, else the payload-array index.
  index: number;
  // activities/milestones → the item's id; assignments → the activityId;
  // dependencies → "fromActivityId->toActivityId".
  id?: string;
  reason: ItemReject;
  section?: BulkSection;
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

export type AiOpOutcome =
  | { status: "applied" }
  | { status: "skipped"; reason: AiSkipReason }
  | {
      status: "partial";
      appliedCount: number;
      skippedItems: SkippedItem[];
      // Composite-only producer (bulk_import_schedule, Phase 2). Never set by
      // handleAddItems or the single-array bulk handlers.
      sections?: BulkSectionCounts;
    };

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
 * Narrow a core reason to an ItemReject for the bulk `partial` outcome. The six
 * ItemReject members pass through; anything else (would_exceed_length, the
 * whole-op reasons, etc.) is defensively mapped to `invalid` — expected
 * unreachable in the bulk paths, asserted so in unit tests (P0.1).
 */
export function toItemReject(reason: AiSkipReason): ItemReject {
  switch (reason) {
    case "cap_exceeded":
    case "invalid":
    case "duplicate":
    case "not_found":
    case "cycle":
    case "value_unchanged":
      return reason;
    default:
      return "invalid";
  }
}
