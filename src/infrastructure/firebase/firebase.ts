// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { initializeApp, getApps } from "firebase/app";
import { initializeFirestore, memoryLocalCache } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import type { FirebaseApp } from "firebase/app";
import type { Firestore } from "firebase/firestore";
import type { Auth } from "firebase/auth";
import type { HttpsCallable } from "firebase/functions";
import type {
  ClaimPendingInvitationsResult,
  ResendInviteInput,
  ResendInviteResult,
  RevokeInviteInput,
  RevokeInviteResult,
  SendInvitationEmailInput,
  SendInvitationEmailResult,
} from "./invitation-types";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

/**
 * Firebase is only initialized when config is present.
 * When env vars are missing, the app operates in local-only mode.
 */
const isFirebaseConfigured = Boolean(firebaseConfig.apiKey);

let app: FirebaseApp | null = null;
if (isFirebaseConfigured) {
  app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0]!;
}

// memoryLocalCache avoids stale security rule decisions that persist in IndexedDB
// and cause "Missing or insufficient permissions" errors after rules change.
export const db: Firestore | null = app
  ? initializeFirestore(app, { localCache: memoryLocalCache() })
  : null;

export const auth: Auth | null = app ? getAuth(app) : null;

/** True when Firebase SDK is initialized and available. */
export const isFirebaseAvailable = isFirebaseConfigured && app !== null;

// ---------------------------------------------------------------------------
// Cloud Functions callable factories (bulk-sharing invitation system).
//
// Each factory returns a typed `HttpsCallable<Input, Result>` when Firebase is
// configured, or `null` in local-only mode. Call sites must null-check before
// invoking — see `src/infrastructure/firebase/firestore-driver.ts` and
// `src/ui/components/SharingSection.tsx` for usage patterns.
//
// Region pinned to us-central1 to match the spert-suite Cloud Functions repo.
// ---------------------------------------------------------------------------

const functions = app ? getFunctions(app, "us-central1") : null;

export function getSendInvitationEmail(): HttpsCallable<
  SendInvitationEmailInput,
  SendInvitationEmailResult
> | null {
  return functions ? httpsCallable(functions, "sendInvitationEmail") : null;
}

export function getClaimPendingInvitations(): HttpsCallable<
  Record<string, never>,
  ClaimPendingInvitationsResult
> | null {
  return functions ? httpsCallable(functions, "claimPendingInvitations") : null;
}

export function getRevokeInvite(): HttpsCallable<
  RevokeInviteInput,
  RevokeInviteResult
> | null {
  return functions ? httpsCallable(functions, "revokeInvite") : null;
}

export function getResendInvite(): HttpsCallable<
  ResendInviteInput,
  ResendInviteResult
> | null {
  return functions ? httpsCallable(functions, "resendInvite") : null;
}

/**
 * AI Connectivity: server-side session teardown (best-effort). Deletes the
 * shared anonymous-session doc + its subcollections when a pairing ends. If it
 * fails, the session's `expiresAt` TTL cleans up within 7 days.
 */
export function getTeardownAiSession(): HttpsCallable<
  { sessionId: string },
  { success?: boolean }
> | null {
  return functions ? httpsCallable(functions, "teardownAiSession") : null;
}
