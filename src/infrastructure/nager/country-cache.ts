// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { z } from "zod";
import type { NagerCountry } from "@domain/models/nager-types";
import { NagerCountrySchema } from "./nager-client";

const COUNTRY_CACHE_KEY = "spert-scheduler:nager-countries";

/**
 * Load cached country list from localStorage. Returns null if missing or invalid.
 */
export function loadCachedCountries(): NagerCountry[] | null {
  try {
    const raw = localStorage.getItem(COUNTRY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const result = z.array(NagerCountrySchema).safeParse(parsed);
    if (result.success) {
      return result.data;
    }
    console.warn("Cached country data failed validation, re-fetching");
    return null;
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
