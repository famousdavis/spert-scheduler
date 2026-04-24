// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useRef, useCallback } from "react";
import type { Calendar, Holiday } from "@domain/models/types";
import type { NagerCountry } from "@domain/models/nager-types";
import { generateId } from "@app/api/id";
import { getUSHolidays } from "@core/calendar/us-holidays";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import {
  fetchPublicHolidays,
} from "@infrastructure/nager/nager-client";

type ButtonState = "idle" | "loading" | "success" | "error";

const FAILURE_MESSAGE =
  "Holiday data couldn\u2019t be loaded right now. This is likely a temporary issue " +
  "with the holiday data service \u2014 your other SPERT\u00AE Scheduler features are " +
  "unaffected. You can enter your holidays manually instead, or try again later.";

interface HolidayLoaderProps {
  calendar: Calendar;
  countries: NagerCountry[];
  onUpdate: (calendar: Calendar) => void;
}

function loadButtonClass(buttonState: string): string {
  if (buttonState === "error") return "bg-amber-600 hover:bg-amber-700 text-white";
  if (buttonState === "success") return "bg-green-600 text-white";
  return "bg-blue-600 hover:bg-blue-700 text-white";
}

export function HolidayLoader({ calendar, countries, onUpdate }: HolidayLoaderProps) {
  const currentYear = new Date().getFullYear();
  const defaultHolidayCountry = usePreferencesStore((s) => s.preferences.defaultHolidayCountry);
  const updatePreferences = usePreferencesStore((s) => s.updatePreferences);

  // -- Country + year state ---------------------------------------------------
  const [selectedCountry, setSelectedCountry] = useState(
    defaultHolidayCountry ??
      (navigator.language?.split("-")[1]?.toUpperCase() || "US"),
  );
  const [presetYear, setPresetYear] = useState(currentYear);

  // Sync selectedCountry when preferences load from localStorage
  useEffect(() => {
    if (defaultHolidayCountry && defaultHolidayCountry !== selectedCountry) {
      setSelectedCountry(defaultHolidayCountry);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultHolidayCountry]);

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
      const mergedDates = new Map<string, string>(); // date -> new name

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
          className={`px-3 py-1 text-sm rounded ${loadButtonClass(buttonState)}`}
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
  );
}
