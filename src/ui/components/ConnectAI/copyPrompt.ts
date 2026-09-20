// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Build the "copy prompt" a user pastes into their AI chatbot to start a
 * SPERT Scheduler session. It gives the AI the pairing code plus the operating
 * rules: how to connect, what SPERT Scheduler models, and — critically — to
 * ask about dependency-aware scheduling BEFORE creating activities, since
 * dependencies need Read Mode and a dependency-mode scenario.
 *
 * Two registers live in this string. STEP 2's options are a script the AI reads
 * out to me, and inside relayed text "you" addresses the reader rather than the
 * AI — so keep those lines free of second person, and phrase every instruction
 * in them as an action the reader can actually perform. The tool sections speak
 * to the AI directly, where "you" is the AI and "I"/"me" is the user.
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
  2. Can any activities run AT THE SAME TIME, or does this project run one
     activity at a time?
     (a) One at a time — each activity starts when the one before it finishes,
         in the order I give them, so the durations add up. Nothing to set up.
     (b) A network — I say what waits for what ("Testing starts when Build
         finishes"), and anything NOT linked runs in parallel from day one, so
         the project is as long as its longest chain rather than the sum.

     NO TOOL CAN CHANGE EITHER SETTING BELOW. If I choose (b), ask me to set
     them, and tell me where they are:
       - "Dependencies" — a toggle switch, per scenario, in the summary panel
         above the activity list, on the same row as "Parkinson's Law". Not the
         Dependencies panel further down the page; that one has no toggle.
       - Read Mode — a "Turn on Read" button in the Connect AI panel, beside
         "Permissions: Write". Also a checkbox when I first connect.

     If I choose (a), nothing needs setting — but ask me to confirm
     "Dependencies" is already off, since with Read Mode off there is no way
     to check that setting.
Wait for my answers. Do not build until I confirm.
Do NOT create dependencies unless I have confirmed (b) AND both settings are on.

CONCEPTS
- Activities: name + three-point estimate (min <= mostLikely <= max, working
  days). If you leave distributionType out, the app picks normal, logNormal
  or triangular from the three numbers alone (confidenceLevel plays no part),
  or uses the scenario's default when min, mostLikely and max are all equal.
  Choose distributionType yourself (normal | logNormal | triangular | uniform)
  whenever what I have told you about the work says more than three numbers
  can. The app never chooses uniform from the numbers: for an estimate with
  no distinct most-likely value, where any duration in the range is as likely
  as any other (a vendor's quoted lead time, a booked window), pass
  distributionType: "uniform" yourself. You may also set confidenceLevel; if
  you leave it out, the scenario's default applies.
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
  scheduler_bulk_append_notes,
  scheduler_bulk_import (needs Read Mode + a dependency-mode scenario ONLY
    when you include dependencies; without them it needs neither).

TOOLS THAT REQUIRE READ MODE
Read Mode lets you SEE the project, not just write to it. With it off every
write is fire-and-forget: you cannot discover ids, cannot confirm a change
landed, cannot read my notes and descriptions for context, and cannot touch
dependencies. It is mine to grant — ask for it with the "Turn on Read" button
in the Connect AI panel, beside "Permissions: Write".
  scheduler_get_project — read the current activities, schedule, and ids.
    Use this to discover ids before updating/toggling/assigning, and to verify
    your changes landed.
  scheduler_create_dependency / scheduler_remove_dependency /
  scheduler_update_dependency — these also require the target scenario to have
    dependency mode enabled (pass scenarioId).
  scheduler_bulk_create_dependencies — same gate; create many edges at once.
  scheduler_reorder_activities — reorder a scenario's activities to EXACTLY a
    full id list you provide (pass scenarioId). RE-READ scheduler_get_project
    immediately before calling to get the live ids, pass the COMPLETE current
    set in your desired order, and verify after. In a sequential scenario this
    CHANGES start/finish dates; in a dependency-mode scenario it changes DISPLAY
    ORDER ONLY and no dates move — either way simulation results are cleared and
    re-run. A repeated id is rejected as invalid_order; a missing or extra id is
    rejected as stale_order (the project changed since you read it — re-read and
    rebuild the full list). You cannot see section-header bands: they follow
    their anchor activity, so warn me that a visual grouping may shift.

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
  - scheduler_bulk_append_notes: append one note to up to 100 EXISTING
    activities in one call. NOT idempotent — re-running duplicates every note;
    if a call partially fails, resend only the ids that skipped, not the whole
    call. With Read Mode off you can't see how much note text an activity
    already has, so keep appended text short and keep batches modest (~25-40
    when notes carry real content, same reasoning as
    scheduler_bulk_create_activities) — an append that would push an activity's
    notes past 2000 chars is skipped as "too long," and a truncated mid-call
    output gets the whole call rejected.
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
scheduler_append_activity_note / scheduler_bulk_append_notes append to an
activity's notes (max 2000 chars total, existing + new). If an append would
overflow, that append (or, in bulk, just that one item) is skipped rather than
truncated — keep notes concise, and remember that with Read Mode off you have no
visibility into how much note text an activity already has, so a short append
that's fine on one activity may overflow another.

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
