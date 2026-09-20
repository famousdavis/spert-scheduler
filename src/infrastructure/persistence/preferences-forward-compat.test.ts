// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-68 — one preference value this copy does not understand must not wipe all
 * the others, and must not be destroyed by the next unrelated save.
 *
 * Measured at `88dc6b2` before the fix: a single `defaultDistributionType:
 * "betaPert"` made `loadPreferences()` return a value EXACTLY equal to
 * `DEFAULT_USER_PREFERENCES` (9 customised values lost), and made the cloud
 * load return `{}` — 0 of 23 keys. The next save then wrote that reset over
 * both copies.
 *
 * ⚠️ Every fixture here is deliberately built so it CANNOT pass vacuously: each
 * asserted field differs from its default, so a regression to "return the
 * defaults" fails on every one of them. The three tests already in
 * `preferences-repository.test.ts` that look like wipe pins do not
 * discriminate — their fixtures' other fields all equal their defaults.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import type { UserPreferences } from "@domain/models/types";

vi.mock("../firebase/firebase", () => ({
  db: { __mock: true },
  auth: null,
  isFirebaseAvailable: true,
  getSendInvitationEmail: vi.fn(() => null),
  getClaimPendingInvitations: vi.fn(() => null),
  getRevokeInvite: vi.fn(() => null),
  getResendInvite: vi.fn(() => null),
}));

const setDocSpy = vi.fn().mockResolvedValue(undefined);
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, _col: string, id: string) => ({ id })),
  setDoc: (...args: unknown[]) => setDocSpy(...args),
  getDoc: vi.fn(),
  deleteDoc: vi.fn(),
  deleteField: vi.fn(() => "__delete__"),
  getDocs: vi.fn(),
  collection: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  runTransaction: vi.fn(),
  serverTimestamp: vi.fn(() => "__ts__"),
  updateDoc: vi.fn(),
}));

import { getDoc } from "firebase/firestore";
import { FirestoreDriver } from "../firebase/firestore-driver";
import {
  loadPreferences,
  savePreferences,
  clearPreferences,
  clearRetainedPreferences,
  _resetRetainedPreferencesForTests,
} from "./preferences-repository";
import {
  setStorageNamespace,
  getActiveStorageNamespace,
} from "./local-storage-repository";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";

const UID = "uid-forward-compat";
const STORAGE_KEY = `spert:user-preferences:${UID}`;

/** A value only a NEWER release knows. Rejected by this copy's enum. */
const UNKNOWN_VALUE = "betaPert";
/** A key only a NEWER release knows. */
const UNKNOWN_KEY = "defaultRiskAppetite";

/** Nine settings, every one of them different from its default. */
const CUSTOMISED = {
  defaultTrialCount: 25000,
  dateFormat: "DD/MM/YYYY",
  theme: "dark",
  autoRunSimulation: true,
  defaultActivityTarget: 0.6,
  defaultConfidenceLevel: "highConfidence",
  ganttShowArrows: false,
  defaultHolidayCountry: "DE",
  targetFinishGreenPct: 60,
} as const;

function storedWith(extra: Record<string, unknown>): Record<string, unknown> {
  return { ...DEFAULT_USER_PREFERENCES, ...CUSTOMISED, ...extra };
}

function storedWithout(key: string): Record<string, unknown> {
  const stored = storedWith({});
  delete stored[key];
  return stored;
}

function expectCustomisedSurvived(prefs: Partial<UserPreferences>): void {
  expect(prefs.defaultTrialCount).toBe(25000);
  expect(prefs.dateFormat).toBe("DD/MM/YYYY");
  expect(prefs.theme).toBe("dark");
  expect(prefs.autoRunSimulation).toBe(true);
  expect(prefs.defaultActivityTarget).toBe(0.6);
  expect(prefs.defaultConfidenceLevel).toBe("highConfidence");
  expect(prefs.ganttShowArrows).toBe(false);
  expect(prefs.defaultHolidayCountry).toBe("DE");
  expect(prefs.targetFinishGreenPct).toBe(60);
}

function readStored(): Record<string, unknown> {
  return JSON.parse(localStorage.getItem(STORAGE_KEY)!) as Record<string, unknown>;
}

function lastCloudWrite(): Record<string, unknown> {
  const call = setDocSpy.mock.calls.at(-1);
  return call?.[1] as Record<string, unknown>;
}

function cloudDoc(data: unknown) {
  return { exists: () => true, data: () => data } as never;
}

beforeEach(() => {
  localStorage.clear();
  // Production arrangement: `StorageProvider` sets the storage namespace to the
  // signed-in UID, and `useCloudSync` builds the driver with the SAME uid. The
  // shared retained map is keyed by that one string — this test relies on it,
  // and asserts it below.
  setStorageNamespace(UID);
  _resetRetainedPreferencesForTests();
  setDocSpy.mockClear();
  vi.mocked(getDoc).mockReset();
  usePreferencesStore.getState().clearInMemory();
});

describe("WI-68 · the storage namespace and the driver uid are the same key", () => {
  it("so one retained map serves both sides", () => {
    expect(getActiveStorageNamespace()).toBe(UID);
    expect(new FirestoreDriver(UID)).toBeDefined();
  });
});

describe("WI-68 · LOCAL — one unreadable value", () => {
  it("keeps every other preference", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );

    const loaded = loadPreferences();

    expectCustomisedSurvived(loaded);
    // The one it cannot read falls back to its default at runtime.
    expect(loaded.defaultDistributionType).toBe(
      DEFAULT_USER_PREFERENCES.defaultDistributionType
    );
    expect(loaded).not.toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("writes the unreadable value back unchanged on an unrelated save", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );
    const loaded = loadPreferences();

    // The user changes something else entirely.
    savePreferences({ ...loaded, theme: "light" }, ["theme"]);

    const stored = readStored();
    expect(stored.defaultDistributionType).toBe(UNKNOWN_VALUE);
    expect(stored.theme).toBe("light");
    expect(stored.defaultTrialCount).toBe(25000);
  });

  it("a user change to THAT field replaces the unreadable value", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );
    const loaded = loadPreferences();

    savePreferences({ ...loaded, defaultDistributionType: "uniform" }, [
      "defaultDistributionType",
    ]);

    expect(readStored().defaultDistributionType).toBe("uniform");
  });

  it("an unknown KEY is still dropped on save — RULED, and deliberate", () => {
    // ⚠️ `spertscheduler_settings` validates with `keys().hasOnly([...])`, so
    // writing an unallowlisted key back would make EVERY preferences save for
    // that user fail. Dropping it costs only what it already costs today.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWith({ [UNKNOWN_KEY]: "aggressive" }))
    );
    const loaded = loadPreferences();

    expectCustomisedSurvived(loaded);
    savePreferences(loaded, ["theme"]);

    expect(Object.hasOwn(readStored(), UNKNOWN_KEY)).toBe(false);
  });

  it("CONTROL — a document with nothing unreadable retains nothing", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(storedWith({})));
    const loaded = loadPreferences();

    savePreferences({ ...loaded, theme: "light" }, ["theme"]);

    expect(readStored().theme).toBe("light");
  });

  it("a stored value that is not an object still yields the bare defaults", () => {
    for (const junk of ['"hello"', "[1,2,3]", "null", "42"]) {
      localStorage.setItem(STORAGE_KEY, junk);
      expect(loadPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
    }
  });
});

describe("WI-68 · CLOUD — one unreadable value", () => {
  it("keeps every other preference, where the whole-document parse returned {}", async () => {
    vi.mocked(getDoc).mockResolvedValue(
      cloudDoc(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );
    const driver = new FirestoreDriver(UID);

    const prefs = await driver.loadPreferences();

    expect(Object.keys(prefs).length).toBeGreaterThan(20);
    expectCustomisedSurvived(prefs);
    // Unreadable, so it is absent from the partial and `useCloudSync` leaves
    // the runtime value alone.
    expect(Object.hasOwn(prefs, "defaultDistributionType")).toBe(false);
  });

  it("writes the unreadable value back unchanged on an unrelated save", async () => {
    vi.mocked(getDoc).mockResolvedValue(
      cloudDoc(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );
    const driver = new FirestoreDriver(UID);
    const prefs = await driver.loadPreferences();

    await driver.savePreferences({
      ...DEFAULT_USER_PREFERENCES,
      ...prefs,
      theme: "light",
    } as UserPreferences);

    const written = lastCloudWrite();
    expect(written.defaultDistributionType).toBe(UNKNOWN_VALUE);
    expect(written.theme).toBe("light");
    expect(written.defaultTrialCount).toBe(25000);
  });

  it("a user change to THAT field replaces it, via the store", async () => {
    vi.mocked(getDoc).mockResolvedValue(
      cloudDoc(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );
    const driver = new FirestoreDriver(UID);
    const prefs = await driver.loadPreferences();

    // This is what `useCloudSync` does: apply the cloud partial, then the user
    // picks a distribution, then the subscription saves.
    usePreferencesStore.getState().updatePreferences(prefs);
    usePreferencesStore
      .getState()
      .updatePreferences({ defaultDistributionType: "uniform" });
    await driver.savePreferences(usePreferencesStore.getState().preferences);

    expect(lastCloudWrite().defaultDistributionType).toBe("uniform");
  });

  it("an unknown KEY is still dropped on save — RULED, and deliberate", async () => {
    vi.mocked(getDoc).mockResolvedValue(
      cloudDoc(storedWith({ [UNKNOWN_KEY]: "aggressive" }))
    );
    const driver = new FirestoreDriver(UID);
    const prefs = await driver.loadPreferences();

    expectCustomisedSurvived(prefs);
    await driver.savePreferences({
      ...DEFAULT_USER_PREFERENCES,
      ...prefs,
    } as UserPreferences);

    expect(Object.hasOwn(lastCloudWrite(), UNKNOWN_KEY)).toBe(false);
  });

  it("stays a WHOLE-DOCUMENT setDoc — two arguments, never { merge: true }", async () => {
    const driver = new FirestoreDriver(UID);
    await driver.savePreferences({ ...DEFAULT_USER_PREFERENCES });
    expect(setDocSpy.mock.calls.at(-1)).toHaveLength(2);
  });
});

describe("WI-68 · RESET clears the retained values too", () => {
  it("LOCAL — reset writes exactly the defaults, with nothing written back", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );
    usePreferencesStore.getState().loadPreferences();

    usePreferencesStore.getState().resetPreferences();

    const stored = readStored();
    expect(stored).toEqual(DEFAULT_USER_PREFERENCES);
    expect(stored.defaultDistributionType).toBe(
      DEFAULT_USER_PREFERENCES.defaultDistributionType
    );
    // The four optional keys absent from the defaults must be gone, which is
    // what `{ merge: true }` in the cloud would have broken.
    for (const key of [
      "globalCalendar",
      "defaultHolidayCountry",
      "targetFinishGreenPct",
      "targetFinishAmberPct",
    ]) {
      expect(Object.hasOwn(stored, key)).toBe(false);
    }
  });

  it("CLOUD — the reset document carries no retained value either", async () => {
    vi.mocked(getDoc).mockResolvedValue(
      cloudDoc(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );
    const driver = new FirestoreDriver(UID);
    await driver.loadPreferences();

    // ⚠️ THE CASE A PER-DRIVER MAP WOULD GET WRONG. The user's only non-default
    // distribution is one this copy cannot read, so the RUNTIME value is
    // already `triangular` — the default. Nothing observable changes on reset,
    // so a driver inferring "the user changed this" from a state diff would
    // write `betaPert` straight back into the reset document.
    usePreferencesStore.getState().resetPreferences();
    await driver.savePreferences(usePreferencesStore.getState().preferences);

    const written = lastCloudWrite();
    expect(written.defaultDistributionType).toBe(
      DEFAULT_USER_PREFERENCES.defaultDistributionType
    );
    expect(written).toEqual(DEFAULT_USER_PREFERENCES);
  });

  it("sign-out cleanup clears them as well", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );
    loadPreferences();

    clearPreferences();
    savePreferences({ ...DEFAULT_USER_PREFERENCES });

    expect(readStored().defaultDistributionType).toBe(
      DEFAULT_USER_PREFERENCES.defaultDistributionType
    );
  });
});

describe("WI-68 · consequences of the per-field read", () => {
  it("dateFormat keeps its legacy-format preprocess", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWith({ dateFormat: "YYYY-MM-DD" }))
    );
    expect(loadPreferences().dateFormat).toBe("YYYY/MM/DD");
  });

  it("an absent OPTIONAL key now loads its documented default, not undefined", () => {
    // A deliberate, recorded change. Before the per-field read this returned
    // `undefined` whenever every required field happened to be valid, and the
    // full defaults whenever one was not — an accident of the whole-object
    // parse, not a designed behaviour.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWithout("ganttShowArrows"))
    );

    const loaded = loadPreferences();

    expect(loaded.ganttShowArrows).toBe(DEFAULT_USER_PREFERENCES.ganttShowArrows);
    expectCustomisedSurvived({ ...loaded, ganttShowArrows: false });
  });

  it("a missing REQUIRED field costs only that field", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWithout("defaultTrialCount"))
    );

    const loaded = loadPreferences();

    expect(loaded.defaultTrialCount).toBe(DEFAULT_USER_PREFERENCES.defaultTrialCount);
    expect(loaded.theme).toBe("dark");
    expect(loaded.dateFormat).toBe("DD/MM/YYYY");
  });

  it("retained values are namespaced — one user's cannot reach another's save", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(storedWith({ defaultDistributionType: UNKNOWN_VALUE }))
    );
    loadPreferences();

    setStorageNamespace("uid-other");
    savePreferences({ ...DEFAULT_USER_PREFERENCES });

    const other = JSON.parse(
      localStorage.getItem("spert:user-preferences:uid-other")!
    ) as Record<string, unknown>;
    expect(other.defaultDistributionType).toBe(
      DEFAULT_USER_PREFERENCES.defaultDistributionType
    );

    // And the first user's is still intact.
    setStorageNamespace(UID);
    clearRetainedPreferences("nobody");
    expect(readStored().defaultDistributionType).toBe(UNKNOWN_VALUE);
  });
});
