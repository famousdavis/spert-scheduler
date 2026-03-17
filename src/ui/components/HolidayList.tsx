// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback } from "react";
import type { Calendar, Holiday } from "@domain/models/types";
import type { NagerCountry } from "@domain/models/nager-types";
import { useDateFormat } from "@ui/hooks/use-date-format";

interface HolidayListProps {
  calendar: Calendar;
  countries: NagerCountry[];
  onUpdate: (calendar: Calendar) => void;
}

export function HolidayList({ calendar, countries, onUpdate }: HolidayListProps) {
  const formatDate = useDateFormat();

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocale, setEditLocale] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

  const getCountryName = useCallback(
    (code: string) =>
      countries.find((c) => c.countryCode === code)?.name ?? code,
    [countries],
  );

  const removeHoliday = (id: string) => {
    onUpdate({
      holidays: calendar.holidays.filter((h) => h.id !== id),
    });
  };

  const startEditing = (holiday: Holiday) => {
    setEditingId(holiday.id);
    setEditName(holiday.name);
    setEditLocale(holiday.locale ?? "");
    setEditStartDate(holiday.startDate);
    setEditEndDate(holiday.endDate);
  };

  const cancelEditing = () => {
    setEditingId(null);
  };

  const saveEdit = () => {
    if (!editName.trim() || !editStartDate || !editEndDate) return;
    if (editEndDate < editStartDate) return;

    onUpdate({
      holidays: calendar.holidays
        .map((h) =>
          h.id === editingId
            ? {
                ...h,
                name: editName.trim(),
                locale: editLocale.trim() || undefined,
                startDate: editStartDate,
                endDate: editEndDate,
              }
            : h,
        )
        .sort((a, b) => a.startDate.localeCompare(b.startDate)),
    });
    setEditingId(null);
  };

  const formatRange = (h: Holiday) => {
    if (h.startDate === h.endDate) {
      return formatDate(h.startDate);
    }
    return `${formatDate(h.startDate)} \u2013 ${formatDate(h.endDate)}`;
  };

  if (calendar.holidays.length === 0) {
    return (
      <p className="text-gray-400 dark:text-gray-500 text-sm">
        No holidays configured.
      </p>
    );
  }

  return (
    <ul className="space-y-1">
      {calendar.holidays.map((holiday) =>
        editingId === holiday.id ? (
          /* Edit mode */
          <li
            key={holiday.id}
            className="flex flex-wrap items-center gap-2 py-2 px-3 bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded"
          >
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm w-44 bg-white dark:bg-gray-700 dark:text-gray-100"
            />
            <input
              type="text"
              value={editLocale}
              onChange={(e) => setEditLocale(e.target.value)}
              placeholder="Locale"
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm w-28 bg-white dark:bg-gray-700 dark:text-gray-100"
            />
            <input
              type="date"
              value={editStartDate}
              onChange={(e) => {
                setEditStartDate(e.target.value);
                if (e.target.value > editEndDate) {
                  setEditEndDate(e.target.value);
                }
              }}
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
            />
            <input
              type="date"
              value={editEndDate}
              min={editStartDate}
              onChange={(e) => setEditEndDate(e.target.value)}
              className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
            />
            <button
              onClick={saveEdit}
              disabled={
                !editName.trim() || !editStartDate || !editEndDate
              }
              className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm font-medium disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={cancelEditing}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-sm"
            >
              Cancel
            </button>
          </li>
        ) : (
          /* Display mode */
          <li
            key={holiday.id}
            className={`flex items-center justify-between py-1.5 px-3 rounded ${
              holiday.source === "api"
                ? "bg-blue-50/50 dark:bg-blue-900/20 border-l-2 border-l-blue-300 dark:border-l-blue-500 border border-gray-200 dark:border-gray-700"
                : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
            }`}
          >
            <div className="min-w-0 flex items-center gap-2">
              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {holiday.name || formatRange(holiday)}
              </span>
              {/* Country or locale label */}
              {holiday.source === "api" &&
                holiday.countryCodes &&
                holiday.countryCodes.length > 0 && (
                  <span className="text-sm italic font-normal text-gray-500 dark:text-gray-400">
                    (
                    {holiday.countryCodes.length > 1
                      ? "Multi"
                      : getCountryName(holiday.countryCodes[0]!)}
                    )
                  </span>
                )}
              {holiday.locale && (
                <span className="text-sm italic font-normal text-gray-500 dark:text-gray-400">
                  ({holiday.locale})
                </span>
              )}
              {holiday.name && (
                <span className="text-xs text-gray-600 dark:text-gray-400 tabular-nums">
                  {formatRange(holiday)}
                </span>
              )}
              {holiday.source === "api" && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-800 text-blue-600 dark:text-blue-300 font-medium">
                  API
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <button
                onClick={() => startEditing(holiday)}
                className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 text-sm"
              >
                Edit
              </button>
              <button
                onClick={() => removeHoliday(holiday.id)}
                className="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 text-sm"
              >
                Remove
              </button>
            </div>
          </li>
        ),
      )}
    </ul>
  );
}
