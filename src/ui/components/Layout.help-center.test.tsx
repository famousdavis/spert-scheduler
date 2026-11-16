// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Adding a guide to public/? Also add it, with a one-line description, to spertsuite.com's
// src/data/help.ts (spert-landing-page). The landing page's daily "Guide list matches the app
// repos" check stays red until you do. The PDF guide house rules say the same.

/**
 * v0.87.1, Help Center Phase 2: the header's Help Center link.
 *
 * It sits immediately left of About, opens this app's page in the SPERT® Suite Help Center in a new tab, and is never
 * one of the nav's routes, so it never takes the active pill. jsdom applies no CSS, so the visually hidden words are
 * pinned by their `sr-only` class as well as by the accessible name. The URL is compared with a LITERAL, never with
 * the constant, so a wrong slug at the constant cannot stay green.
 *
 * William's ruling (2026-11-16): the link is hidden below 1,024 px (`hidden lg:inline-flex`). v0.87.0 fitted the
 * header at 768 px with 3.3 px to spare, and the link adds 118 px, so below about 882 px the header wrapped and, at
 * 768, scrolled sideways. jsdom evaluates no media query, so the classes are pinned here; the widths were measured
 * in Chrome.
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

vi.mock("@ui/hooks/use-cloud-sync", () => ({ useCloudSync: () => {} }));
vi.mock("@ui/hooks/useInvitationLanding", () => ({
  useInvitationLanding: () => ({ state: "idle", claimedNames: [], dismiss: () => {} }),
}));
vi.mock("@ui/providers/AuthProvider", () => ({
  useAuth: () => ({ user: null, loading: false }),
}));
vi.mock("@ui/providers/StorageProvider", () => ({
  useStorage: () => ({ mode: "local", storageReady: true }),
}));
// The header's right-hand cluster and the banners are not the subject here.
vi.mock("./AuthButton", () => ({ AuthButton: () => null }));
vi.mock("./StorageLoginModal", () => ({ StorageLoginModal: () => null }));
vi.mock("./LocalStorageWarningBanner", () => ({ LocalStorageWarningBanner: () => null }));
vi.mock("./FirstRunBanner", () => ({ FirstRunBanner: () => null }));
vi.mock("./AiTeardownBanner", () => ({ AiTeardownBanner: () => null }));

import { Layout } from "./Layout";

afterEach(cleanup);

const NAME = "Help Center (opens in a new tab)";
const ROUTES = ["/projects", "/calendar", "/settings", "/about"] as const;
const PILL = ["bg-blue-100", "dark:bg-blue-900/50", "text-blue-700", "dark:text-blue-300"];

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={null} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  const nav = screen.getByRole("navigation");
  return { nav, link: within(nav).getByRole("link", { name: NAME }) };
}

describe("the header's Help Center link", () => {
  it("goes to this app's Help Center page, the whole URL", () => {
    expect(renderAt("/projects").link.getAttribute("href")).toBe("https://spertsuite.com/help/scheduler");
  });

  it("opens in a new tab, with noopener and noreferrer", () => {
    const { link } = renderAt("/projects");
    expect(link).toHaveAttribute("target", "_blank");
    const rel = (link.getAttribute("rel") ?? "").split(/\s+/);
    expect(rel).toContain("noopener");
    expect(rel).toContain("noreferrer");
  });

  it("is named \"Help Center (opens in a new tab)\": the arrow is hidden, the new-tab words are sr-only", () => {
    const { link } = renderAt("/projects");
    expect(link).toHaveAccessibleName(NAME);
    const spans = [...link.querySelectorAll("span")];
    const arrow = spans.find((s) => s.textContent === "↗");
    expect(arrow).toHaveAttribute("aria-hidden", "true");
    const words = spans.find((s) => s.textContent === "(opens in a new tab)");
    expect(words).toHaveClass("sr-only");
    expect(link.textContent).toBe("Help Center ↗ (opens in a new tab)");
  });

  it("comes immediately before About, and the four nav items keep their order", () => {
    const { nav, link } = renderAt("/projects");
    const about = within(nav).getByRole("link", { name: "About" });
    expect(link.nextElementSibling).toBe(about);
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Projects",
      "Calendar",
      "Settings",
      "Help Center ↗ (opens in a new tab)",
      "About",
    ]);
  });

  it("is hidden below 1,024 px and shown from it: `hidden lg:inline-flex`, never a bare `inline-flex`", () => {
    const classes = renderAt("/projects").link.className.split(/\s+/);
    expect(classes).toContain("hidden");
    expect(classes).toContain("lg:inline-flex");
    expect(classes).not.toContain("inline-flex");
  });

  it.each(ROUTES)("is never styled active, at %s", (path) => {
    const { nav, link } = renderAt(path);
    for (const cls of PILL) expect(link).not.toHaveClass(cls);
    expect(link).not.toHaveAttribute("aria-current");
    // It wears exactly the classes of a nav item that is not the current route, with only its leading `inline-flex`
    // made `hidden lg:inline-flex`.
    const inactive = within(nav)
      .getAllByRole("link")
      .find((a) => a !== link && !a.className.includes("bg-blue-100"))!;
    expect(inactive.className.startsWith("inline-flex ")).toBe(true);
    expect(link.className).toBe(inactive.className.replace(/^inline-flex /, "hidden lg:inline-flex "));
  });
});
