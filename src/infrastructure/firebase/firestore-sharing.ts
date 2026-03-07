/**
 * Project sharing operations for Firestore.
 * Manages owner/editor/viewer roles and user profile lookup.
 */

import {
  doc,
  getDoc,
  updateDoc,
  setDoc,
  getDocs,
  collection,
  query,
  where,
  serverTimestamp,
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
      email,
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
 * Only the project owner can share.
 */
export async function shareProject(
  currentUid: string,
  projectId: string,
  targetEmail: string,
  role: "editor" | "viewer"
): Promise<{ success: boolean; error?: string }> {
  if (!db) return { success: false, error: "Firestore not available" };

  // Look up target user
  const targetUser = await findUserByEmail(targetEmail);
  if (!targetUser) {
    return {
      success: false,
      error: "No user found with that email. They must sign in at least once.",
    };
  }

  if (targetUser.uid === currentUid) {
    return { success: false, error: "Cannot share with yourself." };
  }

  // Verify current user is owner
  const ref = doc(db, PROJECTS_COL, projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { success: false, error: "Project not found." };
  }

  const data = snap.data();
  if (data.owner !== currentUid) {
    return { success: false, error: "Only the project owner can share." };
  }

  // Add member
  await updateDoc(ref, {
    [`members.${targetUser.uid}`]: role,
  });

  return { success: true };
}

/**
 * Remove a member from a project.
 * Only the project owner can remove members.
 */
export async function removeProjectMember(
  currentUid: string,
  projectId: string,
  targetUid: string
): Promise<{ success: boolean; error?: string }> {
  if (!db) return { success: false, error: "Firestore not available" };

  if (targetUid === currentUid) {
    return { success: false, error: "Cannot remove yourself." };
  }

  // Verify current user is owner
  const ref = doc(db, PROJECTS_COL, projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { success: false, error: "Project not found." };
  }

  const data = snap.data();
  if (data.owner !== currentUid) {
    return { success: false, error: "Only the project owner can remove members." };
  }

  if (data.owner === targetUid) {
    return { success: false, error: "Cannot remove the project owner." };
  }

  // Remove using updateDoc with FieldValue.delete()
  // Firestore doesn't support deleting nested map keys directly with updateDoc,
  // so we rebuild the members map without the target user.
  const members = { ...(data.members as Record<string, ProjectRole>) };
  delete members[targetUid];
  await updateDoc(ref, { members });

  return { success: true };
}

/**
 * Update a member's role on a project.
 * Only the project owner can update roles.
 */
export async function updateMemberRole(
  currentUid: string,
  projectId: string,
  targetUid: string,
  newRole: "editor" | "viewer"
): Promise<{ success: boolean; error?: string }> {
  if (!db) return { success: false, error: "Firestore not available" };

  const ref = doc(db, PROJECTS_COL, projectId);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    return { success: false, error: "Project not found." };
  }

  const data = snap.data();
  if (data.owner !== currentUid) {
    return { success: false, error: "Only the project owner can change roles." };
  }

  if (data.owner === targetUid) {
    return { success: false, error: "Cannot change the owner's role." };
  }

  await updateDoc(ref, {
    [`members.${targetUid}`]: newRole,
  });

  return { success: true };
}
