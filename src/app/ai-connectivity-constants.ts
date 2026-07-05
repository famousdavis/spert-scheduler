// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Constants for the AI Connectivity feature (mirrors SPERT Story Map's
 * `aiConstants.ts`, with Scheduler-namespaced localStorage keys so the two apps
 * never collide when served from the same origin).
 */

export const AI_CONSENT_VERSION = 1;

// localStorage keys — Scheduler-namespaced.
export const AI_SESSION_ID_KEY = "spert_scheduler_ai_session_id";
export const AI_CONSENT_KEY = "spert_scheduler_ai_consent";
export const AI_LAST_SEQ_PREFIX = "spert_scheduler_ai_last_seq:";

/**
 * Shared, cross-app anonymous AI session collection. Sessions from every SPERT
 * Suite app live here and are differentiated by the `appId` field (§2.3); the
 * shared MCP server filters on it.
 */
export const AI_SESSIONS_COL = "anonymous_sessions";

/** This app's identifier, written to the shared session doc (§2.3). */
export const SCHEDULER_APP_ID = "scheduler";
