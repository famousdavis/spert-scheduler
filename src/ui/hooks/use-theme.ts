import { useEffect, useMemo } from "react";
import { usePreferencesStore } from "./use-preferences-store";
import type { ThemePreference } from "@domain/models/types";

export type EffectiveTheme = "light" | "dark";

/**
 * Hook for managing the application theme.
 * - Reads theme preference from user preferences store
 * - Listens to system preference for "system" mode
 * - Applies/removes "dark" class on document root
 * - Returns current effective theme for conditional rendering
 */
export function useTheme(): {
  theme: ThemePreference;
  effectiveTheme: EffectiveTheme;
  setTheme: (theme: ThemePreference) => void;
} {
  const { preferences, updatePreferences } = usePreferencesStore();
  const theme = preferences.theme ?? "system";

  // Determine effective theme based on preference and system setting
  const effectiveTheme = useMemo((): EffectiveTheme => {
    if (theme === "light" || theme === "dark") {
      return theme;
    }
    // "system" - check media query
    if (typeof window !== "undefined") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  }, [theme]);

  // Apply dark class to document element
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveTheme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
  }, [effectiveTheme]);

  // Listen for system preference changes when in "system" mode
  useEffect(() => {
    if (theme !== "system") return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      const root = document.documentElement;
      if (e.matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, [theme]);

  const setTheme = (newTheme: ThemePreference) => {
    updatePreferences({ theme: newTheme });
  };

  return { theme, effectiveTheme, setTheme };
}
