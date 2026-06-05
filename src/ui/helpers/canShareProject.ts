// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { StorageMode } from "@ui/providers/StorageProvider";

/**
 * Authorization predicate for the per-tile Share affordance on the dashboard.
 *
 * Returns true only when the app is in cloud mode AND a user is signed in AND
 * that user owns the project. Local-mode tiles, signed-out sessions, and
 * shared-with-me (non-owned) projects all return false — matching how sharing
 * is gated elsewhere in the suite. Legacy cloud projects with a `null` owner
 * (pre-v0.42.0 ownership seeding) correctly return false; those can still be
 * shared from the project page's own Sharing section.
 */
export function canShareProject(
  mode: StorageMode,
  userUid: string | null | undefined,
  ownerUid: string | null,
): boolean {
  return mode === "cloud" && !!userUid && ownerUid === userUid;
}
