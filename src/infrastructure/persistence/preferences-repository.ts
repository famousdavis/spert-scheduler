// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

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

export function loadPreferences(): UserPreferences {
  const raw = localStorage.getItem(keyForActiveNamespace());
  if (!raw) return { ...DEFAULT_USER_PREFERENCES };

  try {
    const parsed = JSON.parse(raw);
    const result = UserPreferencesSchema.safeParse(parsed);
    if (result.success) {
      return result.data as UserPreferences;
    }
    if (import.meta.env.DEV) {
      console.warn("User preferences failed schema validation; resetting to defaults:", result.error.issues);
    }
    return { ...DEFAULT_USER_PREFERENCES };
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

export function savePreferences(prefs: UserPreferences): void {
  localStorage.setItem(keyForActiveNamespace(), JSON.stringify(prefs));
}

/** Removes the stored preferences key for the active namespace.
 *  Idempotent. Does not touch other namespaces' preferences. */
export function clearPreferences(): void {
  localStorage.removeItem(keyForActiveNamespace());
}
