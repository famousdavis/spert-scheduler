// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useProjectStore, type ProjectStore } from "@ui/hooks/use-project-store";

/**
 * WI-112 (v0.76.10) — the ONE definition of "a project created now would never reach the cloud": cloud
 * sync runs (cloud storage, signed in) and the FIRST cloud load of the sign-in has not ended, on success
 * or failure. Until then `useCloudSync` sends no store change to Firestore, and the load then replaces
 * the project list, so a project created meanwhile vanished — at once, or at the next visit. Measured
 * before this release for New Project, Load Sample, a tile's Clone and Settings' Import Activities.
 *
 * Every control that creates a project is greyed out while this is true (the words are in
 * `@ui/helpers/cloud-create-gate`), and every create is checked again as it commits — a window opened
 * earlier, or the sample's build landing late, is refused.
 *
 * Two readers, one answer: `useCloudCreateBlocked` for a component, and `isCloudCreateBlocked` for code
 * that runs after the render it began in — the sample's build asks it when it LANDS, by which time the
 * Dashboard may have left the screen. Both read the store, so they answer the same on any page. (A copy
 * the Dashboard kept stopped updating once it was left: a review measured a sample, pressed before the
 * sign-in was recognised, added inside the load from another page — announced, opened, never uploaded.)
 *
 * ⚠️ `cloudSyncReady` is the sync handler's own gate. NOT `cloudDataLoaded`: that one waits for EVERY cloud
 * load (WI-113) — the invitation re-fetch too, which can still be running after the first load has ended, when
 * the sync handler already sends a create to the cloud. (Before WI-113 the re-fetch could set it true while the
 * first load still ran, and a create then was dropped.) A project created while that re-fetch runs is sent to the
 * cloud, and the re-fetch's answer then takes it off the list until the projects are next loaded — left, by
 * owner ruling (2026-10-10), to the sign-in design that follows.
 * ⚠️ Cloud storage only (`cloudSyncActive`). Before a remembered sign-in is recognised the app is in local
 * storage, and a project created then is a local one; that moment is left as it is (owner ruling, 2026-10-16).
 * The same gate keeps the pages from loading the project list while the first load runs (WI-113).
 */
function cloudCreateBlocked(s: ProjectStore): boolean {
  return s.cloudSyncActive && !s.cloudSyncReady;
}

/** The gate, for a component: it re-renders when the gate opens or closes. */
export function useCloudCreateBlocked(): boolean {
  return useProjectStore(cloudCreateBlocked);
}

/** The gate as it is now, for code outside React. */
export function isCloudCreateBlocked(): boolean {
  return cloudCreateBlocked(useProjectStore.getState());
}
