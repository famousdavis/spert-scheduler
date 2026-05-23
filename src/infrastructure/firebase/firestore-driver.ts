// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Firestore-backed project storage driver.
 *
 * Collections:
 *   spertscheduler_projects/{projectId}  — full project doc + owner/members
 *   spertscheduler_settings/{uid}        — per-user preferences
 *   spertscheduler_profiles/{uid}        — user profile
 */

import {
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  deleteField,
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import type { Unsubscribe, QueryDocumentSnapshot } from "firebase/firestore";
import {
  db,
  getResendInvite,
  getRevokeInvite,
} from "./firebase";
import {
  sanitizeForFirestore,
  sanitizeForFirestoreMerge,
  stripFirestoreFields,
  stripSimulationResultsForCloud,
} from "./firestore-sanitize";
import type {
  PendingInvite,
  ResendInviteResult,
  RevokeInviteResult,
} from "./invitation-types";
import { SCHEMA_VERSION } from "@domain/models/types";
import type { Project, UserPreferences } from "@domain/models/types";
import { ProjectSchema } from "@domain/schemas/project.schema";
import { UserPreferencesSchema } from "@domain/schemas/preferences.schema";
import { applyMigrations } from "@infrastructure/persistence/migrations";

const PROJECTS_COL = "spertscheduler_projects";
const SETTINGS_COL = "spertscheduler_settings";

export type ProjectRole = "owner" | "editor" | "viewer";

export interface FirestoreProjectMeta {
  owner: string;
  members: Record<string, ProjectRole>;
}

/** Maximum document size warning threshold (bytes). */
const DOC_SIZE_WARNING_BYTES = 800_000;

/**
 * Firestore project storage driver.
 * All methods require an active Firestore connection (db !== null).
 */
export class FirestoreDriver {
  private uid: string;
  private saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private pendingSaves = new Map<string, Project>();
  private onSaveErrorCb: ((error: unknown) => void) | null = null;

  constructor(uid: string) {
    this.uid = uid;
  }

  // -- Project CRUD -----------------------------------------------------------

  /**
   * Load all projects the user has access to.
   * Returns projects with _owner and _members metadata attached.
   */
  async loadAll(): Promise<
    (Project & { _owner: string; _members: Record<string, ProjectRole> })[]
  > {
    if (!db) throw new Error("Firestore not initialized");

    const q = query(
      collection(db, PROJECTS_COL),
      where(`members.${this.uid}`, "in", ["owner", "editor", "viewer"])
    );
    const snap = await getDocs(q);
    const projects: (Project & {
      _owner: string;
      _members: Record<string, ProjectRole>;
    })[] = [];

    for (const docSnap of snap.docs) {
      const project = await this.processProjectDoc(docSnap);
      if (project) projects.push(project);
    }

    return projects;
  }

  /**
   * Processes a single Firestore document snapshot into a typed Project.
   * May write back to Firestore if schema migration was applied (write-forward pattern).
   * Returns null if the document is corrupted or fails schema validation.
   */
  private async processProjectDoc(
    docSnap: QueryDocumentSnapshot,
  ): Promise<(Project & { _owner: string; _members: Record<string, ProjectRole> }) | null> {
    const raw = docSnap.data();
    const stripped = stripFirestoreFields(raw);
    const projectData = { id: docSnap.id, ...stripped };

    let data: unknown = projectData;
    const schemaVersion =
      typeof stripped.schemaVersion === "number" ? stripped.schemaVersion : 1;
    const wasMigrated = schemaVersion < SCHEMA_VERSION;
    if (wasMigrated) {
      try {
        data = applyMigrations(data, schemaVersion, SCHEMA_VERSION);
      } catch {
        return null; // skip corrupted project
      }
    }

    const result = ProjectSchema.safeParse(data);
    if (!result.success) return null;

    const project = result.data as Project & {
      _owner: string;
      _members: Record<string, ProjectRole>;
    };
    project._owner = raw.owner as string;
    project._members = raw.members as Record<string, ProjectRole>;

    if (wasMigrated) {
      try {
        await this.doSave(project);
      } catch (e) {
        console.error("Write-forward migration save failed for project:", docSnap.id);
        this.onSaveErrorCb?.(e);
      }
    }

    return project;
  }

  /**
   * Load a single project by ID.
   */
  async load(id: string): Promise<Project | null> {
    if (!db) throw new Error("Firestore not initialized");

    const ref = doc(db, PROJECTS_COL, id);
    const snap = await getDoc(ref);
    if (!snap.exists()) return null;

    const raw = snap.data();
    const stripped = stripFirestoreFields(raw);
    const projectData = { id: snap.id, ...stripped };

    // Migrate
    let data: unknown = projectData;
    const schemaVersion =
      typeof stripped.schemaVersion === "number"
        ? stripped.schemaVersion
        : 1;
    const wasMigrated = schemaVersion < SCHEMA_VERSION;
    if (wasMigrated) {
      data = applyMigrations(data, schemaVersion, SCHEMA_VERSION);
    }

    // Validate
    const result = ProjectSchema.safeParse(data);
    if (!result.success) return null;

    const project = result.data as Project;

    // Write-forward: persist migrated schema immediately to prevent
    // multi-device race where a v0.19.x client overwrites patched fields
    if (wasMigrated) {
      try {
        await this.doSave(project);
      } catch (e) {
        // Non-blocking: log but don't prevent the user from using the app
        console.error("Write-forward migration save failed for project:", id);
        this.onSaveErrorCb?.(e);
      }
    }

    return project;
  }

  /**
   * Create a new project with ownership.
   * Sets owner and members fields — only used for new projects.
   */
  async create(project: Project): Promise<void> {
    if (!db) throw new Error("Firestore not initialized");

    const ref = doc(db, PROJECTS_COL, project.id);
    const cleaned = stripSimulationResultsForCloud(project);
    // eslint-disable-next-line sonarjs/no-unused-vars
    const { id: _id, ...rest } = cleaned; // NOSONAR — intentional destructuring discard

    const data = sanitizeForFirestore({
      ...rest,
      schemaVersion: SCHEMA_VERSION,
      owner: this.uid,
      members: { [this.uid]: "owner" as ProjectRole },
      updatedAt: serverTimestamp(),
    });

    await setDoc(ref, data);
  }

  /**
   * Save a project (debounced). Never sets owner/members.
   * Strips simulation results before saving.
   *
   * The debounce window (200 ms) is chosen to balance two tensions:
   *   - Too long → click-driven changes (preset selection, color picker,
   *     toggle switches) can race a fast browser refresh: the `beforeunload`
   *     flush starts `setDoc` but the network request gets aborted before
   *     it commits, silently dropping the user's change. v0.45.6 originally
   *     used 500 ms and shipped with that race exposed.
   *   - Too short → rapid keystrokes (typing in a name field) fire one
   *     write per character instead of one per word. ~200 ms still batches
   *     normal typing (most users have >250 ms gaps between keystrokes).
   * Pair this with the `pagehide` flush in use-cloud-sync.ts for refresh
   * resilience.
   */
  save(project: Project): void {
    this.pendingSaves.set(project.id, project);

    const existing = this.saveTimers.get(project.id);
    if (existing) clearTimeout(existing);

    this.saveTimers.set(
      project.id,
      setTimeout(() => {
        this.saveTimers.delete(project.id);
        const p = this.pendingSaves.get(project.id);
        this.pendingSaves.delete(project.id);
        if (p) this.doSave(p);
      }, 200)
    );
  }

  /**
   * Save immediately (bypasses debounce).
   */
  async saveImmediate(project: Project): Promise<void> {
    const existing = this.saveTimers.get(project.id);
    if (existing) {
      clearTimeout(existing);
      this.saveTimers.delete(project.id);
      this.pendingSaves.delete(project.id);
    }
    await this.doSave(project);
  }

  private async doSave(project: Project): Promise<void> {
    if (!db) return;

    try {
      const cleaned = stripSimulationResultsForCloud(project);
      // eslint-disable-next-line sonarjs/no-unused-vars
      const { id: _docId, ...rest } = cleaned; // NOSONAR — intentional destructuring discard
      // Merge-aware sanitize: `undefined` map-keys become `deleteField()`
      // sentinels so that fields cleared locally (e.g. custom Gantt colors
      // reset by a preset click) are actually removed on the server doc
      // instead of lingering through Firestore's deep merge.
      const data = sanitizeForFirestoreMerge({
        ...rest,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
      });

      // Check document size
      const jsonSize = new Blob([JSON.stringify(data)]).size;
      if (import.meta.env.DEV && jsonSize > DOC_SIZE_WARNING_BYTES) {
        console.warn(
          `Project "${project.name}" is ${(jsonSize / 1024).toFixed(0)} KB — approaching Firestore 1 MB limit.`
        );
      }

      // merge: true preserves owner/members fields set during create()
      const ref = doc(db, PROJECTS_COL, project.id);
      await setDoc(ref, data, { merge: true });
    } catch (e) {
      console.error("Firestore write error:", e);
      this.onSaveErrorCb?.(e);
    }
  }

  /**
   * Cancel a pending debounced save for a project without writing.
   * Call before create() or remove() to prevent stale data from overwriting.
   */
  cancelPendingSave(id: string): void {
    const timer = this.saveTimers.get(id);
    if (timer) {
      clearTimeout(timer);
      this.saveTimers.delete(id);
      this.pendingSaves.delete(id);
    }
  }

  /**
   * Cancel all pending debounced saves without writing. Idempotent.
   * Used on sign-out and mode-switch teardown so queued writes do not
   * fire against revoked credentials or into the wrong storage mode.
   */
  cancelPendingSaves(): void {
    const ids = Array.from(this.saveTimers.keys());
    for (const id of ids) {
      const timer = this.saveTimers.get(id);
      if (timer) clearTimeout(timer);
      this.saveTimers.delete(id);
      this.pendingSaves.delete(id);
    }
  }

  /**
   * Delete a project.
   */
  async remove(id: string): Promise<void> {
    if (!db) throw new Error("Firestore not initialized");
    await deleteDoc(doc(db, PROJECTS_COL, id));
  }

  // -- Real-time subscriptions ------------------------------------------------

  /**
   * Subscribe to real-time changes for a single project.
   * Uses hasPendingWrites for echo prevention.
   */
  subscribeToProject(
    id: string,
    callback: (project: Project) => void,
    onError?: (error: unknown) => void
  ): Unsubscribe {
    if (!db) return () => {};

    const ref = doc(db, PROJECTS_COL, id);
    return onSnapshot(
      ref,
      (snap) => {
        if (snap.metadata.hasPendingWrites) return;
        if (!snap.exists()) return;

        const raw = snap.data();
        const stripped = stripFirestoreFields(raw);
        const projectData = { id: snap.id, ...stripped };

        // Migrate
        let data: unknown = projectData;
        const schemaVersion =
          typeof stripped.schemaVersion === "number"
            ? stripped.schemaVersion
            : 1;
        if (schemaVersion < SCHEMA_VERSION) {
          try {
            data = applyMigrations(data, schemaVersion, SCHEMA_VERSION);
          } catch {
            return;
          }
        }

        // Validate
        const result = ProjectSchema.safeParse(data);
        if (!result.success) return;

        // LU1 fix (Lesson 38): re-attach `owner` from the raw doc.
        // `stripFirestoreFields` strips `owner` before Zod parse, so without
        // this re-attach every snapshot would clobber the in-memory `owner`
        // back to the schema default (null), suppressing the SharingSection
        // owner gate ~1s after Add Project / Clone Project.
        // Cast to Project (same loosening as the loadAll path) because Zod's
        // Scenario schema has some optional fields the TS interface marks as
        // required — pre-existing schema/type drift, unrelated to this fix.
        const project = {
          ...(result.data as Project),
          owner: (raw.owner as string | undefined) ?? null,
        };
        callback(project);
      },
      (error) => {
        console.error(`Snapshot listener failed for project ${id}:`, error);
        onError?.(error);
      }
    );
  }

  // -- Bulk-sharing collaborator management -----------------------------------

  /**
   * Remove a collaborator from a project. Atomic via runTransaction so that
   * concurrent member additions on other keys land cleanly (`deleteField()`
   * targets only the one member entry, not the full members map).
   *
   * Three app-side guards mirror the deleted `removeProjectMember` helper.
   * The Firestore update rule does NOT prevent an owner from removing
   * themselves: if the owner removes their own uid from `members`, the write
   * passes (caller is owner), but afterwards `members` no longer contains the
   * owner's uid → `get` and `list` rules fail → project locked. Guard 1
   * prevents that lockout. Guard 2 is belt-and-suspenders against caller
   * impersonation. Guard 3 protects the project owner from removal by any
   * other caller.
   */
  async removeCollaborator(projectId: string, userId: string): Promise<void> {
    if (!db) return;
    // Guard 1: cannot remove yourself (prevents owner-self-removal lockout)
    if (userId === this.uid) {
      throw new Error("Cannot remove yourself from a project.");
    }
    const ref = doc(db, PROJECTS_COL, projectId);
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) throw new Error("Project not found.");
      const data = snap.data();
      // Guard 2: caller must be owner (Firestore rule enforces; redundant by design)
      if (data.owner !== this.uid) {
        throw new Error("Only the project owner can remove members.");
      }
      // Guard 3: cannot remove the project owner via this code path
      if (data.owner === userId) {
        throw new Error("Cannot remove the project owner.");
      }
      tx.update(ref, { [`members.${userId}`]: deleteField() });
    });
  }

  /**
   * List pending invitations for a given project, scoped to the current user
   * as inviter. Backed by the `(inviterUid, modelId)` composite index — do NOT
   * try to query by `(appId, modelId)` (no such index exists in the suite-wide
   * schema). Results are filtered to `status === "pending"` only and sorted
   * newest-first for the UI list.
   */
  async listPendingInvites(projectId: string): Promise<PendingInvite[]> {
    if (!db) return [];
    const q = query(
      collection(db, "spertsuite_invitations"),
      where("inviterUid", "==", this.uid),
      where("modelId", "==", projectId)
    );
    const snap = await getDocs(q);
    const invites: PendingInvite[] = [];
    for (const d of snap.docs) {
      const data = d.data();
      if (data.status !== "pending") continue;
      invites.push({
        tokenId: d.id,
        inviteeEmail: data.inviteeEmail as string,
        role: data.role as "editor" | "viewer",
        status: "pending",
        createdAt: data.createdAt?.toMillis?.() ?? 0,
        expiresAt: data.expiresAt?.toMillis?.() ?? 0,
        lastEmailSentAt: data.lastEmailSentAt?.toMillis?.() ?? 0,
        emailSendCount: (data.emailSendCount as number) ?? 0,
        modelId: data.modelId as string,
        modelName: data.modelName as string,
        isVoting: false,
      });
    }
    return invites.sort((a, b) => b.createdAt - a.createdAt);
  }

  /** Revoke a pending invitation via the suite Cloud Function. */
  async revokeInvite(tokenId: string): Promise<RevokeInviteResult> {
    const callable = getRevokeInvite();
    if (!callable) return { success: false };
    const res = await callable({ tokenId });
    return res.data;
  }

  /** Resend the email for a pending invitation (max 5× per invite). */
  async resendInvite(tokenId: string): Promise<ResendInviteResult> {
    const callable = getResendInvite();
    if (!callable) return { success: false };
    const res = await callable({ tokenId });
    return res.data;
  }

  // -- Preferences ------------------------------------------------------------

  async loadPreferences(): Promise<Partial<UserPreferences>> {
    if (!db) return {};
    try {
      const ref = doc(db, SETTINGS_COL, this.uid);
      const snap = await getDoc(ref);
      if (!snap.exists()) return {};
      const parsed = UserPreferencesSchema.partial().safeParse(snap.data());
      return parsed.success ? parsed.data : {};
    } catch (e) {
      console.error("Failed to load cloud preferences:", e);
      return {};
    }
  }

  async savePreferences(prefs: UserPreferences): Promise<void> {
    if (!db) return;
    try {
      const ref = doc(db, SETTINGS_COL, this.uid);
      await setDoc(ref, sanitizeForFirestore(prefs));
    } catch (e) {
      console.error("Failed to save cloud preferences:", e);
      this.onSaveErrorCb?.(e);
    }
  }

  // -- Lifecycle --------------------------------------------------------------

  onSaveError(cb: (error: unknown) => void): void {
    this.onSaveErrorCb = cb;
  }

  /**
   * Flush all pending debounce timers. Called on beforeunload.
   */
  flushPendingSaves(): void {
    for (const [id, timer] of this.saveTimers) {
      clearTimeout(timer);
      this.saveTimers.delete(id);
      const p = this.pendingSaves.get(id);
      this.pendingSaves.delete(id);
      if (p) this.doSave(p);
    }
  }

  /**
   * Clean up all timers and subscriptions.
   */
  dispose(): void {
    for (const timer of this.saveTimers.values()) {
      clearTimeout(timer);
    }
    this.saveTimers.clear();
    this.pendingSaves.clear();
  }
}
