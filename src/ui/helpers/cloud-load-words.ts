// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * WI-113 — the words for what the app shows while, or after, it loads a signed-in user's projects from cloud storage
 * (owner rulings, 2026-10-16 and 2026-10-17): the Dashboard's line while a load is pending, which a project's page shows
 * too; the Dashboard's line when a load fails; and the project page's own lines. Kept apart from `cloud-create-gate`,
 * which holds the create controls' words, so that each page imports only what it shows.
 */

/**
 * The Dashboard's line while a cloud load is pending and its list is empty — and a project's page, its project not in
 * the list, says the same, in place of both of its lines. One string for both, so that they cannot drift.
 */
export const CLOUD_LOADING_LINE = "Loading your projects from cloud storage…";

/** The Dashboard's line from a failed cloud load of the session until a later re-fetch answers, or the session ends. */
export const CLOUD_LOAD_FAILED_LINE =
  "Scheduler couldn’t finish loading from cloud storage, so some projects may be missing here. Reload the page to try again.";

/**
 * The project page, its project not in the list, while the Dashboard would show the line above — a failed load of the
 * session, none pending — in place of both of its lines.
 */
export const PROJECT_LOAD_FAILED_LINE =
  "Scheduler couldn’t finish loading from cloud storage, so this project may be missing here. Reload the page to try again.";

/** The project page's second line, its project not in the list while no one is signed in. */
export const PROJECT_SIGNED_OUT_LINE =
  "It isn’t among the projects this browser can open without signing in. If it’s in cloud storage, sign in to cloud storage with the account that has it.";
