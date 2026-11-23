// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useShallow } from "zustand/react/shallow";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import type { ThemePreference } from "@domain/models/types";

function nextTheme(current: ThemePreference): ThemePreference {
  if (current === "light") return "dark";
  if (current === "dark") return "system";
  return "light";
}

const LABELS: Record<ThemePreference, string> = {
  light: "Light",
  dark: "Dark",
  system: "System",
};

function SunIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

function SystemIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="14" rx="2" ry="2" />
      <path d="M8 22h8M12 18v4" />
    </svg>
  );
}

export function ThemeToggleButton() {
  const { theme, updatePreferences } = usePreferencesStore(
    useShallow((s) => ({
      theme: s.preferences.theme ?? "system",
      updatePreferences: s.updatePreferences,
    }))
  );

  const handleClick = () => {
    updatePreferences({ theme: nextTheme(theme) });
  };

  const label = `Theme: ${LABELS[theme]}. Click to cycle.`;

  // The frame's 32 × 32 theme button (`.sf-theme`, contract §3, v0.88.0). Its icons are `currentColor` strokes, the
  // frame's muted text colour (4.84 : 1 on white, 6.82 on #101828), at full opacity, and take the text colour on hover:
  // they carry state (which theme is on), so they are held to the 3 : 1 non-text bar. The stylesheet draws them at
  // 20 px. Its name is unchanged: frame-check cycles it by "Theme: <mode>".
  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label}
      title={label}
      className="sf-theme"
      data-sf="theme"
    >
      {theme === "light" && <SunIcon />}
      {theme === "dark" && <MoonIcon />}
      {theme === "system" && <SystemIcon />}
    </button>
  );
}
