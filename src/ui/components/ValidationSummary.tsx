// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity } from "@domain/models/types";
import { ActivitySchema } from "@domain/schemas/project.schema";
import { nameOrUnnamed } from "@domain/helpers/display-name";

interface ValidationSummaryProps {
  activities: Activity[];
}

interface ActivityError {
  activityId: string;
  activityName: string;
  messages: string[];
}

export function ValidationSummary({ activities }: ValidationSummaryProps) {
  const errors: ActivityError[] = [];

  for (const activity of activities) {
    const result = ActivitySchema.safeParse(activity);
    if (!result.success) {
      errors.push({
        activityId: activity.id,
        activityName: nameOrUnnamed(activity.name),
        messages: result.error.issues.map((issue) => issue.message),
      });
    }
  }

  if (errors.length === 0) return null;

  const scrollToActivity = (activityId: string) => {
    const el = document.querySelector<HTMLElement>(
      `[data-row-id="${activityId}"][data-field="name"]`
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.focus();
    }
  };

  return (
    <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 space-y-1.5">
      <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
        {errors.length} activit{errors.length === 1 ? "y has" : "ies have"}{" "}
        validation errors
      </p>
      <ul className="space-y-1">
        {errors.map((err) => (
          <li key={err.activityId} className="text-sm text-amber-700 dark:text-amber-300">
            <button
              onClick={() => scrollToActivity(err.activityId)}
              className="text-amber-800 dark:text-amber-200 font-medium hover:underline"
            >
              {err.activityName}
            </button>
            : {err.messages.join("; ")}
          </li>
        ))}
      </ul>
    </div>
  );
}
