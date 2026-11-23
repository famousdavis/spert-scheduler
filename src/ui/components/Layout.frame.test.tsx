// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * FRAME26 stage 4 (v0.88.0): the SPERT® Suite frame around every route (contract §3, §6, §7, §8, §9.3).
 *
 * In this order: the skip link, the brand row (a <header>), the navigation row, the notices slot, `main`, the footer.
 * The brand is one link to Projects, named by its visible title; the title is not a heading, and every screen's one
 * h1 is its heading row's, in `main`. Settings, About and the changelog cap their body (X4): their heading row is a
 * direct child of `main`, so it stays full width. The notices slot is outside `main` and `no-print`. Every frame
 * element carries its `data-sf` hook, which frame-check reads. The real About, Changelog, Settings, Calendar and 404
 * pages render here; Projects and a project's page have files of their own (`*.frame.test.tsx`).
 */

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@ui/hooks/use-cloud-sync", () => ({ useCloudSync: () => {} }));
vi.mock("@ui/hooks/useInvitationLanding", () => ({
  useInvitationLanding: () => ({ state: "idle", claimedNames: [], dismiss: () => {} }),
}));
vi.mock("@ui/providers/AuthProvider", () => ({ useAuth: () => ({ user: null, loading: false, firebaseAvailable: false }) }));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: () => ({ mode: "local", storageReady: true, switchMode: vi.fn(), persistedMode: "local" }),
}));
vi.mock("./StorageLoginModal", () => ({ StorageLoginModal: () => null }));
vi.mock("@ui/components/CalendarEditor", () => ({ CalendarEditor: () => null }));
vi.mock("@infrastructure/nager/nager-client", () => ({
  fetchAvailableCountries: vi.fn(() => Promise.resolve([])),
  fetchPublicHolidays: vi.fn(() => Promise.resolve([])),
}));

import { Layout } from "./Layout";
import { HeadingRow } from "./HeadingRow";
import { AboutPage } from "@ui/pages/AboutPage";
import { ChangelogPage } from "@ui/pages/ChangelogPage";
import { SettingsPage } from "@ui/pages/SettingsPage";
import { CalendarPage } from "@ui/pages/CalendarPage";
import { NotFoundPage } from "@ui/pages/NotFoundPage";
import { APP_TAGLINE } from "@app/constants";
import { LS_FIRST_RUN_SEEN } from "@app/legal-constants";

beforeEach(() => localStorage.clear());
afterEach(cleanup);

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/projects" element={<HeadingRow>Projects</HeadingRow>} />
          <Route path="/project/:id" element={<div className="space-y-6"><HeadingRow>A project</HeadingRow></div>} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/changelog" element={<ChangelogPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

const hook = (name: string) => document.querySelector(`[data-sf="${name}"]`);
const ROUTES = [
  ["/projects", "Projects", false],
  ["/project/abc", "A project", false],
  ["/calendar", "Calendar", false],
  ["/settings", "Settings", true],
  ["/about", "About SPERT® Scheduler", true],
  ["/changelog", "Changelog", true],
  ["/no-such-page", "Page not found", false],
] as const;

describe("FRAME26: the frame around every route", () => {
  it.each(ROUTES)("%s: the frame's blocks, in order, each with its hook", (path) => {
    renderAt(path);
    const app = hook("app")!;
    expect(app).toHaveClass("sf-app");
    const blocks = [...app.children].map((e) => e.getAttribute("data-sf"));
    // The brand row is the <header>; it carries no hook of its own (its parts do).
    expect(blocks.slice(0, 6)).toEqual(["skip", null, "nav", "notices", "main", "footer"]);
    expect(app.children[1]!.tagName).toBe("HEADER");
    expect(app.children[1]).toHaveClass("sf-bar");
    for (const name of ["skip", "brand", "favicon", "title", "tagline", "utils", "theme", "chip", "nav", "nav-work", "nav-app", "notices", "main", "headrow", "heading", "footer"]) {
      expect(hook(name), name).not.toBeNull();
    }
  });

  it.each(ROUTES)("%s: one h1, %j, the heading row's, in main; no heading in the header", (path, heading, capped) => {
    renderAt(path);
    const main = screen.getByRole("main");
    const h1s = screen.getAllByRole("heading", { level: 1 });
    expect(h1s.map((h) => h.textContent)).toEqual([heading]);
    expect(h1s[0]).toBe(hook("heading"));
    expect(main.contains(h1s[0]!)).toBe(true);
    expect(within(screen.getByRole("banner")).queryAllByRole("heading")).toEqual([]);
    expect(main.classList.contains("sf-main--capped")).toBe(capped);
    // On a capped screen the cap reaches every child of main but the heading row, so the row must be main's child.
    if (capped) expect(hook("headrow")!.parentElement).toBe(main);
  });

  it("the skip link is first and points at main", () => {
    renderAt("/projects");
    const skip = screen.getByRole("link", { name: "Skip to main content" });
    expect(document.querySelector("a, button")).toBe(skip);
    expect(skip).toHaveAttribute("href", "#main");
    expect(skip).toHaveClass("sf-skip");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("the brand row: one link to Projects named by its title, two decorative favicons, the tagline, then theme and chip", () => {
    renderAt("/settings");
    const brand = hook("brand") as HTMLAnchorElement;
    expect(brand.tagName).toBe("A");
    expect(brand).toHaveAttribute("href", "/projects");
    expect(brand).not.toHaveAttribute("aria-label");
    expect(brand).toHaveAccessibleName("SPERT® Scheduler");
    const favicons = [...document.querySelectorAll('[data-sf="favicon"]')];
    expect(favicons.map((f) => [f.getAttribute("alt"), f.classList.contains("sf-icon--light"), f.classList.contains("sf-icon--dark")]))
      .toEqual([["", true, false], ["", false, true]]);
    for (const f of favicons) expect(brand.contains(f)).toBe(true);
    expect(hook("tagline")).toHaveTextContent(APP_TAGLINE);
    expect(APP_TAGLINE).toBe("Probabilistic project scheduling with Monte Carlo simulation");
    const utils = hook("utils")!;
    expect([...utils.children].map((c) => c.getAttribute("data-sf"))).toEqual(["theme", "chip"]);
    // The brand row never sticks (contract §3); only the navigation row does, on a project's page.
    expect(document.querySelector("header")!.className).not.toMatch(/sticky/);
  });

  it("the notices slot is outside main, no-print, and holds the banners in the suite's order", () => {
    localStorage.removeItem(LS_FIRST_RUN_SEEN);
    renderAt("/projects");
    const slot = hook("notices")!;
    expect(slot).toHaveClass("sf-col", "sf-notices", "no-print");
    expect(screen.getByRole("main").contains(slot)).toBe(false);
    const notices = [...slot.children];
    expect(notices.map((n) => (n.textContent ?? "").slice(0, 24))).toEqual(["SPERT® Suite web apps ar", "Your data exists only in"]);
    for (const n of notices) expect(n).toHaveClass("sf-notice");
  });

  it("the footer: the frame's two lines, Version to the changelog, Keyboard shortcuts a .sf-link button", () => {
    renderAt("/about");
    const footer = hook("footer")!;
    expect(footer).toHaveClass("sf-footer");
    const lines = [...footer.firstElementChild!.children];
    expect(lines).toHaveLength(2);
    expect(within(footer as HTMLElement).getByRole("link", { name: /^Version / })).toHaveAttribute("href", "/changelog");
    expect(within(footer as HTMLElement).getByRole("button", { name: "Keyboard shortcuts" })).toHaveClass("sf-link");
    for (const a of footer.querySelectorAll("a")) expect(a).not.toHaveAttribute("class");
  });
});
