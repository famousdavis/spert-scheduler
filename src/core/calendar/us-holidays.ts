/**
 * US federal holiday calculator — pure function, no framework dependencies.
 */

export interface USHolidayEntry {
  name: string;
  date: string; // YYYY-MM-DD
}

/**
 * Computes the Nth weekday of a given month/year.
 * @param year Full year (e.g. 2026)
 * @param month 0-indexed month (0=Jan, 11=Dec)
 * @param dayOfWeek 0=Sun, 1=Mon, ... 6=Sat
 * @param nth 1-based (1st, 2nd, 3rd, etc.)
 */
function nthWeekdayOfMonth(
  year: number,
  month: number,
  dayOfWeek: number,
  nth: number
): Date {
  const first = new Date(year, month, 1);
  let diff = dayOfWeek - first.getDay();
  if (diff < 0) diff += 7;
  const day = 1 + diff + (nth - 1) * 7;
  return new Date(year, month, day);
}

/**
 * Computes the last weekday of a given month/year.
 */
function lastWeekdayOfMonth(
  year: number,
  month: number,
  dayOfWeek: number
): Date {
  const last = new Date(year, month + 1, 0); // last day of month
  let diff = last.getDay() - dayOfWeek;
  if (diff < 0) diff += 7;
  return new Date(year, month, last.getDate() - diff);
}

function toISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Returns US federal holidays for a given year.
 * Includes 12 common holidays used in project scheduling.
 */
export function getUSHolidays(year: number): USHolidayEntry[] {
  const thanksgiving = nthWeekdayOfMonth(year, 10, 4, 4);

  return [
    { name: "New Year's Day", date: toISO(new Date(year, 0, 1)) },
    { name: "Martin Luther King Jr. Day", date: toISO(nthWeekdayOfMonth(year, 0, 1, 3)) },
    { name: "Presidents' Day", date: toISO(nthWeekdayOfMonth(year, 1, 1, 3)) },
    { name: "Memorial Day", date: toISO(lastWeekdayOfMonth(year, 4, 1)) },
    { name: "Independence Day", date: toISO(new Date(year, 6, 4)) },
    { name: "Labor Day", date: toISO(nthWeekdayOfMonth(year, 8, 1, 1)) },
    { name: "Columbus Day", date: toISO(nthWeekdayOfMonth(year, 9, 1, 2)) },
    { name: "Veterans Day", date: toISO(new Date(year, 10, 11)) },
    { name: "Thanksgiving", date: toISO(thanksgiving) },
    {
      name: "Day After Thanksgiving",
      date: toISO(new Date(year, 10, thanksgiving.getDate() + 1)),
    },
    { name: "Christmas Eve", date: toISO(new Date(year, 11, 24)) },
    { name: "Christmas Day", date: toISO(new Date(year, 11, 25)) },
  ];
}
