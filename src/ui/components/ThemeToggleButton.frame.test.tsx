// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * FRAME26 stage 4 (v0.88.0): the theme button is the frame's 32 × 32 `.sf-theme` (contract §3, "Utilities"). Its icons
 * carry state (which theme is on), so they are held to the 3 : 1 non-text bar: they draw in `currentColor`, the frame's
 * muted text colour, with no fixed colour and no opacity. Its name is unchanged, "Theme: <mode>. Click to cycle.",
 * because frame-check and the inventory find it by "Theme: <mode>".
 */

import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ThemeToggleButton } from "./ThemeToggleButton";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { DEFAULT_USER_PREFERENCES, type ThemePreference } from "@domain/models/types";

beforeEach(() => {
  localStorage.clear();
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, theme: "light" } });
});
afterEach(cleanup);

function renderWith(theme: ThemePreference): HTMLElement {
  usePreferencesStore.setState({ preferences: { ...DEFAULT_USER_PREFERENCES, theme } });
  render(<ThemeToggleButton />);
  return screen.getByRole("button");
}

describe("FRAME26: the theme button", () => {
  it.each([
    ["light", "Theme: Light. Click to cycle."],
    ["dark", "Theme: Dark. Click to cycle."],
    ["system", "Theme: System. Click to cycle."],
  ] as const)("in %s it is the frame's .sf-theme, named %j", (theme, name) => {
    const button = renderWith(theme);
    expect(button).toHaveAccessibleName(name);
    expect(button).toHaveAttribute("title", name);
    expect(button.getAttribute("class")).toBe("sf-theme");
    expect(button).toHaveAttribute("data-sf", "theme");
    expect(button).toHaveAttribute("type", "button");
  });

  it.each(["light", "dark", "system"] as const)("in %s its one icon draws in currentColor, with no fixed colour or opacity", (theme) => {
    const button = renderWith(theme);
    const icons = button.querySelectorAll("svg");
    expect(icons).toHaveLength(1);
    const svg = icons[0]!;
    expect(svg).toHaveAttribute("stroke", "currentColor");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    for (const el of [svg, ...svg.querySelectorAll("*")]) {
      expect(el.getAttribute("fill") ?? "none").toMatch(/^(none|currentColor)$/);
      expect(el.getAttribute("stroke") ?? "currentColor").toBe("currentColor");
      expect(el).not.toHaveAttribute("opacity");
      expect(el).not.toHaveAttribute("class");
      expect(el).not.toHaveAttribute("style");
    }
    expect(button).not.toHaveAttribute("style");
  });

  it("cycles Light → Dark → System → Light, its name following", () => {
    const button = renderWith("light");
    fireEvent.click(button);
    expect(button).toHaveAccessibleName("Theme: Dark. Click to cycle.");
    fireEvent.click(button);
    expect(button).toHaveAccessibleName("Theme: System. Click to cycle.");
    fireEvent.click(button);
    expect(button).toHaveAccessibleName("Theme: Light. Click to cycle.");
  });
});
