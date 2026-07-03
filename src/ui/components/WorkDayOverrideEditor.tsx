// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useMemo, useRef, useEffect } from "react";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { useWorkCalendar } from "@ui/hooks/use-work-calendar";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { toast } from "@ui/hooks/use-notification-store";
import {
  classifyWorkDayAdd,
  classifyChipStatus,
  matchHolidays,
  computeBulkEligibleDates,
} from "@ui/helpers/classify-work-day-override";
import type { ChipStatus } from "@ui/helpers/classify-work-day-override";
import type { Calendar } from "@domain/models/types";

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

interface WorkDayOverrideEditorProps {
  projectId: string;
  convertedWorkDays: string[];
  forcedWorkDays: string[];
  projectCalendarOverride?: Calendar;
}

/**
 * A confirmation awaiting the user's decision. `mode: "add"` comes from the
 * date input (fresh add of a global-holiday date); `mode: "upgrade"` comes
 * from an inert converted chip's recovery action and never offers the bulk
 * range option (the date is already in convertedWorkDays, which the bulk
 * eligibility filter would exclude).
 */
interface PendingConfirmation {
  date: string;
  mode: "add" | "upgrade";
  holidayNames: string[];
  range?: { start: string; end: string };
}

interface OverrideChipProps {
  status: ChipStatus;
  canUpgrade: boolean;
  formattedDate: string;
  onUpgrade: () => void;
  onRemove: () => void;
}

function inertTitleFor(status: ChipStatus): string | undefined {
  if (status.active) return undefined;
  return status.reason === "project-holiday"
    ? "Not currently a work day — a project holiday falls on this date. Remove the project holiday to make it workable."
    : "Not currently a work day — a company holiday falls on this date.";
}

function OverrideChip({
  status,
  canUpgrade,
  formattedDate,
  onUpgrade,
  onRemove,
}: OverrideChipProps) {
  const inertTitle = inertTitleFor(status);
  return (
    <span
      title={inertTitle}
      className={
        status.active
          ? "inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full"
          : "inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 dark:bg-gray-700/40 text-gray-500 dark:text-gray-400 text-xs rounded-full line-through decoration-gray-400/60"
      }
    >
      {formattedDate}
      {canUpgrade && (
        <button
          onClick={onUpgrade}
          aria-label={`Convert ${formattedDate} to a forced holiday override`}
          className="ml-0.5 px-1.5 py-0 text-[11px] font-medium no-underline bg-amber-100 dark:bg-amber-800/40 text-amber-700 dark:text-amber-300 rounded hover:bg-amber-200 dark:hover:bg-amber-700/50"
        >
          Convert to forced override
        </button>
      )}
      <button
        onClick={onRemove}
        aria-label={`Remove ${formattedDate}`}
        className={
          status.active
            ? "ml-0.5 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
            : "ml-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        }
        title="Remove"
      >
        ×
      </button>
    </span>
  );
}

export function WorkDayOverrideEditor({
  projectId,
  convertedWorkDays,
  forcedWorkDays,
  projectCalendarOverride,
}: WorkDayOverrideEditorProps) {
  const formatDate = useDateFormat();
  const [dateInput, setDateInput] = useState("");
  const [pending, setPending] = useState<PendingConfirmation | null>(null);
  const [projectHolidayWarning, setProjectHolidayWarning] = useState<
    string | null
  >(null);
  const workCalendar = useWorkCalendar(projectId);
  const globalCalendar = usePreferencesStore(
    (s) => s.preferences.globalCalendar
  );
  const prefWorkDays = usePreferencesStore((s) => s.preferences.workDays);

  const addConvertedWorkDay = useProjectStore((s) => s.addConvertedWorkDay);
  const addForcedWorkDay = useProjectStore((s) => s.addForcedWorkDay);
  const setForcedWorkDays = useProjectStore((s) => s.setForcedWorkDays);
  const removeWorkDayOverride = useProjectStore(
    (s) => s.removeWorkDayOverride
  );
  const upgradeToForcedWorkDay = useProjectStore(
    (s) => s.upgradeToForcedWorkDay
  );

  const workDays = prefWorkDays ?? DEFAULT_WORK_DAYS;
  const globalHolidays = globalCalendar?.holidays ?? [];
  const projectHolidays = projectCalendarOverride?.holidays ?? [];

  // Focus the primary action when the confirm banner raises (a11y).
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pending) confirmButtonRef.current?.focus();
  }, [pending]);

  // Merged chip list. If a date somehow appears in both arrays (hand-edited or
  // imported data), display it once, tagged as forced for status purposes.
  const chips = useMemo(() => {
    const map = new Map<string, "converted" | "forced">();
    for (const d of convertedWorkDays) map.set(d, "converted");
    for (const d of forcedWorkDays) map.set(d, "forced");
    return [...map.entries()]
      .map(([date, source]) => ({ date, source }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [convertedWorkDays, forcedWorkDays]);

  // Bulk eligibility for the banner's "Convert all N days" button — computed
  // for the label itself so N is accurate before the click, never in upgrade
  // mode, and only when exactly one multi-day holiday matched (range present).
  const bulkEligible =
    pending?.mode === "add" && pending.range
      ? computeBulkEligibleDates(pending.range, {
          convertedWorkDays,
          forcedWorkDays,
          projectHolidays,
          workDays,
        })
      : [];

  const handleAdd = () => {
    if (!dateInput) return;
    const decision = classifyWorkDayAdd(dateInput, {
      convertedWorkDays,
      forcedWorkDays,
      globalHolidays,
      projectHolidays,
      workCalendar,
    });

    // A new add gesture always supersedes any pending confirmation — no
    // stacking, no queue; the newest classification takes over.
    switch (decision.kind) {
      case "duplicate":
        setPending(null);
        toast.info("This date is already in your list.");
        break;
      case "project-holiday-block":
        setPending(null);
        setProjectHolidayWarning(
          "This date is a project holiday — remove it from this project's holiday list first if you want it to be a work day."
        );
        break;
      case "global-holiday-confirm":
        setProjectHolidayWarning(null);
        setPending({
          date: dateInput,
          mode: "add",
          holidayNames: decision.holidayNames,
          range: decision.range,
        });
        break;
      case "already-workday-noop":
        setPending(null);
        toast.info("This date is already a work day — no override is needed.");
        break;
      case "ok":
        setPending(null);
        addConvertedWorkDay(projectId, dateInput);
        break;
    }
    setDateInput("");
  };

  const handleUpgrade = (date: string) => {
    setProjectHolidayWarning(null);
    setPending({
      date,
      mode: "upgrade",
      holidayNames: matchHolidays(date, globalHolidays).map((h) => h.name),
      // No bulk affordance in upgrade mode — the date being recovered is
      // already in convertedWorkDays, which the bulk filter would exclude.
    });
  };

  const handleConfirmSingle = () => {
    if (!pending) return;
    if (pending.mode === "add") {
      addForcedWorkDay(projectId, pending.date);
    } else {
      upgradeToForcedWorkDay(projectId, pending.date);
    }
    setPending(null);
  };

  const handleConfirmBulk = () => {
    if (bulkEligible.length === 0) return;
    setForcedWorkDays(projectId, [...forcedWorkDays, ...bulkEligible].sort());
    setPending(null);
  };

  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Converted Work Days
      </h3>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Mark specific dates as working days for this project — weekends, or
        company holidays (with confirmation).
      </p>

      {/* Add form */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="date"
          id={`work-day-override-${projectId}`}
          name="workDayOverride"
          aria-label="Work day override date"
          value={dateInput}
          onChange={(e) => setDateInput(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:border-blue-400 focus:outline-none"
        />
        <button
          onClick={handleAdd}
          disabled={!dateInput}
          className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add
        </button>
      </div>

      {/* Global-holiday confirm banner (not a modal — page stays interactive) */}
      {pending && (
        <div
          role="status"
          aria-live="polite"
          onKeyDown={(e) => {
            if (e.key === "Escape") setPending(null);
          }}
          className="mt-2 flex flex-col gap-2 text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-3 py-2 rounded-md"
        >
          <span>
            {formatDate(pending.date)} is a company holiday (
            {pending.holidayNames.join(", ")}). Convert it to a work day for
            this project only?
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              ref={confirmButtonRef}
              onClick={handleConfirmSingle}
              aria-label={`Convert ${formatDate(pending.date)} to a work day for this project`}
              className="px-2 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Convert this day
            </button>
            {pending.mode === "add" &&
              pending.range &&
              bulkEligible.length > 0 && (
                <button
                  onClick={handleConfirmBulk}
                  aria-label={`Convert all ${bulkEligible.length} eligible days of ${pending.holidayNames[0]} to work days`}
                  className="px-2 py-1 text-xs font-medium bg-blue-100 dark:bg-blue-800/40 text-blue-700 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-700/50"
                >
                  Convert all {bulkEligible.length}{" "}
                  {bulkEligible.length === 1 ? "day" : "days"} of{" "}
                  {pending.holidayNames[0]}
                </button>
              )}
            <button
              onClick={() => setPending(null)}
              aria-label="Cancel holiday conversion"
              className="px-2 py-1 text-xs font-medium text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Project-holiday blocked-action warning (persistent until dismissed) */}
      {projectHolidayWarning && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 rounded-md">
          <span>{projectHolidayWarning}</span>
          <button
            onClick={() => setProjectHolidayWarning(null)}
            className="ml-auto shrink-0 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/40 rounded hover:bg-amber-200 dark:hover:bg-amber-700/50"
          >
            Got it
          </button>
        </div>
      )}

      {/* 50+ entry warning */}
      {convertedWorkDays.length + forcedWorkDays.length > 50 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          You have added many work day overrides. Consider adjusting your work
          week settings instead.
        </p>
      )}

      {/* Chip list — status computed from isWorkDay, not array membership */}
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map(({ date, source }) => {
            const status = classifyChipStatus(date, {
              projectHolidays,
              workCalendar,
            });
            const canUpgrade =
              !status.active &&
              status.reason === "global-holiday" &&
              source === "converted";
            return (
              <OverrideChip
                key={date}
                status={status}
                canUpgrade={canUpgrade}
                formattedDate={formatDate(date)}
                onUpgrade={() => handleUpgrade(date)}
                onRemove={() => removeWorkDayOverride(projectId, date)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
