// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/** Current version of the Terms of Service document. */
export const TOS_VERSION = "03-31-2026";

/** Current version of the Privacy Policy document. */
export const PRIVACY_POLICY_VERSION = "03-31-2026";

/** Canonical URL for the Terms of Service PDF. */
export const TOS_URL = "https://spertsuite.com/TOS.pdf";

/** Canonical URL for the Privacy Policy PDF. */
export const PRIVACY_URL = "https://spertsuite.com/PRIVACY.pdf";

/** Canonical URL for the project LICENSE file on GitHub. */
export const LICENSE_URL = "https://github.com/famousdavis/spert-scheduler/blob/main/LICENSE";

/** App identifier written to Firestore ToS acceptance records. */
export const APP_ID = "spert-scheduler";

// ── localStorage keys ──

/** Whether the first-run informational banner has been dismissed. */
export const LS_FIRST_RUN_SEEN = "spert_firstRun_seen";

/** Cached ToS version the user has accepted (localStorage-only check at sign-in time). */
export const LS_TOS_ACCEPTED_VERSION = "spert_tos_accepted_version";

/** Flag set before Firebase Auth fires; signals onAuthStateChanged to write acceptance record. */
export const LS_TOS_WRITE_PENDING = "spert_tos_write_pending";
