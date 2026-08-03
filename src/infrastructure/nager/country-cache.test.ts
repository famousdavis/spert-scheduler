// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * `country-cache.ts` (§3.9, 2026-08-03) — the only file in `src/infrastructure` that was
 * at a true 0%: both functions, never executed by anything.
 *
 * ⚠️ It is in scope while most of the directory's uncovered code is NOT, and the reason is
 * the heuristic rather than the percentage. Its rule — *cached data that fails Zod
 * validation must be discarded and re-fetched, and a cache write must never break the
 * caller* — has no other expression anywhere. By contrast `firestore-driver`'s uncovered
 * guards mirror `firestore.rules` and are marked "redundant by design" in the source.
 *
 * No Firestore mock is needed; this is localStorage and Zod.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import type { NagerCountry } from "@domain/models/nager-types";
import { loadCachedCountries, saveCachedCountries } from "./country-cache";

const KEY = "spert-scheduler:nager-countries";

/** Real shape, annotated rather than cast. */
const COUNTRIES: NagerCountry[] = [
  { countryCode: "US", name: "United States" },
  { countryCode: "GB", name: "United Kingdom" },
];

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("country cache — round trip", () => {
  it("returns what was saved", () => {
    saveCachedCountries(COUNTRIES);
    expect(loadCachedCountries()).toEqual(COUNTRIES);
  });

  it("writes under the documented key, so a rename is a visible change", () => {
    saveCachedCountries(COUNTRIES);
    expect(localStorage.getItem(KEY)).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(COUNTRIES);
  });

  it("round-trips an empty list rather than treating it as absent", () => {
    // `[]` is valid cached data — it must not read back as "no cache", which would make
    // the app re-fetch forever.
    saveCachedCountries([]);
    expect(loadCachedCountries()).toEqual([]);
  });
});

describe("country cache — the discard rule", () => {
  it("returns null when nothing is cached", () => {
    expect(loadCachedCountries()).toBeNull();
  });

  it("discards cached data that fails validation", () => {
    // The rule with no other expression: a shape change in NagerCountry must invalidate
    // existing caches rather than flow through as malformed data.
    localStorage.setItem(KEY, JSON.stringify([{ countryCode: "US" }]));
    expect(loadCachedCountries()).toBeNull();
  });

  it("discards a cached value that is not an array", () => {
    localStorage.setItem(KEY, JSON.stringify({ countryCode: "US", name: "United States" }));
    expect(loadCachedCountries()).toBeNull();
  });

  it("discards unparseable JSON rather than throwing", () => {
    localStorage.setItem(KEY, "{not json");
    expect(() => loadCachedCountries()).not.toThrow();
    expect(loadCachedCountries()).toBeNull();
  });

  it("warns when it discards validated-but-wrong data, and stays silent when there is none", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    loadCachedCountries(); // empty cache — not a problem worth warning about
    expect(warn).not.toHaveBeenCalled();

    localStorage.setItem(KEY, JSON.stringify([{ countryCode: "US" }]));
    loadCachedCountries();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe("country cache — writes are best-effort", () => {
  it("does not throw when storage rejects the write", () => {
    // Quota exceeded, private browsing, storage disabled — the cache is an optimisation
    // and must never break the caller. Nothing else states this.
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new DOMException("QuotaExceededError");
      });

    expect(() => saveCachedCountries(COUNTRIES)).not.toThrow();
    expect(setItem).toHaveBeenCalled();
  });

  it("leaves a readable cache in place when a later write fails", () => {
    saveCachedCountries(COUNTRIES);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("QuotaExceededError");
    });

    saveCachedCountries([{ countryCode: "FR", name: "France" }]);
    vi.restoreAllMocks();

    // The failed write is a no-op, not a corruption.
    expect(loadCachedCountries()).toEqual(COUNTRIES);
  });
});
