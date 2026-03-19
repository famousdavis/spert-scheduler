// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import { loadPreferences, savePreferences } from "./preferences-repository";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { UserPreferences } from "@domain/models/types";
import { UserPreferencesSchema } from "@domain/schemas/preferences.schema";

const STORAGE_KEY = "spert:user-preferences";

beforeEach(() => {
  localStorage.clear();
});

describe("loadPreferences", () => {
  it("returns defaults when no data stored", () => {
    expect(loadPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("returns stored preferences when valid", () => {
    const prefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      defaultTrialCount: 10000,
      dateFormat: "YYYY/MM/DD",
      autoRunSimulation: true,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));

    const loaded = loadPreferences();
    expect(loaded.defaultTrialCount).toBe(10000);
    expect(loaded.dateFormat).toBe("YYYY/MM/DD");
    expect(loaded.autoRunSimulation).toBe(true);
  });

  it("returns defaults on invalid JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json-{{{");
    expect(loadPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("returns defaults when schema validation fails", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ defaultTrialCount: "not-a-number" })
    );
    expect(loadPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("returns defaults when stored object is missing fields", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ dateFormat: "MM/DD/YYYY" }));
    expect(loadPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("returns defaults when trial count is out of range", () => {
    const prefs = { ...DEFAULT_USER_PREFERENCES, defaultTrialCount: 999 };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    expect(loadPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });
});

describe("savePreferences", () => {
  it("persists preferences to localStorage", () => {
    const prefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      defaultTrialCount: 25000,
    };
    savePreferences(prefs);

    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
    expect(stored.defaultTrialCount).toBe(25000);
  });

  it("round-trips through save and load", () => {
    const prefs: UserPreferences = {
      defaultTrialCount: 25000,
      defaultDistributionType: "triangular",
      defaultConfidenceLevel: "highConfidence",
      defaultActivityTarget: 0.75,
      defaultProjectTarget: 0.9,
      dateFormat: "DD/MM/YYYY",
      autoRunSimulation: true,
      theme: "dark",
      storeFullSimulationData: true,
      defaultHeuristicEnabled: false,
      defaultHeuristicMinPercent: 50,
      defaultHeuristicMaxPercent: 200,
      defaultDependencyMode: false,
      ganttViewMode: "uncertainty",
      ganttShowToday: false,
      ganttShowCriticalPath: false,
      ganttShowProjectName: true,
      ganttShowArrows: true,
    };
    savePreferences(prefs);
    expect(loadPreferences()).toEqual(prefs);
  });

  it("storeFullSimulationData defaults to false", () => {
    localStorage.clear();
    expect(loadPreferences().storeFullSimulationData).toBe(false);
  });

  it("round-trips defaultHolidayCountry", () => {
    const prefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      defaultHolidayCountry: "DE",
    };
    savePreferences(prefs);
    expect(loadPreferences().defaultHolidayCountry).toBe("DE");
  });

  it("round-trips workDays", () => {
    const prefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      workDays: [0, 1, 2, 3, 4],
    };
    savePreferences(prefs);
    const loaded = loadPreferences();
    expect(loaded.workDays).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("UserPreferencesSchema workDays validation", () => {
  it("accepts valid workDays array", () => {
    for (const workDays of [[1, 2, 3, 4, 5], [0, 6], [3]]) {
      const result = UserPreferencesSchema.safeParse({
        ...DEFAULT_USER_PREFERENCES,
        workDays,
      });
      expect(result.success, `workDays=${JSON.stringify(workDays)} should be valid`).toBe(true);
    }
  });

  it("rejects empty workDays", () => {
    const result = UserPreferencesSchema.safeParse({
      ...DEFAULT_USER_PREFERENCES,
      workDays: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects out-of-range day index", () => {
    expect(
      UserPreferencesSchema.safeParse({ ...DEFAULT_USER_PREFERENCES, workDays: [7] }).success
    ).toBe(false);
    expect(
      UserPreferencesSchema.safeParse({ ...DEFAULT_USER_PREFERENCES, workDays: [-1] }).success
    ).toBe(false);
  });

  it("accepts undefined workDays (defaults to Mon-Fri)", () => {
    const result = UserPreferencesSchema.safeParse(DEFAULT_USER_PREFERENCES);
    expect(result.success).toBe(true);
  });
});
