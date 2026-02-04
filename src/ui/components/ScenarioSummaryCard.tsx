import type { DeterministicSchedule, ScenarioSettings, Calendar } from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import {
  parseDateISO,
  addWorkingDays,
  formatDateISO,
} from "@core/calendar/calendar";
import {
  ACTIVITY_PERCENTILE_OPTIONS,
  PROJECT_PERCENTILE_OPTIONS,
} from "@ui/helpers/percentile-options";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { toast } from "@ui/hooks/use-notification-store";

interface ScenarioSummaryCardProps {
  startDate: string;
  schedule: DeterministicSchedule | null;
  buffer: ScheduleBuffer | null;
  calendar?: Calendar;
  settings: ScenarioSettings;
  hasSimulationResults: boolean;
  onSettingsChange: (updates: Partial<ScenarioSettings>) => void;
  onNewSeed: () => void;
  isLocked?: boolean;
  onToggleLock?: () => void;
}

export function ScenarioSummaryCard({
  startDate,
  schedule,
  buffer,
  calendar,
  settings,
  hasSimulationResults,
  onSettingsChange,
  onNewSeed,
  isLocked,
  onToggleLock,
}: ScenarioSummaryCardProps) {
  const formatDate = useDateFormat();
  const actPct = Math.round(settings.probabilityTarget * 100);
  const projPct = Math.round(settings.projectProbabilityTarget * 100);

  // Compute buffered finish date by adding buffer working days to the deterministic end date
  const bufferedEndDate =
    schedule && buffer && buffer.bufferDays > 0
      ? formatDateISO(
          addWorkingDays(
            parseDateISO(schedule.projectEndDate),
            buffer.bufferDays,
            calendar
          )
        )
      : null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-3">
      {/* Lock indicator banner */}
      {isLocked && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-md -mt-1 mb-2">
          <span className="text-amber-600 dark:text-amber-400 text-sm">🔒</span>
          <span className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            This scenario is locked — editing is disabled
          </span>
          {onToggleLock && (
            <button
              onClick={onToggleLock}
              className="ml-auto text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 font-medium hover:underline"
            >
              Unlock
            </button>
          )}
        </div>
      )}

      {/* Row 1: Dates and duration */}
      <div className="flex items-baseline gap-6 flex-wrap">
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Start
          </span>
          <p className="text-lg font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
            {formatDate(startDate)}
          </p>
        </div>
        <div className="border-l border-gray-200 dark:border-gray-600 self-stretch" />
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Finish w/o Buffer
          </span>
          <p className="text-lg font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
            {schedule ? formatDate(schedule.projectEndDate) : "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Duration
          </span>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {schedule ? (
              <>
                {schedule.totalDurationDays}{" "}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  working days
                </span>
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="border-l border-gray-200 dark:border-gray-600 self-stretch" />
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Finish w/Buffer
          </span>
          <p className="text-lg font-semibold text-blue-700 dark:text-blue-400 tabular-nums">
            {bufferedEndDate ? formatDate(bufferedEndDate) : "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
            Duration w/Buffer
          </span>
          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 tabular-nums">
            {schedule && buffer && buffer.bufferDays > 0 ? (
              <>
                {schedule.totalDurationDays + buffer.bufferDays}{" "}
                <span className="text-sm font-normal text-gray-500 dark:text-gray-400">
                  working days
                </span>
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
      </div>

      {/* Row 2: Targets, trials, seed */}
      <div className="flex items-center gap-4 flex-wrap text-sm">
        {/* Activity Target */}
        <div className="flex items-center gap-1.5">
          <label className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
            Activity Target:
          </label>
          <select
            value={settings.probabilityTarget}
            onChange={(e) =>
              onSettingsChange({
                probabilityTarget: parseFloat(e.target.value),
              })
            }
            disabled={isLocked}
            className="px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm font-medium focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {ACTIVITY_PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Project Target */}
        <div className="flex items-center gap-1.5">
          <label className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
            Project Target:
          </label>
          <select
            value={settings.projectProbabilityTarget}
            onChange={(e) =>
              onSettingsChange({
                projectProbabilityTarget: parseFloat(e.target.value),
              })
            }
            disabled={isLocked}
            className="px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm font-medium focus:border-blue-400 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {PROJECT_PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-l border-gray-200 dark:border-gray-600 h-5" />

        {/* Trials */}
        <div className="flex items-center gap-1.5">
          <label className="text-gray-500 dark:text-gray-400 text-xs whitespace-nowrap">
            Trials:
          </label>
          <select
            value={settings.trialCount}
            onChange={(e) =>
              onSettingsChange({
                trialCount: parseInt(e.target.value, 10),
              })
            }
            disabled={isLocked}
            className="px-2 py-1 border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-sm font-medium focus:border-blue-400 focus:outline-none tabular-nums disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {[1000, 5000, 10000, 25000, 50000].map((n) => (
              <option key={n} value={n}>
                {n.toLocaleString()}
              </option>
            ))}
          </select>
        </div>

        {/* Seed */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 dark:text-gray-400 text-xs">Seed:</span>
          <code className="text-xs text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded max-w-[100px] truncate">
            {settings.rngSeed.slice(0, 8)}
          </code>
          <button
            onClick={() => {
              navigator.clipboard.writeText(settings.rngSeed);
              toast.success("Seed copied to clipboard");
            }}
            className="text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-xs"
            title="Copy full seed to clipboard"
            aria-label="Copy seed"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={onNewSeed}
            disabled={isLocked}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-xs hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:no-underline"
          >
            New
          </button>
        </div>
      </div>

      {/* Row 3: Schedule Buffer */}
      <div className="pt-1 border-t border-gray-100 dark:border-gray-700">
        {buffer ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 dark:text-gray-400">Schedule Buffer:</span>
            <span
              className={`font-semibold tabular-nums ${
                buffer.bufferDays >= 0 ? "text-blue-700 dark:text-blue-400" : "text-red-600 dark:text-red-400"
              }`}
            >
              {buffer.bufferDays > 0 ? "+" : ""}
              {buffer.bufferDays} days
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              (P{actPct} schedule → P{projPct} project confidence)
            </span>
          </div>
        ) : hasSimulationResults ? (
          <span className="text-xs text-gray-400 dark:text-gray-500">
            Buffer unavailable — P{projPct} not found in simulation results
          </span>
        ) : (
          <span className="text-xs text-gray-400 dark:text-gray-500 italic">
            Run simulation to calculate schedule buffer
          </span>
        )}
      </div>
    </div>
  );
}
