import type { DeterministicSchedule } from "@domain/models/types";
import { formatDateDisplay } from "@core/calendar/calendar";

interface SchedulePanelProps {
  schedule: DeterministicSchedule | null;
  probabilityTarget: number;
}

export function SchedulePanel({
  schedule,
  probabilityTarget,
}: SchedulePanelProps) {
  if (!schedule) return null;

  const targetPct = Math.round(probabilityTarget * 100);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">
          Deterministic Schedule (P{targetPct})
        </h3>
        <div className="text-sm text-gray-500">
          Total: {schedule.totalDurationDays} working days | End:{" "}
          <span className="font-medium text-gray-700">
            {formatDateDisplay(schedule.projectEndDate)}
          </span>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="py-2 px-3 text-left font-medium text-gray-600">
                #
              </th>
              <th className="py-2 px-3 text-left font-medium text-gray-600">
                Activity
              </th>
              <th className="py-2 px-3 text-right font-medium text-gray-600">
                Duration
              </th>
              <th className="py-2 px-3 text-left font-medium text-gray-600">
                Start
              </th>
              <th className="py-2 px-3 text-left font-medium text-gray-600">
                End
              </th>
              <th className="py-2 px-3 text-left font-medium text-gray-600">
                Source
              </th>
            </tr>
          </thead>
          <tbody>
            {schedule.activities.map((sa, idx) => (
              <tr key={sa.activityId} className="border-b border-gray-100">
                <td className="py-1.5 px-3 text-gray-400">{idx + 1}</td>
                <td className="py-1.5 px-3">{sa.name}</td>
                <td className="py-1.5 px-3 text-right tabular-nums">
                  {sa.duration}d
                </td>
                <td className="py-1.5 px-3 tabular-nums">{formatDateDisplay(sa.startDate)}</td>
                <td className="py-1.5 px-3 tabular-nums">{formatDateDisplay(sa.endDate)}</td>
                <td className="py-1.5 px-3">
                  {sa.isActual ? (
                    <span className="text-green-600 text-xs font-medium">
                      Actual
                    </span>
                  ) : (
                    <span className="text-blue-600 text-xs">P{targetPct}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
