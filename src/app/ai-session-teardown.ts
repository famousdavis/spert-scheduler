// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { doc, deleteDoc } from "firebase/firestore";
import { db, getTeardownAiSession } from "@infrastructure/firebase/firebase";
import {
  AI_SESSIONS_COL,
  AI_SESSION_ID_KEY,
  AI_TEARDOWN_PENDING_KEY,
  clearAiConnectivityKeys,
} from "@app/ai-connectivity-constants";

/**
 * End a Connect AI session at sign-out, OUTSIDE React (mirrors SPERT Story Map's
 * `aiSessionTeardown.ts`).
 *
 * `use-ai-connectivity`'s `stopSession` already does this, but that hook is
 * mounted only on the project page. Sign-out is driven from StorageProvider
 * (the registered sign-out cleanup, which runs for the explicit sign-out AND the
 * `onAuthStateChanged(null)` path; and the WI-113 change-of-user path), where the
 * hook is not available. So the teardown lives here as a plain module function
 * that reads the session id from localStorage, and those call sites invoke it in
 * place of the local-only `clearAiConnectivityKeys`.
 *
 * It mirrors `stopSession` → `teardown`: a LOCAL teardown (forget the session in
 * this browser — AI-2 shared-browser protection, kept whether or not the server
 * call succeeds) plus the server `teardownAiSession` Cloud Function (delete the
 * relay session + its snapshot). Idempotent: with no stored session id it is a
 * no-op that leaves any parked failure marker ALONE.
 *
 * Connect AI relay sessions are anonymous and browser-scoped; they do not need a
 * signed-in account. Sign-out is one trigger that should end a session — it does
 * not touch sign-in, cloud sync, or cloud-project access.
 */

/** Bound the server call so a flaky network cannot hang sign-out. */
const TEARDOWN_TIMEOUT_MS = 10_000;

export interface AiSignOutTeardownResult {
  /** True when a stored session id was found and a server teardown was tried. */
  attempted: boolean;
  /**
   * True when the session is fully ended as far as this browser can tell:
   * either there was nothing to end, or the server call succeeded. False means
   * the relay session may still be live until its 7-day TTL — a retry is parked.
   */
  serverOk: boolean;
}

/**
 * Same-tab signal that the pending marker changed. AiTeardownBanner is mounted
 * once, app-wide, so it cannot learn of a set/clear from a `storage` event
 * (those fire only in OTHER tabs). This custom event lets it re-read.
 */
export const AI_TEARDOWN_CHANGED_EVENT = "spert:scheduler-ai-teardown-changed";

function notifyTeardownChanged(): void {
  try {
    window.dispatchEvent(new CustomEvent(AI_TEARDOWN_CHANGED_EVENT));
  } catch {
    // no window (non-DOM env)
  }
}

/** The session id parked for a later teardown retry, or null. */
export function getPendingAiTeardownSessionId(): string | null {
  try {
    return localStorage.getItem(AI_TEARDOWN_PENDING_KEY);
  } catch {
    return null;
  }
}

function setPendingAiTeardown(sessionId: string): void {
  try {
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, sessionId);
  } catch {
    // no localStorage
  }
  notifyTeardownChanged();
}

export function clearPendingAiTeardown(): void {
  let had = false;
  try {
    had = localStorage.getItem(AI_TEARDOWN_PENDING_KEY) !== null;
    localStorage.removeItem(AI_TEARDOWN_PENDING_KEY);
  } catch {
    // no localStorage
  }
  if (had) notifyTeardownChanged();
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = setTimeout(() => reject(new Error("teardown-timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(id);
        resolve(v);
      },
      (e) => {
        clearTimeout(id);
        reject(e);
      }
    );
  });
}

/**
 * The authoritative server-side revocation: delete the Read-mode snapshot and
 * call the `teardownAiSession` Cloud Function (which deletes the ops, snapshot
 * and session doc). Returns true only when the Cloud Function succeeded — after
 * that every MCP tool rejects the session id with `session_not_found`.
 *
 * @param {string} sessionId The anonymous session id to tear down.
 * @return {Promise<boolean>} True on a confirmed server teardown.
 */
async function runServerTeardown(sessionId: string): Promise<boolean> {
  const database = db;
  const callable = getTeardownAiSession();
  if (!database || !callable) return false;
  // Offline: fail fast and deterministically; the caller parks the marker so it
  // is retried on the next load / when back online.
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  try {
    // Bound the WHOLE server teardown, not just the callable. A Firestore write
    // does not resolve while the backend is unreachable, and navigator.onLine
    // can be true when it still is (captive portal, dropped VPN, proxy). Left
    // unbounded, the snapshot delete would hang sign-out forever.
    await withTimeout(
      (async () => {
        try {
          await deleteDoc(doc(database, AI_SESSIONS_COL, sessionId, "snapshot", "current"));
        } catch {
          // non-fatal — the Cloud Function removes the snapshot as well
        }
        await callable({ sessionId });
      })(),
      TEARDOWN_TIMEOUT_MS
    );
    return true;
  } catch (err) {
    console.error(
      "[AI] Sign-out could not reach the server to end the AI session; it may " +
        "stay live until it TTL-expires in 7 days unless retried:",
      err
    );
    return false;
  }
}

/**
 * End the Connect AI session as part of sign-out. Always clears the local
 * session keys (AI-2); when a session id was stored, also deletes the server
 * relay session. On a server failure the session id is parked for retry and the
 * result reports `serverOk: false` so the UI can tell the user.
 *
 * @return {Promise<AiSignOutTeardownResult>} What happened.
 */
export async function endAiSessionForSignOut(): Promise<AiSignOutTeardownResult> {
  let sessionId: string | null = null;
  try {
    sessionId = localStorage.getItem(AI_SESSION_ID_KEY);
  } catch {
    // no localStorage
  }

  // Local teardown ALWAYS (keeps clearAiConnectivityKeys' shared-browser
  // protection), whether or not the server call succeeds.
  clearAiConnectivityKeys();

  // Nothing stored, or no Firebase (so no relay session could have been
  // created): nothing to revoke. Leave any parked marker ALONE — a failed
  // teardown parks the marker and then clears the session id (above), so this
  // same function running again with no session id (the registered cleanup
  // after firebaseSignOut fires onAuthStateChanged(null), or another tab, which
  // shares localStorage) must not erase the warning it just set.
  if (!sessionId || !db || !getTeardownAiSession()) {
    return { attempted: false, serverOk: true };
  }

  const serverOk = await runServerTeardown(sessionId);
  if (serverOk) {
    // Clear only a marker that belongs to the session we actually ended.
    if (getPendingAiTeardownSessionId() === sessionId) clearPendingAiTeardown();
  } else {
    setPendingAiTeardown(sessionId);
  }
  return { attempted: true, serverOk };
}

/**
 * Retry a parked teardown (next load, or when the browser is back online).
 *
 * @return {Promise<boolean>} True when nothing is left pending.
 */
export async function retryPendingAiTeardown(): Promise<boolean> {
  const sessionId = getPendingAiTeardownSessionId();
  if (!sessionId) return true;
  if (!db || !getTeardownAiSession()) return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;
  const ok = await runServerTeardown(sessionId);
  if (ok) clearPendingAiTeardown();
  return ok;
}
