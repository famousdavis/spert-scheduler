// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Project sharing operations for Firestore.
 * Manages owner/editor/viewer roles and user profile lookup.
 */

import {
  doc,
  getDoc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "./firebase";
import type { ProjectRole } from "./firestore-driver";

const PROJECTS_COL = "spertscheduler_projects";
const PROFILES_COL = "spertscheduler_profiles";

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
}

export interface ProjectMember {
  uid: string;
  role: ProjectRole;
  email?: string;
  displayName?: string;
}

/**
 * Create or update user profile on sign-in.
 * Email is normalized to lowercase to ensure consistent lookup.
 */
export async function upsertUserProfile(
  uid: string,
  displayName: string,
  email: string
): Promise<void> {
  if (!db) return;
  await setDoc(
    doc(db, PROFILES_COL, uid),
    {
      displayName,
      email: email.toLowerCase().trim(),
      lastLogin: serverTimestamp(),
    },
    { merge: true }
  );
}

/**
 * Look up a user by email address.
 * Returns null if no user found with that email.
 */
export async function findUserByEmail(
  email: string
): Promise<UserProfile | null> {
  if (!db) return null;

  const q = query(
    collection(db, PROFILES_COL),
    where("email", "==", email.toLowerCase().trim())
  );
  const snap = await getDocs(q);
  if (snap.empty) return null;

  const docSnap = snap.docs[0]!;
  const data = docSnap.data();
  return {
    uid: docSnap.id,
    displayName: data.displayName ?? "",
    email: data.email ?? "",
  };
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
      const profileSnap = await getDoc(doc(db, PROFILES_COL, uid));
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
 * Share a project with another user.
 * Only the project owner can share. Uses a Firestore transaction
 * to ensure atomic read-verify-write.
 */
export async function shareProject(
  currentUid: string,
  projectId: string,
  targetEmail: string,
  role: "editor" | "viewer"
): Promise<{ success: boolean; error?: string }> {
  if (!db) return { success: false, error: "Unable to share. Verify the email and try again." };

  // Look up target user
  const targetUser = await findUserByEmail(targetEmail);
  if (!targetUser) {
    return {
      success: false,
      error: "Unable to share. Verify the email and try again.",
    };
  }

  if (targetUser.uid === currentUid) {
    return { success: false, error: "Cannot share with yourself." };
  }

  const ref = doc(db, PROJECTS_COL, projectId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("Project not found.");

      const data = snap.data();
      if (data.owner !== currentUid) {
        throw new Error("Only the project owner can share.");
      }

      transaction.update(ref, {
        [`members.${targetUser.uid}`]: role,
      });
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Share failed.",
    };
  }
}

/**
 * Remove a member from a project.
 * Only the project owner can remove members. Uses a Firestore transaction
 * to ensure atomic read-verify-write.
 */
export async function removeProjectMember(
  currentUid: string,
  projectId: string,
  targetUid: string
): Promise<{ success: boolean; error?: string }> {
  if (!db) return { success: false, error: "Unable to share. Verify the email and try again." };

  if (targetUid === currentUid) {
    return { success: false, error: "Cannot remove yourself." };
  }

  const ref = doc(db, PROJECTS_COL, projectId);

  try {
    await runTransaction(db, async (transaction) => {
      const snap = await transaction.get(ref);
      if (!snap.exists()) throw new Error("Project not found.");

      const data = snap.data();
      if (data.owner !== currentUid) {
        throw new Error("Only the project owner can remove members.");
      }

      if (data.owner === targetUid) {
        throw new Error("Cannot remove the project owner.");
      }

      // Rebuild the members map without the target user
      const members = { ...(data.members as Record<string, ProjectRole>) };
      delete members[targetUid];

      transaction.update(ref, { members });
    });
    return { success: true };
  } catch (e) {
    return {
      success: false,
      error: e instanceof Error ? e.message : "Remove failed.",
    };
  }
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
