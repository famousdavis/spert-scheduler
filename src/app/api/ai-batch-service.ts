// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

// -- AI batch service (public entry point) -----------------------------------
// Dispatches drained AI ops to their handlers and applies a batch to a project.
// The module family:
//   ai-op-types.ts     — op/payload/outcome contract + result constructors
//   ai-op-handlers.ts  — singular handlers + the shared item-level cores
//   ai-bulk-handlers.ts — bulk / composite-import / reorder handlers
// Consumers import ONLY from this module; the public surface (applyAiOpsToProject
// plus the contract types re-exported below) is unchanged by the split.

import type { Project, Scenario } from "@domain/models/types";
import {
  BulkCreateActivitiesSchema,
  BulkCreateDependenciesSchema,
  BulkCreateMilestonesSchema,
  BulkAssignMilestonesSchema,
  BulkUpdateActivitiesSchema,
  BulkImportScheduleSchema,
  ReorderActivitiesSchema,
} from "./ai-bulk-schemas";
import {
  type AiOp,
  type AiOpResult,
  type OpResult,
  type BulkCreateActivitiesPayload,
  type BulkCreateDependenciesPayload,
  type BulkCreateMilestonesPayload,
  type BulkAssignMilestonesPayload,
  type BulkUpdateActivitiesPayload,
  type BulkImportSchedulePayload,
  type ReorderActivitiesPayload,
  skip,
} from "./ai-op-types";
import {
  handleCreateActivity,
  handleUpdateEstimate,
  handleRename,
  handleSetDescription,
  handleAppendNote,
  handleAddItems,
  handleToggleItem,
  handleCreateMilestone,
  handleUpdateMilestone,
  handleAssign,
  handleCreateDependency,
  handleRemoveDependency,
  handleUpdateDependency,
} from "./ai-op-handlers";
import {
  handleBulkCreateActivities,
  handleBulkCreateDependencies,
  handleBulkCreateMilestones,
  handleBulkAssignMilestones,
  handleBulkUpdateActivities,
  handleBulkImportSchedule,
  handleReorderActivities,
} from "./ai-bulk-handlers";

export type {
  AiOp,
  AiSkipReason,
  ItemReject,
  BulkSection,
  SkippedItem,
  BulkSectionCounts,
  AiOpOutcome,
  AiOpResult,
} from "./ai-op-types";

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
    // Reorder (Phase 3): structural parse (array of ≥2 strings) → whole-op
    // invalid on shape failure; the handler owns the duplicate / set-equality /
    // identical-order prechecks and is the authoritative drain-time check.
    case "reorder_activities": {
      const parsed = ReorderActivitiesSchema.safeParse(op.payload);
      if (!parsed.success) return skip(scenario, "invalid");
      return handleReorderActivities(scenario, parsed.data as ReorderActivitiesPayload);
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
      // A7: log the op's type/seq, not the full payload — it carries the user's
      // own activity names/notes/descriptions (exposure under telemetry capture
      // or screen-share).
      console.error(
        `[AI] op handler threw unexpectedly — treating as no-op (op=${op.op}, seq=${op.seq})`,
        err
      );
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
