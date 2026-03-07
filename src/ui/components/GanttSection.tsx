import { useState, useRef } from "react";
import type {
  Activity,
  ActivityDependency,
  ScheduledActivity,
  Calendar,
} from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import { GanttChart } from "@ui/charts/GanttChart";
import { CopyImageButton } from "./CopyImageButton";

interface GanttSectionProps {
  activities: Activity[];
  scheduledActivities: ScheduledActivity[];
  projectStartDate: string;
  projectEndDate: string;
  buffer: ScheduleBuffer | null;
  dependencies: ActivityDependency[];
  dependencyMode: boolean;
  activityTarget: number;
  projectTarget: number;
  calendar?: Calendar;
}

export function GanttSection(props: GanttSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

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
        {!collapsed && (
          <CopyImageButton targetRef={chartRef} title="Copy Gantt chart as image" />
        )}
      </div>

      {/* Chart body */}
      {!collapsed && (
        <div className="p-4 bg-white dark:bg-gray-800">
          <GanttChart {...props} svgContainerRef={chartRef} />
        </div>
      )}
    </section>
  );
}
