// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useSyncExternalStore } from "react";
import { todayISO } from "@ui/components/activity-row-helpers";

/** Milliseconds from `now` to one second past the next local midnight, when the date has turned. */
export function msToNextLocalMidnight(now: Date): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
  return next.getTime() - now.getTime();
}

function subscribe(onChange: () => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const arm = () => {
    timer = setTimeout(() => {
      onChange();
      arm();
    }, msToNextLocalMidnight(new Date()));
  };
  arm();
  return () => clearTimeout(timer);
}

/**
 * WI-154: today, `YYYY-MM-DD`, in this browser's local time — read again at each local midnight
 * while the page is open, so a schedule floored at the data date moves on with the calendar
 * instead of keeping yesterday's until something else re-renders it.
 */
export function useToday(): string {
  return useSyncExternalStore(subscribe, todayISO);
}
