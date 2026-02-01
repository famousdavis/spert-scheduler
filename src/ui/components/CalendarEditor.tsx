import { useState } from "react";
import type { Calendar, Holiday } from "@domain/models/types";
import { generateId } from "@app/api/id";
import { formatDateISO } from "@core/calendar/calendar";
import { getUSHolidays } from "@core/calendar/us-holidays";
import { useDateFormat } from "@ui/hooks/use-date-format";

interface CalendarEditorProps {
  calendar: Calendar;
  onUpdate: (calendar: Calendar) => void;
}

export function CalendarEditor({ calendar, onUpdate }: CalendarEditorProps) {
  const formatDate = useDateFormat();
  const today = formatDateISO(new Date());
  const currentYear = new Date().getFullYear();
  const [presetYear, setPresetYear] = useState(currentYear);

  const loadUSHolidays = () => {
    const entries = getUSHolidays(presetYear);
    const existingDates = new Set(calendar.holidays.map((h) => h.startDate));
    const newHolidays: Holiday[] = entries
      .filter((e) => !existingDates.has(e.date))
      .map((e) => ({
        id: generateId(),
        name: e.name,
        startDate: e.date,
        endDate: e.date,
      }));
    if (newHolidays.length === 0) return;
    onUpdate({
      holidays: [...calendar.holidays, ...newHolidays].sort((a, b) =>
        a.startDate.localeCompare(b.startDate)
      ),
    });
  };

  // Add form state
  const [newName, setNewName] = useState("");
  const [newStartDate, setNewStartDate] = useState(today);
  const [newEndDate, setNewEndDate] = useState(today);

  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
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
    };

    onUpdate({
      holidays: [...calendar.holidays, holiday].sort((a, b) =>
        a.startDate.localeCompare(b.startDate)
      ),
    });
    setNewName("");
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
                startDate: editStartDate,
                endDate: editEndDate,
              }
            : h
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

  return (
    <div className="space-y-4">
      {/* US Holiday presets */}
      <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-3">
        <span className="text-sm text-gray-700">Load US Holidays for</span>
        <select
          value={presetYear}
          onChange={(e) => setPresetYear(parseInt(e.target.value, 10))}
          className="px-2 py-1 border border-gray-300 rounded text-sm"
        >
          {[currentYear, currentYear + 1, currentYear + 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button
          onClick={loadUSHolidays}
          className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
        >
          Load Holidays
        </button>
      </div>

      {/* Add holiday form */}
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Holiday Name
          </label>
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g., Christmas Break"
            className="px-3 py-2 border border-gray-300 rounded-md text-sm w-48"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
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
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            End Date
          </label>
          <input
            type="date"
            value={newEndDate}
            min={newStartDate}
            onChange={(e) => setNewEndDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-md text-sm"
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
        <p className="text-gray-400 text-sm">No holidays configured.</p>
      ) : (
        <ul className="space-y-1">
          {calendar.holidays.map((holiday) =>
            editingId === holiday.id ? (
              /* Edit mode */
              <li
                key={holiday.id}
                className="flex flex-wrap items-center gap-2 py-2 px-3 bg-blue-50 border border-blue-200 rounded"
              >
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm w-44"
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
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <input
                  type="date"
                  value={editEndDate}
                  min={editStartDate}
                  onChange={(e) => setEditEndDate(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                />
                <button
                  onClick={saveEdit}
                  disabled={
                    !editName.trim() || !editStartDate || !editEndDate
                  }
                  className="text-blue-600 hover:text-blue-800 text-sm font-medium disabled:opacity-50"
                >
                  Save
                </button>
                <button
                  onClick={cancelEditing}
                  className="text-gray-400 hover:text-gray-600 text-sm"
                >
                  Cancel
                </button>
              </li>
            ) : (
              /* Display mode */
              <li
                key={holiday.id}
                className="flex items-center justify-between py-1.5 px-3 bg-white border border-gray-200 rounded"
              >
                <div className="min-w-0">
                  <span className="text-sm font-medium text-gray-900">
                    {holiday.name || formatRange(holiday)}
                  </span>
                  {holiday.name && (
                    <span className="text-xs text-gray-600 ml-2 tabular-nums">
                      {formatRange(holiday)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <button
                    onClick={() => startEditing(holiday)}
                    className="text-blue-600 hover:text-blue-800 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => removeHoliday(holiday.id)}
                    className="text-red-500 hover:text-red-700 text-sm"
                  >
                    Remove
                  </button>
                </div>
              </li>
            )
          )}
        </ul>
      )}
    </div>
  );
}
