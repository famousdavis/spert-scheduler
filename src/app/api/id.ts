// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Generate a unique ID using crypto.randomUUID().
 */
export function generateId(): string {
  return crypto.randomUUID();
}
