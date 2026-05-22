// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useCallback, useEffect, useRef, useState } from "react";
import type { Activity, ActivityBand } from "@domain/models/types";

/**
 * Tracks "focus the newly-added row" intent for the activity grid. Callers
 * signal intent BEFORE invoking the add action (e.g. `signalActivityAdd()`
 * then `onAdd("")`); the next render that grows the array auto-focuses the
 * last item, then clears the focus target after one animation frame so it
 * doesn't re-trigger on unrelated re-renders.
 */
export function useGridFocus(activities: Activity[], bands: ActivityBand[]) {
  const [focusActivityId, setFocusActivityId] = useState<string | null>(null);
  const [focusBandId, setFocusBandId] = useState<string | null>(null);
  const pendingActivityRef = useRef(false);
  const pendingBandRef = useRef(false);
  const prevActivityCount = useRef(activities.length);
  const prevBandCount = useRef(bands.length);

  useEffect(() => {
    if (pendingActivityRef.current && activities.length > prevActivityCount.current) {
      const last = activities[activities.length - 1];
      if (last) {
        setFocusActivityId(last.id); // eslint-disable-line react-hooks/set-state-in-effect -- coordinating ref-based flag with focus state
      }
      pendingActivityRef.current = false;
    }
    prevActivityCount.current = activities.length;
  }, [activities]);

  useEffect(() => {
    if (focusActivityId) {
      const id = requestAnimationFrame(() => setFocusActivityId(null));
      return () => cancelAnimationFrame(id);
    }
  }, [focusActivityId]);

  useEffect(() => {
    if (pendingBandRef.current && bands.length > prevBandCount.current) {
      const lastBand = bands[bands.length - 1];
      if (lastBand) {
        setFocusBandId(lastBand.id); // eslint-disable-line react-hooks/set-state-in-effect -- mirrors pendingFocus pattern for activities
      }
      pendingBandRef.current = false;
    }
    prevBandCount.current = bands.length;
  }, [bands]);

  useEffect(() => {
    if (focusBandId) {
      const id = requestAnimationFrame(() => setFocusBandId(null));
      return () => cancelAnimationFrame(id);
    }
  }, [focusBandId]);

  const signalActivityAdd = useCallback(() => {
    pendingActivityRef.current = true;
  }, []);

  const signalBandAdd = useCallback(() => {
    pendingBandRef.current = true;
  }, []);

  return { focusActivityId, focusBandId, signalActivityAdd, signalBandAdd };
}

/**
 * Selection-set state for the activity grid. Prunes IDs that no longer
 * correspond to existing activities (e.g. after a delete).
 */
export function useGridSelection(activities: Activity[]) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    setSelectedIds((prev) => { // eslint-disable-line react-hooks/set-state-in-effect -- prunes stale IDs from selection set
      const activityIdSet = new Set(activities.map((a) => a.id));
      const next = new Set([...prev].filter((id) => activityIdSet.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [activities]);

  const toggleSelect = useCallback((activityId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(activityId)) {
        next.delete(activityId);
      } else {
        next.add(activityId);
      }
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === activities.length) {
        return new Set();
      }
      return new Set(activities.map((a) => a.id));
    });
  }, [activities]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  return { selectedIds, toggleSelect, toggleSelectAll, clearSelection };
}
