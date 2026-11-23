// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AuthButton } from "./AuthButton";

/**
 * The account chip on the SPERT® Suite frame (FRAME26 stage 4, v0.88.0). Rewritten from `AuthButton.contrast.test.tsx`
 * (v0.66.2, SCH-2 at v0.87.4), which pinned exactly what the frame replaced: the `.auth-signin-accent` rules in
 * `styles.css`, the pill's `hover:bg-gray-50`, and the old header's grounds.
 *
 * The chip is the frame's `.sf-chip`: a state segment (`.sf-chip-state`, the muted text colour) and an action segment
 * (`.sf-chip-act`, the link colour), and on hover the frame's `--sf-hover` ground. Its colours therefore live in the
 * vendored `spert-frame.css`, read here; the ratios are computed here from WCAG 2's definition and match frame-check's
 * measurement of the built page.
 *
 * ⚠️ What this guards is the defect v0.66.2 found: a colour set INLINE (or by a utility) on the chip or its segments,
 * which beats the theme. So no element of the chip carries an inline style but the avatar's fill, and no segment carries
 * a class of its own.
 */

const mockUser = { displayName: "Test User", email: "test@example.com" };

vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: () => ({ user: (globalThis as { __authUser?: unknown }).__authUser ?? null }),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: () => ({ mode: (globalThis as { __mode?: string }).__mode ?? "local" }),
}));

function renderChip(user: unknown, mode: string): HTMLElement {
  (globalThis as { __authUser?: unknown }).__authUser = user;
  (globalThis as { __mode?: string }).__mode = mode;
  render(<AuthButton onOpenModal={vi.fn()} />);
  return screen.getByRole("button");
}

afterEach(() => {
  cleanup();
  delete (globalThis as { __authUser?: unknown }).__authUser;
  delete (globalThis as { __mode?: string }).__mode;
});

const FRAME = readFileSync(join(process.cwd(), "src", "styles", "spert-frame.css"), "utf8");

/** The body of the vendored stylesheet's rule whose selector is exactly `selector`. */
function rule(selector: string, from = 0): string {
  const at = FRAME.indexOf(`${selector} {`, from);
  if (at === -1) throw new Error(`spert-frame.css: no rule "${selector}"`);
  return FRAME.slice(at + selector.length + 2, FRAME.indexOf("}", at));
}
/** A custom property's #rrggbb value in a rule body. */
function token(body: string, name: string): string {
  const m = new RegExp(`${name}:\\s*(#[0-9a-f]{6});`, "i").exec(body);
  if (!m) throw new Error(`no ${name}`);
  return m[1]!.toLowerCase();
}
const MORE = FRAME.indexOf("@media (prefers-contrast: more)");
const THEMES = {
  light: rule(":root"),
  dark: rule(':root.dark, :root[data-theme="dark"]'),
  lightMore: rule(":root", MORE),
  darkMore: rule(':root.dark, :root[data-theme="dark"]', MORE),
};

/**
 * WCAG 2 contrast of two #rrggbb colours, written out here rather than imported, rounded to two places as frame-check
 * and the contract round them (none of these pairs is within a hundredth of 4.5, so rounding cannot carry one across).
 */
function ratio(a: string, b: string): number {
  const channel = (hex: string, at: number) => {
    const v = parseInt(hex.slice(at, at + 2), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
  const [la, lb] = [lum(a), lum(b)];
  return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
}

/** Every element in the chip that carries an inline style. */
const inlineStyled = (chip: HTMLElement) => [chip, ...chip.querySelectorAll("*")].filter((e) => e.hasAttribute("style"));

describe("the account chip is the frame's .sf-chip, in every state", () => {
  it("signed out: Local only | Sign in, named 'Sign in to cloud storage', no inline style anywhere", () => {
    const chip = renderChip(null, "local");
    expect(chip).toHaveAccessibleName("Sign in to cloud storage");
    expect(chip).toHaveAttribute("aria-haspopup", "dialog");
    expect(chip.getAttribute("class")).toBe("sf-chip");
    expect(chip).toHaveAttribute("data-sf", "chip");
    const [state, act] = [...chip.children];
    expect(state!.getAttribute("class")).toBe("sf-chip-state");
    expect(state).toHaveTextContent(/^Local only$/);
    expect(act!.getAttribute("class")).toBe("sf-chip-act");
    expect(act).toHaveTextContent(/^Sign in$/);
    expect(chip.children).toHaveLength(2);
    expect(inlineStyled(chip)).toEqual([]);
    // The lock beside "Local only" draws in the segment's colour: no class, no fixed colour of its own.
    const lock = state!.querySelector("svg")!;
    expect(lock).not.toHaveAttribute("class");
    for (const shape of lock.querySelectorAll("[stroke]")) expect(shape.getAttribute("stroke")).toBe("currentColor");
  });

  it("signed in, cloud: avatar and name | cloud, the cloud in the action segment's colour", () => {
    const chip = renderChip(mockUser, "cloud");
    expect(chip).toHaveAccessibleName("Signed in as Test (cloud). Open storage menu");
    expect(chip.getAttribute("class")).toBe("sf-chip");
    const [state, act] = [...chip.children];
    expect(state!.getAttribute("class")).toBe("sf-chip-state");
    expect(act!.getAttribute("class")).toBe("sf-chip-act");
    const cloud = act!.querySelector("svg path")!;
    expect(cloud.getAttribute("fill")).toBe("currentColor");
    // The only inline style is the avatar's fill: a filled badge, the same in both themes (white on it: 4.55).
    const avatar = screen.getByText("T");
    expect(inlineStyled(chip)).toEqual([avatar]);
    expect(avatar.style.backgroundColor).toBe("rgb(0, 112, 243)");
    expect(avatar).toHaveClass("text-white", "w-[22px]", "h-[22px]");
    expect(ratio("#ffffff", "#0070f3")).toBeGreaterThanOrEqual(4.5);
  });

  it("signed in, local: avatar and name | lock, the lock muted, not the action colour", () => {
    const chip = renderChip(mockUser, "local");
    expect(chip).toHaveAccessibleName("Signed in as Test (local only). Open storage menu");
    const act = chip.querySelector(".sf-chip-act")!;
    expect(act.querySelector("svg")).toHaveClass("text-gray-500", "dark:text-gray-400");
    expect(screen.getByText("Test")).toHaveClass("text-gray-900", "dark:text-gray-100");
  });
});

describe("the chip's colours are the frame's, and they read", () => {
  it("the stylesheet maps state → muted, action → link, hover → --sf-hover", () => {
    expect(rule(".sf-chip-state")).toMatch(/color: var\(--sf-text-muted\)/);
    expect(rule(".sf-chip-act")).toMatch(/color: var\(--sf-link\)/);
    expect(rule(".sf-chip:hover")).toMatch(/background: var\(--sf-hover\)/);
    expect(rule(".sf-chip")).toMatch(/background: var\(--sf-page\)/);
  });

  it.each([
    // theme, state colour, action colour: at rest on --sf-page, and on hover on --sf-hover
    ["light", "light", 4.84, 4.63, 5.25, 5.02],
    ["dark", "dark", 6.82, 5.64, 6.73, 5.56],
  ] as const)("%s: 'Local only' and 'Sign in' clear 4.5 : 1 at rest and on hover", (_n, theme, mutedRest, mutedHover, linkRest, linkHover) => {
    const t = THEMES[theme];
    const [page, hover, muted, link] = ["--sf-page", "--sf-hover", "--sf-text-muted", "--sf-link"].map((n) => token(t, n));
    expect(ratio(muted!, page!)).toBe(mutedRest);
    expect(ratio(muted!, hover!)).toBe(mutedHover);
    expect(ratio(link!, page!)).toBe(linkRest);
    expect(ratio(link!, hover!)).toBe(linkHover);
    for (const r of [mutedRest, mutedHover, linkRest, linkHover]) expect(r).toBeGreaterThanOrEqual(4.5);
  });

  it("under prefers-contrast: more, the stepped-up muted colour still clears 4.5 : 1 at rest and on hover", () => {
    for (const [rest, more] of [[THEMES.light, THEMES.lightMore], [THEMES.dark, THEMES.darkMore]] as const) {
      const muted = token(more, "--sf-text-muted");
      expect(ratio(muted, token(rest, "--sf-page"))).toBeGreaterThanOrEqual(4.5);
      expect(ratio(muted, token(rest, "--sf-hover"))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("the old accent is gone: no `.auth-signin-accent` rule or class anywhere in the app", () => {
    const SRC = join(process.cwd(), "src");
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((n) => {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) return files(p);
        return /\.(?:tsx?|css)$/.test(n) && !n.includes(".test.") ? [p] : [];
      });
    // changelog-data.ts names it in an old entry's prose, as history.
    const stray = files(SRC)
      .filter((f) => !f.endsWith("changelog-data.ts"))
      .filter((f) => readFileSync(f, "utf8").includes("auth-signin-accent"));
    expect(stray).toEqual([]);
  });

  it("control: the ratio function reads known pairs", () => {
    expect(ratio("#767676", "#ffffff")).toBe(4.54);
    expect(ratio("#6a7282", "#ffffff")).toBe(4.84);
    expect(ratio("#000000", "#ffffff")).toBe(21);
  });
});
