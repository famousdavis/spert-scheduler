// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useMemo } from "react";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { useWorkCalendar } from "@ui/hooks/use-work-calendar";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { mergeCalendars } from "@core/calendar/calendar";
import { buildHolidaySet } from "@core/calendar/work-calendar";
import { toast } from "@ui/hooks/use-notification-store";
import type { Calendar } from "@domain/models/types";

interface ConvertedWorkDaysEditorProps {
  projectId: string;
  convertedWorkDays: string[];
  projectCalendarOverride?: Calendar;
  onAdd: (date: string) => void;
  onRemove: (date: string) => void;
}

export function ConvertedWorkDaysEditor({
  projectId,
  convertedWorkDays,
  projectCalendarOverride,
  onAdd,
  onRemove,
}: ConvertedWorkDaysEditorProps) {
  const formatDate = useDateFormat();
  const [dateInput, setDateInput] = useState("");
  const [holidayWarning, setHolidayWarning] = useState<string | null>(null);
  const workCalendar = useWorkCalendar(projectId);
  const globalCalendar = usePreferencesStore((s) => s.preferences.globalCalendar);

  // Build holiday set for checking if a date is a holiday
  const holidaySet = useMemo(() => {
    const merged = mergeCalendars(globalCalendar, projectCalendarOverride);
    return merged ? buildHolidaySet(merged.holidays) : new Set<string>();
  }, [globalCalendar, projectCalendarOverride]);

  const handleAdd = () => {
    if (!dateInput) return;

    // Check if date is a holiday
    if (holidaySet.has(dateInput)) {
      setHolidayWarning(
        "This date is a holiday \u2014 it will remain a non-work day unless removed from the holiday list."
      );
      setDateInput("");
      return;
    }

    // Check if already a work day (no-op warning — Amendment 8)
    const dateObj = new Date(dateInput + "T00:00:00");
    if (workCalendar.isWorkDay(dateObj)) {
      toast.info("This date is already a work day \u2014 no override is needed.");
      setDateInput("");
      return;
    }

    // Check if already in list
    if (convertedWorkDays.includes(dateInput)) {
      toast.info("This date is already in the converted work days list.");
      setDateInput("");
      return;
    }

    onAdd(dateInput);
    setDateInput("");
  };

  const sorted = useMemo(
    () => [...convertedWorkDays].sort(),
    [convertedWorkDays]
  );

  return (
    <div className="mt-4">
      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
        Converted Work Days
      </h3>
      <p className="mt-0.5 text-xs text-gray-500 dark:text-gray-400">
        Mark specific non-work days (weekends) as working days for this project.
      </p>

      {/* Add form */}
      <div className="mt-2 flex items-center gap-2">
        <input
          type="date"
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

      {/* Holiday blocked-action warning (persistent until dismissed) */}
      {holidayWarning && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/30 px-3 py-2 rounded-md">
          <span>{holidayWarning}</span>
          <button
            onClick={() => setHolidayWarning(null)}
            className="ml-auto shrink-0 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-800/40 rounded hover:bg-amber-200 dark:hover:bg-amber-700/50"
          >
            Got it
          </button>
        </div>
      )}

      {/* 50+ entry warning (Amendment 4) */}
      {convertedWorkDays.length > 50 && (
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          You have added many work day overrides. Consider adjusting your work
          week settings instead.
        </p>
      )}

      {/* Chip list */}
      {sorted.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {sorted.map((date) => (
            <span
              key={date}
              className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded-full"
            >
              {formatDate(date)}
              <button
                onClick={() => onRemove(date)}
                className="ml-0.5 text-blue-400 hover:text-blue-600 dark:hover:text-blue-200"
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
