// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-112 (v0.76.10) — the words and the screen-reader wiring for the controls that create a project,
 * greyed out while the first cloud load runs (`useCloudCreateBlocked`). Kept apart from that hook so a
 * section that only shows them does not import the store.
 *
 * ⚠️ None of them promises anything about time: the load can be slow, or end in failure — and when it
 * fails the controls come back too, so "until … ends" is true in both cases, where "until your
 * projects have loaded" would not be. And none says "your projects": once the projects arrive the
 * user's settings are still loading, and the controls are still greyed.
 */

/** The Dashboard's line under its greyed-out buttons. */
export const CLOUD_CREATE_CONTROLS_NOTE =
  "New Project, Load Sample and Clone are unavailable until loading from cloud storage ends.";

/** The New Project window's line, when the window was opened before the load began. */
export const CLOUD_CREATE_WAIT_NOTE = "A new project can’t be created until loading from cloud storage ends.";

/**
 * Settings' Import Activities' line, under its greyed-out button — for EVERY project it can import
 * into, a new one or one already on the list (owner, R467): an import into a project already on the
 * list was not sent to the cloud then either, and the load could undo it (review 25).
 */
export const CLOUD_IMPORT_WAIT_NOTE = "Activities can’t be imported until loading from cloud storage ends.";

/**
 * The toast when Load Sample's build lands while the first cloud load runs, and nothing is added. A
 * toast and not the note: the user may have left the Dashboard, and the note, by then.
 */
export const SAMPLE_NOT_ADDED_MESSAGE =
  "The sample wasn’t added because loading from cloud storage hadn’t ended. Press Load Sample again when it has.";

/**
 * `aria-describedby` naming the reason while a control is unavailable, nothing otherwise — so a
 * screen reader hears why a greyed-out button does nothing. Spread it, as ActivityEditModal's
 * `saveBlockedAria` is, which keeps the condition out of the component.
 */
export function describedByWhile(unavailable: boolean, reasonId: string): { "aria-describedby"?: string } {
  return unavailable ? { "aria-describedby": reasonId } : {};
}
