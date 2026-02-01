import type { Activity } from "@domain/models/types";
import { ActivitySchema } from "@domain/schemas/project.schema";

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
        activityName: activity.name || "(unnamed)",
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
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-1.5">
      <p className="text-sm font-medium text-amber-800">
        {errors.length} activit{errors.length === 1 ? "y has" : "ies have"}{" "}
        validation errors
      </p>
      <ul className="space-y-1">
        {errors.map((err) => (
          <li key={err.activityId} className="text-sm text-amber-700">
            <button
              onClick={() => scrollToActivity(err.activityId)}
              className="text-amber-800 font-medium hover:underline"
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
