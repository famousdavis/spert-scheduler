// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.87.4, FRAME26 stage 0, SCH-1: the header marks the current page. Since v0.88.0 (FRAME26 stage 4) the mark is the
 * frame's: the navigation row's `.sf-tab` items carry no utility class, and the stylesheet underlines the one with
 * `aria-current="page"` (contract §3, "Active item"). The pill is gone.
 *
 * Until v0.87.4 a nav item was active when `pathname.startsWith(item.path)`. A project lives at `/project/:id`
 * (singular), so inside a project no item was active, measured on the live app at v0.87.3. Nor did any item carry
 * `aria-current`, so a screen reader was never told which page was current.
 *
 * Now at most one item is active, it carries `aria-current="page"`, and it wears the pill. On every page a nav item
 * leads to, exactly one is active, and inside a project it is Projects. The footer's `/changelog` marks none
 * (Orch-FRAME-1's ruling, 2026-11-23). The Help Center link is never active.
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

/** A nav item's whole class list: the frame's `.sf-tab` and nothing else, so no utility can paint a pill or a hover ground. */
const TAB_CLASS = "sf-tab";

function navAt(path: string) {
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
  const links = within(nav).getAllByRole("link");
  return {
    links,
    current: links.filter((a) => a.hasAttribute("aria-current")),
    items: links.filter((a) => !a.textContent?.startsWith("Help Center")),
  };
}

describe("the header's current page", () => {
  it.each([
    ["/projects", "Projects"],
    ["/projects/", "Projects"],
    ["/Projects", "Projects"],
    ["/project/9526e0c9-9ce0-40ca-b5f4-9803ad966a09", "Projects"],
    ["/PROJECT/9526e0c9-9ce0-40ca-b5f4-9803ad966a09", "Projects"],
    ["/project/does-not-exist", "Projects"],
    ["/calendar", "Calendar"],
    ["/settings", "Settings"],
    ["/about", "About"],
  ])("at %s exactly one item, %s, is the current page, and every item is a bare .sf-tab", (path, label) => {
    const { current, items } = navAt(path);
    expect(current.map((a) => a.textContent)).toEqual([label]);
    expect(current[0]).toHaveAttribute("aria-current", "page");
    for (const a of items) expect(a.getAttribute("class")).toBe(TAB_CLASS);
  });

  it("at /changelog no item is the current page, and every item is a bare .sf-tab", () => {
    const { links, current, items } = navAt("/changelog");
    // Control: the nav is there to be read, all five links.
    expect(links).toHaveLength(5);
    expect(current).toEqual([]);
    for (const a of items) expect(a.getAttribute("class")).toBe(TAB_CLASS);
  });

  it.each(["/projects", "/project/abc", "/about", "/changelog"])(
    "at %s the Help Center link is never the current page",
    (path) => {
      const { links } = navAt(path);
      const help = links.find((a) => a.textContent?.startsWith("Help Center"))!;
      expect(help).toBeDefined();
      expect(help).not.toHaveAttribute("aria-current");
      expect(help).not.toHaveClass(TAB_CLASS);
    },
  );
});
