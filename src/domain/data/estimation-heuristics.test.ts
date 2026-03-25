// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  ESTIMATION_HEURISTICS,
  HEURISTIC_DOMAINS,
  getSubdomains,
  getHeuristic,
} from "./estimation-heuristics";

describe("ESTIMATION_HEURISTICS", () => {
  it("contains exactly 73 entries", () => {
    expect(ESTIMATION_HEURISTICS).toHaveLength(73);
  });

  it("has no duplicate domain+subdomain pairs", () => {
    const keys = ESTIMATION_HEURISTICS.map(
      (h) => `${h.domain}::${h.subdomain}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every entry has non-empty strings", () => {
    for (const h of ESTIMATION_HEURISTICS) {
      expect(h.domain.length).toBeGreaterThan(0);
      expect(h.subdomain.length).toBeGreaterThan(0);
      expect(h.rationale.length).toBeGreaterThan(0);
    }
  });

  it("every minPct is in range 1–99", () => {
    for (const h of ESTIMATION_HEURISTICS) {
      expect(h.minPct).toBeGreaterThanOrEqual(1);
      expect(h.minPct).toBeLessThanOrEqual(99);
    }
  });

  it("every maxPct is in range 101–1000", () => {
    for (const h of ESTIMATION_HEURISTICS) {
      expect(h.maxPct).toBeGreaterThanOrEqual(101);
      expect(h.maxPct).toBeLessThanOrEqual(1000);
    }
  });

  it("every minPct < 100 < maxPct", () => {
    for (const h of ESTIMATION_HEURISTICS) {
      expect(h.minPct).toBeLessThan(100);
      expect(h.maxPct).toBeGreaterThan(100);
    }
  });
});

describe("HEURISTIC_DOMAINS", () => {
  it("contains exactly 23 domains", () => {
    expect(HEURISTIC_DOMAINS).toHaveLength(23);
  });

  it("is sorted alphabetically", () => {
    const sorted = [...HEURISTIC_DOMAINS].sort();
    expect(HEURISTIC_DOMAINS).toEqual(sorted);
  });

  it("every domain is non-empty", () => {
    for (const d of HEURISTIC_DOMAINS) {
      expect(d.length).toBeGreaterThan(0);
    }
  });
});

describe("getSubdomains", () => {
  it("returns correct subdomains for a known domain", () => {
    const results = getSubdomains("Construction");
    const names = results.map((h) => h.subdomain);
    expect(names).toEqual([
      "Civil & Infrastructure",
      "Commercial Construction",
      "Commercial Fit-Out (Interior)",
      "Renovation & Retrofit",
      "Residential Construction",
    ]);
  });

  it("returns empty array for unknown domain", () => {
    expect(getSubdomains("Nonexistent Domain")).toEqual([]);
  });

  it("results are sorted alphabetically by subdomain", () => {
    for (const domain of HEURISTIC_DOMAINS) {
      const results = getSubdomains(domain);
      const names = results.map((h) => h.subdomain);
      const sorted = [...names].sort();
      expect(names).toEqual(sorted);
    }
  });
});

describe("getHeuristic", () => {
  it("returns correct entry for known domain+subdomain", () => {
    const h = getHeuristic("Cybersecurity", "Cybersecurity — Incident Response");
    expect(h).toBeDefined();
    expect(h!.minPct).toBe(40);
    expect(h!.maxPct).toBe(600);
  });

  it("returns undefined for unknown domain", () => {
    expect(getHeuristic("Fake", "Fake Sub")).toBeUndefined();
  });

  it("returns undefined for unknown subdomain within valid domain", () => {
    expect(getHeuristic("Construction", "Nonexistent")).toBeUndefined();
  });
});
