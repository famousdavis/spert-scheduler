// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo } from "react";
import type { Scenario } from "@domain/models/types";

/**
 * Manages scenario comparison mode state:
 * - Toggle compare mode on/off
 * - Select/deselect scenarios (max 3)
 * - Compute filtered scenario list for comparison table
 */
export function useScenarioComparison(scenarios: Scenario[]) {
  const [compareMode, setCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(
    () => new Set()
  );

  const handleToggleCompare = useCallback((scenarioId: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(scenarioId)) {
        next.delete(scenarioId);
      } else if (next.size < 3) {
        next.add(scenarioId);
      }
      return next;
    });
  }, []);

  const handleToggleCompareMode = useCallback(() => {
    setCompareMode((prev) => {
      if (!prev) {
        setSelectedForCompare(new Set());
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
