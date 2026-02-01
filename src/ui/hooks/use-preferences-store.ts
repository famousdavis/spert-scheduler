import { create } from "zustand";
import type { UserPreferences } from "@domain/models/types";
import { DEFAULT_USER_PREFERENCES } from "@domain/models/types";
import {
  loadPreferences,
  savePreferences,
} from "@infrastructure/persistence/preferences-repository";

export interface PreferencesStore {
  preferences: UserPreferences;
  loadPreferences: () => void;
  updatePreferences: (updates: Partial<UserPreferences>) => void;
}

export const usePreferencesStore = create<PreferencesStore>((set) => ({
  preferences: { ...DEFAULT_USER_PREFERENCES },

  loadPreferences: () => {
    const preferences = loadPreferences();
    set({ preferences });
  },

  updatePreferences: (updates) => {
    set((state) => {
      const preferences = { ...state.preferences, ...updates };
      savePreferences(preferences);
      return { preferences };
    });
  },
}));
