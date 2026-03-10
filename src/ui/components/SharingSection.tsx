// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import {
  getProjectMembers,
  shareProject,
  removeProjectMember,
  updateMemberRole,
} from "@infrastructure/firebase/firestore-sharing";
import type { ProjectMember } from "@infrastructure/firebase/firestore-sharing";


interface SharingSectionProps {
  projectId: string;
}

export function SharingSection({ projectId }: SharingSectionProps) {
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

  // Only render in cloud mode for authenticated users
  if (mode !== "cloud" || !user) return null;

  // Check if current user is the owner
  const isOwner = members.some(
    (m) => m.uid === user.uid && m.role === "owner"
  );

  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getProjectMembers(projectId);
      setMembers(result);
    } catch (e) {
      console.error("Failed to load members:", e);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!collapsed) {
      loadMembers();
    }
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
      const result = await removeProjectMember(
        user.uid,
        projectId,
        targetUid
      );
      if (result.success) {
        await loadMembers();
      } else {
        setError(result.error ?? "Failed to remove member.");
      }
    },
    [user, projectId, loadMembers]
  );

  const handleRoleChange = useCallback(
    async (targetUid: string, newRole: "editor" | "viewer") => {
      if (!user) return;
      const result = await updateMemberRole(
        user.uid,
        projectId,
        targetUid,
        newRole
      );
      if (result.success) {
        await loadMembers();
      } else {
        setError(result.error ?? "Failed to update role.");
      }
    },
    [user, projectId, loadMembers]
  );

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
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {!collapsed && (
        <div className="px-6 pb-6 space-y-4">
          {loading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Loading members...
            </p>
          ) : (
            <>
              {/* Members list */}
              <div className="space-y-2">
                {members.map((member) => (
                  <div
                    key={member.uid}
                    className="flex items-center justify-between gap-3 py-2 border-b border-gray-100 dark:border-gray-700 last:border-0"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                        {member.displayName || member.email || member.uid}
                        {member.uid === user?.uid && (
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
                      {member.role === "owner" ? (
                        <span className="text-xs font-medium text-blue-600 dark:text-blue-400 px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 rounded">
                          Owner
                        </span>
                      ) : isOwner ? (
                        <>
                          <select
                            value={member.role}
                            onChange={(e) =>
                              handleRoleChange(
                                member.uid,
                                e.target.value as "editor" | "viewer"
                              )
                            }
                            className="text-xs border border-gray-300 dark:border-gray-600 rounded px-1.5 py-0.5 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300"
                          >
                            <option value="editor">Editor</option>
                            <option value="viewer">Viewer</option>
                          </select>
                          <button
                            onClick={() => handleRemove(member.uid)}
                            className="text-xs text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                            title="Remove member"
                          >
                            Remove
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-gray-500 dark:text-gray-400 capitalize">
                          {member.role}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Add member form (owner only) */}
              {isOwner && (
                <div className="border-t border-gray-100 dark:border-gray-700 pt-4">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Add member
                  </h3>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email address"
                      className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md text-sm focus:border-blue-400 focus:outline-none bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleShare();
                      }}
                    />
                    <select
                      value={role}
                      onChange={(e) =>
                        setRole(e.target.value as "editor" | "viewer")
                      }
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
                    The user must have signed in to SPERT Scheduler at least
                    once.
                  </p>
                </div>
              )}

              {/* Feedback messages */}
              {error && (
                <p className="text-sm text-red-600 dark:text-red-400">
                  {error}
                </p>
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
