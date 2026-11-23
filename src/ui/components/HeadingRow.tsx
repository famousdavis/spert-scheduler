// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ReactNode } from "react";

interface HeadingRowProps {
  /** The page's heading: the page's one `h1`. */
  children: ReactNode;
  /** The full text, shown on hover when a long heading is cut short with an ellipsis (contract §7, "Long names"). */
  title?: string;
  /** The page's own toolbar, flush right on the row: the Dashboard's four buttons, a project's five actions. */
  toolbar?: ReactNode;
  /**
   * Extra classes for the row itself. Only the project page passes one, `[overflow-anchor:none]` (v0.69.0): nothing
   * above the activity grid may become the browser's scroll anchor. The frame's `.sf-headrow` sets no `overflow-anchor`.
   */
  className?: string;
}

/**
 * The frame's heading row (FRAME26, contract §3): the page's `h1`, 24 / 32 / 700 at the column's left edge, with the
 * toolbar flush right, 24 px under the frame. Every screen has exactly one, and it is the page's only `h1` on screen:
 * the brand title is not a heading.
 *
 * ⚠️ Render it as a DIRECT child of `main` on a capped screen (`.sf-main--capped`, exception X4: Settings, About,
 * Changelog), never inside a wrapper: the cap applies to every child of `main` except this row, which stays full width.
 * Such a screen returns a fragment, `<><HeadingRow>…</HeadingRow><div className="sf-below">…</div></>`.
 * The project page is the one exception, and it is not capped: its row sits inside its root `div.space-y-6`, because
 * the print stylesheet reaches the printed report through `#root > * > main > *` and `.space-y-6 > *`.
 */
export function HeadingRow({ children, title, toolbar, className }: HeadingRowProps) {
  return (
    <div className={className ? `sf-headrow ${className}` : "sf-headrow"} data-sf="headrow">
      <h1 className="sf-heading" data-sf="heading" title={title}>
        {children}
      </h1>
      {toolbar && (
        <div className="sf-toolbar" data-sf="toolbar">
          {toolbar}
        </div>
      )}
    </div>
  );
}
