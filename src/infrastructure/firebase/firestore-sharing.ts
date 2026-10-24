// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Project sharing operations for Firestore.
 * Manages owner/editor/viewer roles and user profile lookup.
 */

import {
  doc,
  getDoc,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ProjectRole } from "./firestore-driver";

const PROJECTS_COL = "spertscheduler_projects";
const PROFILES_COL = "spertscheduler_profiles";
// Cross-app profile mirror. Written by AuthProvider alongside PROFILES_COL on
// every sign-in, so it carries the same displayName/email shape. Read only as a
// fallback — see getProjectMembers.
const SUITE_PROFILES_COL = "spertsuite_profiles";

export interface ProjectMember {
  uid: string;
  role: ProjectRole;
  email?: string;
  displayName?: string;
}

/**
 * Get all members of a project with their profile info.
 */
export async function getProjectMembers(
  projectId: string
): Promise<ProjectMember[]> {
  if (!db) return [];

  const ref = doc(db, PROJECTS_COL, projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];

  const data = snap.data();
  const members = data.members as Record<string, ProjectRole> | undefined;
  if (!members) return [];

  const result: ProjectMember[] = [];
  for (const [uid, role] of Object.entries(members)) {
    let email: string | undefined;
    let displayName: string | undefined;
    try {
      let profileSnap = await getDoc(doc(db, PROFILES_COL, uid));
      if (!profileSnap.exists()) {
        // Fall back to the suite-wide mirror. The cross-app invitation Cloud
        // Function resolves an invitee BY their spertsuite_profiles doc and
        // then writes only members.{uid} — it never seeds a per-app profile.
        // So a member who has used another SPERT app but never signed into
        // Scheduler has no PROFILES_COL doc, and the row would otherwise
        // render a raw Auth UID.
        profileSnap = await getDoc(doc(db, SUITE_PROFILES_COL, uid));
      }
      if (profileSnap.exists()) {
        const profile = profileSnap.data();
        email = profile.email;
        displayName = profile.displayName;
      }
    } catch {
      // Profile lookup failure is non-fatal
    }
    result.push({ uid, role, email, displayName });
  }

  return result;
}

/**
 * Update a member's role on a project.
 * Only the project owner can update roles. Uses a Firestore transaction
 * to ensure atomic read-verify-write.
 */
export async function updateMemberRole(
  currentUid: string,
  projectId: string,
  targetUid: string,
  newRole: "editor" | "viewer"
): Promise<{ success: boolean; error?: string }> {
  if (!db) return { success: false, error: "Unable to share. Verify the email and try again." };

  const ref = doc(db, PROJECTS_COL, projectId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("Project not found.");

      const data = snap.data();
      if (data.owner !== currentUid) {
        throw new Error("Only the project owner can change roles.");
      }

      if (data.owner === targetUid) {
        throw new Error("Cannot change the owner's role.");
      }

      transaction.update(ref, {
        [`members.${targetUid}`]: newRole,
      });
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Role update failed.",
    };
  }
}
