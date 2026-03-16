// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/** Country entry from Nager.Date /api/v3/AvailableCountries */
export interface NagerCountry {
  countryCode: string;
  name: string;
}

/** Public holiday entry from Nager.Date /api/v3/PublicHolidays/{year}/{countryCode} */
export interface NagerPublicHoliday {
  date: string; // YYYY-MM-DD
  localName: string;
  name: string;
  countryCode: string;
  global: boolean;
  types: string[];
}
