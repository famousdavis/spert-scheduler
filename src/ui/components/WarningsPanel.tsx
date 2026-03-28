// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback } from "react";
import type { ConstraintConflict, DependencyConflict } from "@domain/models/types";
import { useDateFormat } from "@ui/hooks/use-date-format";

// -- Shared warning item component --------------------------------------------

const VARIANT_CLASSES = {
  error: {
    bg: "bg-red-50 dark:bg-red-900/20",
    border: "border-red-200 dark:border-red-700",
    icon: "text-red-500 dark:text-red-400",
    title: "text-red-700 dark:text-red-300",
    text: "text-red-600 dark:text-red-400",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-900/20",
    border: "border-amber-200 dark:border-amber-700",
    icon: "text-amber-500 dark:text-amber-400",
    title: "text-amber-700 dark:text-amber-300",
    text: "text-amber-600 dark:text-amber-400",
  },
} as const;

function WarningItem({ variant, title, detail, message, formatDate }: {
  variant: "error" | "warning";
  title: string;
  detail: string;
  message: string;
  formatDate: (d: string) => string;
}) {
  const c = VARIANT_CLASSES[variant];
  return (
    <div className={`flex items-start gap-2 text-xs ${c.bg} border ${c.border} rounded p-2`}>
      <span className={`${c.icon} mt-0.5 shrink-0`}>!</span>
      <div>
        <span className={`font-medium ${c.title}`}>{title}</span>
        <span className={`${c.text} ml-1`}>{detail}</span>
        <p className={`${c.text} mt-0.5`}>{message.replace(/\d{4}-\d{2}-\d{2}/g, (m) => formatDate(m))}</p>
      </div>
    </div>
  );
}

// -- Panel --------------------------------------------------------------------

interface WarningsPanelProps {
  conflicts: ConstraintConflict[];
  dependencyConflicts?: DependencyConflict[];
  activityNumberMap?: Map<string, number> | null;
}

export function WarningsPanel({ conflicts, dependencyConflicts = [], activityNumberMap }: WarningsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const formatDate = useDateFormat();
  const prefixName = useCallback(
    (id: string, name: string) => {
      const num = activityNumberMap?.get(id);
      return num ? `#${num} ${name}` : name;
    },
    [activityNumberMap]
  );

  if (conflicts.length === 0 && dependencyConflicts.length === 0) return null;

  const errors = conflicts.filter((c) => c.severity === "error");
  const warnings = conflicts.filter((c) => c.severity === "warning");

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <div className="flex items-center gap-2">
          <span className="text-amber-600 dark:text-amber-400 font-medium text-sm">
            Scheduling Warnings
          </span>
          <span className="text-xs text-amber-500 dark:text-amber-400">
            {errors.length > 0 && (
              <span className="bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 px-1.5 py-0.5 rounded font-medium mr-1">
                {errors.length} conflict{errors.length !== 1 ? "s" : ""}
              </span>
            )}
            {warnings.length > 0 && (
              <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                {warnings.length} warning{warnings.length !== 1 ? "s" : ""}
              </span>
            )}
            {dependencyConflicts.length > 0 && (
              <span className="bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded">
                {dependencyConflicts.length} dep violation{dependencyConflicts.length !== 1 ? "s" : ""}
              </span>
            )}
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-amber-500 transition-transform ${collapsed ? "" : "rotate-180"}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-4 pb-3 space-y-2">
          {errors.map((c, i) => (
            <WarningItem
              key={`err-${i}`}
              variant="error"
              title={prefixName(c.activityId, c.activityName)}
              detail={`${c.constraintType} ${formatDate(c.constraintDate)} (${c.constraintMode})`}
              message={c.message}
              formatDate={formatDate}
            />
          ))}
          {warnings.map((c, i) => (
            <WarningItem
              key={`warn-${i}`}
              variant="warning"
              title={prefixName(c.activityId, c.activityName)}
              detail={`${c.constraintType} ${formatDate(c.constraintDate)} (${c.constraintMode})`}
              message={c.message}
              formatDate={formatDate}
            />
          ))}
          {dependencyConflicts.map((dc, i) => {
            const lagSuffix = dc.lagDays !== 0 ? `${dc.lagDays > 0 ? "+" : ""}${dc.lagDays}d` : "";
            return (
            <WarningItem
              key={`dep-${i}`}
              variant="warning"
              title={`${prefixName(dc.fromActivityId, dc.fromActivityName)} → ${prefixName(dc.toActivityId, dc.toActivityName)}`}
              detail={`(${dc.dependencyType}${lagSuffix})`}
              message={dc.message}
              formatDate={formatDate}
            />
            );
          })}
        </div>
      )}
    </div>
  );
}
