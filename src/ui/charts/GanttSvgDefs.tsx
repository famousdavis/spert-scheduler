// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Activity } from "@domain/models/types";
import { ARROW_HEAD_SIZE } from "./gantt-constants";

interface ColorSet {
  hatchInProgress: string;
  hatchActivity: string;
  hatchBuffer: string;
  arrow: string;
  arrowHover: string;
  arrowHoverCritical: string;
  criticalPath: string;
}

interface GanttSvgDefsProps {
  orderedActivities: Activity[];
  c: ColorSet;
  showBuffer: boolean;
  showCriticalPath: boolean;
  hasCriticalPath: boolean;
}

export function GanttSvgDefs({
  orderedActivities,
  c,
  showBuffer,
  showCriticalPath,
  hasCriticalPath,
}: GanttSvgDefsProps) {
  return (
    <defs>
      {orderedActivities.map((act) => (
        <pattern
          key={`hatch-${act.id}`}
          id={`hatch-${act.id}`}
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="8"
            stroke={act.status === "inProgress" ? c.hatchInProgress : c.hatchActivity}
            strokeWidth="4"
          />
        </pattern>
      ))}
      {showBuffer && (
        <pattern
          id="hatch-buffer"
          patternUnits="userSpaceOnUse"
          width="8"
          height="8"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="8"
            stroke={c.hatchBuffer}
            strokeWidth="4"
          />
        </pattern>
      )}
      {/* Arrowhead marker — userSpaceOnUse prevents scaling by stroke width */}
      <marker
        id="arrowhead"
        markerUnits="userSpaceOnUse"
        markerWidth={ARROW_HEAD_SIZE}
        markerHeight={ARROW_HEAD_SIZE}
        refX="0"
        refY={ARROW_HEAD_SIZE / 2}
        orient="auto"
      >
        <polygon
          points={`0 0, ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2}, 0 ${ARROW_HEAD_SIZE}`}
          fill={c.arrow}
        />
      </marker>
      {/* Critical path arrowhead marker */}
      {showCriticalPath && hasCriticalPath && (
        <marker
          id="arrowhead-critical"
          markerUnits="userSpaceOnUse"
          markerWidth={ARROW_HEAD_SIZE}
          markerHeight={ARROW_HEAD_SIZE}
          refX="0"
          refY={ARROW_HEAD_SIZE / 2}
          orient="auto"
        >
          <polygon
            points={`0 0, ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2}, 0 ${ARROW_HEAD_SIZE}`}
            fill={c.criticalPath}
          />
        </marker>
      )}
      {/* Hover arrowhead markers */}
      <marker
        id="arrowhead-hover"
        markerUnits="userSpaceOnUse"
        markerWidth={ARROW_HEAD_SIZE}
        markerHeight={ARROW_HEAD_SIZE}
        refX="0"
        refY={ARROW_HEAD_SIZE / 2}
        orient="auto"
      >
        <polygon
          points={`0 0, ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2}, 0 ${ARROW_HEAD_SIZE}`}
          fill={c.arrowHover}
        />
      </marker>
      <marker
        id="arrowhead-critical-hover"
        markerUnits="userSpaceOnUse"
        markerWidth={ARROW_HEAD_SIZE}
        markerHeight={ARROW_HEAD_SIZE}
        refX="0"
        refY={ARROW_HEAD_SIZE / 2}
        orient="auto"
      >
        <polygon
          points={`0 0, ${ARROW_HEAD_SIZE} ${ARROW_HEAD_SIZE / 2}, 0 ${ARROW_HEAD_SIZE}`}
          fill={c.arrowHoverCritical}
        />
      </marker>
    </defs>
  );
}
