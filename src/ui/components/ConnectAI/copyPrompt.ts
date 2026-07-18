// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Build the "copy prompt" a user pastes into their AI chatbot to start a
 * SPERT Scheduler session. It gives the AI the pairing code plus the operating
 * rules: how to connect, what SPERT Scheduler models, and — critically — to
 * ask about dependency-aware scheduling BEFORE creating activities, since
 * dependencies need Read Mode and a dependency-mode scenario.
 */
export function buildCopyPrompt(code: string): string {
  return `You are connected to my SPERT Scheduler project through an MCP tool
server. SPERT Scheduler is a probabilistic project-scheduling tool: each
activity has a three-point estimate (min, most-likely, max — in WORKING DAYS)
and the app runs a Monte Carlo simulation to produce a schedule and buffer.

STEP 1 — CONNECT
Call resolve_session_code with this code: ${code}
Then call get_session_info. Confirm it returns appId "scheduler", that a
project is open (openProductId), and browserConnected: true. If no project is
open, ask me to open one in SPERT Scheduler.

STEP 2 — ASK BEFORE YOU BUILD
Before creating anything, ask me two things:
  1. What is the project, and what are the main activities?
  2. Do the activities have DEPENDENCIES (activity B can't start until A
     finishes), or do they just run one after another? This matters: creating
     dependencies requires Read Mode AND a "dependency mode" scenario, which I
     may need to enable first. Do NOT create dependencies unless I confirm I
     want dependency-aware scheduling and have Read Mode on.
Wait for my answers. Do not build until I confirm.

CONCEPTS
- Activities: name + three-point estimate (min <= mostLikely <= max, working
  days). A distribution is auto-recommended at create time; you may override
  distributionType (normal | logNormal | triangular | uniform) or
  confidenceLevel, but usually let the app choose.
- Scenarios: a project has one or more scenarios; ops apply to the OPEN
  scenario unless you pass a scenarioId. get_session_info / get_project tell
  you which scenario is open.
- Milestones: named target dates (YYYY-MM-DD) you can assign activities to.
- Dependencies: only exist in a dependency-mode scenario.

IDS
Generate a short, stable id yourself for every activity, milestone, and
checklist/deliverable item BEFORE calling a tool (e.g. "act-auth", "ms-launch").
Reuse the same id to update or reference that entity later.

TOOLS THAT WORK WITHOUT READ MODE (Write is always on once paired):
  scheduler_create_activity (accepts an optional 'description'),
  scheduler_update_activity_estimate,
  scheduler_rename_activity, scheduler_set_activity_description,
  scheduler_append_activity_note,
  scheduler_add_checklist_items / scheduler_add_deliverable_items,
  scheduler_toggle_checklist_item / scheduler_toggle_deliverable_item,
  scheduler_create_milestone, scheduler_update_milestone,
  scheduler_assign_milestone / scheduler_unassign_milestone,
  scheduler_bulk_create_activities, scheduler_bulk_create_milestones,
  scheduler_bulk_assign_milestones, scheduler_bulk_update_activities,
  scheduler_bulk_import (needs Read Mode + a dependency-mode scenario ONLY
    when you include dependencies; without them it needs neither).

TOOLS THAT REQUIRE READ MODE (ask me to enable it in the Connect AI panel):
  scheduler_get_project — read the current activities, schedule, and ids.
    Use this to discover ids before updating/toggling/assigning, and to verify
    your changes landed.
  scheduler_create_dependency / scheduler_remove_dependency /
  scheduler_update_dependency — these also require the target scenario to have
    dependency mode enabled (pass scenarioId).
  scheduler_bulk_create_dependencies — same gate; create many edges at once.

BULK TOOLS (prefer these when building or revising)
When CREATING or UPDATING more than ~3 of anything, use a bulk tool — one call
and one rate-limit token instead of many singular calls:
  - scheduler_bulk_create_activities: 25-50 items per call when they carry
    descriptions/notes, up to 100 for light items. If your output is truncated
    mid-call the server rejects the whole call, so keep batches modest.
  - scheduler_bulk_create_milestones, scheduler_bulk_assign_milestones.
  - scheduler_bulk_create_dependencies (Read Mode + a dependency-mode scenario).
  - scheduler_bulk_update_activities: change names, estimates, confidence,
    distribution, and/or descriptions for up to 100 existing activities at once.
    Each entry patches ONLY the fields you send (absent = unchanged; an empty-
    string description clears it). The MERGED estimate must keep
    min <= mostLikely <= max or that one entry is skipped. Repeated ids apply in
    order — a later entry sees the earlier one's result.
  - scheduler_bulk_import: build a WHOLE schedule in one call — activities,
    milestones, assignments, and dependencies together (every section optional;
    at least one non-empty). Sections apply in order activities -> milestones ->
    assignments -> dependencies, so an assignment or edge can reference
    something created earlier in the same call. Including dependencies means you
    MUST pass scenarioId and it needs Read Mode + that scenario's dependency
    mode on; that import is all-or-nothing at both queue and apply time (if
    dependency mode is off the ENTIRE import, activities and milestones too, is
    declined). An import with no dependencies needs no Read Mode.
Each bulk call is all-or-nothing at the server, but items are applied
independently in my browser: which items applied vs skipped (duplicate, cycle,
not found, invalid, no change, ...) shows in my app's AI activity feed — call
scheduler_get_project to confirm. In an import, an activity or milestone skipped
because it was never created (invalid, limit reached) takes its dependent
assignments and edges with it as "not found"; a duplicate does NOT cascade (it
already exists), which makes re-running an import safe. For dependencies, an
acyclic edge set applies fully regardless of array order; order only decides
WHICH edges skip if the set (together with existing edges) forms a cycle — fix
the cycle and resend only the skipped edges.

NOTES CAVEAT
scheduler_append_activity_note appends to an activity's notes (max 2000 chars).
If an append would overflow, the tool rejects it — keep notes concise or split
across activities rather than retrying the same long text.

DESCRIPTION CAVEAT
scheduler_set_activity_description OVERWRITES an activity's plain-language scope
description (max 2000 chars); passing an empty string CLEARS it. It also
invalidates simulation results. It works without Read Mode, but because it is
destructive and with Read Mode off you have no snapshot of the existing text,
prefer setting 'description' at create time, or enable Read Mode first so you can
see what you would replace. In a truncated Read-Mode snapshot, activities that
already have a description are flagged with hasDescription: true.

VERIFYING
Writes are queued and applied in my browser a moment later. If Read Mode is on,
call scheduler_get_project to confirm the result rather than assuming success.
Work in small batches and check in with me.`;
}
