// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { Link, useLocation } from "react-router-dom";
import { activeNavPath, navSticks } from "@ui/helpers/active-nav";

/** The app's work items, left: the collection first (contract §3, "Navigation zones"). */
const WORK_ITEMS = [
  { path: "/projects", label: "Projects" },
  { path: "/calendar", label: "Calendar" },
] as const;

/** The app zone, right: Settings · About, then Help Center, always in that order. */
const APP_ITEMS = [
  { path: "/settings", label: "Settings" },
  { path: "/about", label: "About" },
] as const;

/** This app's page in the SPERT® Suite Help Center. Defined once, here, beside its one link. */
const HELP_CENTER_URL = "https://spertsuite.com/help/scheduler";

function NavItem({ path, label, activePath }: { path: string; label: string; activePath: string | null }) {
  // The active item is marked by `aria-current="page"` alone: the frame's stylesheet draws its underline and colour
  // from that attribute, at the same weight as every other item, so nothing moves when the selection changes. The
  // attribute is omitted, not "false", on every other item. No utility class: `.sf-tab` sets the colour but not the
  // background, so a `hover:bg-*` or the old active pill's `bg-blue-100` would still paint.
  return (
    <Link to={path} className="sf-tab" aria-current={path === activePath ? "page" : undefined}>
      {label}
    </Link>
  );
}

/**
 * The frame's navigation row (FRAME26, contract §3, v0.88.0): a full-width 44 px band under the brand row. Two zones:
 * the work items on the left (Projects, Calendar), and Settings · About · Help Center ↗ on the right.
 *
 * At most one item is the current page, and inside a project it is Projects (SCH-1, v0.87.4, `activeNavPath`). A
 * route no item leads to (the footer's `/changelog`, a 404) marks none.
 *
 * On a project's page only, the row sticks to the top of the window (`.sf-nav--sticky`, exception X3): those pages run
 * to about 9,000 px. The brand row above it scrolls away there, as everywhere.
 *
 * Help Center is a LINK that leaves the app, never a nav item: not in either list, never `aria-current`. It is the
 * row's last element, quiet 400-weight text (`.sf-help`), shown at every width: v0.87.1 hid it below 1,024 px because
 * the one-row header had no room, and the two rows have it. ⚠️ The spaces are their own text nodes, outside the spans:
 * with a space inside a span, the accessible-name computation trims it and gives "Help Center(opens in a new tab)".
 */
export function AppNav() {
  const { pathname } = useLocation();
  const activePath = activeNavPath(pathname);
  return (
    <nav
      className={navSticks(pathname) ? "sf-nav sf-nav--sticky [overflow-anchor:none]" : "sf-nav [overflow-anchor:none]"}
      data-sf="nav"
    >
      <div className="sf-col sf-nav-row">
        <div className="sf-nav-work" data-sf="nav-work">
          {WORK_ITEMS.map((item) => (
            <NavItem key={item.path} path={item.path} label={item.label} activePath={activePath} />
          ))}
        </div>
        <div className="sf-nav-app" data-sf="nav-app">
          {APP_ITEMS.map((item) => (
            <NavItem key={item.path} path={item.path} label={item.label} activePath={activePath} />
          ))}
          <a href={HELP_CENTER_URL} target="_blank" rel="noopener noreferrer" className="sf-help">
            Help Center{" "}<span aria-hidden="true">↗</span>{" "}<span className="sr-only">(opens in a new tab)</span>
          </a>
        </div>
      </div>
    </nav>
  );
}
