// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  Project,
  Scenario,
  Activity,
  ChecklistItem,
  RSMLevel,
  DistributionType,
  DependencyType,
} from "@domain/models/types";
import { ActivitySchema, MilestoneSchema, ChecklistItemSchema } from "@domain/schemas/project.schema";
import { computePertMean } from "@core/estimation/spert";
import { recommendDistribution } from "@core/recommendation/recommendation";
import { detectCycle } from "@core/schedule/dependency-graph";
import {
  addActivityToScenario,
  updateActivity,
  patchActivityQualitative,
  type QualitativePatch,
} from "./project-service";
import { addMilestone, updateMilestone, assignActivityToMilestone } from "./milestone-service";
import {
  addDependency,
  removeDependency,
  updateDependencyLag,
  updateDependencyType,
} from "./dependency-service";
import {
  BulkCreateActivitiesSchema,
  BulkCreateDependenciesSchema,
  BulkCreateMilestonesSchema,
  BulkAssignMilestonesSchema,
  BulkUpdateActivitiesSchema,
  BulkImportScheduleSchema,
} from "./ai-bulk-schemas";

// -- Caps (mirror the Zod schema `.max()` constraints) -----------------------

const ACTIVITY_CAP = 500;
const MILESTONE_CAP = 100;
const ITEM_CAP = 50;
// Mirrors the domain-schema dependency cap. Enforced in createDependencyCore
// (P0.4) — the ONLY sanctioned singular-path outcome change: before this guard
// the singular path had no cap check and applied the 2001st edge in memory,
// risking a persist-time failure (Spike V4). A per-item `cap_exceeded` skip.
const DEPENDENCY_CAP = 2000;
const NOTES_MAX = 2000;
const DESCRIPTION_MAX = 2000;
const NOTE_SEPARATOR = "\n\n";

// -- Op contract -------------------------------------------------------------
// Every op carries an optional `scenarioId`. Dependency ops require it at the
// tool layer; all others resolve against the open scenario when omitted. It is
// optional in the type so `op.payload.scenarioId` reads uniformly across the
// union.

interface CreateActivityPayload {
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

interface UpdateEstimatePayload {
  scenarioId?: string;
  id: string;
  min?: number;
  mostLikely?: number;
  max?: number;
  confidenceLevel?: RSMLevel;
  distributionType?: DistributionType;
}

interface RenameActivityPayload {
  scenarioId?: string;
  id: string;
  name: string;
}

interface SetDescriptionPayload {
  scenarioId?: string;
  id: string;
  // Typed as `string`, but drained raw from Firestore (no client Zod) — the
  // handler still guards `typeof` before trusting it. Empty string clears.
  description: string;
}

interface AppendNotePayload {
  scenarioId?: string;
  id: string;
  text: string;
}

interface AddItemsPayload {
  scenarioId?: string;
  id: string;
  items: Array<{ id: string; text: string }>;
}

interface ToggleItemPayload {
  scenarioId?: string;
  id: string;
  itemId: string;
  completed: boolean;
}

interface CreateMilestonePayload {
  scenarioId?: string;
  id: string;
  name: string;
  targetDate: string;
}

interface UpdateMilestonePayload {
  scenarioId?: string;
  id: string;
  name?: string;
  targetDate?: string;
}

interface AssignMilestonePayload {
  scenarioId?: string;
  activityId: string;
  milestoneId?: string | null;
}

interface CreateDependencyPayload {
  scenarioId?: string;
  fromActivityId: string;
  toActivityId: string;
  type?: DependencyType;
  lagDays?: number;
}

interface RemoveDependencyPayload {
  scenarioId?: string;
  fromActivityId: string;
  toActivityId: string;
}

interface UpdateDependencyPayload {
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

interface BulkActivityItem {
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

interface BulkCreateActivitiesPayload {
  scenarioId?: string;
  activities: BulkActivityItem[];
}

interface BulkDependencyItem {
  fromActivityId: string;
  toActivityId: string;
  type?: DependencyType;
  lagDays?: number;
}

interface BulkCreateDependenciesPayload {
  // Required at the tool layer; optional here so `op.payload.scenarioId` reads
  // uniformly across the union (matches CreateDependencyPayload).
  scenarioId?: string;
  dependencies: BulkDependencyItem[];
}

interface BulkMilestoneItem {
  id: string;
  name: string;
  targetDate: string;
}

interface BulkCreateMilestonesPayload {
  scenarioId?: string;
  milestones: BulkMilestoneItem[];
}

interface BulkAssignmentItem {
  activityId: string;
  milestoneId: string;
}

interface BulkAssignMilestonesPayload {
  scenarioId?: string;
  assignments: BulkAssignmentItem[];
}

// -- Bulk op payloads (Phase 2) ----------------------------------------------

// The updatable-field subset shared by the singular update handlers and the 2A
// bulk path. Every field optional (absent = unchanged); `id` lives on the item
// / is passed separately to the core.
interface UpdateActivityFields {
  name?: string;
  min?: number;
  mostLikely?: number;
  max?: number;
  confidenceLevel?: RSMLevel;
  distributionType?: DistributionType;
  description?: string;
}

interface BulkUpdateActivityItem extends UpdateActivityFields {
  id: string;
}

interface BulkUpdateActivitiesPayload {
  scenarioId?: string;
  updates: BulkUpdateActivityItem[];
}

// Composite import (2B): four optional sections, each reusing a Phase-1 item
// shape. Absent ≠ empty is preserved by the structural schema (optional, no
// `.min`).
interface BulkImportSchedulePayload {
  scenarioId?: string;
  activities?: BulkActivityItem[];
  milestones?: BulkMilestoneItem[];
  assignments?: BulkAssignmentItem[];
  dependencies?: BulkDependencyItem[];
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
  | { seq: number; op: "bulk_import_schedule"; payload: BulkImportSchedulePayload };

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

interface SectionCount {
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

type OpResult = { scenario: Scenario; outcome: AiOpOutcome };

const skip = (scenario: Scenario, reason: AiSkipReason): OpResult => ({
  scenario,
  outcome: { status: "skipped", reason },
});
const applied = (scenario: Scenario): OpResult => ({
  scenario,
  outcome: { status: "applied" },
});

// -- Shared item-level cores -------------------------------------------------
// A core applies ONE item to a scenario and returns either the next scenario
// (accept) or a skip reason. Cores are the single source of the rich per-item
// reason vocabulary, shared by the singular handlers (which lift a reject
// straight to skip(), since ItemReject ⊂ AiSkipReason) and by the bulk handlers
// (which narrow via toItemReject and accumulate). Cores assume dependency mode
// is ON where relevant — the mode guard lives in the handler wrappers
// (decision 12 / P0.0).

type CoreResult =
  | { ok: true; scenario: Scenario }
  | { ok: false; reason: AiSkipReason };

const accept = (scenario: Scenario): CoreResult => ({ ok: true, scenario });
const reject = (reason: AiSkipReason): CoreResult => ({ ok: false, reason });

/**
 * Narrow a core reason to an ItemReject for the bulk `partial` outcome. The six
 * ItemReject members pass through; anything else (would_exceed_length, the
 * whole-op reasons, etc.) is defensively mapped to `invalid` — expected
 * unreachable in the bulk paths, asserted so in unit tests (P0.1).
 */
function toItemReject(reason: AiSkipReason): ItemReject {
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

// -- Activity ops ------------------------------------------------------------

function createActivityCore(scenario: Scenario, p: CreateActivityPayload): CoreResult {
  if (scenario.activities.length >= ACTIVITY_CAP) return reject("cap_exceeded");
  if (scenario.activities.some((a) => a.id === p.id)) return reject("duplicate");

  const confidenceLevel = p.confidenceLevel ?? scenario.settings.defaultConfidenceLevel;
  // Auto-recommendation applies only at create time. recommendDistribution's
  // 4th param is rsmLevel: RSMLevel; Activity.confidenceLevel is that type.
  const distributionType =
    p.distributionType ??
    recommendDistribution(p.min, p.mostLikely, p.max, confidenceLevel).recommended;
  // logNormal PERT-mean guard: explicit CORE logic, NOT part of ActivitySchema.
  // It must travel with the extraction (the schema cannot express it).
  if (distributionType === "logNormal" && computePertMean(p.min, p.mostLikely, p.max) <= 0) {
    return reject("invalid");
  }

  const parsed = ActivitySchema.safeParse({
    id: p.id,
    name: p.name,
    min: p.min,
    mostLikely: p.mostLikely,
    max: p.max,
    confidenceLevel,
    distributionType,
    status: "planned" as const,
    checklist: [],
    deliverables: [],
    // Optional on create → coalesce (opposite of the set path, which guards).
    description: p.description?.trim() || undefined,
  });
  if (!parsed.success) return reject("invalid");
  return accept(addActivityToScenario(scenario, parsed.data));
}

function handleCreateActivity(scenario: Scenario, p: CreateActivityPayload): OpResult {
  const r = createActivityCore(scenario, p);
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

// Shared activity-update core (Phase 2). Extracted from the three singular
// handlers (handleUpdateEstimate / handleRename / handleSetDescription) so the
// 2A bulk path composes exactly the same per-item semantics. Outcome-preserving
// for the singular paths with ONE deliberate, documented exception (P2 §2 step
// 2): an empty patch (no updatable field present) now rejects `invalid` rather
// than falling through to `value_unchanged`. The three singular ops each carry a
// required field (name / description) or, for the estimate op, previously
// treated an all-absent payload as `value_unchanged`; that lone case flips.
//
// Merge-then-validate: provided fields (description normalized first) merge over
// the activity's current values; the merged activity goes through the full
// ActivitySchema parse plus the logNormal PERT-mean guard (core logic, NOT part
// of the schema — it travels with the extraction). value_unchanged is judged
// AFTER validation, over the provided fields only.
// Collect only the provided fields into an activity patch, normalizing
// description (trim; empty/whitespace → undefined = clear). `descProvided`
// distinguishes "description field present but cleared" (patch.description
// === undefined) from "description field absent" (no key) — the value-change
// comparison needs it because a clear IS a change.
function buildActivityPatch(fields: UpdateActivityFields): {
  patch: Partial<Activity>;
  descProvided: boolean;
} {
  const patch: Partial<Activity> = {};
  if (fields.name !== undefined) patch.name = fields.name;
  if (fields.min !== undefined) patch.min = fields.min;
  if (fields.mostLikely !== undefined) patch.mostLikely = fields.mostLikely;
  if (fields.max !== undefined) patch.max = fields.max;
  if (fields.confidenceLevel !== undefined) patch.confidenceLevel = fields.confidenceLevel;
  if (fields.distributionType !== undefined) patch.distributionType = fields.distributionType;
  const descProvided = fields.description !== undefined;
  if (descProvided) patch.description = fields.description!.trim() || undefined;
  return { patch, descProvided };
}

// Does applying `patch` change any provided field's value? Judged over the
// provided fields only (the singular value_unchanged rule). Description is
// special: `descProvided` with a cleared (undefined) value still counts.
function activityPatchChanges(
  activity: Activity,
  patch: Partial<Activity>,
  descProvided: boolean
): boolean {
  if (patch.name !== undefined && patch.name !== activity.name) return true;
  if (patch.min !== undefined && patch.min !== activity.min) return true;
  if (patch.mostLikely !== undefined && patch.mostLikely !== activity.mostLikely) return true;
  if (patch.max !== undefined && patch.max !== activity.max) return true;
  if (patch.confidenceLevel !== undefined && patch.confidenceLevel !== activity.confidenceLevel) {
    return true;
  }
  if (patch.distributionType !== undefined && patch.distributionType !== activity.distributionType) {
    return true;
  }
  return descProvided && (patch.description ?? undefined) !== (activity.description ?? undefined);
}

function updateActivityCore(
  scenario: Scenario,
  id: string,
  fields: UpdateActivityFields
): CoreResult {
  const activity = scenario.activities.find((a) => a.id === id);
  if (!activity) return reject("not_found");

  // Length pre-check on the RAW description (before trim), mirroring the singular
  // set-description path: over-length reads as would_exceed_length on the
  // singular path and narrows to `invalid` in the bulk path (toItemReject).
  // Unreachable in bulk (the server caps description at 2000; replace semantics).
  if (fields.description !== undefined && fields.description.length > DESCRIPTION_MAX) {
    return reject("would_exceed_length");
  }

  const { patch, descProvided } = buildActivityPatch(fields);
  // Zero updatable fields → invalid (P2 §2 step 2 / disposition 2). A cleared
  // description still populates a key, so it counts as "provided".
  if (Object.keys(patch).length === 0) return reject("invalid");

  // Merge-then-validate: the merged activity (not the fragment) goes through the
  // full ActivitySchema parse plus the logNormal PERT-mean guard.
  const parsed = ActivitySchema.safeParse({ ...activity, ...patch });
  if (!parsed.success) return reject("invalid");
  const d = parsed.data;
  if (d.distributionType === "logNormal" && computePertMean(d.min, d.mostLikely, d.max) <= 0) {
    return reject("invalid");
  }

  if (!activityPatchChanges(activity, patch, descProvided)) return reject("value_unchanged");
  // Apply the provided-field patch (spread over current leaves omitted fields
  // untouched). updateActivity invalidates simulationResults, as every singular
  // update path does today.
  return accept(updateActivity(scenario, id, patch));
}

function handleUpdateEstimate(scenario: Scenario, p: UpdateEstimatePayload): OpResult {
  const r = updateActivityCore(scenario, p.id, {
    min: p.min,
    mostLikely: p.mostLikely,
    max: p.max,
    confidenceLevel: p.confidenceLevel,
    distributionType: p.distributionType,
  });
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

function handleRename(scenario: Scenario, p: RenameActivityPayload): OpResult {
  const r = updateActivityCore(scenario, p.id, { name: p.name });
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

// Overwrite (destructive): empty string clears. Invalidates simulationResults.
function handleSetDescription(scenario: Scenario, p: SetDescriptionPayload): OpResult {
  // Presence guard (load-bearing, singular-only): ops are drained raw with no
  // client Zod, and `description` is optional on ActivitySchema, so a missing
  // field would pass safeParse. An absent field must fail, not mass-clear.
  if (typeof p.description !== "string") return skip(scenario, "invalid");
  const r = updateActivityCore(scenario, p.id, { description: p.description });
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

// -- Qualitative ops ---------------------------------------------------------

function appendNoteCore(scenario: Scenario, p: { id: string; text: string }): CoreResult {
  const activity = scenario.activities.find((a) => a.id === p.id);
  if (!activity) return reject("not_found");
  const current = activity.notes ?? "";
  const nextLength = (current ? current.length + NOTE_SEPARATOR.length : 0) + p.text.length;
  // would_exceed_length is an AiSkipReason, not an ItemReject. In the bulk
  // create path this branch is unreachable (the note lands on a freshly-created
  // activity whose notes are empty, and is ≤2000 chars); if it ever fired there
  // it would narrow to `invalid` via toItemReject. See the 1A invariant.
  if (nextLength > NOTES_MAX) return reject("would_exceed_length");
  return accept(patchActivityQualitative(scenario, p.id, { op: "appendNote", text: p.text }));
}

function handleAppendNote(scenario: Scenario, p: AppendNotePayload): OpResult {
  const r = appendNoteCore(scenario, p);
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

function classifyNewItem(
  item: { id: string; text: string },
  count: number,
  existingIds: Set<string>
): { ok: true; item: ChecklistItem } | { ok: false; reason: ItemReject } {
  if (count >= ITEM_CAP) return { ok: false, reason: "cap_exceeded" };
  if (existingIds.has(item.id)) return { ok: false, reason: "duplicate" };
  // ChecklistItemSchema and DeliverableItemSchema are structurally identical
  // ({ id, text, completed }); one validates both.
  const parsed = ChecklistItemSchema.safeParse({ id: item.id, text: item.text, completed: false });
  if (!parsed.success) return { ok: false, reason: "invalid" };
  return { ok: true, item: parsed.data };
}

function handleAddItems(
  scenario: Scenario,
  p: AddItemsPayload,
  kind: "checklist" | "deliverable"
): OpResult {
  const activity = scenario.activities.find((a) => a.id === p.id);
  if (!activity) return skip(scenario, "not_found");

  const existing = (kind === "checklist" ? activity.checklist : activity.deliverables) ?? [];
  const existingIds = new Set(existing.map((it) => it.id));
  const accepted: ChecklistItem[] = [];
  const skippedItems: Array<{ index: number; reason: ItemReject }> = [];

  p.items.forEach((item, index) => {
    const r = classifyNewItem(item, existing.length + accepted.length, existingIds);
    if (r.ok) {
      accepted.push(r.item);
      existingIds.add(r.item.id);
    } else {
      skippedItems.push({ index, reason: r.reason });
    }
  });

  if (accepted.length === 0) {
    return { scenario, outcome: { status: "partial", appliedCount: 0, skippedItems } };
  }
  const patch: QualitativePatch =
    kind === "checklist"
      ? { op: "addChecklistItems", items: accepted }
      : { op: "addDeliverableItems", items: accepted };
  const next = patchActivityQualitative(scenario, p.id, patch);
  return skippedItems.length === 0
    ? applied(next)
    : { scenario: next, outcome: { status: "partial", appliedCount: accepted.length, skippedItems } };
}

function handleToggleItem(
  scenario: Scenario,
  p: ToggleItemPayload,
  kind: "checklist" | "deliverable"
): OpResult {
  const activity = scenario.activities.find((a) => a.id === p.id);
  if (!activity) return skip(scenario, "not_found");
  const items = (kind === "checklist" ? activity.checklist : activity.deliverables) ?? [];
  const item = items.find((it) => it.id === p.itemId);
  if (!item) return skip(scenario, "not_found");
  if (item.completed === p.completed) return skip(scenario, "value_unchanged");
  const patch: QualitativePatch =
    kind === "checklist"
      ? { op: "toggleChecklistItem", itemId: p.itemId, completed: p.completed }
      : { op: "toggleDeliverableItem", itemId: p.itemId, completed: p.completed };
  return applied(patchActivityQualitative(scenario, p.id, patch));
}

// -- Milestone ops -----------------------------------------------------------

function createMilestoneCore(scenario: Scenario, p: CreateMilestonePayload): CoreResult {
  if (scenario.milestones.length >= MILESTONE_CAP) return reject("cap_exceeded");
  if (scenario.milestones.some((m) => m.id === p.id)) return reject("duplicate");
  const parsed = MilestoneSchema.safeParse({ id: p.id, name: p.name, targetDate: p.targetDate });
  if (!parsed.success) return reject("invalid");
  return accept(addMilestone(scenario, parsed.data.name, parsed.data.targetDate, parsed.data.id));
}

function handleCreateMilestone(scenario: Scenario, p: CreateMilestonePayload): OpResult {
  const r = createMilestoneCore(scenario, p);
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

function handleUpdateMilestone(scenario: Scenario, p: UpdateMilestonePayload): OpResult {
  const milestone = scenario.milestones.find((m) => m.id === p.id);
  if (!milestone) return skip(scenario, "not_found");
  const merged = {
    ...milestone,
    ...(p.name !== undefined ? { name: p.name } : {}),
    ...(p.targetDate !== undefined ? { targetDate: p.targetDate } : {}),
  };
  const parsed = MilestoneSchema.safeParse(merged);
  if (!parsed.success) return skip(scenario, "invalid");
  if (parsed.data.name === milestone.name && parsed.data.targetDate === milestone.targetDate) {
    return skip(scenario, "value_unchanged");
  }
  const next = updateMilestone(scenario, p.id, {
    name: parsed.data.name,
    targetDate: parsed.data.targetDate,
  });
  // Ref-equality backstop over the Unit-1-hardened transform.
  return next === scenario ? skip(scenario, "unknown_noop") : applied(next);
}

function assignMilestoneCore(
  scenario: Scenario,
  activityId: string,
  milestoneId: string
): CoreResult {
  const activity = scenario.activities.find((a) => a.id === activityId);
  if (!activity) return reject("not_found");
  if (!scenario.milestones.some((m) => m.id === milestoneId)) return reject("not_found");
  const next = assignActivityToMilestone(scenario, activityId, milestoneId);
  return next === scenario ? reject("value_unchanged") : accept(next);
}

function handleAssign(scenario: Scenario, p: AssignMilestonePayload, assign: boolean): OpResult {
  if (assign) {
    const milestoneId = p.milestoneId ?? null;
    // A null/absent target can only be not_found. Pre-extraction the activity
    // was checked first, then the milestone; either missing yielded not_found,
    // so collapsing the null case here is outcome-preserving.
    if (milestoneId === null) return skip(scenario, "not_found");
    const r = assignMilestoneCore(scenario, p.activityId, milestoneId);
    return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
  }
  // Unassign path: no shared core (the bulk surface has no unassign tool).
  const activity = scenario.activities.find((a) => a.id === p.activityId);
  if (!activity) return skip(scenario, "not_found");
  const next = assignActivityToMilestone(scenario, p.activityId, null);
  return next === scenario ? skip(scenario, "value_unchanged") : applied(next);
}

// -- Dependency ops (Read Mode + dependencyMode gated) -----------------------

function createDependencyCore(scenario: Scenario, p: CreateDependencyPayload): CoreResult {
  // Cores assume dependency mode is ON (the wrapper guards it — decision 12).
  // P0.4 cap: before this guard the singular path had no cap check and applied
  // the 2001st edge in memory; a per-item cap_exceeded skip past the limit.
  if (scenario.dependencies.length >= DEPENDENCY_CAP) return reject("cap_exceeded");
  const ids = scenario.activities.map((a) => a.id);
  const idSet = new Set(ids);
  if (!idSet.has(p.fromActivityId) || !idSet.has(p.toActivityId)) return reject("not_found");
  if (p.fromActivityId === p.toActivityId) return reject("invalid");
  if (
    scenario.dependencies.some(
      (d) => d.fromActivityId === p.fromActivityId && d.toActivityId === p.toActivityId
    )
  ) {
    return reject("duplicate");
  }
  const type = p.type ?? "FS";
  const lagDays = p.lagDays ?? 0;
  // detectCycle runs on the UNION of the existing deps and the trial edge, so an
  // edge can be `cycle` even when the submitted set alone is acyclic. In a bulk
  // call array order therefore decides WHICH edges of a cyclic union skip.
  const trial = [
    ...scenario.dependencies,
    { fromActivityId: p.fromActivityId, toActivityId: p.toActivityId, type, lagDays },
  ];
  if (detectCycle(ids, trial)) return reject("cycle");
  const next = addDependency(scenario, p.fromActivityId, p.toActivityId, type, lagDays);
  return next === scenario ? reject("unknown_noop") : accept(next);
}

function handleCreateDependency(scenario: Scenario, p: CreateDependencyPayload): OpResult {
  if (!(scenario.settings.dependencyMode ?? false)) return skip(scenario, "dependency_mode_off");
  const r = createDependencyCore(scenario, p);
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

function handleRemoveDependency(scenario: Scenario, p: RemoveDependencyPayload): OpResult {
  if (!(scenario.settings.dependencyMode ?? false)) return skip(scenario, "dependency_mode_off");
  const next = removeDependency(scenario, p.fromActivityId, p.toActivityId);
  return next === scenario ? skip(scenario, "not_found") : applied(next);
}

function handleUpdateDependency(scenario: Scenario, p: UpdateDependencyPayload): OpResult {
  if (!(scenario.settings.dependencyMode ?? false)) return skip(scenario, "dependency_mode_off");
  // Explicit existence check — the sub-transforms cannot distinguish
  // "pair absent" from "pair present, values match" (both ref-equal).
  const exists = scenario.dependencies.some(
    (d) => d.fromActivityId === p.fromActivityId && d.toActivityId === p.toActivityId
  );
  if (!exists) return skip(scenario, "not_found");
  if (p.lagDays === undefined && p.type === undefined) return skip(scenario, "invalid");
  let next = scenario;
  if (p.lagDays !== undefined) {
    next = updateDependencyLag(next, p.fromActivityId, p.toActivityId, p.lagDays);
  }
  if (p.type !== undefined) {
    next = updateDependencyType(next, p.fromActivityId, p.toActivityId, p.type);
  }
  return next === scenario ? skip(scenario, "value_unchanged") : applied(next);
}

// -- Bulk ops (Phase 1) ------------------------------------------------------
// Each single-array bulk handler runs the shared item cores in array order and
// accumulates one `partial` outcome. Per F3-3, zero skips collapse to
// `{status:"applied"}` (the handleAddItems precedent); `partial` appears only
// when at least one item skipped. `sections` is composite-only (Phase 2) and
// never set here. Structural parsing runs once at the dispatcher boundary
// (P0.0 step 1) before any of these; here every item is shape-valid.

function bulkOutcome(appliedCount: number, skippedItems: SkippedItem[]): AiOpOutcome {
  return skippedItems.length === 0
    ? { status: "applied" }
    : { status: "partial", appliedCount, skippedItems };
}

function handleBulkCreateActivities(scenario: Scenario, p: BulkCreateActivitiesPayload): OpResult {
  let scn = scenario;
  const skippedItems: SkippedItem[] = [];
  let appliedCount = 0;
  p.activities.forEach((item, index) => {
    const r = createActivityCore(scn, item);
    if (!r.ok) {
      skippedItems.push({ index, id: item.id, reason: toItemReject(r.reason) });
      return;
    }
    scn = r.scenario;
    appliedCount++;
    // Bulk-only: seed an initial note AFTER the create applied (composing two
    // cores). A per-item create skip above suppresses it; whitespace-only notes
    // are dropped silently. The append cannot exceed length on a fresh,
    // empty-notes activity (the 1A invariant), so an (unreachable) failure here
    // is dropped without reverting the create or marking the item skipped.
    const note = item.note?.trim();
    if (note) {
      const nr = appendNoteCore(scn, { id: item.id, text: note });
      if (nr.ok) scn = nr.scenario;
    }
  });
  return { scenario: scn, outcome: bulkOutcome(appliedCount, skippedItems) };
}

function handleBulkCreateDependencies(
  scenario: Scenario,
  p: BulkCreateDependenciesPayload
): OpResult {
  // Mode guard in the wrapper (decision 12 / P0.0): OFF → whole-op skip with no
  // per-item results. The core assumes mode on and never returns this reason.
  if (!(scenario.settings.dependencyMode ?? false)) return skip(scenario, "dependency_mode_off");
  let scn = scenario;
  const skippedItems: SkippedItem[] = [];
  let appliedCount = 0;
  p.dependencies.forEach((item, index) => {
    const r = createDependencyCore(scn, item);
    if (!r.ok) {
      skippedItems.push({
        index,
        id: `${item.fromActivityId}->${item.toActivityId}`,
        reason: toItemReject(r.reason),
      });
    } else {
      scn = r.scenario;
      appliedCount++;
    }
  });
  return { scenario: scn, outcome: bulkOutcome(appliedCount, skippedItems) };
}

function handleBulkCreateMilestones(scenario: Scenario, p: BulkCreateMilestonesPayload): OpResult {
  let scn = scenario;
  const skippedItems: SkippedItem[] = [];
  let appliedCount = 0;
  p.milestones.forEach((item, index) => {
    const r = createMilestoneCore(scn, item);
    if (!r.ok) {
      skippedItems.push({ index, id: item.id, reason: toItemReject(r.reason) });
    } else {
      scn = r.scenario;
      appliedCount++;
    }
  });
  return { scenario: scn, outcome: bulkOutcome(appliedCount, skippedItems) };
}

function handleBulkAssignMilestones(scenario: Scenario, p: BulkAssignMilestonesPayload): OpResult {
  let scn = scenario;
  const skippedItems: SkippedItem[] = [];
  let appliedCount = 0;
  // Repeated activityId entries apply last-wins: a later entry re-assigning the
  // same activity to the same milestone reads as value_unchanged against the
  // intermediate state (stated in the tool description).
  p.assignments.forEach((item, index) => {
    const r = assignMilestoneCore(scn, item.activityId, item.milestoneId);
    if (!r.ok) {
      skippedItems.push({ index, id: item.activityId, reason: toItemReject(r.reason) });
    } else {
      scn = r.scenario;
      appliedCount++;
    }
  });
  return { scenario: scn, outcome: bulkOutcome(appliedCount, skippedItems) };
}

// -- Bulk ops (Phase 2) ------------------------------------------------------

function handleBulkUpdateActivities(scenario: Scenario, p: BulkUpdateActivitiesPayload): OpResult {
  let scn = scenario;
  const skippedItems: SkippedItem[] = [];
  let appliedCount = 0;
  // Repeated ids apply sequentially: a later entry merges against the state the
  // earlier one produced, and value_unchanged is judged against that
  // intermediate state (stated in the tool description).
  p.updates.forEach((item, index) => {
    const { id, ...fields } = item;
    const r = updateActivityCore(scn, id, fields);
    if (!r.ok) {
      skippedItems.push({ index, id, reason: toItemReject(r.reason) });
    } else {
      scn = r.scenario;
      appliedCount++;
    }
  });
  return { scenario: scn, outcome: bulkOutcome(appliedCount, skippedItems) };
}

// Compose create + optional initial note for the composite import's activities
// section. The note is suppressed when the create skips; an (unreachable) note
// failure on a fresh, empty-notes activity keeps the create applied (the 1A
// invariant). Extracted so handleBulkImportSchedule stays a flat orchestration.
function importActivityWithNote(scenario: Scenario, item: BulkActivityItem): CoreResult {
  const r = createActivityCore(scenario, item);
  if (!r.ok) return r;
  const note = item.note?.trim();
  if (!note) return r;
  const nr = appendNoteCore(r.scenario, { id: item.id, text: note });
  return nr.ok ? nr : r;
}

// Fold one composite-import section through a core, tagging each skip with its
// section and section-local index. The evolving `scn` is what makes cascades
// emergent: an absent-implying skip (invalid/cap_exceeded) never enters `scn`,
// so a later section's dependent resolves to not_found on its own.
function runImportSection<T>(
  scn: Scenario,
  section: BulkSection,
  items: T[],
  apply: (scenario: Scenario, item: T) => CoreResult,
  idOf: (item: T) => string,
  skippedItems: SkippedItem[]
): { scenario: Scenario; count: SectionCount } {
  let applied = 0;
  let skipped = 0;
  items.forEach((item, index) => {
    const r = apply(scn, item);
    if (!r.ok) {
      skippedItems.push({ index, id: idOf(item), reason: toItemReject(r.reason), section });
      skipped++;
    } else {
      scn = r.scenario;
      applied++;
    }
  });
  return { scenario: scn, count: { applied, skipped } };
}

// Composite import (2B): apply up to four sections to ONE scenario in a fixed
// order, delegating each item to its live Phase-1 core. All-or-nothing at BOTH
// gates is enforced upstream (server queue-time refusal) and here (drain-time
// whole-op discards); per-item outcomes aggregate into one `partial`.
function handleBulkImportSchedule(scenario: Scenario, p: BulkImportSchedulePayload): OpResult {
  const activities = p.activities ?? [];
  const milestones = p.milestones ?? [];
  const assignments = p.assignments ?? [];
  const dependencies = p.dependencies ?? [];

  // Drain-time defensive floor (P2 §3, disposition 9): an all-empty composite is
  // a server-bug-only state — the server's empty_import inline check refuses it
  // at queue time. Floor to whole-op invalid; never a false "Applied".
  const totalItems =
    activities.length + milestones.length + assignments.length + dependencies.length;
  if (totalItems === 0) return skip(scenario, "invalid");

  // Drain-time whole-op discard (locked): dependencies present but the scenario
  // toggled dependency mode off between queue and drain → ALL sections
  // discarded with a single dependency_mode_off row. No half-imports.
  if (dependencies.length > 0 && !(scenario.settings.dependencyMode ?? false)) {
    return skip(scenario, "dependency_mode_off");
  }

  let scn = scenario;
  const skippedItems: SkippedItem[] = [];
  const sections: BulkSectionCounts = {};
  let appliedCount = 0;

  if (activities.length > 0) {
    const res = runImportSection(
      scn, "activities", activities, importActivityWithNote, (i) => i.id, skippedItems
    );
    scn = res.scenario;
    sections.activities = res.count;
    appliedCount += res.count.applied;
  }
  if (milestones.length > 0) {
    const res = runImportSection(
      scn, "milestones", milestones, (s, i) => createMilestoneCore(s, i), (i) => i.id, skippedItems
    );
    scn = res.scenario;
    sections.milestones = res.count;
    appliedCount += res.count.applied;
  }
  if (assignments.length > 0) {
    const res = runImportSection(
      scn, "assignments", assignments,
      (s, i) => assignMilestoneCore(s, i.activityId, i.milestoneId),
      (i) => i.activityId, skippedItems
    );
    scn = res.scenario;
    sections.assignments = res.count;
    appliedCount += res.count.applied;
  }
  if (dependencies.length > 0) {
    // Mode guarded above; the core assumes dependency mode is on.
    const res = runImportSection(
      scn, "dependencies", dependencies, (s, i) => createDependencyCore(s, i),
      (i) => `${i.fromActivityId}->${i.toActivityId}`, skippedItems
    );
    scn = res.scenario;
    sections.dependencies = res.count;
    appliedCount += res.count.applied;
  }

  if (skippedItems.length === 0) return applied(scn);
  return { scenario: scn, outcome: { status: "partial", appliedCount, skippedItems, sections } };
}

// -- Dispatcher --------------------------------------------------------------

export function applyAiOpToScenario(scenario: Scenario, op: AiOp): OpResult {
  switch (op.op) {
    case "create_activity":
      return handleCreateActivity(scenario, op.payload);
    case "update_activity_estimate":
      return handleUpdateEstimate(scenario, op.payload);
    case "rename_activity":
      return handleRename(scenario, op.payload);
    case "set_activity_description":
      return handleSetDescription(scenario, op.payload);
    case "append_activity_note":
      return handleAppendNote(scenario, op.payload);
    case "add_checklist_items":
      return handleAddItems(scenario, op.payload, "checklist");
    case "add_deliverable_items":
      return handleAddItems(scenario, op.payload, "deliverable");
    case "toggle_checklist_item":
      return handleToggleItem(scenario, op.payload, "checklist");
    case "toggle_deliverable_item":
      return handleToggleItem(scenario, op.payload, "deliverable");
    case "create_milestone":
      return handleCreateMilestone(scenario, op.payload);
    case "update_milestone":
      return handleUpdateMilestone(scenario, op.payload);
    case "assign_milestone":
      return handleAssign(scenario, op.payload, true);
    case "unassign_milestone":
      return handleAssign(scenario, op.payload, false);
    case "create_dependency":
      return handleCreateDependency(scenario, op.payload);
    case "remove_dependency":
      return handleRemoveDependency(scenario, op.payload);
    case "update_dependency":
      return handleUpdateDependency(scenario, op.payload);
    // Bulk ops (Phase 1): structural parse first (P0.0 step 1) — a whole-payload
    // shape failure is the only path to a whole-op `invalid` (decision 9). The
    // cast bridges the structural (string-enum) parse to the domain-typed
    // payload; enum values are re-validated per item in the cores.
    case "bulk_create_activities": {
      const parsed = BulkCreateActivitiesSchema.safeParse(op.payload);
      if (!parsed.success) return skip(scenario, "invalid");
      return handleBulkCreateActivities(scenario, parsed.data as BulkCreateActivitiesPayload);
    }
    case "bulk_create_dependencies": {
      const parsed = BulkCreateDependenciesSchema.safeParse(op.payload);
      if (!parsed.success) return skip(scenario, "invalid");
      return handleBulkCreateDependencies(scenario, parsed.data as BulkCreateDependenciesPayload);
    }
    case "bulk_create_milestones": {
      const parsed = BulkCreateMilestonesSchema.safeParse(op.payload);
      if (!parsed.success) return skip(scenario, "invalid");
      return handleBulkCreateMilestones(scenario, parsed.data as BulkCreateMilestonesPayload);
    }
    case "bulk_assign_milestones": {
      const parsed = BulkAssignMilestonesSchema.safeParse(op.payload);
      if (!parsed.success) return skip(scenario, "invalid");
      return handleBulkAssignMilestones(scenario, parsed.data as BulkAssignMilestonesPayload);
    }
    // Bulk ops (Phase 2): same structural-parse-first discipline. 2A composes
    // the extracted updateActivityCore; 2B (bulk_import_schedule) orchestrates
    // the shipped cores across four sections with a drain-time whole-op discard.
    case "bulk_update_activities": {
      const parsed = BulkUpdateActivitiesSchema.safeParse(op.payload);
      if (!parsed.success) return skip(scenario, "invalid");
      return handleBulkUpdateActivities(scenario, parsed.data as BulkUpdateActivitiesPayload);
    }
    case "bulk_import_schedule": {
      const parsed = BulkImportScheduleSchema.safeParse(op.payload);
      if (!parsed.success) return skip(scenario, "invalid");
      return handleBulkImportSchedule(scenario, parsed.data as BulkImportSchedulePayload);
    }
    default:
      // Unreachable for well-typed input; a defensive floor for a malformed
      // op string drained from Firestore.
      return skip(scenario, "unknown_op");
  }
}

// -- Project-level application ------------------------------------------------

function applyOpsToOneScenario(
  scenario: Scenario,
  targetOps: AiOp[],
  results: AiOpResult[]
): Scenario {
  return targetOps.reduce((acc, op) => {
    try {
      const { scenario: next, outcome } = applyAiOpToScenario(acc, op);
      results.push({ op, outcome });
      return next;
    } catch (err) {
      console.error("[AI] op handler threw unexpectedly — treating as no-op", op, err);
      results.push({ op, outcome: { status: "skipped", reason: "invalid" } });
      return acc;
    }
  }, scenario);
}

function recordUntargetedOps(
  project: Project,
  ops: AiOp[],
  openScenarioId: string | null,
  results: AiOpResult[]
): void {
  const targetedIds = new Set(project.scenarios.map((s) => s.id));
  for (const op of ops) {
    const resolved = op.payload.scenarioId ?? openScenarioId;
    if (resolved == null) {
      results.push({ op, outcome: { status: "skipped", reason: "no_open_scenario" } });
    } else if (!targetedIds.has(resolved)) {
      results.push({ op, outcome: { status: "skipped", reason: "not_found" } });
    }
  }
}

/**
 * Apply a batch of AI operations to a project. Pure: returns a new project (or
 * the same reference if nothing changed) plus a per-op result list. Ops are
 * routed to their target scenario (`payload.scenarioId ?? openScenarioId`);
 * locked scenarios reject their ops; ops with no resolvable/known scenario are
 * recorded, not dropped. Results are sorted by `op.seq`.
 */
export function applyAiOpsToProject(
  project: Project,
  ops: AiOp[],
  openScenarioId: string | null
): { project: Project; results: AiOpResult[] } {
  const results: AiOpResult[] = [];
  let changed = false;

  const nextScenarios = project.scenarios.map((s) => {
    const targetOps = ops.filter((op) => (op.payload.scenarioId ?? openScenarioId) === s.id);
    if (targetOps.length === 0) return s;
    if (s.locked) {
      for (const op of targetOps) {
        results.push({ op, outcome: { status: "skipped", reason: "locked" } });
      }
      return s;
    }
    const next = applyOpsToOneScenario(s, targetOps, results);
    if (next !== s) changed = true;
    return next;
  });

  recordUntargetedOps(project, ops, openScenarioId, results);
  results.sort((a, b) => a.op.seq - b.op.seq);

  return { project: changed ? { ...project, scenarios: nextScenarios } : project, results };
}
