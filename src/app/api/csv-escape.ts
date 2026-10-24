// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The one CSV field escaper for every SPERT Scheduler CSV writer (simulation export,
 * schedule export). A single copy so the formula-injection guard and the quoting rule cannot
 * drift apart between writers — BR-1/BR-2 (v0.79.x security audit) existed precisely because
 * the logic was duplicated, and the carriage-return gap below was present in both copies.
 */
export function escapeCsvField(value: string | number): string {
  let str = String(value);
  // OWASP CSV formula-injection guard: a cell STARTING with one of these is prefixed with a
  // single quote so a spreadsheet treats it as text, not an executable formula.
  if (/^[=+@\-\t\r]/.test(str)) {
    str = "'" + str;
  }
  // BR-2 (v0.79.x audit): quote on a carriage return ANYWHERE in the value, not only at the
  // start. A mid-value `\r` would otherwise split the row in CR/CRLF-parsing spreadsheets,
  // smuggling a crafted second row — and its own leading-character formula — past the guard above.
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
