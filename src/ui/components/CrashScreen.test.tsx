// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { CrashScreen } from "./CrashScreen";
import { ErrorBoundary } from "./ErrorBoundary";
import { router } from "@app/router";

/**
 * v0.89.0 (FRAME26 clean-up E; contract §7, "Errors"): the outermost crash screen. It stays outside the frame, on the
 * page ground (#ffffff / #101828) with the frame's heading and muted text colours, in the user's theme even when the
 * frame never set it, and offers Reload. `main.tsx`'s boundary shows it for a fault in a provider, and the router's
 * root `errorElement` for one inside a route (until v0.89.0, React Router's own page with the stack). One wording in
 * every SPERT® app (William, 2026-11-26).
 */
const PREFS = "spert:user-preferences:local";

function Boom(): never {
  throw new Error("boom");
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove("dark");
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  document.documentElement.classList.remove("dark");
});

describe("the crash screen", () => {
  it("says what happened, names the app with its ®, and offers Reload, which reloads", () => {
    const onReload = vi.fn();
    render(<CrashScreen onReload={onReload} />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/^Something went wrong$/);
    const line = screen.getByRole("alert").querySelector("p")!;
    expect(line.innerHTML).toBe('SPERT<span class="sf-mark">®</span> Scheduler could not display this page. Reload to try again.');
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(onReload).toHaveBeenCalledTimes(1);
  });

  it("is drawn on the page ground in the frame's text colours, both themes, outside the frame", () => {
    render(<CrashScreen onReload={() => {}} />);
    const screenEl = screen.getByRole("alert");
    expect(screenEl).toHaveClass("bg-white", "dark:bg-[#101828]", "min-h-screen");
    expect(screen.getByRole("heading")).toHaveClass("text-[#333333]", "dark:text-[#e2e8f0]");
    expect(screenEl.querySelector("p")).toHaveClass("text-[#6a7282]", "dark:text-[#99a1af]");
    expect(document.querySelector('[data-sf="app"]')).toBeNull();
    for (const old of ["bg-gray-50", "text-red-600", "Refresh Page"]) expect(screenEl.outerHTML).not.toContain(old);
  });

  it("re-applies the stored theme: dark sets the class, light clears it", () => {
    localStorage.setItem(PREFS, JSON.stringify({ theme: "dark" }));
    render(<CrashScreen onReload={() => {}} />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    cleanup();
    localStorage.setItem(PREFS, JSON.stringify({ theme: "light" }));
    document.documentElement.classList.add("dark");
    render(<CrashScreen onReload={() => {}} />);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("follows the OS under System, and still draws when storage and matchMedia both throw", () => {
    vi.spyOn(window, "matchMedia").mockImplementation(
      (q: string) => ({ matches: /dark/.test(q), media: q }) as unknown as MediaQueryList,
    );
    render(<CrashScreen onReload={() => {}} />);
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    cleanup();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage");
    });
    vi.spyOn(window, "matchMedia").mockImplementation(() => {
      throw new Error("matchMedia");
    });
    expect(() => render(<CrashScreen onReload={() => {}} />)).not.toThrow();
    expect(screen.getByRole("heading")).toHaveTextContent("Something went wrong");
  });

  it("is ErrorBoundary's fallback when none is given, so main.tsx's boundary shows it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("heading")).toHaveTextContent("Something went wrong");
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
  });

  it("is the router's root errorElement, so a fault inside a route never reaches React Router's own page", () => {
    const root = router.routes[0]!;
    expect(root.path).toBe("/");
    expect(root.errorElement).toBeTruthy();
    expect((root.errorElement as { type: unknown }).type).toBe(CrashScreen);
  });

  it("main.tsx wraps the providers in the boundary", () => {
    const main = readFileSync(join(process.cwd(), "src", "main.tsx"), "utf8");
    expect(main).toMatch(/<ErrorBoundary>\s*<AuthProvider>/);
  });
});
