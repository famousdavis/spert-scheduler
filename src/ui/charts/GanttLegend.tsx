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
  hasConstraints?: boolean;
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
  hasConstraints,
  datePrepared,
}: GanttLegendProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 px-3 py-2 text-xs text-gray-600 dark:text-gray-400 border-t border-gray-100 dark:border-gray-700">
      {/* Status colors — use inline vertical-align (not flex) for html2canvas compatibility */}
      <span>
        <span className="inline-block align-middle w-3 h-3 rounded-sm mr-1.5" style={{ backgroundColor: c.barPlanned }} />
        <span className="align-middle">Planned</span>
      </span>
      <span>
        <span className="inline-block align-middle w-3 h-3 rounded-sm mr-1.5" style={{ backgroundColor: c.barInProgress }} />
        <span className="align-middle">In Progress</span>
      </span>
      <span>
        <span className="inline-block align-middle w-3 h-3 rounded-sm mr-1.5" style={{ backgroundColor: c.barComplete }} />
        <span className="align-middle">Complete</span>
      </span>

      {/* Critical path */}
      {showCriticalPath && dependencyMode && hasCriticalPath && (
        <span>
          <span
            className="inline-block align-middle w-3 h-3 rounded-sm mr-1.5"
            style={{ backgroundColor: c.barPlanned, borderLeft: `4px solid ${c.criticalPath}` }}
          />
          <span className="align-middle">Critical Path</span>
        </span>
      )}

      {/* Uncertainty hatching */}
      {viewMode === "uncertainty" && (
        <span>
          <svg width="12" height="12" className="inline-block align-middle mr-1.5">
            <defs>
              <pattern id="legend-hatch" patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="4" stroke={c.hatchActivity} strokeWidth="2" />
              </pattern>
            </defs>
            <rect width="12" height="12" rx="1" fill="url(#legend-hatch)" stroke={c.hatchActivity} strokeWidth="0.5" />
          </svg>
          <span className="align-middle">Uncertainty</span>
        </span>
      )}

      {/* Finish line */}
      <span>
        <svg width="12" height="12" className="inline-block align-middle mr-1.5">
          <line x1="6" y1="0" x2="6" y2="12" stroke={c.finishLine} strokeWidth="2" strokeDasharray="3 1.5" />
        </svg>
        <span className="align-middle">Finish</span>
      </span>

      {/* Today line */}
      {showToday && todayVisible && (
        <span>
          <svg width="12" height="12" className="inline-block align-middle mr-1.5">
            <line x1="6" y1="0" x2="6" y2="12" stroke={c.todayLine} strokeWidth="1.5" strokeDasharray="2 1" />
          </svg>
          <span className="align-middle">Today</span>
        </span>
      )}

      {/* Milestones */}
      {hasMilestones && (
        <span>
          <svg width="12" height="12" className="inline-block align-middle mr-1.5">
            <polygon points="6,1 11,6 6,11 1,6" fill={mc.diamond} />
          </svg>
          <span className="align-middle">Milestone</span>
        </span>
      )}

      {/* Constraint */}
      {hasConstraints && (
        <span>
          <span
            className="inline-block align-middle w-3 h-3 rounded-sm mr-1.5"
            style={{ backgroundColor: "#3b82f6" }}
          />
          <span className="align-middle">Constraint</span>
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
