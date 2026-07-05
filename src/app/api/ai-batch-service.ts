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

// -- Caps (mirror the Zod schema `.max()` constraints) -----------------------

const ACTIVITY_CAP = 500;
const MILESTONE_CAP = 100;
const ITEM_CAP = 50;
const NOTES_MAX = 2000;
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

export type AiOp =
  | { seq: number; op: "create_activity"; payload: CreateActivityPayload }
  | { seq: number; op: "update_activity_estimate"; payload: UpdateEstimatePayload }
  | { seq: number; op: "rename_activity"; payload: RenameActivityPayload }
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
  | { seq: number; op: "update_dependency"; payload: UpdateDependencyPayload };

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
  | "unknown_noop"
  | "unknown_op";

type ItemReject = "cap_exceeded" | "invalid" | "duplicate";

export type AiOpOutcome =
  | { status: "applied" }
  | { status: "skipped"; reason: AiSkipReason }
  | {
      status: "partial";
      appliedCount: number;
      skippedItems: Array<{ index: number; reason: ItemReject }>;
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

// -- Activity ops ------------------------------------------------------------

function handleCreateActivity(scenario: Scenario, p: CreateActivityPayload): OpResult {
  if (scenario.activities.length >= ACTIVITY_CAP) return skip(scenario, "cap_exceeded");
  if (scenario.activities.some((a) => a.id === p.id)) return skip(scenario, "duplicate");

  const confidenceLevel = p.confidenceLevel ?? scenario.settings.defaultConfidenceLevel;
  // Auto-recommendation applies only at create time. recommendDistribution's
  // 4th param is rsmLevel: RSMLevel; Activity.confidenceLevel is that type.
  const distributionType =
    p.distributionType ??
    recommendDistribution(p.min, p.mostLikely, p.max, confidenceLevel).recommended;
  if (distributionType === "logNormal" && computePertMean(p.min, p.mostLikely, p.max) <= 0) {
    return skip(scenario, "invalid");
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
  });
  if (!parsed.success) return skip(scenario, "invalid");
  return applied(addActivityToScenario(scenario, parsed.data));
}

function mergeEstimateFields(activity: Activity, p: UpdateEstimatePayload): Activity {
  const merged = { ...activity };
  if (p.min !== undefined) merged.min = p.min;
  if (p.mostLikely !== undefined) merged.mostLikely = p.mostLikely;
  if (p.max !== undefined) merged.max = p.max;
  if (p.confidenceLevel !== undefined) merged.confidenceLevel = p.confidenceLevel;
  if (p.distributionType !== undefined) merged.distributionType = p.distributionType;
  return merged;
}

function estimateChanged(activity: Activity, p: UpdateEstimatePayload): boolean {
  if (p.min !== undefined && p.min !== activity.min) return true;
  if (p.mostLikely !== undefined && p.mostLikely !== activity.mostLikely) return true;
  if (p.max !== undefined && p.max !== activity.max) return true;
  if (p.confidenceLevel !== undefined && p.confidenceLevel !== activity.confidenceLevel) return true;
  if (p.distributionType !== undefined && p.distributionType !== activity.distributionType) return true;
  return false;
}

function handleUpdateEstimate(scenario: Scenario, p: UpdateEstimatePayload): OpResult {
  const activity = scenario.activities.find((a) => a.id === p.id);
  if (!activity) return skip(scenario, "not_found");

  const parsed = ActivitySchema.safeParse(mergeEstimateFields(activity, p));
  if (!parsed.success) return skip(scenario, "invalid");
  const d = parsed.data;
  if (d.distributionType === "logNormal" && computePertMean(d.min, d.mostLikely, d.max) <= 0) {
    return skip(scenario, "invalid");
  }
  if (!estimateChanged(activity, p)) return skip(scenario, "value_unchanged");
  return applied(
    updateActivity(scenario, p.id, {
      min: d.min,
      mostLikely: d.mostLikely,
      max: d.max,
      confidenceLevel: d.confidenceLevel,
      distributionType: d.distributionType,
    })
  );
}

function handleRename(scenario: Scenario, p: RenameActivityPayload): OpResult {
  const activity = scenario.activities.find((a) => a.id === p.id);
  if (!activity) return skip(scenario, "not_found");
  const parsed = ActivitySchema.safeParse({ ...activity, name: p.name });
  if (!parsed.success) return skip(scenario, "invalid");
  if (parsed.data.name === activity.name) return skip(scenario, "value_unchanged");
  return applied(updateActivity(scenario, p.id, { name: parsed.data.name }));
}

// -- Qualitative ops ---------------------------------------------------------

function handleAppendNote(scenario: Scenario, p: AppendNotePayload): OpResult {
  const activity = scenario.activities.find((a) => a.id === p.id);
  if (!activity) return skip(scenario, "not_found");
  const current = activity.notes ?? "";
  const nextLength = (current ? current.length + NOTE_SEPARATOR.length : 0) + p.text.length;
  if (nextLength > NOTES_MAX) return skip(scenario, "would_exceed_length");
  return applied(patchActivityQualitative(scenario, p.id, { op: "appendNote", text: p.text }));
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

function handleCreateMilestone(scenario: Scenario, p: CreateMilestonePayload): OpResult {
  if (scenario.milestones.length >= MILESTONE_CAP) return skip(scenario, "cap_exceeded");
  if (scenario.milestones.some((m) => m.id === p.id)) return skip(scenario, "duplicate");
  const parsed = MilestoneSchema.safeParse({ id: p.id, name: p.name, targetDate: p.targetDate });
  if (!parsed.success) return skip(scenario, "invalid");
  return applied(addMilestone(scenario, parsed.data.name, parsed.data.targetDate, parsed.data.id));
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

function handleAssign(scenario: Scenario, p: AssignMilestonePayload, assign: boolean): OpResult {
  const activity = scenario.activities.find((a) => a.id === p.activityId);
  if (!activity) return skip(scenario, "not_found");
  const milestoneId = assign ? p.milestoneId ?? null : null;
  if (assign && (milestoneId === null || !scenario.milestones.some((m) => m.id === milestoneId))) {
    return skip(scenario, "not_found");
  }
  const next = assignActivityToMilestone(scenario, p.activityId, milestoneId);
  return next === scenario ? skip(scenario, "value_unchanged") : applied(next);
}

// -- Dependency ops (Read Mode + dependencyMode gated) -----------------------

function handleCreateDependency(scenario: Scenario, p: CreateDependencyPayload): OpResult {
  if (!(scenario.settings.dependencyMode ?? false)) return skip(scenario, "dependency_mode_off");
  const ids = scenario.activities.map((a) => a.id);
  const idSet = new Set(ids);
  if (!idSet.has(p.fromActivityId) || !idSet.has(p.toActivityId)) return skip(scenario, "not_found");
  if (p.fromActivityId === p.toActivityId) return skip(scenario, "invalid");
  if (
    scenario.dependencies.some(
      (d) => d.fromActivityId === p.fromActivityId && d.toActivityId === p.toActivityId
    )
  ) {
    return skip(scenario, "duplicate");
  }
  const type = p.type ?? "FS";
  const lagDays = p.lagDays ?? 0;
  const trial = [
    ...scenario.dependencies,
    { fromActivityId: p.fromActivityId, toActivityId: p.toActivityId, type, lagDays },
  ];
  if (detectCycle(ids, trial)) return skip(scenario, "cycle");
  const next = addDependency(scenario, p.fromActivityId, p.toActivityId, type, lagDays);
  return next === scenario ? skip(scenario, "unknown_noop") : applied(next);
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

// -- Dispatcher --------------------------------------------------------------

export function applyAiOpToScenario(scenario: Scenario, op: AiOp): OpResult {
  switch (op.op) {
    case "create_activity":
      return handleCreateActivity(scenario, op.payload);
    case "update_activity_estimate":
      return handleUpdateEstimate(scenario, op.payload);
    case "rename_activity":
      return handleRename(scenario, op.payload);
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
