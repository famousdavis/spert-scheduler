// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * FRAME26 stage 4 (v0.88.0): the frame's navigation row (contract §3, "Navigation row", "Navigation zones", "Active
 * item"; §8, X3). Two zones: Projects · Calendar on the left; Settings · About · Help Center ↗ on the right, in that
 * order. At most one item is the current page, and exactly one on every screen an item leads to; inside a project it is
 * Projects. The row sticks on a project's page only. jsdom applies no CSS, so the classes and hooks the frame's
 * stylesheet and frame-check read are pinned here; the geometry is frame-check's.
 */

import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { AppNav } from "./AppNav";

afterEach(cleanup);

function navAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <AppNav />
    </MemoryRouter>,
  );
  const nav = screen.getByRole("navigation");
  const work = nav.querySelector('[data-sf="nav-work"]') as HTMLElement;
  const app = nav.querySelector('[data-sf="nav-app"]') as HTMLElement;
  return { nav, work, app, current: within(nav).queryAllByRole("link").filter((a) => a.hasAttribute("aria-current")) };
}

describe("FRAME26: the navigation row", () => {
  it("is the frame's nav, with its two zones in order: Projects · Calendar | Settings · About · Help Center ↗", () => {
    const { nav, work, app } = navAt("/projects");
    expect(nav).toHaveAttribute("data-sf", "nav");
    expect(nav).toHaveClass("sf-nav");
    expect(work).toHaveClass("sf-nav-work");
    expect(app).toHaveClass("sf-nav-app");
    expect(within(work).getAllByRole("link").map((a) => a.textContent)).toEqual(["Projects", "Calendar"]);
    expect(within(app).getAllByRole("link").map((a) => a.textContent)).toEqual([
      "Settings",
      "About",
      "Help Center ↗ (opens in a new tab)",
    ]);
    // Both zones sit in the column, one row.
    expect(work.parentElement).toBe(app.parentElement);
    expect(work.parentElement).toHaveClass("sf-col", "sf-nav-row");
  });

  it.each([
    ["/projects", "Projects"],
    ["/project/abc", "Projects"],
    ["/PROJECT/abc", "Projects"],
    ["/calendar", "Calendar"],
    ["/calendar?project=abc", "Calendar"],
    ["/settings", "Settings"],
    ["/about", "About"],
  ])("at %s exactly one item is current: %s, marked by aria-current alone", (path, label) => {
    const { current } = navAt(path);
    expect(current.map((a) => a.textContent)).toEqual([label]);
    expect(current[0]).toHaveAttribute("aria-current", "page");
    expect(current[0]!.getAttribute("class")).toBe("sf-tab");
  });

  it.each(["/changelog", "/no-such-page"])("at %s, a screen no item leads to, no item is current", (path) => {
    expect(navAt(path).current).toEqual([]);
  });

  it("an item that is not current carries no aria-current at all, never 'false'", () => {
    const { nav } = navAt("/projects");
    for (const a of within(nav).getAllByRole("link").filter((l) => l.textContent !== "Projects")) {
      expect(a).not.toHaveAttribute("aria-current");
    }
  });

  it.each([
    ["/project/abc", true],
    ["/PROJECT/abc", true],
    ["/projects", false],
    ["/calendar", false],
    ["/settings", false],
    ["/about", false],
    ["/changelog", false],
    ["/no-such-page", false],
  ])("at %s the row sticks: %s (exception X3, a project's page only)", (path, sticks) => {
    const { nav } = navAt(path);
    expect(nav.classList.contains("sf-nav--sticky")).toBe(sticks);
  });
});
