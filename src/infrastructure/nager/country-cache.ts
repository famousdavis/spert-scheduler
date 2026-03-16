// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { NagerCountry } from "@domain/models/nager-types";

const COUNTRY_CACHE_KEY = "spert:nager-countries";

/**
 * Load cached country list from localStorage. Returns null if missing or invalid.
 */
export function loadCachedCountries(): NagerCountry[] | null {
  try {
    const raw = localStorage.getItem(COUNTRY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    return parsed as NagerCountry[];
  } catch {
    return null;
  }
}

/**
 * Save country list to localStorage cache.
 */
export function saveCachedCountries(countries: NagerCountry[]): void {
  try {
    localStorage.setItem(COUNTRY_CACHE_KEY, JSON.stringify(countries));
  } catch {
    // Silently fail — cache is best-effort
  }
}
