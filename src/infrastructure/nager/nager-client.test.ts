// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  fetchAvailableCountries,
  fetchPublicHolidays,
} from "./nager-client";

describe("fetchAvailableCountries", () => {
  const mockCountries = [
    { countryCode: "DE", name: "Germany" },
    { countryCode: "US", name: "United States" },
    { countryCode: "AT", name: "Austria" },
  ];

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns countries sorted alphabetically by name", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockCountries,
    } as Response);

    const result = await fetchAvailableCountries();
    expect(result).toEqual([
      { countryCode: "AT", name: "Austria" },
      { countryCode: "DE", name: "Germany" },
      { countryCode: "US", name: "United States" },
    ]);
  });

  it("calls the correct URL", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await fetchAvailableCountries();
    expect(fetch).toHaveBeenCalledWith(
      "https://date.nager.at/api/v3/AvailableCountries",
    );
  });

  it("throws on HTTP error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    } as Response);

    await expect(fetchAvailableCountries()).rejects.toThrow(
      "Nager API error: 500 Internal Server Error",
    );
  });

  it("throws on network failure", async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(fetchAvailableCountries()).rejects.toThrow(
      "Failed to fetch",
    );
  });

  it("throws on malformed API response (missing required fields)", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [{ countryCode: "US" }], // missing name
    } as Response);

    await expect(fetchAvailableCountries()).rejects.toThrow();
  });
});

describe("fetchPublicHolidays", () => {
  const mockHolidays = [
    {
      date: "2026-01-01",
      localName: "Neujahr",
      name: "New Year's Day",
      countryCode: "DE",
      global: true,
      types: ["Public"],
    },
    {
      date: "2026-10-31",
      localName: "Reformationstag",
      name: "Reformation Day",
      countryCode: "DE",
      global: false, // subdivision-specific
      types: ["Public"],
    },
    {
      date: "2026-12-25",
      localName: "Erster Weihnachtstag",
      name: "Christmas Day",
      countryCode: "DE",
      global: true,
      types: ["Public"],
    },
  ];

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns only global holidays", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => mockHolidays,
    } as Response);

    const result = await fetchPublicHolidays(2026, "DE");
    expect(result).toHaveLength(2);
    expect(result.every((h) => h.global)).toBe(true);
    expect(result[0]!.name).toBe("New Year's Day");
    expect(result[1]!.name).toBe("Christmas Day");
  });

  it("calls the correct URL with year and country code", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [],
    } as Response);

    await fetchPublicHolidays(2027, "US");
    expect(fetch).toHaveBeenCalledWith(
      "https://date.nager.at/api/v3/PublicHolidays/2027/US",
    );
  });

  it("throws on HTTP error", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    } as Response);

    await expect(fetchPublicHolidays(2026, "XX")).rejects.toThrow(
      "Nager API error: 404 Not Found",
    );
  });

  it("throws on malformed API response (missing required fields)", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        { date: "2026-01-01", name: "New Year's Day" }, // missing global, countryCode, etc.
      ],
    } as Response);

    await expect(fetchPublicHolidays(2026, "DE")).rejects.toThrow();
  });

  it("returns empty array when all holidays are subdivision-specific", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => [
        { ...mockHolidays[0], global: false },
        { ...mockHolidays[2], global: false },
      ],
    } as Response);

    const result = await fetchPublicHolidays(2026, "DE");
    expect(result).toHaveLength(0);
  });
});
