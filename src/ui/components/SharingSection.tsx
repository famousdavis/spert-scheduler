// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useCallback, useId } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { getCloudSyncDriver } from "@ui/hooks/use-cloud-sync";
import { getFirstName } from "@ui/helpers/format-user";
import {
  getProjectMembers,
  shareProject,
  updateMemberRole,
} from "@infrastructure/firebase/firestore-sharing";
import type { ProjectMember } from "@infrastructure/firebase/firestore-sharing";
import { getSendInvitationEmail } from "@infrastructure/firebase/firebase";
import type {
  PendingInvite,
  SendInvitationEmailResult,
} from "@infrastructure/firebase/invitation-types";
import {
  parseBulkEmails,
  mapInvitationError,
} from "@ui/helpers/invitation-utils";
import { INVITATIONS_ENABLED } from "@app/featureFlags";
import { ConfirmDialog } from "./ConfirmDialog";

interface SharingSectionProps {
  projectId: string;
}

/**
 * Trailing controls for a member row — owner badge, role select + remove
 * button (when caller is owner), or read-only role text. Extracted to keep
 * the calling JSX flat (no nested ternaries).
 */
function MemberRowControls({
  member,
  callerIsOwner,
  onRoleChange,
  onRemove,
}: {
  member: ProjectMember;
  callerIsOwner: boolean;
  onRoleChange: (uid: string, role: "editor" | "viewer") => void;
  onRemove: (uid: string) => void;
}) {
  if (member.role === "owner") {
    return (
      <span className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded">
        Owner
      </span>
    );
  }
  if (callerIsOwner) {
    return (
      <>
        <select
          name="memberRole"
          aria-label={`Role for ${member.email ?? member.uid}`}
          value={member.role}
          onChange={(e) =>
            onRoleChange(member.uid, e.target.value as "editor" | "viewer")
          }
          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
        >
          <option value="editor">Editor</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          onClick={() => onRemove(member.uid)}
          aria-label={`Remove ${member.email ?? member.uid}`}
          className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
          title="Remove member"
        >
          Remove
        </button>
      </>
    );
  }
  return (
    <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
      {member.role}
    </span>
  );
}

/**
 * Sharing section dispatcher — picks the legacy single-input variant or the
 * v0.42.0 bulk-invitation variant based on the `INVITATIONS_ENABLED` flag.
 *
 * The Legacy variant is retained as the rollback safety net per Lesson 23. It
 * stays in tree until v0.43.x once the bulk-sharing path has shipped stably.
 */
export function SharingSection({ projectId }: SharingSectionProps) {
  if (INVITATIONS_ENABLED) return <BulkSharingSection projectId={projectId} />;
  return <LegacySharingSection projectId={projectId} />;
}

// ────────────────────────────────────────────────────────────────────────
// LegacySharingSection (flag-off) — single-input share, byte-equivalent to
// the pre-v0.42.0 component except that member removal now routes through
// `FirestoreDriver.removeCollaborator` (throws-on-error) instead of the
// deleted `removeProjectMember` helper (returned `{success, error}`).
// ────────────────────────────────────────────────────────────────────────

function LegacySharingSection({ projectId }: SharingSectionProps) {
  const { user } = useAuth();
  const { mode } = useStorage();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const [collapsed, setCollapsed] = useState(true);

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      setMembers(await getProjectMembers(projectId));
    } catch (e) {
      console.error("Failed to load members:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!collapsed) loadMembers();
  }, [collapsed, loadMembers]);

  const handleShare = useCallback(async () => {
    if (!email.trim() || !user) return;
    setSharing(true);
    setError(null);
    setSuccess(null);
    const result = await shareProject(user.uid, projectId, email.trim(), role);
    if (result.success) {
      setSuccess(`Shared with ${email.trim()} as ${role}.`);
      setEmail("");
      await loadMembers();
    } else {
      setError(result.error ?? "Failed to share.");
    }
    setSharing(false);
  }, [email, role, user, projectId, loadMembers]);

  const handleRemove = useCallback(
    async (targetUid: string) => {
      if (!user) return;
      const driver = getCloudSyncDriver();
      try {
        await driver?.removeCollaborator(projectId, targetUid);
        await loadMembers();
      } catch (err) {
        // removeCollaborator is Firestore-direct (not a CF callable) — surface
        // the message verbatim. The three guards in removeCollaborator throw
        // user-meaningful Errors ("Cannot remove yourself…" etc.).
        setError(err instanceof Error ? err.message : "Failed to remove member.");
      }
    },
    [user, projectId, loadMembers]
  );

  const handleRoleChange = useCallback(
    async (targetUid: string, newRole: "editor" | "viewer") => {
      if (!user) return;
      const result = await updateMemberRole(user.uid, projectId, targetUid, newRole);
      if (result.success) {
        await loadMembers();
      } else {
        setError(result.error ?? "Failed to update role.");
      }
    },
    [user, projectId, loadMembers]
  );

  if (mode !== "cloud" || !user) return null;

  const isOwner = members.some((m) => m.uid === user.uid && m.role === "owner");

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
          Sharing
        </h2>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${
            collapsed ? "" : "rotate-180"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-6 pb-6 space-y-4 max-w-3xl">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading members...
            </p>
          ) : (
            <>
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.uid}
                    className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {getFirstName(member.displayName, member.email) || member.uid}
                        {member.uid === user.uid && (
                          <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                            (you)
                          </span>
                        )}
                      </p>
                      {member.email && member.displayName && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {member.email}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <MemberRowControls
                        member={member}
                        callerIsOwner={isOwner}
                        onRoleChange={handleRoleChange}
                        onRemove={handleRemove}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {isOwner && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Add member
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      name="inviteEmail"
                      aria-label="Invite member email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      autoComplete="off"
                      className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleShare();
                      }}
                    />
                    <select
                      name="inviteRole"
                      aria-label="Invite member role"
                      value={role}
                      onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                      className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                    <button
                      onClick={handleShare}
                      disabled={!email.trim() || sharing}
                      className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {sharing ? "Sharing..." : "Share"}
                    </button>
                  </div>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    The user must have signed in to SPERT Scheduler at least once.
                  </p>
                </div>
              )}

              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              )}
              {success && (
                <p className="text-sm text-green-600 dark:text-green-400">
                  {success}
                </p>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}

// ────────────────────────────────────────────────────────────────────────
// BulkSharingSection (flag-on) — paste-list invite + pending-invitation
// management with Resend (max 5×) and Revoke controls. Ownership derives
// synchronously from `project.owner` (Lesson 38). Wrapped in a four-state
// OwnerStatus enum (Lesson 60) so a transient members-fetch failure
// surfaces visibly instead of leaving the list looking empty.
// ────────────────────────────────────────────────────────────────────────

type OwnerStatus = "loading" | "owner" | "not-owner" | "error";

function BulkSharingSection({ projectId }: SharingSectionProps) {
  const { user } = useAuth();
  const { mode } = useStorage();
  const driver = getCloudSyncDriver();
  const textareaId = useId();
  const roleSelectId = useId();

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loadingMem, setLoadingMem] = useState(false);
  const [bulkEmails, setBulkEmails] = useState("");
  const [role, setRole] = useState<"editor" | "viewer">("editor");
  const [sending, setSending] = useState(false);
  const [inviteResult, setInviteResult] = useState<SendInvitationEmailResult | null>(null);
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  // Tracks whether the most-recent loadMembers attempt failed. Drives the
  // OwnerStatus derivation below; cleared on the next successful fetch.
  const [membersFetchError, setMembersFetchError] = useState(false);

  // Lesson 38: derive ownership synchronously from project.owner — no
  // Firestore round-trip. Lesson 60 (adapted): wrap in a four-state enum so a
  // transient members-fetch failure surfaces visibly rather than silently
  // leaving the list empty. SPERT diverges from the MSB canonical here in
  // that 'not-owner' still renders the members list (informational); only
  // the bulk-invite form is owner-gated.
  const project = useProjectStore((s) => s.projects.find((p) => p.id === projectId));
  let ownerStatus: OwnerStatus;
  if (project === undefined) {
    ownerStatus = "loading";
  } else if (membersFetchError) {
    ownerStatus = "error";
  } else if (project.owner === user?.uid) {
    ownerStatus = "owner";
  } else {
    ownerStatus = "not-owner";
  }
  const isOwner = ownerStatus === "owner";

  const loadMembers = useCallback(async () => {
    setLoadingMem(true);
    try {
      setMembers(await getProjectMembers(projectId));
      setMembersFetchError(false);
    } catch {
      // Lesson 60: surface as an OwnerStatus = "error" rather than silently
      // swallowing. The render path replaces section content with a visible
      // "couldn't load" message and prompts the user to refresh.
      setMembersFetchError(true);
    } finally {
      setLoadingMem(false);
    }
  }, [projectId]);

  const loadPendingInvites = useCallback(async () => {
    if (!driver) return;
    try {
      setPendingInvites(await driver.listPendingInvites(projectId));
    } catch (e) {
      console.error("listPendingInvites failed:", e);
    }
  }, [projectId, driver]);

  useEffect(() => {
    if (!collapsed) {
      void loadMembers();
      void loadPendingInvites();
    }
  }, [collapsed, loadMembers, loadPendingInvites]);

  if (mode !== "cloud" || !user) return null;
  // Lesson 60: project not yet hydrated in the store — render nothing rather
  // than flashing a 'not-owner' state. The next store update will re-render.
  if (ownerStatus === "loading") return null;

  const handleSend = async () => {
    const { valid, invalid } = parseBulkEmails(bulkEmails);
    if (valid.length === 0) {
      setError("No valid email addresses. Check formatting and try again.");
      return; // Lesson 42: do NOT call CF, do NOT clear textarea
    }
    setError(null);
    setSending(true);
    try {
      const callable = getSendInvitationEmail();
      if (!callable) return;
      const projectName =
        useProjectStore.getState().projects.find((p) => p.id === projectId)?.name ??
        "Untitled";
      const res = await callable({
        appId: "spertscheduler", // suite-wide callable literal (Lesson 15: hyphenless)
        modelId: projectId,
        modelName: projectName,
        emails: valid,
        role,
        isVoting: false,
      });
      setInviteResult({
        ...res.data,
        failed: [
          ...res.data.failed,
          ...invalid.map((email) => ({ email, reason: "invalid-format" })),
        ],
      });
      setBulkEmails(""); // Lesson 43: clear on success
      // Lesson 64: allSettled (not all) — a transient failure in one refresh
      // must not block the other from updating. Each callback already swallows
      // its own errors, so no extra logging needed here.
      await Promise.allSettled([loadMembers(), loadPendingInvites()]);
    } catch (err) {
      setError(mapInvitationError(err, "send"));
    } finally {
      setSending(false);
    }
  };

  const handleRoleChange = async (targetUid: string, newRole: "editor" | "viewer") => {
    const result = await updateMemberRole(user.uid, projectId, targetUid, newRole);
    if (!result.success) {
      setError(result.error ?? "Failed to update role.");
    } else {
      await loadMembers();
    }
  };

  const handleRemove = async (targetUid: string) => {
    try {
      await driver?.removeCollaborator(projectId, targetUid);
      await loadMembers();
    } catch (err) {
      // Firestore-direct call — no functions/* codes; surface message verbatim.
      setError(err instanceof Error ? err.message : "Failed to remove member.");
    }
  };

  const handleResend = async (tokenId: string) => {
    setActionBusy(tokenId);
    try {
      await driver?.resendInvite(tokenId);
      await loadPendingInvites();
    } catch (err) {
      setError(mapInvitationError(err, "resend"));
    } finally {
      setActionBusy(null);
    }
  };

  const handleRevoke = async (tokenId: string) => {
    setActionBusy(tokenId);
    try {
      await driver?.revokeInvite(tokenId);
      await loadPendingInvites();
    } catch (err) {
      setError(mapInvitationError(err, "revoke"));
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <section className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
      >
        <h2 className="text-lg font-semibold text-blue-600 dark:text-blue-400">
          Sharing
        </h2>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${
            collapsed ? "" : "rotate-180"
          }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-6 pb-6 space-y-4 max-w-3xl">
          {ownerStatus === "error" ? (
            // Lesson 60: visible error replaces section content (header stays
            // so users can collapse). Independent of the per-action `error`
            // string state below, which surfaces send/remove/etc. failures.
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400"
            >
              Couldn&rsquo;t load sharing details. Refresh the page to try again.
            </p>
          ) : (
            <>
          {/* Members list */}
          {loadingMem ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading members…
            </p>
          ) : (
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.uid}
                  className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {getFirstName(member.displayName, member.email) || member.uid}
                      {member.uid === user.uid && (
                        <span className="ml-1 text-xs text-gray-500 dark:text-gray-400">
                          (you)
                        </span>
                      )}
                    </p>
                    {member.email && (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {member.email}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <MemberRowControls
                      member={member}
                      callerIsOwner={!!isOwner}
                      onRoleChange={handleRoleChange}
                      onRemove={handleRemove}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Bulk invite form — owner only */}
          {isOwner && (
            <div className="border-t border-gray-100 dark:border-gray-700 pt-4 space-y-3">
              <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Invite by email
              </h3>
              <div>
                <label htmlFor={textareaId} className="sr-only">
                  Email addresses
                </label>
                <textarea
                  id={textareaId}
                  name="bulkEmails"
                  value={bulkEmails}
                  onChange={(e) => {
                    setBulkEmails(e.target.value);
                    if (inviteResult) setInviteResult(null);
                  }}
                  autoComplete="off"
                  placeholder="Enter email addresses, one per line or comma-separated"
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                />
              </div>
              <div className="flex gap-2">
                <label htmlFor={roleSelectId} className="sr-only">
                  Role for invited members
                </label>
                <select
                  id={roleSelectId}
                  name="inviteRole"
                  value={role}
                  onChange={(e) => setRole(e.target.value as "editor" | "viewer")}
                  className="px-2 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                >
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
                <button
                  onClick={handleSend}
                  disabled={sending || !bulkEmails.trim()}
                  className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sending ? "Sending…" : "Send invitations"}
                </button>
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Existing users are added immediately. New users receive an
                invitation email.
              </p>

              {/* Result chips */}
              {inviteResult && (
                <div className="space-y-1">
                  {inviteResult.added.map((email) => (
                    <p
                      key={email}
                      className="text-sm text-green-700 dark:text-green-400"
                    >
                      ✓ Added: {email}
                    </p>
                  ))}
                  {inviteResult.invited.map((email) => (
                    <p
                      key={email}
                      className="text-sm text-blue-700 dark:text-blue-400"
                    >
                      ✉ Invited: {email}
                    </p>
                  ))}
                  {inviteResult.failed.map((r) => (
                    <p
                      key={r.email}
                      className="text-sm text-red-600 dark:text-red-400"
                    >
                      ✗ {r.email}
                      {r.reason === "invalid-format"
                        ? " (invalid format)"
                        : `: ${r.reason}`}
                    </p>
                  ))}
                </div>
              )}

              {/* Pending invitations */}
              {pendingInvites.length > 0 && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Pending invitations
                  </h4>
                  {pendingInvites.map((invite) => (
                    <div
                      key={invite.tokenId}
                      className="flex items-center justify-between gap-2 py-1.5"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-gray-900 dark:text-gray-100 truncate">
                          {invite.inviteeEmail}
                        </span>
                        <span className="text-xs text-gray-500 ml-2 capitalize">
                          {invite.role}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-400">
                          ({invite.emailSendCount}/5)
                        </span>
                        <button
                          onClick={() => handleResend(invite.tokenId)}
                          disabled={
                            invite.emailSendCount >= 5 || actionBusy !== null
                          }
                          aria-label={`Resend invitation to ${invite.inviteeEmail}`}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Resend
                        </button>
                        <ConfirmDialog
                          trigger={
                            <button
                              type="button"
                              disabled={actionBusy !== null}
                              aria-label={`Revoke invitation to ${invite.inviteeEmail}`}
                              className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              Revoke
                            </button>
                          }
                          title="Revoke invitation?"
                          description={`${invite.inviteeEmail} will no longer be able to claim this invitation.`}
                          onConfirm={() => handleRevoke(invite.tokenId)}
                          confirmLabel="Revoke"
                          destructive
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </>
          )}
        </div>
      )}
    </section>
  );
}
