// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Pure helpers for the bulk-invitation UI: tokenizing pasted email lists and
 * mapping `functions/*` error codes to user-facing messages.
 */

// Atomic groups via possessive `[^\s@]+?` would be ideal but JS regex doesn't
// support them; instead we cap each segment to a sane length so a malicious
// input can't trigger super-linear backtracking.
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{1,63}$/;

/**
 * Splits a raw textarea string into deduplicated, lowercased valid and invalid
 * email tokens. Tokens may be separated by whitespace, commas, semicolons, or
 * newlines. Caller decides how to surface the `invalid` list — typically as
 * "skipped: invalid format" chips.
 */
export function parseBulkEmails(raw: string): { valid: string[]; invalid: string[] } {
  // \s already covers \n; comma + semicolon are the only non-whitespace separators.
  const tokens = raw
    .split(/[\s,;]+/)
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const token of tokens) {
    if (seen.has(token)) continue;
    seen.add(token);
    if (EMAIL_RE.test(token)) valid.push(token);
    else invalid.push(token);
  }
  return { valid, invalid };
}

/**
 * Maps Cloud Function error codes to canonical user-facing strings. The same
 * `resource-exhausted` code carries different meanings depending on whether
 * we were sending a fresh invite (daily cap) or resending an existing one
 * (per-invite cap of 5×) — so the context matters.
 */
export function mapInvitationError(
  err: unknown,
  context: "send" | "resend" | "revoke"
): string {
  // Defensive: a thrown null/undefined would crash the property access otherwise.
  const code =
    (err && typeof err === "object" && "code" in err
      ? (err as { code?: unknown }).code
      : undefined) ?? "unknown";
  if (code === "functions/resource-exhausted") {
    return context === "send"
      ? "Daily invitation limit reached. Try again tomorrow."
      : "Resend limit reached for this invitation.";
  }
  if (code === "functions/unauthenticated") {
    return "Please sign in to manage invitations.";
  }
  if (code === "functions/permission-denied") {
    return "Only the project owner can manage invitations.";
  }
  return "Something went wrong. Please try again.";
}
