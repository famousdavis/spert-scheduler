// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity, ActivityStatus, Calendar, DateFormatPreference } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import { actualDatesFault, type ActualDatesFault } from "@domain/helpers/actual-dates-rules";
import { statusLabel } from "@domain/helpers/format-labels";
import { elapsedWorkingDays, recordedDuration } from "@core/schedule/recorded-progress";
import type { CSVImportError, ParseTableOptions } from "./types";

/**
 * WI-150 — the four dates an imported row may carry, read by heading only (a headerless paste never
 * carries them, so the template's column order is unchanged). The headings are the ones v0.81.0's
 * schedule export writes, which are also P6's; MS Project's Actual Start and Actual Finish match too.
 * "Start" and "Finish" are deliberately NOT read: the P6 & MS Project guide tells users to bring a
 * Start column along to sort by, and promises that Scheduler skips it.
 */
export const DATE_COLUMN_LABELS = {
  actualStart: "Actual Start",
  actualFinish: "Actual Finish",
  plannedStart: "Planned Start",
  plannedFinish: "Planned Finish",
} as const;

export type DateField = keyof typeof DATE_COLUMN_LABELS;

/** Each date field's header aliases, pre-normalised (lowercase, no whitespace) for `HEADER_ALIASES`. */
export const DATE_HEADER_ALIASES: Record<DateField, string[]> = {
  actualStart: ["actualstart"],
  actualFinish: ["actualfinish"],
  plannedStart: ["plannedstart"],
  plannedFinish: ["plannedfinish"],
};

const DATE_FIELDS = Object.keys(DATE_COLUMN_LABELS) as DateField[];

// -- One cell -------------------------------------------------------------------

/** Which way a date such as 03/04/2026 is read: month first (MM/DD) or day first (DD/MM). */
export type DayOrder = "monthFirst" | "dayFirst";

export type DateCell =
  | { kind: "empty" }
  | { kind: "date"; iso: string }
  /** A bare number: Excel's serial for a date, which a sheet shows when the column is not formatted as a date. */
  | { kind: "number" }
  | { kind: "invalid" };

/** What a source tool writes in a date cell that holds no date: MS Project writes "NA"; a sheet, a dash. */
const NO_DATE = new Set(["", "na", "n/a", "-", "\u2013", "\u2014"]);

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const WEEKDAY_PREFIX = /^(?:mon|tue|wed|thu|fri|sat|sun)[a-z]{0,6},? /i; // "Mon 3/2/26" (MS Project)
const TIME_SUFFIX = / \d{1,2}:\d{2}(?::\d{2})?(?: ?[ap]\.?m\.?)?$/i; // "3/2/2026 8:00 AM"
const ISO_TIME_SUFFIX = /T\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/; // MS Project XML: "2026-09-21T08:00:00" (Review 34, I-W5)
const P6_MARK_SUFFIX = /(?: A)?\*?$/; // P6 marks an actual date "A" and a constrained one "*" (both: "A*")
const YEAR_FIRST = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/; // 2026-03-02, 2026/03/02
const YEAR_LAST = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/; // 03/02/2026, 3/2/26
const DAY_MONTH_NAME = /^(\d{1,2})[- ]([a-z]{3,9})\.?[- ,]{1,2}(\d{2}|\d{4})$/i; // 2-Mar-26 (P6), 2 March 2026
const MONTH_NAME_DAY = /^([a-z]{3,9})\.? (\d{1,2}),? (\d{2}|\d{4})$/i; // Mar 2, 2026
const SERIAL = /^\d{3,6}(?:\.\d+)?$/; // 46083

/** A month by its name, its three-letter form, or "Sept" — 1 to 12, or 0 when it is not one. */
function monthNumber(token: string): number {
  const t = token.toLowerCase();
  const i = MONTH_NAMES.findIndex((m) => m === t || m.slice(0, 3) === t || (t === "sept" && m === "september"));
  return i + 1;
}

/** A two-digit year is this century's: 26 is 2026. */
function fullYear(text: string): number {
  const y = Number(text);
  return text.length === 2 ? 2000 + y : y;
}

/** The date as `YYYY-MM-DD` when the three parts are a real calendar day, else null. */
function isoOf(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1) return null;
  const d = new Date(year, month - 1, day);
  if (d.getMonth() !== month - 1 || d.getDate() !== day) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * A cell with what a source tool adds around a date removed: a weekday before it, a time or a P6
 * mark after. The mark comes off FIRST: P6 writes it after the time ("02-Mar-26 08:00 A"), and the
 * time is matched at the end of the cell (Review 34, I-F2).
 */
function stripDecorations(raw: string): string {
  const unmarked = raw.trim().replace(WEEKDAY_PREFIX, "").replace(P6_MARK_SUFFIX, "").trim();
  return unmarked.replace(TIME_SUFFIX, "").replace(ISO_TIME_SUFFIX, "").trim();
}

/** A date written with the year last and the month as a number (03/04/2026): the one form a day order reads. */
function isNumericYearLast(raw: string): boolean {
  return YEAR_LAST.test(stripDecorations(raw));
}

function namedMonthDate(text: string): string | null {
  const dm = DAY_MONTH_NAME.exec(text);
  if (dm) return isoOf(fullYear(dm[3]!), monthNumber(dm[2]!), Number(dm[1]));
  const md = MONTH_NAME_DAY.exec(text);
  if (md) return isoOf(fullYear(md[3]!), monthNumber(md[1]!), Number(md[2]));
  return null;
}

/** Read one date cell. Year first, or a month by name, is read one way only; 03/04/2026 by `order`. */
export function parseDateCell(raw: string, order: DayOrder): DateCell {
  if (NO_DATE.has(raw.trim().toLowerCase())) return { kind: "empty" };
  const text = stripDecorations(raw);
  if (SERIAL.test(text)) return { kind: "number" };
  const yf = YEAR_FIRST.exec(text);
  const yl = YEAR_LAST.exec(text);
  let iso: string | null;
  if (yf) iso = isoOf(Number(yf[1]), Number(yf[2]), Number(yf[3]));
  else if (yl) {
    const [a, b] = [Number(yl[1]), Number(yl[2])];
    iso = order === "monthFirst" ? isoOf(fullYear(yl[3]!), a, b) : isoOf(fullYear(yl[3]!), b, a);
  } else iso = namedMonthDate(text);
  return iso ? { kind: "date", iso } : { kind: "invalid" };
}

// -- The file's day order ---------------------------------------------------------

export interface DayOrderChoice {
  order: DayOrder;
  /** Set when the file's own dates chose an order other than the user's: the cell that proved it. */
  provedBy?: { raw: string; row: number };
}

/** The order the user's Date Format setting reads 03/04/2026 in. YYYY/MM/DD says nothing about it: month first. */
export function preferredDayOrder(format: DateFormatPreference | undefined): DayOrder {
  return format === "DD/MM/YYYY" ? "dayFirst" : "monthFirst";
}

/** Which order a year-last date proves, if any: 25/03/2026 can only be day first, 03/25/2026 only month first. */
function provenOrder(raw: string): DayOrder | null {
  const yl = YEAR_LAST.exec(stripDecorations(raw));
  if (!yl) return null;
  const [a, b] = [Number(yl[1]), Number(yl[2])];
  if (a > 12 && b <= 12) return "dayFirst";
  if (b > 12 && a <= 12) return "monthFirst";
  return null;
}

/**
 * ONE order for the whole file: the user's, unless the file's dates prove the other order and never
 * the user's (a file that proves both is read in the user's order; its other dates are refused).
 */
export function chooseDayOrder(
  cells: readonly { raw: string; row: number }[],
  preferred: DayOrder,
): DayOrderChoice {
  let other: { raw: string; row: number } | undefined;
  for (const cell of cells) {
    const proven = provenOrder(cell.raw);
    if (proven === preferred) return { order: preferred };
    if (proven && !other) other = cell;
  }
  if (!other) return { order: preferred };
  return { order: preferred === "monthFirst" ? "dayFirst" : "monthFirst", provedBy: other };
}

// -- One row: the decision table ------------------------------------------------------

export type RowDates = Partial<Record<DateField, string>>;

export interface RowProgress {
  status: ActivityStatus;
  /** The dates the activity is created with. */
  fields: Pick<Activity, "actualStartDate" | "actualFinishDate" | "plannedStartDate" | "plannedFinishDate">;
  errors: CSVImportError[];
  warnings: CSVImportError[];
  /** A Planned row's Planned Start or Planned Finish, not imported (owner, R1 (a)). */
  plannedIgnored: boolean;
  /** The Status cell was blank, and the row's Actual dates gave its Status. */
  inferred: boolean;
}

/** The quoted cell, as an error names a value: at most 80 characters. */
function quoted(raw: string): string {
  const t = raw.trim();
  return `"${t.length > 80 ? t.slice(0, 80) + "…" : t}"`;
}

const DATE_ORDER_LABEL: Record<DayOrder, string> = { monthFirst: "MM/DD/YYYY", dayFirst: "DD/MM/YYYY" };

/** "14 November 2026": a date no day order can misread. */
function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const month = MONTH_NAMES[m! - 1]!;
  return `${d} ${month.charAt(0).toUpperCase()}${month.slice(1)} ${y}`;
}

function cellError(field: DateField, raw: string, kind: "number" | "invalid", order: DayOrder, row: number): CSVImportError {
  const column = DATE_COLUMN_LABELS[field];
  const message =
    kind === "number"
      ? `${column} ${quoted(raw)} is a number, not a date. In your spreadsheet, format the column as a date and copy it again.`
      : `${column} ${quoted(raw)} is not a date. Write it as YYYY-MM-DD, or as ${DATE_ORDER_LABEL[order]} as this file's dates are read.`;
  return { row, column, message, severity: "error" };
}

/** A cell that is not a date: which, and how it failed. */
type BadCell = { field: DateField; raw: string; kind: "number" | "invalid" };

/** The four cells read as dates, and each cell that is not one. */
function readCells(raw: RowDates, order: DayOrder): { dates: RowDates; bad: BadCell[] } {
  const dates: RowDates = {};
  const bad: BadCell[] = [];
  for (const field of DATE_FIELDS) {
    const cell = raw[field];
    if (cell === undefined) continue;
    const parsed = parseDateCell(cell, order);
    if (parsed.kind === "date") dates[field] = parsed.iso;
    else if (parsed.kind !== "empty") bad.push({ field, raw: cell, kind: parsed.kind });
  }
  return { dates, bad };
}

/**
 * Review 34, V-R2: a cell the row's Status never keeps — a Planned row's four, an In Progress row's
 * Actual Finish — cannot block the import when it is not a date. With the Status blank, the Actual
 * dates decide it, so only a Planned row's own pair is set aside.
 */
function cellIgnored(field: DateField, statusGiven: ActivityStatus | null, status: ActivityStatus): boolean {
  if (statusGiven === null) return status === "planned" && (field === "plannedStart" || field === "plannedFinish");
  if (statusGiven === "planned") return true;
  return statusGiven === "inProgress" && field === "actualFinish";
}

function ignoredCellWarning(cell: BadCell, status: ActivityStatus, row: number): CSVImportError {
  const column = DATE_COLUMN_LABELS[cell.field];
  return warning(
    row, column,
    `${column} ${quoted(cell.raw)} is not a date, and an activity whose Status is ${statusLabel(status)} does not keep it, so it was not imported.`,
  );
}

/** With the Status cell blank, the Actual dates give the Status; with none, Planned — the default it always had. */
function inferStatus(dates: RowDates): ActivityStatus {
  if (dates.actualFinish) return "complete";
  return dates.actualStart ? "inProgress" : "planned";
}

/**
 * A date after today, named with the day order it was read in when that order decided it (Review 34,
 * I-F5 = V-W5): "10/12/2026", read as DD/MM/YYYY, is 10 December — a reading the user can check.
 */
function afterTodayMessage(column: string, raw: string, iso: string, order: DayOrder): string {
  const reading = isNumericYearLast(raw) ? `, read as ${DATE_ORDER_LABEL[order]} (${longDate(iso)}),` : "";
  return `${column} ${quoted(raw)}${reading} is after today. An actual date cannot be in the future.`;
}

/** The importer's sentence for each of the window's faults it can meet (it never sets the Start Date rule). */
function faultMessage(fault: ActualDatesFault, raw: RowDates, dates: RowDates, order: DayOrder): string {
  const startRaw = raw.actualStart ?? "";
  const finishRaw = raw.actualFinish ?? "";
  switch (fault) {
    case "finishWithoutStart":
      return "Actual Finish has a date but Actual Start is blank. Enter the Actual Start too, or clear the Actual Finish.";
    case "startAfterToday":
      return afterTodayMessage("Actual Start", startRaw, dates.actualStart!, order);
    case "finishAfterToday":
      return afterTodayMessage("Actual Finish", finishRaw, dates.actualFinish!, order);
    default: {
      const readAs = isNumericYearLast(startRaw) || isNumericYearLast(finishRaw) ? ` (dates read as ${DATE_ORDER_LABEL[order]})` : "";
      return `Actual Finish ${quoted(finishRaw)} is before Actual Start ${quoted(startRaw)}${readAs}.`;
    }
  }
}

function warning(row: number, column: string, message: string): CSVImportError {
  return { row, column, message, severity: "warning" };
}

/** "Actual Start", "Actual Finish" or "Actual Start and Actual Finish": the Actual dates a row gives. */
function actualsNamed(dates: RowDates): string {
  const named = [dates.actualStart && "Actual Start", dates.actualFinish && "Actual Finish"].filter(Boolean);
  return named.join(" and ");
}

/** A started row's Planned pair: kept when both are given in order, else neither, with a warning saying why. */
function keptPlan(dates: RowDates, raw: RowDates, row: number): { plan: RowProgress["fields"]; warning?: CSVImportError } {
  const { plannedStart: ps, plannedFinish: pf } = dates;
  if (!ps && !pf) return { plan: {} };
  if (!ps || !pf) {
    const given = ps ? "Planned Start" : "Planned Finish";
    return { plan: {}, warning: warning(row, given, `Only ${given} has a date, so neither planned date was imported. An activity keeps both or neither.`) };
  }
  if (pf < ps) {
    const message = `Planned Finish ${quoted(raw.plannedFinish ?? "")} is before Planned Start ${quoted(raw.plannedStart ?? "")}, so neither planned date was imported.`;
    return { plan: {}, warning: warning(row, "Planned Finish", message) };
  }
  return { plan: { plannedStartDate: ps, plannedFinishDate: pf } };
}

/**
 * T3's advice, by which Actual dates the Planned row gives (Review 34, V-E4): In Progress keeps no
 * finish, and Complete refuses a finish with no start, so each case names the Status that keeps them.
 */
function plannedAdvice(dates: RowDates): string {
  if (!dates.actualFinish) return "To keep it, set Status to In Progress or Complete.";
  if (dates.actualStart) return "To keep them, set Status to Complete.";
  return "To keep it, enter the Actual Start too and set Status to Complete.";
}

/** The warnings for Actual dates the row's Status does not keep, or does not have. */
function statusWarnings(status: ActivityStatus, dates: RowDates, hasActualStartColumn: boolean, row: number): CSVImportError[] {
  if (status === "planned") {
    if (!dates.actualStart && !dates.actualFinish) return [];
    const named = actualsNamed(dates);
    return [warning(row, "Status", `Status is Planned, so ${named} ${named.includes(" and ") ? "were" : "was"} not imported. ${plannedAdvice(dates)}`)];
  }
  const out: CSVImportError[] = [];
  if (status === "inProgress" && dates.actualFinish) {
    out.push(warning(row, "Actual Finish", "Status is In Progress, so Actual Finish was not imported. To keep it, set Status to Complete."));
  }
  if (hasActualStartColumn && !dates.actualStart) out.push(warning(row, "Actual Start", NO_START_RECORDED[status]));
  return out;
}

/** A started row with no Actual Start schedules as it did before WI-150; the preview says so. */
const NO_START_RECORDED: Record<Exclude<ActivityStatus, "planned">, string> = {
  inProgress: "Status is In Progress but Actual Start is blank, so no start date is recorded for it.",
  // Owner, R636 (D6): words only, no count — I-W2's sentence.
  complete:
    "Status is Complete but Actual Start and Actual Finish are blank, so it is still scheduled and simulated from its estimates, as if it had not finished. Enter both dates to count it as done.",
};

/** T2's sentence: Complete with a start and no finish (Review 34, V-W3: the file may have no such column). */
function noFinishMessage(hasActualFinishColumn: boolean): string {
  return hasActualFinishColumn
    ? "Status is Complete but Actual Finish is blank. Enter the day it finished, or set Status to In Progress."
    : "Status is Complete but this file has no Actual Finish column. Add one with the day it finished, or set Status to In Progress.";
}

/**
 * THE import's decision table for one row (WI-150): Status × which dates are present → the dates
 * recorded, an error that blocks the import, or a warning that does not. Each Actual-date rule is the
 * Edit Activity window's own (`actualDatesFault`), except the Start Date rule: the import sets the
 * scenario's Start Date itself (to the earliest Actual Start). `statusGiven` is null when the Status
 * cell is blank (or there is no Status column) — then the Actual dates give the Status.
 */
export function readRowProgress(args: {
  raw: RowDates;
  statusGiven: ActivityStatus | null;
  hasActualStartColumn: boolean;
  /** Review 34, V-W3: T2's words name a missing column. Absent: the file has one. */
  hasActualFinishColumn?: boolean;
  order: DayOrder;
  today: string;
  row: number;
}): RowProgress {
  const { raw, statusGiven, order, today, row } = args;
  const { dates, bad } = readCells(raw, order);
  const status = statusGiven ?? inferStatus(dates);
  const base = { status, fields: {}, warnings: [], plannedIgnored: false, inferred: statusGiven === null && status !== "planned" };
  const ignored = bad.filter((c) => cellIgnored(c.field, statusGiven, status));
  const errors = bad.filter((c) => !ignored.includes(c)).map((c) => cellError(c.field, c.raw, c.kind, order, row));
  if (errors.length > 0) return { ...base, errors };
  const warnings = [...ignored.map((c) => ignoredCellWarning(c, status, row)), ...statusWarnings(status, dates, args.hasActualStartColumn, row)];
  if (status === "planned") {
    return { ...base, errors: [], warnings, plannedIgnored: !!(dates.plannedStart || dates.plannedFinish) };
  }
  if (status === "complete" && dates.actualStart && !dates.actualFinish) {
    const message = noFinishMessage(args.hasActualFinishColumn ?? true);
    return { ...base, errors: [{ row, column: "Actual Finish", message, severity: "error" }] };
  }
  const fault = actualDatesFault({
    status, start: dates.actualStart ?? "", finish: dates.actualFinish ?? "", today, scenarioStart: undefined, lastEdited: "finish",
  });
  if (fault) {
    const column = fault === "startAfterToday" ? "Actual Start" : "Actual Finish";
    return { ...base, errors: [{ row, column, message: faultMessage(fault, raw, dates, order), severity: "error" }] };
  }
  const { plan, warning: planWarning } = keptPlan(dates, raw, row);
  const fields: RowProgress["fields"] = { ...plan };
  if (dates.actualStart) fields.actualStartDate = dates.actualStart;
  if (status === "complete" && dates.actualFinish) fields.actualFinishDate = dates.actualFinish;
  return { ...base, fields, errors: [], warnings: planWarning ? [...warnings, planWarning] : warnings };
}

/**
 * Owner, R636 (D3; Review 34, I-W1 = V-Q1): a Status word the importer does not know, on a row with
 * Actual dates, takes its Status from the dates, as a blank one does — MS Project's "Late" on a
 * started task is In Progress. With no Actual date it is Planned, as before WI-150.
 */
function unknownStatusOutcome(dates: RowDates): string {
  const status = inferStatus(dates);
  if (status === "planned") return `${statusLabel(status)} will be used instead.`;
  if (status === "inProgress") return "Its Actual Start makes it In Progress.";
  return dates.actualStart
    ? "Its Actual Start and Actual Finish make it Complete."
    : "Its Actual Finish makes it Complete.";
}

// -- The whole file ---------------------------------------------------------------------

/**
 * The date columns of one parse: built once from the header map, it reads each row's four cells and
 * keeps the counts the preview's notes are made from. With none of the four columns, every row reads
 * as before WI-150: its Status as given (a blank one Planned), and no dates.
 */
export interface ProgressDateReader {
  read(cells: readonly string[], rawStatus: string, mappedStatus: ActivityStatus, row: number): RowProgress;
  /** The end of the parser's "Unrecognized status" warning: what the row's Status becomes, and why. */
  unknownStatusOutcome(cells: readonly string[]): string;
  notes(): string[];
  earliestActualStart(): string | undefined;
}

/** The parser's activity limit: it reads no row after the 500th it imports. */
const MAX_READ_ROWS = 500;

/**
 * A row the parser's loop reads as an activity — the same three skips as `parseFlatActivityTable`'s
 * Pass 1: a `#` note row, an empty row, a "section" row (Review 34, V-W2: a note row's date chose the
 * whole file's day order, and the note cited a row no activity came from).
 */
function isActivityRow(row: readonly string[], typeColumn: number | undefined): boolean {
  if ((row[0]?.trim() ?? "").startsWith("#")) return false;
  if (row.every((cell) => cell.trim() === "")) return false;
  return typeColumn === undefined || row[typeColumn]?.trim().toLowerCase() !== "section";
}

/** The header map's date columns, and the date cells of every row the parser reads, with the row number the user sees. */
function dateColumns(
  headers: Readonly<Record<string, number>>, rows: readonly (readonly string[])[], dataStartIndex: number,
  rowNumbers: readonly number[] | undefined,
): { columns: Partial<Record<DateField, number>>; cells: { raw: string; row: number }[] } {
  const fields = DATE_FIELDS.filter((f) => headers[f] !== undefined);
  const columns = Object.fromEntries(fields.map((f) => [f, headers[f]!])) as Partial<Record<DateField, number>>;
  const cells: { raw: string; row: number }[] = [];
  let read = 0;
  for (let i = dataStartIndex; i < rows.length && read < MAX_READ_ROWS; i++) {
    if (!isActivityRow(rows[i]!, headers.type)) continue;
    read++;
    const row = rowNumbers?.[i] ?? i + 1;
    for (const f of fields) cells.push({ raw: rows[i]![columns[f]!] ?? "", row });
  }
  return { columns, cells };
}

export function makeProgressDateReader(
  headers: Readonly<Record<string, number>>,
  rows: readonly (readonly string[])[],
  dataStartIndex: number,
  options: Pick<ParseTableOptions, "today" | "dateFormat" | "rowNumbers"> | undefined,
  /** Is a Status word one the parser knows? An unknown one on a row with Actual dates takes them (D3). */
  isKnownStatus: (rawStatus: string) => boolean = () => true,
): ProgressDateReader {
  const { columns, cells } = dateColumns(headers, rows, dataStartIndex, options?.rowNumbers);
  const preferred = preferredDayOrder(options?.dateFormat);
  const choice = chooseDayOrder(cells, preferred);
  // The core never reads the clock: with no `today` given, no date is "after today".
  const today = options?.today ?? "9999-12-31";
  const rawDates = (row: readonly string[]): RowDates => {
    const out: RowDates = {};
    for (const f of DATE_FIELDS) if (columns[f] !== undefined) out[f] = (row[columns[f]] ?? "").trim();
    return out;
  };
  let plannedIgnored = 0;
  let inferred = 0;
  let earliest: string | undefined;
  return {
    read(row, rawStatus, mappedStatus, rowNum) {
      const unknown = rawStatus !== "" && !isKnownStatus(rawStatus);
      const result = readRowProgress({
        raw: rawDates(row),
        statusGiven: rawStatus === "" || unknown ? null : mappedStatus,
        hasActualStartColumn: columns.actualStart !== undefined,
        hasActualFinishColumn: columns.actualFinish !== undefined,
        order: choice.order,
        today,
        row: rowNum,
      });
      if (result.errors.length > 0) return result;
      if (result.plannedIgnored) plannedIgnored++;
      // An unknown word has its own warning (the parser's); the note counts blank Status cells only.
      if (result.inferred && !unknown) inferred++;
      const start = result.fields.actualStartDate;
      if (start && (!earliest || start < earliest)) earliest = start;
      return result;
    },
    unknownStatusOutcome: (row) => unknownStatusOutcome(readCells(rawDates(row), choice.order).dates),
    notes: () => progressNotes(plannedIgnored, inferred, choice, preferred),
    earliestActualStart: () => earliest,
  };
}

/** The preview's sentences about the whole file, in the parser's voice. */
function progressNotes(plannedIgnored: number, inferred: number, choice: DayOrderChoice, preferred: DayOrder): string[] {
  const notes: string[] = [];
  if (choice.provedBy) {
    notes.push(
      `Dates are read as ${DATE_ORDER_LABEL[choice.order]}, because ${quoted(choice.provedBy.raw)} on row ${choice.provedBy.row} cannot be ${DATE_ORDER_LABEL[preferred]}, your date format.`,
    );
  }
  if (inferred > 0) {
    const n = inferred === 1 ? "1 activity has" : `${inferred} activities have`;
    notes.push(`${n} no Status but an Actual Start, so ${inferred === 1 ? "it is" : "they are"} imported as In Progress, or as Complete when there is an Actual Finish too.`);
  }
  if (plannedIgnored > 0) {
    const n = plannedIgnored === 1 ? "1 activity that has" : `${plannedIgnored} activities that have`;
    notes.push(
      `Planned Start and Planned Finish were not imported for ${n} not started (Status Planned). Scheduler schedules these activities itself, and keeps an activity's Planned Start and Planned Finish from its own plan when the activity starts.`,
    );
  }
  return notes;
}

// -- At commit: the counts, from the dates ------------------------------------------------

/**
 * Each imported started row's day count, worked out from its dates as the Edit Activity window works
 * it out from typed ones: an In Progress row's working days from its Actual Start to today, a
 * Complete row's from its Actual Start to its Actual Finish, both counted. A row with no Actual Start
 * keeps no count, as before WI-150. Needs the target project's calendar, so it runs at commit.
 */
export function withImportedCounts(
  activities: readonly Activity[], todayISO: string, calendar: WorkCalendar | Calendar | undefined,
): Activity[] {
  return activities.map((a) => {
    const start = a.actualStartDate;
    if (!start) return a;
    if (a.status === "inProgress") return { ...a, actualDuration: elapsedWorkingDays(start, todayISO, calendar) };
    if (a.status === "complete" && a.actualFinishDate) {
      return { ...a, actualDuration: recordedDuration(start, a.actualFinishDate, calendar) };
    }
    return a;
  });
}
