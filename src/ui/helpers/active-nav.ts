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
  const segment = (pathname.split("/")[1] ?? "").toLowerCase();
  return SEGMENT_TO_NAV_PATH.get(segment) ?? null;
}
