// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

// -- Bulk AI op handlers (Phases 1–4) ----------------------------------------
// Single-array bulk handlers (Phase 1), the 2A update + 2B composite-import
// handlers (Phase 2), the whole-op reorder handler (Phase 3), and the
// single-array bulk_append_notes handler (Phase 4). Each bulk handler composes
// the shared item-level cores from ai-op-handlers.ts; structural (Zod) parsing
// runs once at the dispatcher boundary before any of these, so every item here
// is shape-valid.

import type { Scenario } from "@domain/models/types";
import {
  type BulkActivityItem,
  type BulkCreateActivitiesPayload,
  type BulkCreateDependenciesPayload,
  type BulkCreateMilestonesPayload,
  type BulkAssignMilestonesPayload,
  type BulkUpdateActivitiesPayload,
  type BulkImportSchedulePayload,
  type ReorderActivitiesPayload,
  type BulkAppendNotesPayload,
  type BulkSection,
  type BulkSectionCounts,
  type SectionCount,
  type SkippedItem,
  type AiOpOutcome,
  type OpResult,
  type CoreResult,
  skip,
  applied,
  toItemReject,
} from "./ai-op-types";
import {
  createActivityCore,
  updateActivityCore,
  appendNoteCore,
  createMilestoneCore,
  assignMilestoneCore,
  createDependencyCore,
} from "./ai-op-handlers";

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

export function handleBulkCreateActivities(
  scenario: Scenario,
  p: BulkCreateActivitiesPayload
): OpResult {
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

export function handleBulkCreateDependencies(
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

export function handleBulkCreateMilestones(
  scenario: Scenario,
  p: BulkCreateMilestonesPayload
): OpResult {
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

export function handleBulkAssignMilestones(
  scenario: Scenario,
  p: BulkAssignMilestonesPayload
): OpResult {
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

export function handleBulkUpdateActivities(
  scenario: Scenario,
  p: BulkUpdateActivitiesPayload
): OpResult {
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
export function handleBulkImportSchedule(
  scenario: Scenario,
  p: BulkImportSchedulePayload
): OpResult {
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

// Reorder (Phase 3): rebuild `activities` from an explicit full id list. The one
// whole-op-only write in the bulk family — no per-item loop, no `partial`
// outcome. The precheck order mirrors the server's queue-time prechecks, but
// THIS is the authoritative pass: state can drift between the server's
// snapshot-time check and drain, so a queue-time pass never implies a drain-time
// pass.
//   invalid_order   — a duplicate id in the requested list
//   stale_order     — the list is not an exact permutation of the live activity
//                     ids (missing/extra id or length mismatch) → project changed
//   value_unchanged — the list already matches the current order
// On apply: rebuild `activities` in the given order; bands are left untouched
// (each band re-anchors to its activity at render time via buildRenderList, so a
// moved anchor carries its band with it — no band mutation). simulationResults is
// invalidated in BOTH modes, matching the human reorder convention
// (reorderActivities / reorderWithBands); the dependency-mode message discloses
// that results re-run even though no dates move.
export function handleReorderActivities(
  scenario: Scenario,
  p: ReorderActivitiesPayload
): OpResult {
  const ordered = p.orderedActivityIds;

  // Precheck A — duplicate ids in the requested order → whole-op invalid_order.
  const seen = new Set<string>();
  for (const id of ordered) {
    if (seen.has(id)) return skip(scenario, "invalid_order");
    seen.add(id);
  }

  // Precheck B — set-equality vs the live scenario. A (no duplicates) already
  // holds, so equal length + every requested id present ⇒ exact permutation.
  const currentIds = scenario.activities.map((a) => a.id);
  if (currentIds.length !== ordered.length) return skip(scenario, "stale_order");
  const currentSet = new Set(currentIds);
  for (const id of ordered) {
    if (!currentSet.has(id)) return skip(scenario, "stale_order");
  }

  // Identical order → no-op (no mutation, no invalidation).
  if (currentIds.every((id, i) => id === ordered[i])) {
    return skip(scenario, "value_unchanged");
  }

  // Rebuild the array in the requested order. Every id resolves (set-equality
  // above), so the lookups are total.
  const byId = new Map(scenario.activities.map((a) => [a.id, a]));
  const activities = ordered.map((id) => byId.get(id)!);
  return applied({ ...scenario, activities, simulationResults: undefined });
}

// -- Bulk ops (Phase 4) -------------------------------------------------------
// Single new op, added after the Phase 1-3 bulk campaign shipped (contract
// phase 3->4). Same flat single-array shape as Phase 1/2A; appendNoteCore
// already exists and is already imported above (it seeds notes in the
// bulk-create path).

export function handleBulkAppendNotes(
  scenario: Scenario,
  p: BulkAppendNotesPayload
): OpResult {
  let scn = scenario;
  const skippedItems: SkippedItem[] = [];
  let appliedCount = 0;
  // NOT idempotent (unlike bulk_update's last-wins merge): re-running this
  // payload duplicates every note. Repeated ids WITHIN one call apply
  // cumulatively in array order (each entry appends against the scenario the
  // prior entry produced) -- an early entry can push a later entry on the
  // SAME id over NOTES_MAX even if neither text alone would. would_exceed_
  // length is genuinely reachable here (unlike the bulk-create seeding path:
  // these are EXISTING activities whose notes may already be non-empty) and
  // passes through toItemReject as an ItemReject (D1).
  p.notes.forEach((item, index) => {
    const r = appendNoteCore(scn, { id: item.id, text: item.text });
    if (!r.ok) {
      skippedItems.push({ index, id: item.id, reason: toItemReject(r.reason) });
    } else {
      scn = r.scenario;
      appliedCount++;
    }
  });
  return { scenario: scn, outcome: bulkOutcome(appliedCount, skippedItems) };
}
