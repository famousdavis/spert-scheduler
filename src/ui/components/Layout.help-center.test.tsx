// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Adding a guide to public/? Also add it, with a one-line description, to spertsuite.com's
// src/data/help.ts (spert-landing-page). The landing page's daily "Guide list matches the app
// repos" check stays red until you do. The PDF guide house rules say the same.

/**
 * v0.87.1, Help Center Phase 2: the header's Help Center link. Since v0.88.0 (FRAME26 stage 4) it is the frame's
 * `.sf-help`, the navigation row's LAST element: Settings · About · Help Center ↗ (contract §3, "Navigation zones").
 *
 * It opens this app's page in the SPERT® Suite Help Center in a new tab, and is never one of the nav's routes, so it
 * is never the current page. jsdom applies no CSS, so the visually hidden words are pinned by their `sr-only` class as
 * well as by the accessible name. The URL is compared with a LITERAL, never with the constant, so a wrong slug at the
 * constant cannot stay green.
 *
 * William's ruling of 2026-11-16 hid the link below 1,024 px, because v0.87.0's one-row header had 3.3 px to spare at
 * 768. The frame's two rows have the room, and the frame's app zone never moves, so it shows at every width (Orch-FRAME-2,
 * D3, 2026-11-23). `.sf-help` sets `display` unlayered, so a `hidden` utility could not hide it anyway.
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

  it("comes immediately after About, last in the app zone, and the four nav items keep their order", () => {
    const { nav, link } = renderAt("/projects");
    const about = within(nav).getByRole("link", { name: "About" });
    expect(about.nextElementSibling).toBe(link);
    expect(link.nextElementSibling).toBeNull();
    expect(link.parentElement).toHaveAttribute("data-sf", "nav-app");
    expect(within(nav).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Projects",
      "Calendar",
      "Settings",
      "About",
      "Help Center ↗ (opens in a new tab)",
    ]);
  });

  it("is the frame's `.sf-help` alone, shown at every width: no `hidden`, no other class", () => {
    expect(renderAt("/projects").link.getAttribute("class")).toBe("sf-help");
  });

  it.each(ROUTES)("is never the current page, nor a nav item, at %s", (path) => {
    const { link } = renderAt(path);
    expect(link).not.toHaveAttribute("aria-current");
    expect(link).not.toHaveClass("sf-tab");
  });
});
