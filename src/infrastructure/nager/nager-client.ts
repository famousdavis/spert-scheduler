// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type {
  NagerCountry,
  NagerPublicHoliday,
} from "@domain/models/nager-types";

const BASE_URL = "https://date.nager.at/api/v3";

/**
 * Fetch all supported countries from Nager.Date, sorted alphabetically by name.
 */
export async function fetchAvailableCountries(): Promise<NagerCountry[]> {
  const res = await fetch(`${BASE_URL}/AvailableCountries`);
  if (!res.ok) {
    throw new Error(`Nager API error: ${res.status} ${res.statusText}`);
  }
  const data: NagerCountry[] = await res.json();
  return data.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fetch public holidays for a country and year, filtered to globally observed only.
 */
export async function fetchPublicHolidays(
  year: number,
  countryCode: string,
): Promise<NagerPublicHoliday[]> {
  const res = await fetch(
    `${BASE_URL}/PublicHolidays/${year}/${countryCode}`,
  );
  if (!res.ok) {
    throw new Error(`Nager API error: ${res.status} ${res.statusText}`);
  }
  const data: NagerPublicHoliday[] = await res.json();
  return data.filter((h) => h.global);
}
