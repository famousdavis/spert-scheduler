import type { DeterministicSchedule, ScenarioSettings, Calendar } from "@domain/models/types";
import type { ScheduleBuffer } from "@core/schedule/buffer";
import {
  formatDateDisplay,
  parseDateISO,
  addWorkingDays,
  formatDateISO,
} from "@core/calendar/calendar";

/** Percentile options for the Activity Target dropdown (P50–P95) */
const PERCENTILE_OPTIONS = [
  { value: 0.5, label: "P50" },
  { value: 0.55, label: "P55" },
  { value: 0.6, label: "P60" },
  { value: 0.65, label: "P65" },
  { value: 0.7, label: "P70" },
  { value: 0.75, label: "P75" },
  { value: 0.8, label: "P80" },
  { value: 0.85, label: "P85" },
  { value: 0.9, label: "P90" },
  { value: 0.95, label: "P95" },
];

/** Percentile options for the Project Target dropdown (P50–P99) */
const PROJECT_PERCENTILE_OPTIONS = [
  { value: 0.5, label: "P50" },
  { value: 0.55, label: "P55" },
  { value: 0.6, label: "P60" },
  { value: 0.65, label: "P65" },
  { value: 0.7, label: "P70" },
  { value: 0.75, label: "P75" },
  { value: 0.8, label: "P80" },
  { value: 0.85, label: "P85" },
  { value: 0.9, label: "P90" },
  { value: 0.95, label: "P95" },
  { value: 0.96, label: "P96" },
  { value: 0.97, label: "P97" },
  { value: 0.98, label: "P98" },
  { value: 0.99, label: "P99" },
];

interface ScenarioSummaryCardProps {
  startDate: string;
  schedule: DeterministicSchedule | null;
  buffer: ScheduleBuffer | null;
  calendar?: Calendar;
  settings: ScenarioSettings;
  hasSimulationResults: boolean;
  onSettingsChange: (updates: Partial<ScenarioSettings>) => void;
  onNewSeed: () => void;
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
}: ScenarioSummaryCardProps) {
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
    <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      {/* Row 1: Dates and duration */}
      <div className="flex items-baseline gap-6 flex-wrap">
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Start
          </span>
          <p className="text-lg font-semibold text-blue-700 tabular-nums">
            {formatDateDisplay(startDate)}
          </p>
        </div>
        <div className="border-l border-gray-200 self-stretch" />
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Finish w/o Buffer
          </span>
          <p className="text-lg font-semibold text-blue-700 tabular-nums">
            {schedule ? formatDateDisplay(schedule.projectEndDate) : "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Duration
          </span>
          <p className="text-lg font-semibold text-gray-900 tabular-nums">
            {schedule ? (
              <>
                {schedule.totalDurationDays}{" "}
                <span className="text-sm font-normal text-gray-500">
                  working days
                </span>
              </>
            ) : (
              "—"
            )}
          </p>
        </div>
        <div className="border-l border-gray-200 self-stretch" />
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Finish w/Buffer
          </span>
          <p className="text-lg font-semibold text-blue-700 tabular-nums">
            {bufferedEndDate ? formatDateDisplay(bufferedEndDate) : "—"}
          </p>
        </div>
        <div>
          <span className="text-xs text-gray-500 uppercase tracking-wide">
            Duration w/Buffer
          </span>
          <p className="text-lg font-semibold text-gray-900 tabular-nums">
            {schedule && buffer && buffer.bufferDays > 0 ? (
              <>
                {schedule.totalDurationDays + buffer.bufferDays}{" "}
                <span className="text-sm font-normal text-gray-500">
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
          <label className="text-gray-500 text-xs whitespace-nowrap">
            Activity Target:
          </label>
          <select
            value={settings.probabilityTarget}
            onChange={(e) =>
              onSettingsChange({
                probabilityTarget: parseFloat(e.target.value),
              })
            }
            className="px-2 py-1 border border-gray-200 rounded text-sm font-medium focus:border-blue-400 focus:outline-none"
          >
            {PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Project Target */}
        <div className="flex items-center gap-1.5">
          <label className="text-gray-500 text-xs whitespace-nowrap">
            Project Target:
          </label>
          <select
            value={settings.projectProbabilityTarget}
            onChange={(e) =>
              onSettingsChange({
                projectProbabilityTarget: parseFloat(e.target.value),
              })
            }
            className="px-2 py-1 border border-gray-200 rounded text-sm font-medium focus:border-blue-400 focus:outline-none"
          >
            {PROJECT_PERCENTILE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className="border-l border-gray-200 h-5" />

        {/* Trials */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs">Trials:</span>
          <span className="font-medium tabular-nums">
            {settings.trialCount.toLocaleString()}
          </span>
        </div>

        {/* Seed */}
        <div className="flex items-center gap-1.5">
          <span className="text-gray-500 text-xs">Seed:</span>
          <code className="text-xs text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded max-w-[100px] truncate">
            {settings.rngSeed.slice(0, 8)}
          </code>
          <button
            onClick={onNewSeed}
            className="text-blue-600 hover:text-blue-800 text-xs hover:underline"
          >
            New
          </button>
        </div>
      </div>

      {/* Row 3: Schedule Buffer */}
      <div className="pt-1 border-t border-gray-100">
        {buffer ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">Schedule Buffer:</span>
            <span
              className={`font-semibold tabular-nums ${
                buffer.bufferDays >= 0 ? "text-blue-700" : "text-red-600"
              }`}
            >
              {buffer.bufferDays > 0 ? "+" : ""}
              {buffer.bufferDays} days
            </span>
            <span className="text-xs text-gray-400">
              (P{actPct} schedule → P{projPct} project confidence)
            </span>
          </div>
        ) : hasSimulationResults ? (
          <span className="text-xs text-gray-400">
            Buffer unavailable — P{projPct} not found in simulation results
          </span>
        ) : (
          <span className="text-xs text-gray-400 italic">
            Run simulation to calculate schedule buffer
          </span>
        )}
      </div>
    </div>
  );
}
