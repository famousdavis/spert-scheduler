// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { GanttViewMode } from "@domain/models/types";

interface ColorSet {
  barPlanned: string;
  barInProgress: string;
  barComplete: string;
  criticalPath: string;
  hatchActivity: string;
  finishLine: string;
  todayLine: string;
}

interface MilestoneColorSet {
  diamond: string;
}

interface GanttLegendProps {
  c: ColorSet;
  mc: MilestoneColorSet;
  viewMode: GanttViewMode;
  showCriticalPath: boolean;
  dependencyMode: boolean;
  hasCriticalPath: boolean;
  showToday: boolean;
  todayVisible: boolean;
  hasMilestones: boolean;
  datePrepared?: string;
}

export function GanttLegend({
  c,
  mc,
  viewMode,
  showCriticalPath,
  dependencyMode,
  hasCriticalPath,
  showToday,
  todayVisible,
  hasMilestones,
  datePrepared,
}: GanttLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
      {/* Status colors */}
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: c.barPlanned }} />
        Planned
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: c.barInProgress }} />
        In Progress
      </span>
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: c.barComplete }} />
        Complete
      </span>

      {/* Critical path */}
      {showCriticalPath && dependencyMode && hasCriticalPath && (
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: c.barPlanned, borderLeft: `4px solid ${c.criticalPath}` }}
          />
          Critical Path
        </span>
      )}

      {/* Uncertainty hatching */}
      {viewMode === "uncertainty" && (
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" className="inline-block">
            <defs>
              <pattern id="legend-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="4" stroke={c.hatchActivity} strokeWidth="2" />
              </pattern>
            </defs>
            <rect width="12" height="12" rx="1" fill="url(#legend-hatch)" stroke={c.hatchActivity} strokeWidth="0.5" />
          </svg>
          Uncertainty
        </span>
      )}

      {/* Finish line */}
      <span className="flex items-center gap-1.5">
        <svg width="12" height="12" className="inline-block">
          <line x1="6" y1="0" x2="6" y2="12" stroke={c.finishLine} strokeWidth="2" strokeDasharray="3 1.5" />
        </svg>
        Finish
      </span>

      {/* Today line */}
      {showToday && todayVisible && (
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" className="inline-block">
            <line x1="6" y1="0" x2="6" y2="12" stroke={c.todayLine} strokeWidth="1.5" strokeDasharray="2 1" />
          </svg>
          Today
        </span>
      )}

      {/* Milestones */}
      {hasMilestones && (
        <span className="flex items-center gap-1.5">
          <svg width="12" height="12" className="inline-block">
            <polygon points="6,1 11,6 6,11 1,6" fill={mc.diamond} />
          </svg>
          Milestone
        </span>
      )}

      {/* Date prepared — pushed to far right */}
      {datePrepared && (
        <span className="ml-auto text-gray-400 dark:text-gray-500">
          Date prepared: {datePrepared}
        </span>
      )}
    </div>
  );
}
