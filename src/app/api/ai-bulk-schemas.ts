// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { z } from "zod";

// Structural-only schemas for AI bulk-op payloads (decision 9). They validate
// the envelope SHAPE, field PRIMITIVE TYPES, and ARRAY-LENGTH CAPS (mirroring
// the server caps) — nothing more. No enums, no content bounds (string min/max,
// number ranges), no regexes, no cross-field rules. All content/semantic
// validation happens per-item inside the handler-loop cores, so one item's
// content can never reject another item.
//
// A whole-op `invalid` outcome occurs ONLY when this structural parse fails —
// i.e. envelope corruption or a type-level shape skew. Because AI ops are
// written exclusively by the Admin SDK (the `ops/` subcollection is
// `allow write: if false`), that failure is reachable only via a server bug,
// never via a malformed AI tool call (the server's strict Zod would have
// rejected the call before any op was written).
//
// Zod 4 (client). The server authors an idiomatic Zod-3 twin per-repo; the
// shared shape is pinned by `ai-op-contract.json` (see contract test).

const scenarioIdOpt = z.string().optional();

const bulkActivityItem = z.object({
  id: z.string(),
  name: z.string(),
  min: z.number(),
  mostLikely: z.number(),
  max: z.number(),
  confidenceLevel: z.string().optional(),
  distributionType: z.string().optional(),
  description: z.string().optional(),
  note: z.string().optional(),
});

const bulkDependencyItem = z.object({
  fromActivityId: z.string(),
  toActivityId: z.string(),
  type: z.string().optional(),
  lagDays: z.number().optional(),
});

const bulkMilestoneItem = z.object({
  id: z.string(),
  name: z.string(),
  targetDate: z.string(),
});

const bulkAssignmentItem = z.object({
  activityId: z.string(),
  milestoneId: z.string(),
});

// Phase 2. Every field except `id` is optional — an update patches only the
// fields it carries (absent = unchanged). Structural only: no enums, no content
// bounds. The handler's updateActivityCore merges over current values, then
// validates the merged activity per item.
const bulkUpdateItem = z.object({
  id: z.string(),
  name: z.string().optional(),
  min: z.number().optional(),
  mostLikely: z.number().optional(),
  max: z.number().optional(),
  confidenceLevel: z.string().optional(),
  distributionType: z.string().optional(),
  description: z.string().optional(),
});

export const BulkCreateActivitiesSchema = z.object({
  scenarioId: scenarioIdOpt,
  activities: z.array(bulkActivityItem).min(1).max(100),
});

export const BulkCreateDependenciesSchema = z.object({
  scenarioId: scenarioIdOpt,
  dependencies: z.array(bulkDependencyItem).min(1).max(500),
});

export const BulkCreateMilestonesSchema = z.object({
  scenarioId: scenarioIdOpt,
  milestones: z.array(bulkMilestoneItem).min(1).max(100),
});

export const BulkAssignMilestonesSchema = z.object({
  scenarioId: scenarioIdOpt,
  assignments: z.array(bulkAssignmentItem).min(1).max(500),
});

// Phase 2 — 2A. Bulk activity update: one array, ≤100 patches.
export const BulkUpdateActivitiesSchema = z.object({
  scenarioId: scenarioIdOpt,
  updates: z.array(bulkUpdateItem).min(1).max(100),
});

// Phase 2 — 2B. Composite import: four OPTIONAL sections reusing the live
// Phase-1 item shapes. Sections carry a `.max()` cap but NO `.min(1)` — an
// absent or explicitly-empty section is structurally valid; the "at least one
// section non-empty" rule is a server inline check + a drain-time defensive
// floor (all-empty → whole-op `invalid`), never a structural one.
export const BulkImportScheduleSchema = z.object({
  scenarioId: scenarioIdOpt,
  activities: z.array(bulkActivityItem).max(100).optional(),
  milestones: z.array(bulkMilestoneItem).max(100).optional(),
  assignments: z.array(bulkAssignmentItem).max(500).optional(),
  dependencies: z.array(bulkDependencyItem).max(500).optional(),
});

// Phase 3. Reorder activities: the FULL current activity-id list for the target
// scenario, in the desired order. Structural only — a bare string array with the
// same min/max caps the server enforces (`.min(2)` since a reorder needs ≥2 ids;
// `.max(500)` mirrors the activity cap). Duplicate ids, set-equality against the
// live scenario, and identical-order detection are the handler's job, not the
// structural schema's (a whole-op `invalid` here means envelope corruption only).
export const ReorderActivitiesSchema = z.object({
  scenarioId: scenarioIdOpt,
  orderedActivityIds: z.array(z.string()).min(2).max(500),
});
