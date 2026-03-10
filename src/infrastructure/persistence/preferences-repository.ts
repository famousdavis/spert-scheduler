// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { UserPreferences } from "@domain/models/types";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import { UserPreferencesSchema } from "@domain/schemas/preferences.schema";

const STORAGE_KEY = "spert:user-preferences";

export function loadPreferences(): UserPreferences {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { ...DEFAULT_USER_PREFERENCES };

  try {
    const parsed = JSON.parse(raw);
    const result = UserPreferencesSchema.safeParse(parsed);
    if (result.success) {
      return result.data as UserPreferences;
    }
    return { ...DEFAULT_USER_PREFERENCES };
  } catch {
    return { ...DEFAULT_USER_PREFERENCES };
  }
}

export function savePreferences(prefs: UserPreferences): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}
