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
  scheduler_create_activity, scheduler_update_activity_estimate,
  scheduler_rename_activity, scheduler_append_activity_note,
  scheduler_add_checklist_items / scheduler_add_deliverable_items,
  scheduler_toggle_checklist_item / scheduler_toggle_deliverable_item,
  scheduler_create_milestone, scheduler_update_milestone,
  scheduler_assign_milestone / scheduler_unassign_milestone.

TOOLS THAT REQUIRE READ MODE (ask me to enable it in the Connect AI panel):
  scheduler_get_project — read the current activities, schedule, and ids.
    Use this to discover ids before updating/toggling/assigning, and to verify
    your changes landed.
  scheduler_create_dependency / scheduler_remove_dependency /
  scheduler_update_dependency — these also require the target scenario to have
    dependency mode enabled (pass scenarioId).

NOTES CAVEAT
scheduler_append_activity_note appends to an activity's notes (max 2000 chars).
If an append would overflow, the tool rejects it — keep notes concise or split
across activities rather than retrying the same long text.

VERIFYING
Writes are queued and applied in my browser a moment later. If Read Mode is on,
call scheduler_get_project to confirm the result rather than assuming success.
Work in small batches and check in with me.`;
}
