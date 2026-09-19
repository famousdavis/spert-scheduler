// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ActivityProblem } from "@ui/hooks/use-estimate-validity";

/** How many activities a toast names before it summarises the rest. */
const TOAST_NAMED_LIMIT = 3;

/** One activity and its reasons, as a phrase: `Design (Min must be <= Most Likely)`. */
export function describeProblem(problem: ActivityProblem): string {
  return `${problem.name} (${problem.messages.join("; ")})`;
}

/**
 * The toast shown when a "Run simulation" link is used while Run is refused (v0.69.0, WI-53).
 *
 * The summary card's two links used to call the simulation directly: with the panel's Run
 * button disabled by a flagged row, one click still ran a complete plan on the bad estimate, or
 * surfaced the engine's raw error. The handler now refuses, and the links stop being silent
 * no-ops — a toast overlays the page, so it moves nothing under the pointer.
 */
export function runBlockedMessage(blockers: readonly ActivityProblem[]): string {
  const named = blockers.slice(0, TOAST_NAMED_LIMIT).map(describeProblem);
  const rest = blockers.length - named.length;
  const list = rest > 0 ? `${named.join(", ")} and ${rest} more` : named.join(", ");
  const subject = blockers.length === 1 ? "this activity" : `these ${blockers.length} activities`;
  return `Simulation not run. Fix ${subject} first: ${list}.`;
}
