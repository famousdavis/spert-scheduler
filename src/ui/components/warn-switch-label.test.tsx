// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.86.1 — the switch that turns the local-storage caution off is named by the words beside it. Its
 * accessible name read "Warn on startup when using local storage" while the words on screen read "Warn me on
 * startup when using local storage", so a speech-input user saying what they saw did not match it (WCAG 2.5.3,
 * Label in Name). The switch is in two places, Settings → Notifications and the Storage & Sign In window.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NotificationsSection } from "./NotificationsSection";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";

const LABEL = "Warn me on startup when using local storage";

afterEach(() => {
  cleanup();
  usePreferencesStore.getState().updatePreferences({ suppressLocalStorageWarning: false });
});

describe("v0.86.1: the caution's off-switch is named by the words beside it", () => {
  it("Settings → Notifications: the switch's name is the visible label, and it turns the caution off and on", () => {
    render(<NotificationsSection />);

    const visible = screen.getByText(LABEL);
    const toggle = screen.getByRole("switch", { name: LABEL });
    expect(toggle).toHaveAccessibleName(visible.textContent ?? "");
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(toggle);
    expect(usePreferencesStore.getState().preferences.suppressLocalStorageWarning).toBe(true);
    expect(toggle).toHaveAttribute("aria-checked", "false");
  });

  it("the Storage & Sign In window's switch carries the same name as the words beside it", () => {
    const source = readFileSync(join("src", "ui", "components", "StorageLoginModal.tsx"), "utf8");
    const toggle = source.slice(source.indexOf("function NotificationsToggle("));
    const end = toggle.indexOf("\n}\n");
    const body = toggle.slice(0, end);
    expect(body).toContain(`            ${LABEL}\n`);
    expect(body.match(/<ToggleSwitch ariaLabel="([^"]*)"/)?.[1]).toBe(LABEL);
  });
});
