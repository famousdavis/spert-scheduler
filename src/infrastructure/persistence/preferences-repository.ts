// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { UserPreferences } from "@domain/models/types";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { UserPreferencesSchema } from "@domain/schemas/preferences.schema";
import { getActiveStorageNamespace } from "./local-storage-repository";

// v0.45.3 — UID-namespaced preferences keys (sibling pattern to
// local-storage-repository.ts M4). Pre-v0.45.3 used a single shared key
// `spert:user-preferences`, which let User A's preferences leak into
// User B's session on a shared device when User A's session ended
// without an explicit sign-out (crash, tab close). Now keyed per active
// namespace — "local" for signed-out/local mode, UID for cloud mode.
const KEY_BASE = "spert:user-preferences";
const LEGACY_KEY = KEY_BASE; // pre-v0.45.3 unscoped key

function keyForActiveNamespace(): string {
  return `${KEY_BASE}:${getActiveStorageNamespace()}`;
}

/** Read → write-and-verify → delete migration of the pre-v0.45.3 legacy
 *  key into the `local` namespace. Read-before-delete ordering means a
 *  mid-migration crash leaves the data under BOTH keys (recoverable),
 *  never under neither. Idempotent. */
let legacyMigrationDone = false;
export function migrateLegacyPreferencesToLocal(): void {
  if (legacyMigrationDone) return;
  legacyMigrationDone = true;

  const value = localStorage.getItem(LEGACY_KEY);
  if (value === null) return;

  // The legacy key shape collides with the new namespaced key when
  // namespace === "" — but namespace defaults to "local" and is never empty,
  // so `LEGACY_KEY === KEY_BASE` is structurally distinct from
  // `${KEY_BASE}:local`. Safe.
  const targetKey = `${KEY_BASE}:local`;
  try {
    localStorage.setItem(targetKey, value);
    if (localStorage.getItem(targetKey) === value) {
      localStorage.removeItem(LEGACY_KEY);
    }
  } catch {
    // Quota exceeded — leave the legacy key in place; the next boot retries.
  }
}

// Run the migration at module load. Tests that need a clean slate can call
// `_resetLegacyPreferencesMigrationForTests()`.
if (typeof localStorage !== "undefined") {
  migrateLegacyPreferencesToLocal();
}

export function _resetLegacyPreferencesMigrationForTests(): void {
  legacyMigrationDone = false;
}

// -- WI-68: forward compatibility --------------------------------------------
//
// A preference VALUE a newer release writes but this copy does not know — say a
// `defaultDistributionType` it has never heard of — used to cost the user EVERY other
// preference. One `safeParse` ran over the whole object and a single bad field
// returned `DEFAULT_USER_PREFERENCES` in full, so date format, theme and trial
// count all reverted; the next save then wrote that reset over the stored copy
// (and, in cloud mode, over every other device's).
//
// The read is now per field. A field that fails its own schema falls back to
// its default AT RUNTIME, and its RAW value is RETAINED so that an unrelated
// save writes it back untouched. A field the user actually changes drops its
// retained value, because the user's choice is now the newer one.
//
// This protects copies built from here on. An older copy still wipes.

/** Raw values of known preference keys this copy could not read. */
export type RetainedPreferences = Record<string, unknown>;

/** Keyed by storage namespace — "local" when signed out, the UID otherwise
 *  (`StorageProvider` sets it; see `local-storage-repository`). The cloud
 *  driver shares this map under the same UID key rather than keeping its own,
 *  which is what lets `resetPreferences` clear BOTH sides at once. A driver
 *  that inferred "the user changed this" from a state diff could not: a user
 *  whose only non-default setting is an unreadable one has a runtime value
 *  already equal to the default, so a reset changes nothing observable and the
 *  unreadable value would be written straight back into the reset document. */
const retainedByNamespace = new Map<string, RetainedPreferences>();

const PREFERENCE_KEYS = Object.keys(
  UserPreferencesSchema.shape
) as (keyof UserPreferences)[];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface TolerantPreferencesRead {
  /** The fields this copy can use. Spread over the defaults for a runtime
   *  object, or used as-is where a partial is wanted (the cloud load). */
  valid: Partial<UserPreferences>;
  /** Raw values of KNOWN keys that were present and unreadable.
   *
   *  ⚠️ Unknown KEYS are deliberately NOT retained. The
   *  `spertscheduler_settings` rule validates with `keys().hasOnly([...])`, so
   *  a single key outside the deployed allowlist would make EVERY preferences
   *  save for that user fail with PERMISSION_DENIED. Dropping an unknown key
   *  costs exactly what it already costs today; writing one back could cost
   *  the user every future preference change.
   *
   *  ⚠️ That applies to the LOCAL read too, and not merely for symmetry:
   *  `retainedByNamespace` is ONE map shared with the cloud driver, so a key
   *  retained from localStorage lands in the next cloud `setDoc` payload and
   *  fails `hasOnly` there. Retaining unknown keys locally is the same hazard
   *  by a longer route. */
  retained: RetainedPreferences;
}

/** Parse a stored preferences object one field at a time. Pure. */
export function readPreferencesPerField(stored: unknown): TolerantPreferencesRead {
  const valid: Record<string, unknown> = {};
  const retained: RetainedPreferences = {};
  if (!isPlainRecord(stored)) return { valid, retained };

  for (const key of PREFERENCE_KEYS) {
    const present = Object.hasOwn(stored, key);
    const result = UserPreferencesSchema.shape[key].safeParse(stored[key]);
    if (result.success) {
      if (present) valid[key] = result.data;
    } else if (present) {
      retained[key] = stored[key];
    }
  }
  return { valid, retained };
}

/** Replace the retained entries for a namespace with what this load found. */
export function setRetainedPreferences(
  namespace: string,
  retained: RetainedPreferences
): void {
  if (Object.keys(retained).length === 0) {
    retainedByNamespace.delete(namespace);
    return;
  }
  retainedByNamespace.set(namespace, { ...retained });
}

export function getRetainedPreferences(namespace: string): RetainedPreferences {
  return retainedByNamespace.get(namespace) ?? {};
}

/** The user has chosen a value for these keys, so the retained ones are stale. */
export function dropRetainedPreferences(
  namespace: string,
  keys: Iterable<string>
): void {
  const current = retainedByNamespace.get(namespace);
  if (!current) return;
  for (const key of keys) delete current[key];
  if (Object.keys(current).length === 0) retainedByNamespace.delete(namespace);
}

/** Called by `resetPreferences` BEFORE it saves, and on sign-out cleanup, so a
 *  reset really does write nothing but the defaults. */
export function clearRetainedPreferences(namespace: string): void {
  retainedByNamespace.delete(namespace);
}

/** The map outlives `localStorage.clear()`, which tests reach for in
 *  `beforeEach`. Without this, one test's retained value is written back by the
 *  next test's save. */
export function _resetRetainedPreferencesForTests(): void {
  retainedByNamespace.clear();
}

/** The document to persist: the runtime preferences, with the values this copy
 *  could not read written back over them. */
export function withRetainedPreferences(
  namespace: string,
  prefs: UserPreferences
): Record<string, unknown> {
  return { ...prefs, ...getRetainedPreferences(namespace) };
}

export function activePreferencesNamespace(): string {
  return getActiveStorageNamespace();
}

export function loadPreferences(): UserPreferences {
  const namespace = getActiveStorageNamespace();
  const raw = localStorage.getItem(keyForActiveNamespace());
  if (!raw) {
    clearRetainedPreferences(namespace);
    return { ...DEFAULT_USER_PREFERENCES };
  }

  try {
    const { valid, retained } = readPreferencesPerField(JSON.parse(raw));
    setRetainedPreferences(namespace, retained);
    if (import.meta.env.DEV && Object.keys(retained).length > 0) {
      console.warn(
        "User preferences: these values are not understood by this version and " +
          "will be left as they are:",
        Object.keys(retained)
      );
    }
    return { ...DEFAULT_USER_PREFERENCES, ...valid };
  } catch {
    clearRetainedPreferences(namespace);
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

/** `changedKeys` are the keys the user just chose a value for; their retained
 *  raw values are dropped so the user's choice wins. Omit it for a save that
 *  changes nothing (the cloud echo), which must preserve them. */
export function savePreferences(
  prefs: UserPreferences,
  changedKeys?: Iterable<string>
): void {
  const namespace = getActiveStorageNamespace();
  if (changedKeys) dropRetainedPreferences(namespace, changedKeys);
  localStorage.setItem(
    keyForActiveNamespace(),
    JSON.stringify(withRetainedPreferences(namespace, prefs))
  );
}

/** Removes the stored preferences key for the active namespace.
 *  Idempotent. Does not touch other namespaces' preferences. */
export function clearPreferences(): void {
  clearRetainedPreferences(getActiveStorageNamespace());
  localStorage.removeItem(keyForActiveNamespace());
}
