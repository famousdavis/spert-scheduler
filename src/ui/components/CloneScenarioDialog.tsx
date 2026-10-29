// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { NAME_MAX_LENGTH } from "@domain/models/types";
import { ScenarioSchema } from "@domain/schemas/project.schema";
import { addWorkingDays, formatDateISO, parseDateISO } from "@core/calendar/calendar";
import { isCalendarError, type WorkCalendar } from "@core/calendar/work-calendar";
import { nextCloneName, reforecastCloneName } from "@app/api/project-service";
import { describedByWhile } from "@ui/helpers/cloud-create-gate";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";

/** The line beside a greyed-out Clone while the box is ticked and the date is not a whole one (WI-139). */
const CLONE_NEEDS_REFORECAST_DATE = "Clone needs a date to reforecast from.";

/** The note under the date (WI-139, R608). */
const REFORECAST_FROM_NOTE =
  "The copy’s Start Date — the next working day by default, because an Actual cell counts today as a day worked. Each In Progress activity carries over its remaining work: its estimates reduced by the days in its Actual cell, so update those first.";

/**
 * A reforecast's default Start Date (WI-139; owner, R608): the first working day AFTER today, in
 * local time, by the calendar the page schedules with. Not today: an Actual cell's own count
 * includes today (`computeElapsedDays`), so a copy started today would count it twice. A calendar
 * with no working day ahead throws — then today, and the page's own schedule reports the calendar.
 */
function nextWorkingDayAfterToday(calendar: WorkCalendar | undefined): string {
  const today = formatDateISO(new Date());
  try {
    return formatDateISO(addWorkingDays(parseDateISO(today), 1, calendar));
  } catch (err) {
    if (isCalendarError(err)) return today;
    throw err;
  }
}

/** A whole calendar date, by the rule the copy's Start Date must pass. A date field gives "" until it holds one. */
function isWholeDate(value: string): boolean {
  return ScenarioSchema.shape.startDate.safeParse(value).success;
}

interface CloneScenarioDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourceName: string;
  /**
   * Every scenario name in the project now (WI-108). The proposed name is the first of
   * "<source> (Copy)", "(Copy 2)" … that none of them has — the rule a project's own clone follows —
   * so a second clone of the same scenario is offered a name of its own. The user can still type any.
   */
  existingNames: string[];
  /**
   * `reforecastFrom` comes only with `dropCompleted` (WI-139): the copy's Start Date, `YYYY-MM-DD`.
   * Unticked, Clone sends the name and `false` alone, as before.
   */
  onClone: (newName: string, dropCompleted: boolean, reforecastFrom?: string) => void;
  /** The calendar the page schedules with, which sets the default date (WI-139). Absent: Monday to Friday. */
  workCalendar?: WorkCalendar;
}

export function CloneScenarioDialog({
  open,
  onOpenChange,
  sourceName,
  existingNames,
  onClone,
  workCalendar,
}: CloneScenarioDialogProps) {
  // Read once, when the window opens: the page mounts it only while it is open (WI-108).
  const [copyName] = useState(() => nextCloneName(sourceName, existingNames));
  // The next working day, read when the window opens: a reforecast's default Start Date (WI-139).
  const [reforecastFrom, setReforecastFrom] = useState(() => nextWorkingDayAfterToday(workCalendar));
  // The last whole date in the field. The proposed name reads it, so the name holds while one is typed.
  const [nameDate, setNameDate] = useState(reforecastFrom);
  // What the user typed, or null while the name is still the proposal, which follows the box and the date.
  const [typedName, setTypedName] = useState<string | null>(null);
  const [dropCompleted, setDropCompleted] = useState(false);
  const nameId = useId();
  const dateId = useId();
  const noteId = useId();
  const reasonId = useId();
  const dateFormat = usePreferencesStore((s) => s.preferences.dateFormat);

  const proposedName = dropCompleted
    ? reforecastCloneName(sourceName, nameDate, existingNames, dateFormat)
    : copyName;
  const name = typedName ?? proposedName;
  const dateMissing = dropCompleted && !isWholeDate(reforecastFrom);

  const handleDateChange = (value: string) => {
    setReforecastFrom(value);
    if (isWholeDate(value)) setNameDate(value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || dateMissing) return;
    // Unticked, exactly as before: the name and `false`, and no date.
    if (dropCompleted) onClone(trimmed, true, reforecastFrom);
    else onClone(trimmed, false);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed z-50 top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Clone Scenario
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Create a copy of &ldquo;{sourceName}&rdquo;
          </Dialog.Description>
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label htmlFor={nameId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                New Name
              </label>
              <input
                id={nameId}
                name="cloneScenarioName"
                type="text"
                maxLength={NAME_MAX_LENGTH}
                value={name}
                onChange={(e) => setTypedName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
                autoFocus
              />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  name="dropCompletedActivities"
                  checked={dropCompleted}
                  onChange={(e) => setDropCompleted(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-gray-700 dark:text-gray-300">
                  Drop completed activities (reforecast)
                </span>
              </label>
              {dropCompleted && (
                <div className="mt-2 ml-6">
                  <label htmlFor={dateId} className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Reforecast from
                  </label>
                  <input
                    id={dateId}
                    name="reforecastFromDate"
                    type="date"
                    required
                    value={reforecastFrom}
                    onChange={(e) => handleDateChange(e.target.value)}
                    aria-invalid={dateMissing || undefined}
                    aria-describedby={dateMissing ? `${noteId} ${reasonId}` : noteId}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 dark:text-gray-100"
                  />
                  <p id={noteId} className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {REFORECAST_FROM_NOTE}
                  </p>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2">
              {dateMissing && (
                <p id={reasonId} className="mr-auto self-center text-sm text-amber-700 dark:text-amber-300">
                  {CLONE_NEEDS_REFORECAST_DATE}
                </p>
              )}
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                disabled={!name.trim() || dateMissing}
                {...describedByWhile(dateMissing, reasonId)}
                className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Clone
              </button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
