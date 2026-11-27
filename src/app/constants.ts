// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

export const APP_VERSION = "0.89.0";
export const APP_NAME = "SPERT Scheduler";
/** The brand row's tagline (FRAME26, William's wording, 2026-11-23). */
export const APP_TAGLINE = "Probabilistic project scheduling with Monte Carlo simulation";

/**
 * SessionStorage key set when an ?invite= URL is processed.
 * Read in both AuthProvider (toast gate) and useInvitationLanding (Effect 3 gate).
 * Single source — import from here, never hardcode the string elsewhere.
 */
export const INVITE_SESSION_KEY = "spert:scheduler:invite-token";
