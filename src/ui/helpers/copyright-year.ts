// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * The year the © line shows, in the footer and on the About page (FRAME26 Y1, William, 2026-11-27): the current year,
 * from this one function, so the two can never differ. The footer printed a fixed 2026 until v0.90.0.
 */
export function copyrightYear(): number {
  return new Date().getFullYear();
}
