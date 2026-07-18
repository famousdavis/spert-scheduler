// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

// -- Singular AI op handlers + shared item-level cores -----------------------
// One section per op family (activity / qualitative / milestone / dependency).
// The exported cores are composed by the bulk handlers (ai-bulk-handlers.ts);
// the exported handle* functions are called by the ai-batch-service dispatcher.

import type { Scenario, Activity, ChecklistItem } from "@domain/models/types";
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
  type CreateActivityPayload,
  type UpdateEstimatePayload,
  type RenameActivityPayload,
  type SetDescriptionPayload,
  type AppendNotePayload,
  type AddItemsPayload,
  type ToggleItemPayload,
  type CreateMilestonePayload,
  type UpdateMilestonePayload,
  type AssignMilestonePayload,
  type CreateDependencyPayload,
  type RemoveDependencyPayload,
  type UpdateDependencyPayload,
  type UpdateActivityFields,
  type ItemReject,
  type OpResult,
  type CoreResult,
  skip,
  applied,
  accept,
  reject,
} from "./ai-op-types";

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

// -- Shared item-level cores -------------------------------------------------
// A core applies ONE item to a scenario and returns either the next scenario
// (accept) or a skip reason. Cores are the single source of the rich per-item
// reason vocabulary, shared by the singular handlers (which lift a reject
// straight to skip(), since ItemReject ⊂ AiSkipReason) and by the bulk handlers
// (which narrow via toItemReject and accumulate). Cores assume dependency mode
// is ON where relevant — the mode guard lives in the handler wrappers
// (decision 12 / P0.0).

// -- Activity ops ------------------------------------------------------------

export function createActivityCore(scenario: Scenario, p: CreateActivityPayload): CoreResult {
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

export function handleCreateActivity(scenario: Scenario, p: CreateActivityPayload): OpResult {
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

export function updateActivityCore(
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

export function handleUpdateEstimate(scenario: Scenario, p: UpdateEstimatePayload): OpResult {
  const r = updateActivityCore(scenario, p.id, {
    min: p.min,
    mostLikely: p.mostLikely,
    max: p.max,
    confidenceLevel: p.confidenceLevel,
    distributionType: p.distributionType,
  });
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

export function handleRename(scenario: Scenario, p: RenameActivityPayload): OpResult {
  const r = updateActivityCore(scenario, p.id, { name: p.name });
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

// Overwrite (destructive): empty string clears. Invalidates simulationResults.
export function handleSetDescription(scenario: Scenario, p: SetDescriptionPayload): OpResult {
  // Presence guard (load-bearing, singular-only): ops are drained raw with no
  // client Zod, and `description` is optional on ActivitySchema, so a missing
  // field would pass safeParse. An absent field must fail, not mass-clear.
  if (typeof p.description !== "string") return skip(scenario, "invalid");
  const r = updateActivityCore(scenario, p.id, { description: p.description });
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

// -- Qualitative ops ---------------------------------------------------------

export function appendNoteCore(scenario: Scenario, p: { id: string; text: string }): CoreResult {
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

export function handleAppendNote(scenario: Scenario, p: AppendNotePayload): OpResult {
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

export function handleAddItems(
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

export function handleToggleItem(
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

export function createMilestoneCore(scenario: Scenario, p: CreateMilestonePayload): CoreResult {
  if (scenario.milestones.length >= MILESTONE_CAP) return reject("cap_exceeded");
  if (scenario.milestones.some((m) => m.id === p.id)) return reject("duplicate");
  const parsed = MilestoneSchema.safeParse({ id: p.id, name: p.name, targetDate: p.targetDate });
  if (!parsed.success) return reject("invalid");
  return accept(addMilestone(scenario, parsed.data.name, parsed.data.targetDate, parsed.data.id));
}

export function handleCreateMilestone(scenario: Scenario, p: CreateMilestonePayload): OpResult {
  const r = createMilestoneCore(scenario, p);
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

export function handleUpdateMilestone(scenario: Scenario, p: UpdateMilestonePayload): OpResult {
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

export function assignMilestoneCore(
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

export function handleAssign(
  scenario: Scenario,
  p: AssignMilestonePayload,
  assign: boolean
): OpResult {
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

export function createDependencyCore(scenario: Scenario, p: CreateDependencyPayload): CoreResult {
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

export function handleCreateDependency(scenario: Scenario, p: CreateDependencyPayload): OpResult {
  if (!(scenario.settings.dependencyMode ?? false)) return skip(scenario, "dependency_mode_off");
  const r = createDependencyCore(scenario, p);
  return r.ok ? applied(r.scenario) : skip(scenario, r.reason);
}

export function handleRemoveDependency(scenario: Scenario, p: RemoveDependencyPayload): OpResult {
  if (!(scenario.settings.dependencyMode ?? false)) return skip(scenario, "dependency_mode_off");
  const next = removeDependency(scenario, p.fromActivityId, p.toActivityId);
  return next === scenario ? skip(scenario, "not_found") : applied(next);
}

export function handleUpdateDependency(scenario: Scenario, p: UpdateDependencyPayload): OpResult {
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
