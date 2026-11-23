// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Which header nav item is the current page (v0.87.4, FRAME26 stage 0, SCH-1).
 *
 * Until v0.87.4 the header asked `pathname.startsWith(item.path)`, and a project lives at `/project/:id`, singular,
 * so inside a project NO item was active. React Router also matches routes without regard to case, so `/Projects`
 * showed the Projects page with nothing active either.
 *
 * The answer is read from the FIRST path segment, lower-cased. At most one item is ever active: a route that no nav
 * item leads to (the footer's `/changelog`) marks none, because `aria-current="page"` on another item would tell a
 * screen-reader user they were somewhere they are not.
 */
const SEGMENT_TO_NAV_PATH: ReadonlyMap<string, string> = new Map([
  ["projects", "/projects"],
  ["project", "/projects"],
  ["calendar", "/calendar"],
  ["settings", "/settings"],
  ["about", "/about"],
]);

/** The nav item's path for this pathname, or `null` when no nav item is the current page. */
export function activeNavPath(pathname: string): string | null {
  return SEGMENT_TO_NAV_PATH.get(firstSegment(pathname)) ?? null;
}

/** The pathname's first segment, lower-cased: the one reading every rule in this file shares. */
function firstSegment(pathname: string): string {
  return (pathname.split("/")[1] ?? "").toLowerCase();
}

/**
 * Whether the frame's navigation row sticks to the top of the window (FRAME26, contract §8, exception X3): on a
 * project's page only, which runs to about 9,000 px with the sample. The brand row never sticks, and on every other
 * screen the navigation row scrolls with the page.
 */
export function navSticks(pathname: string): boolean {
  return firstSegment(pathname) === "project";
}

/** The screens whose body is capped at 896 px from the column's left edge (contract §8, exception X4). */
const CAPPED_SEGMENTS: ReadonlySet<string> = new Set(["settings", "about", "changelog"]);

/** Whether this pathname's body is capped (X4). The heading row stays full width either way. */
export function bodyCapped(pathname: string): boolean {
  return CAPPED_SEGMENTS.has(firstSegment(pathname));
}
