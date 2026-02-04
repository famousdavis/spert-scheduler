import { describe, it, expect, beforeEach } from "vitest";
import { loadPreferences, savePreferences } from "./preferences-repository";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { UserPreferences } from "@domain/models/types";

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
      dateFormat: "YYYY-MM-DD",
      autoRunSimulation: true,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));

    const loaded = loadPreferences();
    expect(loaded.defaultTrialCount).toBe(10000);
    expect(loaded.dateFormat).toBe("YYYY-MM-DD");
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
    };
    savePreferences(prefs);
    expect(loadPreferences()).toEqual(prefs);
  });

  it("storeFullSimulationData defaults to false", () => {
    localStorage.clear();
    expect(loadPreferences().storeFullSimulationData).toBe(false);
  });
});
