// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useEffect, useRef, useState } from "react";
import { STANDARD_PERCENTILES } from "@domain/models/types";
import {
  computeStandardPercentileCIs,
  type PercentileCI,
} from "@core/analytics/analytics";

interface PercentileTableProps {
  percentiles: Record<number, number>;
  probabilityTarget: number;
  /**
   * Optional: raw samples for computing bootstrap confidence intervals.
   * If provided, enables the "Show CI" toggle.
   */
  samples?: number[];
}

export function PercentileTable({
  percentiles,
  probabilityTarget,
  samples,
}: PercentileTableProps) {
  const targetPct = Math.round(probabilityTarget * 100);
  const [showCI, setShowCI] = useState(false);
  const [cis, setCIs] = useState<Record<number, PercentileCI> | null>(null);
  const [computing, setComputing] = useState(false);
  const samplesRef = useRef(samples);
  samplesRef.current = samples;

  // Compute CIs asynchronously when toggled on (deferred to unblock the checkbox)
  useEffect(() => {
    if (!showCI || !samples || samples.length === 0) {
      setCIs(null);
      setComputing(false);
      return;
    }

    setComputing(true);
    const captured = samples;
    const timer = setTimeout(() => {
      const result = computeStandardPercentileCIs(captured, 500);
      // Only apply if samples haven't changed while computing
      if (samplesRef.current === captured) {
        setCIs(result);
        setComputing(false);
      }
    }, 0);

    return () => clearTimeout(timer);
  }, [showCI, samples]);

  const canShowCI = samples && samples.length > 0;

  return (
    <div>
      {canShowCI && (
        <div className="flex items-center justify-end mb-2 gap-2">
          {computing && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 animate-pulse">
              Computing...
            </span>
          )}
          <label className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showCI}
              onChange={(e) => setShowCI(e.target.checked)}
              className="rounded border-gray-300 dark:border-gray-600 dark:bg-gray-700"
            />
            Show 95% CI
          </label>
        </div>
      )}
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-300 dark:border-gray-600">
            <th className="py-2 px-3 text-left font-medium text-gray-600 dark:text-gray-400">
              Percentile
            </th>
            <th className="py-2 px-3 text-right font-medium text-gray-600 dark:text-gray-400">
              Duration (days)
            </th>
          </tr>
        </thead>
        <tbody>
          {STANDARD_PERCENTILES.map((p) => {
            const isTarget = p === targetPct;
            const ci = cis?.[p];
            return (
              <tr
                key={p}
                className={`border-b border-gray-100 dark:border-gray-700 ${
                  isTarget ? "bg-green-50 dark:bg-green-900/20 font-semibold" : ""
                }`}
              >
                <td className="py-1.5 px-3 dark:text-gray-200">
                  P{p}
                  {isTarget && (
                    <span className="ml-2 text-xs text-green-700 dark:text-green-400">Target</span>
                  )}
                </td>
                <td className="py-1.5 px-3 text-right tabular-nums dark:text-gray-200">
                  {percentiles[p] != null ? (
                    <>
                      {percentiles[p]!.toFixed(1)}
                      {ci && (
                        <span className="ml-1 text-xs text-gray-400 dark:text-gray-500">
                          [{ci.lower.toFixed(1)} - {ci.upper.toFixed(1)}]
                        </span>
                      )}
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {showCI && cis && (
        <p className="mt-2 text-[10px] text-gray-400 dark:text-gray-500">
          95% CI via bootstrap (500 iterations)
        </p>
      )}
    </div>
  );
}
