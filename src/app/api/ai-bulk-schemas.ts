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
