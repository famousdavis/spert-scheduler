// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Bulk-sharing invitation types — shared across the suite.
 *
 * These types describe the shape of pending invitation documents in the
 * `spertsuite_invitations` Firestore collection and the input/output payloads
 * for the four invitation Cloud Functions (sendInvitationEmail,
 * claimPendingInvitations, revokeInvite, resendInvite).
 *
 * `appId` callable literals use `'spertscheduler'` (no hyphen) — distinct from
 * the package's `APP_ID = "spert-scheduler"` (with hyphen, used for legal
 * constants and ToS document IDs). See Lesson 15.
 */

export interface PendingInvite {
  tokenId: string;
  inviteeEmail: string;
  role: "editor" | "viewer";
  status: "pending" | "accepted" | "revoked" | "expired";
  createdAt: number;
  expiresAt: number;
  lastEmailSentAt: number;
  emailSendCount: number;
  modelId: string;
  modelName: string;
  /** Always false for Scheduler; boolean (not literal false) for suite compat. */
  isVoting: boolean;
}

export type InvitationStatus = PendingInvite["status"];

export interface SpertModelsChangedDetail {
  claimed: { appId: string; modelId: string; modelName: string }[];
}

export interface SendInvitationEmailInput {
  appId: "spertscheduler";
  modelId: string;
  modelName: string;
  emails: string[];
  role: "editor" | "viewer";
  isVoting: false;
}

export interface SendInvitationEmailResult {
  // CF (spert-landing-page functions/src/sendInvitationEmail.tsx:SendResponse)
  // returns plain string arrays for added/invited; only failed carries an object
  // shape with reason codes. Named by SYMBOL, not line: the target is in another
  // repository on its own release cycle, so nothing here can verify a line number
  // and it does not stay correct. The previous citation, :42-46, had drifted onto
  // SendRequest — the CF's INPUT type — while describing its result.
  added: string[];
  invited: string[];
  failed: { email: string; reason: string }[];
}

export interface ClaimPendingInvitationsResult {
  claimed: { appId: string; modelId: string; modelName: string }[];
}

export interface RevokeInviteInput {
  tokenId: string;
}
export interface RevokeInviteResult {
  success: boolean;
}

export interface ResendInviteInput {
  tokenId: string;
}
export interface ResendInviteResult {
  success: boolean;
}
