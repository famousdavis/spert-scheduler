// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ActivityProblem } from "@ui/hooks/use-estimate-validity";

/**
 * How many activities a toast names before it summarises the rest. The Compare notes use the same limit
 * (WI-58): Compare is a summary, and the full list is one tab away.
 */
export const TOAST_NAMED_LIMIT = 3;

/**
 * Each activity's `#N` by id — the number its grid shows — or nothing when the project does not
 * number its activities (WI-105). The page passes its own `activityNumberMap`, so a number here is a
 * number on screen; Compare's Run for another scenario passes that scenario's own positions.
 */
export type ActivityNumbers = ReadonlyMap<string, number> | null;

/**
 * An activity as the grid and the validation summary name it: `#4 Design`, or `Design` alone when
 * there is no number for it. With no numbers the name is returned unchanged, byte for byte.
 */
export function numberedName(problem: ActivityProblem, numbers?: ActivityNumbers): string {
  const number = numbers?.get(problem.id);
  return number === undefined ? problem.name : `#${number} ${problem.name}`;
}

/** One activity and its reasons, as a phrase: `#4 Design (Min is above Most Likely)`. */
export function describeProblem(problem: ActivityProblem, numbers?: ActivityNumbers): string {
  return `${numberedName(problem, numbers)} (${problem.messages.join("; ")})`;
}

/**
 * The toast shown when a "Run simulation" link is used while Run is refused (v0.69.0, WI-53).
 *
 * The summary card's two links used to call the simulation directly: with the panel's Run
 * button disabled by a flagged row, one click still ran a complete plan on the bad estimate, or
 * surfaced the engine's raw error. The handler now refuses, and the links stop being silent
 * no-ops — a toast overlays the page, so it moves nothing under the pointer.
 *
 * Since WI-105 each activity carries its `#N` when `numbers` has one, as the validation summary
 * and the Schedule Error panel name it.
 */
export function runBlockedMessage(blockers: readonly ActivityProblem[], numbers?: ActivityNumbers): string {
  const named = blockers.slice(0, TOAST_NAMED_LIMIT).map((blocker) => describeProblem(blocker, numbers));
  const rest = blockers.length - named.length;
  const list = rest > 0 ? `${named.join(", ")} and ${rest} more` : named.join(", ");
  const subject = blockers.length === 1 ? "this activity" : `these ${blockers.length} activities`;
  return `Simulation not run. Fix ${subject} first: ${list}.`;
}
