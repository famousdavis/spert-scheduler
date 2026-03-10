// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Local-to-cloud data migration.
 * Uploads all local projects to Firestore with collision handling.
 * Local data is preserved as a backup.
 */

import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";
import {
  sanitizeForFirestore,
  stripSimulationResultsForCloud,
} from "./firestore-sanitize";
import { LocalStorageRepository } from "@infrastructure/persistence/local-storage-repository";
import {
  loadPreferences,
} from "@infrastructure/persistence/preferences-repository";
import { SCHEMA_VERSION } from "@domain/models/types";
import type { ProjectRole } from "./firestore-driver";

const PROJECTS_COL = "spertscheduler_projects";
const SETTINGS_COL = "spertscheduler_settings";

export interface MigrationItemResult {
  id: string;
  name: string;
  status: "migrated" | "skipped" | "migrated-new-id" | "failed";
  newId?: string;
  reason?: string;
}

export interface MigrationResult {
  items: MigrationItemResult[];
  uploaded: number;
  skipped: number;
  failed: number;
}

/**
 * Upload all local projects to Firestore.
 *
 * Collision handling:
 * - If a doc with the same ID exists AND user is a member → skip
 * - If a doc exists but user is NOT a member → generate new ID
 * - If permission-denied → generate new ID (doc may or may not exist)
 * - If doc doesn't exist → proceed with original ID
 *
 * Local data is left in place as a backup.
 */
export async function migrateLocalToCloud(
  uid: string
): Promise<MigrationResult> {
  if (!db) throw new Error("Firestore not initialized");

  const repo = new LocalStorageRepository();
  const ids = repo.list();
  const items: MigrationItemResult[] = [];
  let uploaded = 0;
  let skipped = 0;
  let failed = 0;

  for (const id of ids) {
    const project = repo.load(id);
    if (!project) {
      items.push({ id, name: id, status: "skipped", reason: "corrupt" });
      skipped++;
      continue;
    }

    let targetId = project.id;

    try {
      const existing = await getDoc(doc(db, PROJECTS_COL, targetId));
      if (existing.exists()) {
        const data = existing.data();
        if (data.members && data.members[uid]) {
          // User already has this project in cloud — skip
          items.push({
            id,
            name: project.name,
            status: "skipped",
            reason: "exists",
          });
          skipped++;
          continue;
        }
        // Belongs to someone else — generate new ID
        targetId = crypto.randomUUID();
      }
    } catch {
      // PERMISSION_DENIED or other error — generate new ID to be safe
      targetId = crypto.randomUUID();
    }

    try {
      const cleaned = stripSimulationResultsForCloud({
        ...project,
        id: targetId,
      });
      const { id: _id, ...rest } = cleaned;

      await setDoc(doc(db, PROJECTS_COL, targetId), {
        ...sanitizeForFirestore(rest),
        schemaVersion: SCHEMA_VERSION,
        owner: uid,
        members: { [uid]: "owner" as ProjectRole },
        updatedAt: serverTimestamp(),
      });

      if (targetId !== id) {
        items.push({
          id,
          name: project.name,
          status: "migrated-new-id",
          newId: targetId,
        });
      } else {
        items.push({ id, name: project.name, status: "migrated" });
      }
      uploaded++;
    } catch (e) {
      items.push({
        id,
        name: project.name,
        status: "failed",
        reason: e instanceof Error ? e.message : String(e),
      });
      failed++;
    }
  }

  // Migrate preferences
  try {
    const prefs = loadPreferences();
    await setDoc(
      doc(db, SETTINGS_COL, uid),
      sanitizeForFirestore(prefs),
      { merge: true }
    );
  } catch (e) {
    console.error("Failed to migrate preferences:", e);
  }

  return { items, uploaded, skipped, failed };
}
