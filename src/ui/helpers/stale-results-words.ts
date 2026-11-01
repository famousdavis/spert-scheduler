// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { StaleResults } from "@core/schedule/recorded-progress";
import { nameOrUnnamed } from "@domain/helpers/display-name";

/**
 * WI-154 (owner, R639, decision 3) — the one sentence beside results simulated on an earlier data
 * date (`staleResults`), shown as not run on every surface. Its dates go through the user's format.
 */

/** The project page and print: the open scenario. */
export function staleResultsSentence(stale: StaleResults, formatDate: (iso: string) => string): string {
  return `The last simulation was run on ${formatDate(stale.simulatedOn)}. Work that has not started is now scheduled no earlier than ${formatDate(stale.dataDate)}, so run the simulation again to bring the forecast up to date.`;
}

/** Comparison, on screen and on paper, and Settings' schedule export: the scenarios it names. */
export function staleScenariosSentence(
  names: string[], dataDate: string, formatDate: (iso: string) => string, action: string,
): string {
  const list = names.map(nameOrUnnamed);
  const one = list.length === 1;
  const who = one ? list[0]! : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `The last ${one ? "simulation" : "simulations"} of ${who} ${one ? "was" : "were"} run on an earlier day. Work that has not started is now scheduled no earlier than ${formatDate(dataDate)}, so run ${one ? "it" : "them"} again ${action}.`;
}
