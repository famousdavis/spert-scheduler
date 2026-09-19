// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useState, useSyncExternalStore } from "react";

/**
 * Is a pointer pressed anywhere in the window? One module-level store for every caller, fed by
 * capture-phase listeners on `window` that exist only while something is subscribed.
 *
 * ⚠️ RELEASED A TASK AFTER `pointerup`, not at it. `pointerup` is followed by `mouseup` and then
 * `click`, all in one task; a release at `pointerup` would let the held content paint between
 * the press and the click it belongs to, which is the whole defect. `setTimeout(0)` runs after
 * that task — measured in Chromium: the click was dispatched before the paint in every run.
 * `pointercancel` and a window `blur` release too, or a press that never sees its `pointerup`
 * (a drag out of the window, an alert) would hold forever.
 */
let pointerDown = false;
let releaseTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function press(): void {
  clearTimeout(releaseTimer);
  if (pointerDown) return;
  pointerDown = true;
  emit();
}

function release(): void {
  clearTimeout(releaseTimer);
  releaseTimer = setTimeout(() => {
    if (!pointerDown) return;
    pointerDown = false;
    emit();
  }, 0);
}

function attach(): void {
  window.addEventListener("pointerdown", press, true);
  window.addEventListener("pointerup", release, true);
  window.addEventListener("pointercancel", release, true);
  window.addEventListener("blur", release);
}

function detach(): void {
  window.removeEventListener("pointerdown", press, true);
  window.removeEventListener("pointerup", release, true);
  window.removeEventListener("pointercancel", release, true);
  window.removeEventListener("blur", release);
  clearTimeout(releaseTimer);
  pointerDown = false;
}

function subscribe(listener: () => void): () => void {
  if (listeners.size === 0) attach();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) detach();
  };
}

const isPointerDown = (): boolean => pointerDown;
const notPointerDown = (): boolean => false;

/**
 * `value`, except while a pointer is pressed: then the value as it was painted when the press
 * began (v0.69.0, WI-49's "hold").
 *
 * THE DEFECT IT CLOSES. Committing an estimate by clicking something else — the row's pencil,
 * Delete, another cell — happens on `pointerdown`'s blur, before the click. When that commit
 * flagged the row, the validation summary and the schedule-error banner were inserted above the
 * grid (or grew, or were removed) between the press and the click: the grid moved by up to
 * 222 px, `mouseup` landed on a different element, and the click never reached the pencil. The
 * dialog did not open. Holding what those two SHOW until the click has landed keeps the grid
 * still under the pointer; the flag paints a task later.
 *
 * ⚠️ HOLD ONLY WHAT IS PAINTED ABOVE THE GRID, NEVER A GATE. Run, auto-run and the rows read the
 * live values, so display and gate can disagree for at most one press — never longer.
 *
 * ⚠️ `value` MUST BE REFERENCE-STABLE between renders (a store array, a `useMemo` result, state,
 * a primitive): an object built in the render body is a new value every render, never equal to
 * the held one, and this re-renders forever.
 *
 * No effect and no ref: the pointer state is an external store, and the painted value is state
 * adjusted during render — React's documented pattern, which costs one extra pass per change.
 */
export function useHeldWhilePointerDown<T>(value: T): T {
  const down = useSyncExternalStore(subscribe, isPointerDown, notPointerDown);
  const [shown, setShown] = useState(value);
  if (!down && shown !== value) setShown(value);
  return down ? shown : value;
}
