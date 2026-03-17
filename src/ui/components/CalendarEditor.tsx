// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect } from "react";
import type { Calendar, Holiday } from "@domain/models/types";
import type { NagerCountry } from "@domain/models/nager-types";
import { generateId } from "@app/api/id";
import { formatDateISO } from "@core/calendar/calendar";
import {
  fetchAvailableCountries,
} from "@infrastructure/nager/nager-client";
import {
  loadCachedCountries,
  saveCachedCountries,
} from "@infrastructure/nager/country-cache";
import { HolidayLoader } from "./HolidayLoader";
import { HolidayList } from "./HolidayList";

interface CalendarEditorProps {
  calendar: Calendar;
  onUpdate: (calendar: Calendar) => void;
}

export function CalendarEditor({ calendar, onUpdate }: CalendarEditorProps) {
  const today = formatDateISO(new Date());

  // -- Shared country list (used by HolidayLoader + HolidayList) --------------
  const [countries, setCountries] = useState<NagerCountry[]>(() => {
    const cached = loadCachedCountries();
    return cached ?? [{ countryCode: "US", name: "United States" }];
  });

  useEffect(() => {
    let cancelled = false;
    fetchAvailableCountries()
      .then((list) => {
        if (!cancelled) {
          setCountries(list);
          saveCachedCountries(list);
        }
      })
      .catch(() => {
        // Use cached data (already set in initial state)
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // -- Add holiday form state -------------------------------------------------
  const [newName, setNewName] = useState("");
  const [newLocale, setNewLocale] = useState("");
  const [newStartDate, setNewStartDate] = useState(today);
  const [newEndDate, setNewEndDate] = useState(today);

  const addHoliday = () => {
    if (!newName.trim() || !newStartDate || !newEndDate) return;
    if (newEndDate < newStartDate) return;

    const holiday: Holiday = {
      id: generateId(),
      name: newName.trim(),
      startDate: newStartDate,
      endDate: newEndDate,
      source: "manual",
      ...(newLocale.trim() && { locale: newLocale.trim() }),
    };

    onUpdate({
      holidays: [...calendar.holidays, holiday].sort((a, b) =>
        a.startDate.localeCompare(b.startDate),
      ),
    });
    setNewName("");
    setNewLocale("");
    setNewStartDate(today);
    setNewEndDate(today);
  };

  return (
    <div className="space-y-4">
      {/* Country holiday loader */}
      <HolidayLoader calendar={calendar} countries={countries} onUpdate={onUpdate} />

      {/* Add holiday form */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Holiday Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., Lincoln's Birthday"
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm w-48 bg-white dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Locale <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            type="text"
            value={newLocale}
            onChange={(e) => setNewLocale(e.target.value)}
            placeholder="e.g., Illinois"
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm w-36 bg-white dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={newStartDate}
            onChange={(e) => {
              setNewStartDate(e.target.value);
              if (e.target.value > newEndDate) {
                setNewEndDate(e.target.value);
              }
            }}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={newEndDate}
            min={newStartDate}
            onChange={(e) => setNewEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
          />
        </div>
        <button
          onClick={addHoliday}
          disabled={!newName.trim() || !newStartDate || !newEndDate}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Holiday
        </button>
      </div>

      {/* Holiday list */}
      <HolidayList calendar={calendar} countries={countries} onUpdate={onUpdate} />
    </div>
  );
}
