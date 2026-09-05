// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useSyncExternalStore } from "react";

/**
 * Whether the `dark` class is currently on `<html>`, as a SUBSCRIBED value.
 *
 * ⚠️ THE DEFECT THIS EXISTS FOR IS NOT "THE CHART READ A STALE SOURCE". Measured on the
 * sample project 2026-09-05: the class is correct on every path that can change the theme
 * — an explicit toggle, Dark→System, and an OS flip while the preference is "system".
 * `useTheme` sets it in an effect on the first two and in a media-query listener on the
 * third. The chart read that correct value **during render, with nothing subscribed to
 * it**, so React was never told to look again. It is a missing subscription, not a wrong
 * source, and that distinction is what this hook encodes.
 *
 * ⚠️ WHY NOT `useTheme().effectiveTheme`, which the work item prescribed. That memo is
 * keyed on the theme PREFERENCE alone, and the preference does not change when the OS
 * theme flips under "system" — the hook handles that path by mutating the class directly
 * and updating no React state. So `effectiveTheme` is itself stale on exactly that path.
 * `use-theme.test.ts` has pinned this since the quality campaign, with a comment naming
 * "a chart palette" as the first consumer that would be caught by it. Swapping the chart
 * onto `effectiveTheme` would have closed the two easy paths, left the hardest-to-notice
 * one open, and made this chart that predicted first victim. The class is the one source
 * that is right on all three.
 *
 * ⚠️ `useSyncExternalStore`, not `useState` + `useEffect`. It is the primitive for exactly
 * this — an external mutable source — and it keeps the two Gantt consumers from tearing
 * against each other within a render. A `setState`-in-effect version would also add a
 * `react-hooks/set-state-in-effect` lint finding, which this repo gates on by NUMBER.
 *
 * `subscribe` and `getSnapshot` are module-level so their identities are stable; defining
 * them inside the hook would resubscribe the observer on every render.
 */
function subscribe(onStoreChange: () => void): () => void {
  if (typeof document === "undefined") return () => {};
  const observer = new MutationObserver(onStoreChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  return () => observer.disconnect();
}

function getSnapshot(): boolean {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

/** Server render has no document; the app's own sites already defaulted to light. */
function getServerSnapshot(): boolean {
  return false;
}

export function useIsDarkClass(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
