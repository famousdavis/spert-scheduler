// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { loadPreferences } from "@infrastructure/persistence/preferences-repository";

/**
 * Which theme the crash screen draws in (v0.89.0, FRAME26 clean-up E). The `dark` class on `<html>` is normally set by
 * `useTheme`, in Layout's effect; when the crash is in a provider or in Layout itself that effect never ran, so the
 * crash screen asks again: the stored preference, and for "system" the OS's scheme. Each read is guarded, because the
 * fault that brought the screen up may be in storage or in `matchMedia` itself; with nothing readable it is light.
 */
export function crashScreenIsDark(): boolean {
  let theme: string;
  try {
    theme = loadPreferences().theme ?? "system";
  } catch {
    theme = "system";
  }
  if (theme === "dark") return true;
  if (theme === "light") return false;
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    return document.documentElement.classList.contains("dark");
  }
}
