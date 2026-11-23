// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AuthButton } from "./AuthButton";

/**
 * The header auth chip's colours (v0.66.2).
 *
 * ⚠️ **jsdom has no layout and no paint, so this file cannot measure contrast.** The
 * ratios were measured in a real browser with the R18 instrument and are recorded in the
 * PR; what a test *can* pin is the thing that made the defect unfixable in the first
 * place — **that the themed colours are reachable by the theme at all.**
 *
 * The original bug was not a badly-chosen colour. It was `color: "#0070f3"` in an INLINE
 * STYLE, which beats every Tailwind variant, so a `dark:` class on that span emitted CSS
 * that could never apply. A future edit that moves any of these colours back inline would
 * restore exactly that defect while every contrast number in the PR still read as correct.
 * That is what these assertions defend.
 */

const mockUser = { displayName: "Test User", email: "test@example.com" };

vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: () => ({ user: (globalThis as { __authUser?: unknown }).__authUser ?? null }),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: () => ({ mode: (globalThis as { __mode?: string }).__mode ?? "local" }),
}));

function renderChip(user: unknown, mode: string) {
  (globalThis as { __authUser?: unknown }).__authUser = user;
  (globalThis as { __mode?: string }).__mode = mode;
  render(<AuthButton onOpenModal={vi.fn()} />);
}

afterEach(() => {
  cleanup();
  delete (globalThis as { __authUser?: unknown }).__authUser;
  delete (globalThis as { __mode?: string }).__mode;
});

describe("AuthButton — themed colours are reachable by the theme", () => {
  describe("signed out", () => {
    it('"Sign in" takes its colour from a class, never an inline style', () => {
      renderChip(null, "local");
      const signIn = screen.getByText("Sign in");

      // The class is what `.dark .auth-signin-accent` in styles.css hooks onto.
      expect(signIn.className).toContain("auth-signin-accent");
      // ⚠️ The load-bearing half: an inline colour would silently win over it.
      expect(signIn.style.color).toBe("");
      // Non-themed inline properties are fine and deliberately kept.
      expect(signIn.style.fontSize).toBe("12px");
    });

    it('"Local only" carries both a light and a dark variant', () => {
      renderChip(null, "local");
      const localOnly = screen.getByText("Local only");

      // It had only `text-gray-400`, which measured 2.60 on the light header.
      expect(localOnly.className).toContain("text-gray-500");
      expect(localOnly.className).toContain("dark:text-gray-400");
      expect(localOnly.style.color).toBe("");
    });

    it("the lock glyph inherits currentColor rather than a fixed grey", () => {
      renderChip(null, "local");
      const svg = document.querySelector("svg");
      expect(svg).not.toBeNull();

      // A hard-coded stroke cannot follow the theme; #9CA3AF measured 2.54 in light.
      const strokes = Array.from(svg!.querySelectorAll("[stroke]")).map((n) =>
        n.getAttribute("stroke"),
      );
      expect(strokes.length).toBeGreaterThan(0);
      expect(strokes.every((s) => s === "currentColor")).toBe(true);
      expect(svg!.getAttribute("class")).toContain("dark:text-gray-400");
    });
  });

  describe("signed in", () => {
    // These two states are unreachable without signing in, so they are covered here
    // rather than in the browser. They were measured via a temporary forced-state probe.
    it("cloud: the avatar keeps its fixed accent, which is theme-independent by design", () => {
      renderChip(mockUser, "cloud");
      const avatar = screen.getByText("T");

      // White on #0070f3 measures 4.55 in BOTH themes because both endpoints are inline.
      // That is intentional: it is a filled badge, not themed text.
      expect(avatar.style.backgroundColor).toBe("rgb(0, 112, 243)");
      expect(avatar.className).toContain("text-white");
    });

    it("local: the name follows the theme", () => {
      renderChip(mockUser, "local");
      const name = screen.getByText("Test");

      expect(name.className).toContain("text-gray-900");
      expect(name.className).toContain("dark:text-gray-100");
    });
  });
});

/**
 * FRAME26 stage 0, SCH-2 (v0.87.4): "Sign in" on hover.
 *
 * On hover the signed-out chip turns `hover:bg-gray-50` (#f9fafb), and the light accent #0070f3 measured 4.36 there,
 * under 4.5, in headless Chrome against the live app at v0.87.3. The rest colour stays #0070f3 (the avatar shares the
 * hex, see styles.css); light HOVER alone steps to #155dfc. jsdom applies no `:hover`, so this reads the stylesheet
 * and pins the rules, the scope that keeps dark mode untouched, and the WCAG ratio of each colour pair the browser
 * measured. A changed hover background in the chip's classes fails here too, so it cannot slip past without a new
 * measurement.
 */
describe("AuthButton — 'Sign in' stays readable on hover (SCH-2)", () => {
  /** Top-level and nested rules of `src/styles.css`, comments removed, keyed by whitespace-normalised selector. */
  function stylesheetRules(): Map<string, string> {
    const raw = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
    const css = raw.replace(/\/\*[\s\S]*?\*\//g, "");
    // A character scan, not a regex: each innermost `selector { body }`, so a rule inside `@media` keeps its own
    // selector.
    const rules = new Map<string, string>();
    let selectorFrom = 0;
    let bodyFrom = -1;
    let selector = "";
    for (let i = 0; i < css.length; i++) {
      if (css[i] === "{") {
        selector = css.slice(selectorFrom, i).trim().replace(/\s+/g, " ");
        bodyFrom = i + 1;
        selectorFrom = i + 1;
      } else if (css[i] === "}") {
        if (bodyFrom !== -1) rules.set(selector, css.slice(bodyFrom, i));
        bodyFrom = -1;
        selectorFrom = i + 1;
      }
    }
    return rules;
  }
  function colourOf(selector: string): string | undefined {
    const body = stylesheetRules().get(selector);
    return body?.match(/(?:^|;|\s)color:\s*(#[0-9a-fA-F]{6})\s*;/)?.[1]?.toLowerCase();
  }
  /** WCAG 2 contrast of two #rrggbb colours, written out here rather than imported. */
  function ratio(a: string, b: string): number {
    const channel = (hex: string, at: number) => {
      const v = parseInt(hex.slice(at, at + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    };
    const lum = (hex: string) => 0.2126 * channel(hex, 1) + 0.7152 * channel(hex, 3) + 0.0722 * channel(hex, 5);
    const la = lum(a);
    const lb = lum(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  const LIGHT_HOVER = "html:not(.dark) button:hover .auth-signin-accent";

  it("light at rest keeps #0070f3 and dark keeps #60a5fa", () => {
    expect(colourOf(".auth-signin-accent")).toBe("#0070f3");
    expect(colourOf(".dark .auth-signin-accent")).toBe("#60a5fa");
  });

  it("light on hover is #155dfc", () => {
    expect(colourOf(LIGHT_HOVER)).toBe("#155dfc");
  });

  it("every hover rule for the accent is scoped away from dark mode", () => {
    // A bare `button:hover .auth-signin-accent` (0,2,1) outranks `.dark .auth-signin-accent` (0,2,0).
    const hoverRules = [...stylesheetRules().keys()].filter(
      (s) => s.includes("auth-signin-accent") && s.includes(":hover"),
    );
    expect(hoverRules).toEqual([LIGHT_HOVER]);
  });

  it("the chip's backgrounds are the ones measured: white and gray-50 on hover, gray-800 in dark", () => {
    renderChip(null, "local");
    const signIn = screen.getByText("Sign in");
    // `button:hover` reaches the span only if the span is inside the button.
    const button = signIn.closest("button")!;
    expect(button).not.toBeNull();
    expect(button.className.split(/\s+/)).toEqual(
      expect.arrayContaining(["bg-transparent", "hover:bg-gray-50", "dark:hover:bg-gray-800"]),
    );
  });

  it.each([
    ["light at rest", ".auth-signin-accent", "#ffffff"], // white header
    ["light on hover", LIGHT_HOVER, "#f9fafb"], // gray-50, as Chrome computed it
    ["dark at rest and on hover", ".dark .auth-signin-accent", "#1e2939"], // gray-800, header and hover alike
  ])("%s clears 4.5 : 1", (_label, selector, background) => {
    const fg = colourOf(selector);
    expect(fg).toBeDefined();
    expect(ratio(fg!, background)).toBeGreaterThanOrEqual(4.5);
  });

  it("control: the ratio function reads the known pairs", () => {
    expect(ratio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(ratio("#0070f3", "#f9fafb")).toBeLessThan(4.5); // the defect: 4.36
  });
});
