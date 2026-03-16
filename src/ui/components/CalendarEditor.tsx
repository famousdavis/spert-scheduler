// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useRef, useCallback } from "react";
import type { Calendar, Holiday } from "@domain/models/types";
import type { NagerCountry } from "@domain/models/nager-types";
import { generateId } from "@app/api/id";
import { formatDateISO } from "@core/calendar/calendar";
import { getUSHolidays } from "@core/calendar/us-holidays";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import {
  fetchAvailableCountries,
  fetchPublicHolidays,
} from "@infrastructure/nager/nager-client";
import {
  loadCachedCountries,
  saveCachedCountries,
} from "@infrastructure/nager/country-cache";

type ButtonState = "idle" | "loading" | "success" | "error";

const FAILURE_MESSAGE =
  "Holiday data couldn\u2019t be loaded right now. This is likely a temporary issue " +
  "with the holiday data service \u2014 your other SPERT\u00AE Scheduler features are " +
  "unaffected. You can enter your holidays manually instead, or try again later.";

interface CalendarEditorProps {
  calendar: Calendar;
  onUpdate: (calendar: Calendar) => void;
}

export function CalendarEditor({ calendar, onUpdate }: CalendarEditorProps) {
  const formatDate = useDateFormat();
  const today = formatDateISO(new Date());
  const currentYear = new Date().getFullYear();

  const { preferences, updatePreferences } = usePreferencesStore();

  // -- Country + year state ---------------------------------------------------
  const [countries, setCountries] = useState<NagerCountry[]>(() => {
    const cached = loadCachedCountries();
    return cached ?? [{ countryCode: "US", name: "United States" }];
  });
  const [selectedCountry, setSelectedCountry] = useState(
    preferences.defaultHolidayCountry ??
      (navigator.language?.split("-")[1]?.toUpperCase() || "US"),
  );
  const [presetYear, setPresetYear] = useState(currentYear);

  // Sync selectedCountry when preferences load from localStorage
  useEffect(() => {
    const saved = preferences.defaultHolidayCountry;
    if (saved && saved !== selectedCountry) {
      setSelectedCountry(saved);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferences.defaultHolidayCountry]);

  // -- Button + inline message state ------------------------------------------
  const [buttonState, setButtonState] = useState<ButtonState>("idle");
  const [inlineMessage, setInlineMessage] = useState<string | null>(null);
  const inlineTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current);
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
    };
  }, []);

  // -- Country list fetch on mount --------------------------------------------
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

  // -- Refs for stable access in handlers -------------------------------------
  const calendarRef = useRef(calendar);
  calendarRef.current = calendar;

  // -- Helpers ----------------------------------------------------------------

  const getCountryName = useCallback(
    (code: string) =>
      countries.find((c) => c.countryCode === code)?.name ?? code,
    [countries],
  );

  // -- Country change ---------------------------------------------------------
  const handleCountryChange = (code: string) => {
    setSelectedCountry(code);
    updatePreferences({ defaultHolidayCountry: code });
    setButtonState("idle");
    setInlineMessage(null);
  };

  // -- Year change ------------------------------------------------------------
  const handleYearChange = (year: number) => {
    setPresetYear(year);
    setButtonState("idle");
    setInlineMessage(null);
  };

  // -- Load holidays ----------------------------------------------------------
  const loadHolidays = async () => {
    setButtonState("loading");
    setInlineMessage(null);

    try {
      const apiHolidays = await fetchPublicHolidays(
        presetYear,
        selectedCountry,
      );

      const latest = calendarRef.current;
      const existingByDate = new Map(
        latest.holidays.map((h) => [h.startDate, h]),
      );

      // Separate into new holidays vs existing ones that need country merging
      const newHolidays: Holiday[] = [];
      const mergedDates = new Map<string, string>(); // date → new name

      for (const e of apiHolidays) {
        const existing = existingByDate.get(e.date);
        if (!existing) {
          newHolidays.push({
            id: generateId(),
            name: e.name,
            startDate: e.date,
            endDate: e.date,
            source: "api" as const,
            countryCodes: [selectedCountry],
          });
        } else if (
          existing.source === "api" &&
          !existing.countryCodes?.includes(selectedCountry)
        ) {
          // Merge country code and name into existing holiday
          mergedDates.set(e.date, e.name);
        }
      }

      if (newHolidays.length === 0 && mergedDates.size === 0) {
        // All holidays from this fetch already exist for this country
        if (inlineTimerRef.current) clearTimeout(inlineTimerRef.current);
        setInlineMessage(
          `Holidays for ${getCountryName(selectedCountry)} ${presetYear} are already loaded.`,
        );
        inlineTimerRef.current = setTimeout(() => {
          setInlineMessage(null);
          inlineTimerRef.current = null;
        }, 4000);
        setButtonState("idle");
        return;
      }

      // Merge country codes and names into existing holidays that overlap
      const updated = latest.holidays.map((h) => {
        const newName = mergedDates.get(h.startDate);
        if (newName === undefined) return h;
        const mergedName =
          newName !== h.name ? `${h.name} / ${newName}` : h.name;
        return {
          ...h,
          name: mergedName,
          countryCodes: [...(h.countryCodes ?? []), selectedCountry],
        };
      });

      onUpdate({
        holidays: [...updated, ...newHolidays].sort((a, b) =>
          a.startDate.localeCompare(b.startDate),
        ),
      });

      setButtonState("success");
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setButtonState("idle");
        successTimerRef.current = null;
      }, 2000);
    } catch (err) {
      console.error("Holiday fetch failed:", err);
      setButtonState("error");
      setInlineMessage(FAILURE_MESSAGE);

      // US fallback: offer built-in holidays when API is unavailable
      if (selectedCountry === "US") {
        setInlineMessage(
          FAILURE_MESSAGE +
            "\n\nSince you selected the US, you can use the built-in holiday list instead.",
        );
      }
    }
  };

  // -- US fallback loader -----------------------------------------------------
  const loadUSFallback = () => {
    const current = calendarRef.current;
    const existingDates = new Set(current.holidays.map((h) => h.startDate));
    const entries = getUSHolidays(presetYear);
    const newHolidays: Holiday[] = entries
      .filter((e) => !existingDates.has(e.date))
      .map((e) => ({
        id: generateId(),
        name: e.name,
        startDate: e.date,
        endDate: e.date,
        source: "api" as const,
        countryCodes: ["US"],
      }));
    if (newHolidays.length > 0) {
      onUpdate({
        holidays: [...current.holidays, ...newHolidays].sort((a, b) =>
          a.startDate.localeCompare(b.startDate),
        ),
      });
    }
    setButtonState("idle");
    setInlineMessage(null);
  };

  // -- Add form state ---------------------------------------------------------
  const [newName, setNewName] = useState("");
  const [newLocale, setNewLocale] = useState("");
  const [newStartDate, setNewStartDate] = useState(today);
  const [newEndDate, setNewEndDate] = useState(today);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editLocale, setEditLocale] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");

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

  // -- Button label + spinner -------------------------------------------------
  const buttonLabel = () => {
    switch (buttonState) {
      case "loading":
        return (
          <>
            <svg
              className="animate-spin -ml-0.5 mr-1.5 h-3.5 w-3.5 inline"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            Loading...
          </>
        );
      case "success":
        return "Holidays Loaded \u2713";
      case "error":
        return "Retry Now";
      default:
        return "Load Holidays";
    }
  };

  return (
    <div className="space-y-4">
      {/* Country holiday loader */}
      <div className="bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg p-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Country
          </label>
          <select
            value={selectedCountry}
            onChange={(e) => handleCountryChange(e.target.value)}
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-gray-100 max-w-48"
          >
            {countries.map((c) => (
              <option key={c.countryCode} value={c.countryCode}>
                {c.name}
              </option>
            ))}
          </select>
          <label className="text-sm text-gray-700 dark:text-gray-300">
            Year
          </label>
          <select
            value={presetYear}
            onChange={(e) =>
              handleYearChange(parseInt(e.target.value, 10))
            }
            className="px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
          >
            {[currentYear, currentYear + 1, currentYear + 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            onClick={loadHolidays}
            className={`px-3 py-1 text-sm rounded ${
              buttonState === "error"
                ? "bg-amber-600 hover:bg-amber-700 text-white"
                : buttonState === "success"
                  ? "bg-green-600 text-white"
                  : "bg-blue-600 hover:bg-blue-700 text-white"
            }`}
          >
            {buttonLabel()}
          </button>
          {buttonState === "error" && selectedCountry === "US" && (
            <button
              onClick={loadUSFallback}
              className="px-3 py-1 text-sm rounded border border-blue-600 text-blue-600 hover:bg-blue-50 dark:hover:bg-gray-600 dark:text-blue-400 dark:border-blue-400"
            >
              Use Built-in US Holidays
            </button>
          )}
        </div>

        {/* Inline message (duplicate load or error) */}
        {inlineMessage && (
          <p
            className={`text-sm ${
              buttonState === "error"
                ? "text-amber-700 dark:text-amber-400"
                : "text-red-700 dark:text-red-400"
            } whitespace-pre-line`}
          >
            {inlineMessage}
          </p>
        )}
      </div>

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
      {calendar.holidays.length === 0 ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          No holidays configured.
        </p>
      ) : (
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
      )}
    </div>
  );
}
