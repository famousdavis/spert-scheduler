// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo } from "react";
import type { Scenario } from "@domain/models/types";

/**
 * The most scenarios Compare shows at once — the ONE definition of the cap. The hook refuses a
 * tick past it, and the scenario tabs grey out the remaining boxes when it is reached (WI-87).
 * The tabs' tooltip says "three" in words, and its test pins both, so a change here fails there.
 */
export const MAX_COMPARE_SCENARIOS = 3;

/**
 * The ticked ids whose scenario still exists — the same set when none has gone.
 *
 * A scenario deleted while ticked (by its ✕, by undo, or by a collaborator) leaves its id in the
 * ticked set. Nothing may count it: not the limit, not the tabs' greyed boxes (WI-62). It is
 * derived here rather than pruned by an effect, so the selection can never disagree with the
 * scenarios for even one render.
 */
function liveTicks(ticked: Set<string>, scenarios: Scenario[]): Set<string> {
  const live = scenarios.filter((s) => ticked.has(s.id)).map((s) => s.id);
  return live.length === ticked.size ? ticked : new Set(live);
}

/**
 * Manages scenario comparison mode state:
 * - Toggle compare mode on/off
 * - Select/deselect scenarios (at most MAX_COMPARE_SCENARIOS)
 * - Compute filtered scenario list for comparison table
 */
export function useScenarioComparison(scenarios: Scenario[]) {
  const [compareMode, setCompareMode] = useState(false);
  const [tickedIds, setTickedIds] = useState<Set<string>>(() => new Set());
  const selectedForCompare = useMemo(() => liveTicks(tickedIds, scenarios), [tickedIds, scenarios]);

  const handleToggleCompare = useCallback(
    (scenarioId: string) => {
      setTickedIds((prev) => {
        // Drop the ids of scenarios that have gone before counting, so a deleted tick frees its
        // place and the ticked set never holds more than the limit.
        const next = new Set(liveTicks(prev, scenarios));
        if (next.has(scenarioId)) {
          next.delete(scenarioId);
        } else if (next.size < MAX_COMPARE_SCENARIOS) {
          next.add(scenarioId);
        }
        return next;
      });
    },
    [scenarios]
  );

  const handleToggleCompareMode = useCallback(() => {
    setCompareMode((prev) => {
      if (!prev) {
        setTickedIds(new Set());
      }
      return !prev;
    });
  }, []);

  const compareScenarios = useMemo(
    () =>
      compareMode
        ? scenarios.filter((s) => selectedForCompare.has(s.id))
        : [],
    [compareMode, scenarios, selectedForCompare]
  );

  return {
    compareMode,
    selectedForCompare,
    handleToggleCompare,
    handleToggleCompareMode,
    compareScenarios,
  };
}
