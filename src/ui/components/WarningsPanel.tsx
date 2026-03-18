// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState } from "react";
import type { ConstraintConflict } from "@domain/models/types";
import { useDateFormat } from "@ui/hooks/use-date-format";

interface WarningsPanelProps {
  conflicts: ConstraintConflict[];
}

export function WarningsPanel({ conflicts }: WarningsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const formatDate = useDateFormat();

  if (conflicts.length === 0) return null;

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
          {/* Errors first */}
          {errors.map((c, i) => (
            <div
              key={`err-${i}`}
              className="flex items-start gap-2 text-xs bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded p-2"
            >
              <span className="text-red-500 dark:text-red-400 mt-0.5 shrink-0">!</span>
              <div>
                <span className="font-medium text-red-700 dark:text-red-300">
                  {c.activityName}
                </span>
                <span className="text-red-600 dark:text-red-400 ml-1">
                  {c.constraintType} {formatDate(c.constraintDate)} ({c.constraintMode})
                </span>
                <p className="text-red-600 dark:text-red-400 mt-0.5">{c.message.replace(/\d{4}-\d{2}-\d{2}/g, (m) => formatDate(m))}</p>
              </div>
            </div>
          ))}

          {/* Then warnings */}
          {warnings.map((c, i) => (
            <div
              key={`warn-${i}`}
              className="flex items-start gap-2 text-xs bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded p-2"
            >
              <span className="text-amber-500 dark:text-amber-400 mt-0.5 shrink-0">!</span>
              <div>
                <span className="font-medium text-amber-700 dark:text-amber-300">
                  {c.activityName}
                </span>
                <span className="text-amber-600 dark:text-amber-400 ml-1">
                  {c.constraintType} {formatDate(c.constraintDate)} ({c.constraintMode})
                </span>
                <p className="text-amber-600 dark:text-amber-400 mt-0.5">{c.message.replace(/\d{4}-\d{2}-\d{2}/g, (m) => formatDate(m))}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
