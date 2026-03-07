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
  getDocs,
  collection,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import type { Unsubscribe } from "firebase/firestore";
import { db } from "./firebase";
import {
  sanitizeForFirestore,
  stripFirestoreFields,
  stripSimulationResultsForCloud,
} from "./firestore-sanitize";
import { SCHEMA_VERSION } from "@domain/models/types";
import type { Project, UserPreferences } from "@domain/models/types";
import { ProjectSchema } from "@domain/schemas/project.schema";
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
      const raw = docSnap.data();
      const stripped = stripFirestoreFields(raw);
      const projectData = { id: docSnap.id, ...stripped };

      // Apply migrations if needed
      let data: unknown = projectData;
      const schemaVersion =
        typeof stripped.schemaVersion === "number"
          ? stripped.schemaVersion
          : 1;
      if (schemaVersion < SCHEMA_VERSION) {
        try {
          data = applyMigrations(data, schemaVersion, SCHEMA_VERSION);
        } catch {
          continue; // skip corrupted projects
        }
      }

      // Validate
      const result = ProjectSchema.safeParse(data);
      if (!result.success) continue;

      const project = result.data as Project & {
        _owner: string;
        _members: Record<string, ProjectRole>;
      };
      project._owner = raw.owner as string;
      project._members = raw.members as Record<string, ProjectRole>;
      projects.push(project);
    }

    return projects;
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
    if (schemaVersion < SCHEMA_VERSION) {
      data = applyMigrations(data, schemaVersion, SCHEMA_VERSION);
    }

    // Validate
    const result = ProjectSchema.safeParse(data);
    if (!result.success) return null;

    return result.data as Project;
  }

  /**
   * Create a new project with ownership.
   * Sets owner and members fields — only used for new projects.
   */
  async create(project: Project): Promise<void> {
    if (!db) throw new Error("Firestore not initialized");

    const ref = doc(db, PROJECTS_COL, project.id);
    const cleaned = stripSimulationResultsForCloud(project);
    const { id, ...rest } = cleaned;

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
   * Save a project (debounced, 500ms). Never sets owner/members.
   * Strips simulation results before saving.
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
      }, 500)
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
      const { id, ...rest } = cleaned;
      const data = sanitizeForFirestore({
        ...rest,
        schemaVersion: SCHEMA_VERSION,
        updatedAt: serverTimestamp(),
      });

      // Check document size
      const jsonSize = new Blob([JSON.stringify(data)]).size;
      if (jsonSize > DOC_SIZE_WARNING_BYTES) {
        console.warn(
          `Project "${project.name}" is ${(jsonSize / 1024).toFixed(0)} KB — approaching Firestore 1 MB limit.`
        );
      }

      // merge: true preserves owner/members fields set during create()
      const ref = doc(db, PROJECTS_COL, id);
      await setDoc(ref, data, { merge: true });
    } catch (e) {
      console.error("Firestore write error:", e);
      this.onSaveErrorCb?.(e);
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
    callback: (project: Project) => void
  ): Unsubscribe {
    if (!db) return () => {};

    const ref = doc(db, PROJECTS_COL, id);
    return onSnapshot(ref, (snap) => {
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

      callback(result.data as Project);
    });
  }

  // -- Preferences ------------------------------------------------------------

  async loadPreferences(): Promise<Partial<UserPreferences>> {
    if (!db) return {};
    try {
      const ref = doc(db, SETTINGS_COL, this.uid);
      const snap = await getDoc(ref);
      return snap.exists() ? (snap.data() as Partial<UserPreferences>) : {};
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
