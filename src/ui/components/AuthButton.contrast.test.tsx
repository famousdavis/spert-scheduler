// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
