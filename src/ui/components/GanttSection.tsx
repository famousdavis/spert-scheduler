// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useRef, useCallback } from "react";
import { flushSync } from "react-dom";
import type {
  Activity,
  ActivityBand,
  ActivityDependency,
  GanttAppearanceSettings,
  Milestone,
  MilestoneBufferInfo,
  ScheduledActivity,
  Calendar,
} from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { resolveGanttAppearance } from "@ui/charts/gantt-constants";
import { GanttChart } from "@ui/charts/GanttChart";
import { GanttAppearancePanel } from "./GanttAppearancePanel";
import { CopyImageButton } from "./CopyImageButton";
import { useIsDarkClass } from "@ui/hooks/use-dark-class";

interface GanttSectionProps {
  activities: Activity[];
  bands?: ActivityBand[];
  scheduledActivities: ScheduledActivity[];
  projectStartDate: string;
  projectEndDate: string;
  buffer: ScheduleBuffer | null;
  dependencies: ActivityDependency[];
  dependencyMode: boolean;
  activityTarget: number;
  projectTarget: number;
  calendar?: WorkCalendar | Calendar;
  milestones?: Milestone[];
  milestoneBuffers?: Map<string, MilestoneBufferInfo> | null;
  criticalPathIds?: Set<string> | null;
  projectName?: string;
  onEditActivity?: (activityId: string) => void;
  onRenameActivity?: (activityId: string, newName: string) => void;
  onRenameBand?: (bandId: string, newName: string) => void;
  onEditDependency?: (fromId: string, toId: string) => void;
  isLocked?: boolean;
  showActivityNumbers?: boolean;
  onToggleActivityNumbers?: (v: boolean) => void;
  showTargetOnGantt?: boolean;
  onToggleShowTarget?: (v: boolean) => void;
  hasTargetDate?: boolean;
  targetFinishDate?: string | null;
  targetRAGColor?: string;
  ganttAppearance: GanttAppearanceSettings;
  onAppearanceChange: (a: GanttAppearanceSettings) => void;
}

export function GanttSection(props: GanttSectionProps) {
  const { ganttAppearance, onAppearanceChange, ...chartProps } = props;
  const [collapsed, setCollapsed] = useState(false);
  const [appearancePanelOpen, setAppearancePanelOpen] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);
  // True only while a copy is being taken: the copy is always light (WI-26, captureLight below).
  const [forceLight, setForceLight] = useState(false);

  // Dark mode, SUBSCRIBED rather than read during render — see use-dark-class.ts. This
  // feeds resolveGanttAppearance, whose only isDark-dependent outputs are the colour
  // preset and the weekend shading tint; every geometry field is independent of it.
  const isDark = useIsDarkClass() && !forceLight;

  const resolvedAppearance = resolveGanttAppearance(ganttAppearance, isDark);

  /**
   * A copy of the Gantt is always light (WI-26). html2canvas copies the page synchronously,
   * inside its call, so the chart is redrawn light just before that call and redrawn in its own
   * theme as soon as the call returns. Both redraws happen before the browser can paint, so the
   * screen never shows the light chart; `flushSync` is what puts each one in the DOM at once.
   */
  const captureLight = useCallback(() => {
    flushSync(() => setForceLight(true));
    return () => flushSync(() => setForceLight(false));
  }, []);

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          onClick={() => setCollapsed((c) => !c)}
        >
          <svg
            className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-90"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          Gantt Chart
        </button>
        {/* captureFullWidth: the chart's container scrolls sideways whenever Fit to window
            is off (the default), and a copy of it would hold only the part in view — a PNG
            that looks complete while missing the chart's end, or its start if the chart has
            been scrolled (WI-57). */}
        {!collapsed && (
          <CopyImageButton targetRef={chartRef} captureLight={captureLight} title="Copy Gantt chart as image" captureFullWidth />
        )}
      </div>

      {/* Chart body */}
      {!collapsed && (
        <div className="p-4 bg-white dark:bg-gray-800">
          <GanttChart
            {...chartProps}
            svgContainerRef={chartRef}
            resolvedAppearance={resolvedAppearance}
            forceLight={forceLight}
            appearancePanelOpen={appearancePanelOpen}
            onToggleAppearancePanel={() => setAppearancePanelOpen((o) => !o)}
          />
          {appearancePanelOpen && (
            <div className="mt-3">
              <GanttAppearancePanel
                appearance={ganttAppearance}
                onChange={onAppearanceChange}
                isDark={isDark}
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
