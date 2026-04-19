// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Extracts a user's first name from their OAuth displayName, with
 * Microsoft "Last, First" reversal. Used by the auth chip and any other
 * site that renders a user's name.
 *
 *   "Alice Smith"      → "Alice"
 *   "Smith, Alice"     → "Alice"
 *   "Smith, Alice Jane"→ "Alice"
 *   ""  / null / undef → email fallback, or "" if both are absent
 */
export function getFirstName(
  displayName: string | null | undefined,
  email: string | null | undefined
): string {
  if (displayName) {
    if (displayName.includes(",")) {
      const afterComma = displayName.split(",")[1]?.trim() ?? "";
      const firstToken = afterComma.split(/\s+/)[0] ?? "";
      if (firstToken) return firstToken;
      // Fall through to email if "Last," with nothing after the comma
    } else {
      const firstToken = displayName.trim().split(/\s+/)[0] ?? "";
      if (firstToken) return firstToken;
    }
  }
  return email ?? "";
}
