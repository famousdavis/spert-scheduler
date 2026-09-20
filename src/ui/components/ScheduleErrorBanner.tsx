// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ScheduleErrorBanner as ScheduleErrorBannerModel } from "@ui/helpers/schedule-error-banner";
import { scrollToActivity } from "@ui/helpers/scroll-to-activity";

interface ScheduleErrorBannerProps {
  /** Already built by `getScheduleErrorBanner` from HELD inputs — see `ProjectPage`. */
  banner: ScheduleErrorBannerModel;
  /** Shows the grid, which may be collapsed (v0.71.0). Called before the jump, synchronously. */
  onRevealGrid: () => void;
}

/**
 * The red schedule-error box above the grid.
 *
 * Lifted out of `ProjectPage.tsx` in v0.71.3 (WI-15) when the generic branch gained a link: the
 * page is the largest component in the repo, and a banner with behaviour of its own is a component,
 * not more JSX in a page that already carries a lint decline for its size.
 *
 * ⚠️ `[overflow-anchor:none]` is load-bearing and must stay. This box sits ABOVE the grid, so it
 * must never become the browser's scroll anchor — its own growth or removal would then move the
 * grid under a pointer (v0.69.0). The same class is on the validation summary for the same reason.
 * What this box SHOWS is already held while a pointer is down, at the page.
 *
 * ⚠️ The link is only ever present on the generic branch. Cycle and calendar failures are not about
 * one activity, so there is no row to jump to and `banner.link` is absent for them.
 */
export function ScheduleErrorBanner({ banner, onRevealGrid }: ScheduleErrorBannerProps) {
  // Destructured so the closure below narrows: `banner.link` inside the callback would not.
  const link = banner.link;
  return (
    <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4 [overflow-anchor:none]">
      <p className="text-sm font-medium text-red-800 dark:text-red-300">
        {banner.heading}
      </p>
      {/* Separate paragraphs, not one space-joined line — the advice is a full sentence of its own
          and running it on after the message produced one unreadable sentence (v0.63.0).

          ⚠️ `text-red-700`, not the `text-red-600` this box carried until v0.71.3. MEASURED in
          Chrome against the composited background: red-600 on red-50 is 4.36:1, which FAILS WCAG
          AA for 14 px text (4.5:1). red-700 is 5.87:1. The failure was pre-existing and is fixed
          here because this is the line WI-15 turned into the explanation a reader actually needs
          — an app aimed at people new to Monte Carlo cannot put its plain-words help below AA.
          Dark is untouched: `dark:text-red-400` measures 5.63:1 over gray-900 and already passed. */}
      <p className="mt-1 text-sm text-red-700 dark:text-red-400">
        {link && (
          <button
            type="button"
            onClick={() => scrollToActivity(link.activityId, onRevealGrid)}
            className="text-red-800 dark:text-red-300 font-medium hover:underline"
          >
            {link.label}
          </button>
        )}
        {/* ⚠️ A REAL text node, never a CSS gap. A `gap` is not an audible space, so a screen
            reader would run the activity's name straight into its problem. */}
        {link && ": "}
        {banner.message}
      </p>
      <p className="mt-1 text-sm text-red-700 dark:text-red-300">
        {banner.advice}
      </p>
    </div>
  );
}
