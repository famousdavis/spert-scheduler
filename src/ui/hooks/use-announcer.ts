// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { create } from "zustand";

/**
 * The app's one polite announcement (v0.89.0, FRAME26 clean-up L): the text of the always-mounted, visually hidden
 * `aria-live="polite"` line in `Layout`, outside every route, so a sentence set just before a navigation is still
 * spoken on the next page. Load Sample uses it ("Added “Sample: …” to your projects and opened it.", contract §7).
 *
 * `announce` empties the line first and sets the text a macrotask later, so the same sentence twice in a row is a
 * change the screen reader hears again. Only the latest call's text lands. Outside React, so no effect sets state.
 */
interface AnnouncerStore {
  text: string;
}

export const useAnnouncerStore = create<AnnouncerStore>(() => ({ text: "" }));

let pending: ReturnType<typeof setTimeout> | null = null;

export function announce(text: string): void {
  if (pending !== null) clearTimeout(pending);
  useAnnouncerStore.setState({ text: "" });
  pending = setTimeout(() => {
    pending = null;
    useAnnouncerStore.setState({ text });
  }, 0);
}
