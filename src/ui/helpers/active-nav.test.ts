// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { activeNavPath, bodyCapped, navSticks } from "./active-nav";

/**
 * SCH-1 (v0.87.4): the header's current nav item, as a decision table. Expected values are literals, never computed
 * by calling the helper. Every route in `src/app/router.tsx` is a row, and so is each case the old
 * `startsWith(item.path)` got wrong: a project page (`/project/:id`, singular) and any route in another letter case,
 * which React Router still matches.
 */
describe("activeNavPath", () => {
  it.each([
    ["/projects", "/projects"],
    ["/projects/", "/projects"],
    ["/project/9526e0c9-9ce0-40ca-b5f4-9803ad966a09", "/projects"],
    ["/project/does-not-exist", "/projects"],
    ["/Projects", "/projects"],
    ["/PROJECT/abc", "/projects"],
    ["/calendar", "/calendar"],
    ["/Calendar", "/calendar"],
    ["/settings", "/settings"],
    ["/about", "/about"],
  ])("%s → %s", (pathname, expected) => {
    expect(activeNavPath(pathname)).toBe(expected);
  });

  it.each([
    // The footer's Version link leads here; no nav item does, so none is the current page (Orch-FRAME-1's ruling).
    ["/changelog"],
    // "/" redirects to /projects before Layout reads it; on its own it names no item.
    ["/"],
    [""],
    // A prefix of an item's path, or an item's path with more on it, is not that item.
    ["/projectsx"],
    ["/proj"],
    ["/aboutus"],
    ["/no-such-route"],
    // A key of Object.prototype is not an item.
    ["/constructor"],
    ["/__proto__"],
  ])("%s → null", (pathname) => {
    expect(activeNavPath(pathname)).toBeNull();
  });
});

/**
 * FRAME26 stage 4 (v0.88.0): the two frame rules read from the same first segment. The navigation row sticks on a
 * project's page only (contract §8, X3), and Settings, About and the changelog cap their body (X4). Literals again.
 */
describe("navSticks (X3)", () => {
  it.each([
    ["/project/9526e0c9-9ce0-40ca-b5f4-9803ad966a09", true],
    ["/project/does-not-exist", true],
    ["/PROJECT/abc", true],
    ["/projects", false],
    ["/projects/", false],
    ["/calendar", false],
    ["/settings", false],
    ["/about", false],
    ["/changelog", false],
    ["/", false],
    ["/no-such-page", false],
  ])("%s → %s", (path, sticks) => {
    expect(navSticks(path)).toBe(sticks);
  });
});

describe("bodyCapped (X4)", () => {
  it.each([
    ["/settings", true],
    ["/about", true],
    ["/changelog", true],
    ["/Settings", true],
    ["/ABOUT/", true],
    ["/projects", false],
    ["/project/abc", false],
    ["/calendar", false],
    ["/", false],
    ["/no-such-page", false],
  ])("%s → %s", (path, capped) => {
    expect(bodyCapped(path)).toBe(capped);
  });
});
