import { useState } from "react";
import type { Calendar } from "@domain/models/types";
import { formatDateISO, formatDateDisplay } from "@core/calendar/calendar";

interface CalendarEditorProps {
  calendar: Calendar;
  onUpdate: (calendar: Calendar) => void;
}

export function CalendarEditor({ calendar, onUpdate }: CalendarEditorProps) {
  const [newDate, setNewDate] = useState(formatDateISO(new Date()));

  const addHoliday = () => {
    if (newDate && !calendar.holidays.includes(newDate)) {
      onUpdate({
        holidays: [...calendar.holidays, newDate].sort(),
      });
    }
  };

  const removeHoliday = (date: string) => {
    onUpdate({
      holidays: calendar.holidays.filter((h) => h !== date),
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Add Holiday
          </label>
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <button
          onClick={addHoliday}
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
        >
          Add
        </button>
      </div>

      {calendar.holidays.length === 0 ? (
        <p className="text-gray-400 text-sm">No holidays configured.</p>
      ) : (
        <ul className="space-y-1">
          {calendar.holidays.map((date) => (
            <li
              key={date}
              className="flex items-center justify-between py-1.5 px-3 bg-white border border-gray-200 rounded"
            >
              <span className="text-sm tabular-nums">{formatDateDisplay(date)}</span>
              <button
                onClick={() => removeHoliday(date)}
                className="text-red-400 hover:text-red-600 text-sm"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
