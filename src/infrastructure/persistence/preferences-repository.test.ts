// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach } from "vitest";
import {
  loadPreferences,
  savePreferences,
  clearPreferences,
  migrateLegacyPreferencesToLocal,
  _resetLegacyPreferencesMigrationForTests,
} from "./preferences-repository";
import {
  setStorageNamespace,
} from "./local-storage-repository";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { UserPreferences } from "@domain/models/types";
import { UserPreferencesSchema } from "@domain/schemas/preferences.schema";

// v0.45.3 — preferences are now UID-namespaced. Default namespace is "local".
const STORAGE_KEY = "spert:user-preferences:local";
const LEGACY_STORAGE_KEY = "spert:user-preferences";

beforeEach(() => {
  localStorage.clear();
  setStorageNamespace("local");
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
      defaultParkinsonsLawEnabled: true,
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

describe("clearPreferences", () => {
  it("removes the stored preferences key", () => {
    savePreferences({
      ...DEFAULT_USER_PREFERENCES,
      defaultTrialCount: 12345,
    });
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();

    clearPreferences();

    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it("causes loadPreferences to return defaults afterwards", () => {
    savePreferences({
      ...DEFAULT_USER_PREFERENCES,
      defaultTrialCount: 99999,
    });

    clearPreferences();

    expect(loadPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("is idempotent when the key is already absent", () => {
    expect(() => clearPreferences()).not.toThrow();
    expect(loadPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
  });
});

describe("UID namespacing (v0.45.3)", () => {
  beforeEach(() => {
    setStorageNamespace("local");
  });

  it("default namespace writes to the :local key", () => {
    savePreferences({ ...DEFAULT_USER_PREFERENCES, defaultTrialCount: 12345 });
    expect(localStorage.getItem("spert:user-preferences:local")).not.toBeNull();
    // Unscoped legacy key is NOT written
    expect(localStorage.getItem("spert:user-preferences")).toBeNull();
  });

  it("UID namespace writes to the :{uid} key, isolated from :local", () => {
    setStorageNamespace("uid-A");
    savePreferences({ ...DEFAULT_USER_PREFERENCES, defaultTrialCount: 7777 });

    expect(localStorage.getItem("spert:user-preferences:uid-A")).not.toBeNull();
    expect(localStorage.getItem("spert:user-preferences:local")).toBeNull();
  });

  it("cross-namespace isolation: A's prefs are not visible to B", () => {
    setStorageNamespace("uid-A");
    savePreferences({ ...DEFAULT_USER_PREFERENCES, defaultTrialCount: 11111 });

    setStorageNamespace("uid-B");
    // B sees defaults — uid-A's data is structurally inaccessible
    expect(loadPreferences().defaultTrialCount).toBe(
      DEFAULT_USER_PREFERENCES.defaultTrialCount,
    );

    // Switching back to A still sees A's data
    setStorageNamespace("uid-A");
    expect(loadPreferences().defaultTrialCount).toBe(11111);
  });

  it("clearPreferences only clears the active namespace", () => {
    setStorageNamespace("uid-A");
    savePreferences({ ...DEFAULT_USER_PREFERENCES, defaultTrialCount: 11111 });

    setStorageNamespace("uid-B");
    savePreferences({ ...DEFAULT_USER_PREFERENCES, defaultTrialCount: 22222 });

    // B clears their own namespace
    clearPreferences();
    expect(localStorage.getItem("spert:user-preferences:uid-B")).toBeNull();

    // A's data is untouched
    expect(localStorage.getItem("spert:user-preferences:uid-A")).not.toBeNull();
    setStorageNamespace("uid-A");
    expect(loadPreferences().defaultTrialCount).toBe(11111);
  });
});

describe("legacy-key migration (v0.45.3)", () => {
  beforeEach(() => {
    localStorage.clear();
    setStorageNamespace("local");
    _resetLegacyPreferencesMigrationForTests();
  });

  it("migrates pre-v0.45.3 unprefixed key to :local namespace", () => {
    const prefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      defaultTrialCount: 33333,
    };
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(prefs));

    migrateLegacyPreferencesToLocal();

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();

    // Round-trip: loadPreferences from active namespace returns migrated data
    expect(loadPreferences().defaultTrialCount).toBe(33333);
  });

  it("idempotent: re-running does not corrupt or duplicate", () => {
    const prefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      defaultTrialCount: 44444,
    };
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(prefs));

    migrateLegacyPreferencesToLocal();
    _resetLegacyPreferencesMigrationForTests();
    migrateLegacyPreferencesToLocal();
    _resetLegacyPreferencesMigrationForTests();
    migrateLegacyPreferencesToLocal();

    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("does nothing when legacy key is absent", () => {
    migrateLegacyPreferencesToLocal();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).toBeNull();
  });

  it("recoverable on partial failure: leaves legacy key in place if write fails", () => {
    const prefs: UserPreferences = {
      ...DEFAULT_USER_PREFERENCES,
      defaultTrialCount: 55555,
    };
    localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(prefs));

    const realSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k: string, v: string) {
      if (k === STORAGE_KEY) {
        throw new DOMException("simulated quota", "QuotaExceededError");
      }
      realSetItem.call(this, k, v);
    };

    try {
      migrateLegacyPreferencesToLocal();
    } finally {
      Storage.prototype.setItem = realSetItem;
    }

    // Legacy key still present — data is recoverable
    expect(localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();
  });
});
