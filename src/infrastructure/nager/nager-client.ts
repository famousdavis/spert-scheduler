// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { z } from "zod";
import type {
  NagerCountry,
  NagerPublicHoliday,
} from "@domain/models/nager-types";

const BASE_URL = "https://date.nager.at/api/v3";

export const NagerCountrySchema = z.object({
  countryCode: z.string(),
  name: z.string(),
});

const NagerPublicHolidaySchema = z.object({
  date: z.string(),
  localName: z.string(),
  name: z.string(),
  countryCode: z.string(),
  global: z.boolean(),
  types: z.array(z.string()),
});

/**
 * Fetch all supported countries from Nager.Date, sorted alphabetically by name.
 */
export async function fetchAvailableCountries(): Promise<NagerCountry[]> {
  const res = await fetch(`${BASE_URL}/AvailableCountries`);
  if (!res.ok) {
    throw new Error(`Nager API error: ${res.status} ${res.statusText}`);
  }
  const raw: unknown = await res.json();
  const data = z.array(NagerCountrySchema).parse(raw);
  return data.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Fetch public holidays for a country and year, filtered to globally observed only.
 */
export async function fetchPublicHolidays(
  year: number,
  countryCode: string,
): Promise<NagerPublicHoliday[]> {
  if (!/^[A-Z]{2}$/.test(countryCode)) {
    throw new Error("Invalid country code");
  }
  const res = await fetch(
    `${BASE_URL}/PublicHolidays/${year}/${encodeURIComponent(countryCode)}`,
  );
  if (!res.ok) {
    throw new Error(`Nager API error: ${res.status} ${res.statusText}`);
  }
  const raw: unknown = await res.json();
  const data = z.array(NagerPublicHolidaySchema).parse(raw);
  return data.filter((h) => h.global);
}
