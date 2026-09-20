// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { create } from "zustand";
import { shallow } from "zustand/shallow";
import type { UserPreferences } from "@domain/models/types";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import {
  activePreferencesNamespace,
  clearRetainedPreferences,
  loadPreferences,
  savePreferences,
} from "@infrastructure/persistence/preferences-repository";

export interface PreferencesStore {
  preferences: UserPreferences;
  loadPreferences: () => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
  clearInMemory: () => void;
}

export const usePreferencesStore = create<PreferencesStore>((set) => ({
  preferences: { ...DEFAULT_USER_PREFERENCES },

  loadPreferences: () => {
    const incoming = loadPreferences();
    set((state) => {
      if (shallow(state.preferences, incoming)) return state;
      return { preferences: incoming };
    });
  },

  updatePreferences: (updates) => {
    set((state) => {
      const preferences = { ...state.preferences, ...updates };
      // WI-68: naming the changed keys drops any raw value this copy could not
      // read for them — the user has now chosen one, so theirs wins. Keys NOT
      // named keep theirs, which is how an unrelated change stops destroying a
      // setting a newer release wrote.
      savePreferences(preferences, Object.keys(updates));
      return { preferences };
    });
  },

  resetPreferences: () => {
    // WI-68: clear FIRST. Reset must write nothing but the defaults, so the
    // retained raw values go too — including in the cloud, which shares this
    // namespace's entries.
    clearRetainedPreferences(activePreferencesNamespace());
    savePreferences({ ...DEFAULT_USER_PREFERENCES });
    set({ preferences: { ...DEFAULT_USER_PREFERENCES } });
  },

  clearInMemory: () => {
    set({ preferences: { ...DEFAULT_USER_PREFERENCES } });
  },
}));
