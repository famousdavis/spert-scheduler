// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { LoadError } from "@ui/hooks/use-project-store";

/**
 * CI-3 (v0.79.8 security self-audit): the confirm-dialog body for deleting a
 * project the loader could not load.
 *
 * A CLOUD delete removes the document for EVERY member, permanently — a far
 * larger blast radius than clearing a local copy — so the wording says so. A
 * future-version project is not damaged (just newer than this build), so its
 * wording says that before the owner removes it for everyone.
 */
export function describeUnloadableDelete(
  error: Pick<LoadError, "source" | "type">,
): string {
  if (error.source === "cloud" && error.type === "future_version") {
    return "This project was created with a newer version of the app — it isn't damaged, just unreadable here. Deleting it permanently removes it from the cloud for everyone it's shared with. This cannot be undone — use Export first if you want a copy.";
  }
  if (error.source === "cloud") {
    return "Deleting this permanently removes the project from the cloud for everyone it's shared with. This cannot be undone — use Export first if you want a copy to recover from.";
  }
  return "The unreadable project data is removed from this browser. This cannot be undone — use Export first if you want a copy to recover from.";
}
