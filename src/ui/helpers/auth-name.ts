// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Reverses Microsoft AD's "Last, First MI" display-name convention to natural
 * "First MI Last" order. Returns the trimmed input if no comma reversal applies.
 *
 * SUITE-SHARED: keep byte-identical with
 * /Users/william/Documents/spert-landing-page/functions/src/mailHeaders.ts
 * (Lesson 19 — single source of truth).
 *
 *   "Alice Smith"          → "Alice Smith"
 *   "Smith, Alice"         → "Alice Smith"
 *   "Smith, Alice Jane"    → "Alice Jane Smith"
 *   ""                     → ""
 */
export function denormalizeLastFirst(s: string): string {
  const parts = s.split(",").map((p) => p.trim()).filter((p) => p.length > 0);
  if (parts.length < 2) return s.trim();
  const [last, ...rest] = parts;
  return `${rest.join(" ")} ${last}`;
}
