// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useRef } from "react";

export interface SingleOrDoubleClickHandlers {
  /** True when at least one action is available, so the element should accept pointers. */
  interactive: boolean;
  onClick: ((event: { detail: number }) => void) | undefined;
  onDoubleClick: (() => void) | undefined;
}

/**
 * Lets one element carry both a single-click and a double-click action.
 *
 * A single click cannot act immediately, because a double click begins with one. So the
 * single action is deferred by `delayMs` and the double click cancels it. That delay is a
 * real cost paid by the common gesture to make the rarer one possible, which is why it is
 * a named constant rather than a literal.
 *
 * ⚠️ FOUR CASES, and the two degenerate ones do NOT wait. The delay only buys something
 * when there is a second gesture that could cancel it:
 *   · both actions  — defer the single, let the double cancel it (the real case)
 *   · single only   — fire immediately; nothing could cancel it, so waiting is dead time
 *   · double only   — fire it on a single click; otherwise the element would be inert to
 *                     the ordinary gesture, which is how a caller passing one callback
 *                     would silently lose the affordance it already had
 *   · neither       — not interactive; the caller should not attach handlers at all
 *
 * ⚠️ A DOUBLE CLICK THAT ARRIVES TOO LATE IS IGNORED, deliberately. If the deferred single
 * action already ran, `timer.current` is null and the double click does nothing, rather
 * than firing a second action on top of the first. Without this a slow double click — two
 * clicks far enough apart for the timer to elapse but close enough for the browser to
 * still report `dblclick` — would run BOTH actions. The browser's double-click threshold
 * is a user/OS setting and is not required to be shorter than `delayMs`, so the two
 * windows genuinely can cross.
 */
export function useSingleOrDoubleClick(opts: {
  onSingle: (() => void) | undefined;
  onDouble: (() => void) | undefined;
  delayMs: number;
  /**
   * When false the element is inert and neither action can fire — a locked scenario, for
   * instance. Taken here rather than by callers gating each callback, so there is one
   * place a whole element is switched off instead of one condition per gesture that
   * could drift apart.
   */
  enabled: boolean;
}): SingleOrDoubleClickHandlers {
  const { onSingle, onDouble, delayMs, enabled } = opts;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cancel = useCallback(() => {
    if (timer.current !== null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // Clear a pending timer if the row unmounts — otherwise a chart that re-renders while a
  // click is in flight opens an editor for a row that is no longer on screen.
  useEffect(() => cancel, [cancel]);

  const handleClick = useCallback(
    (event: { detail: number }) => {
      if (!onSingle) {
        onDouble?.();
        return;
      }
      if (!onDouble) {
        onSingle();
        return;
      }
      // The second click of a double click also raises `click`, with detail 2. Ignore it;
      // the dblclick handler owns that gesture.
      if (event.detail > 1) return;
      cancel();
      timer.current = setTimeout(() => {
        timer.current = null;
        onSingle();
      }, delayMs);
    },
    [onSingle, onDouble, delayMs, cancel],
  );

  const handleDoubleClick = useCallback(() => {
    if (timer.current === null) return;
    cancel();
    onDouble?.();
  }, [cancel, onDouble]);

  const interactive = enabled && Boolean(onSingle || onDouble);
  return {
    interactive,
    onClick: interactive ? handleClick : undefined,
    onDoubleClick: interactive ? handleDoubleClick : undefined,
  };
}
