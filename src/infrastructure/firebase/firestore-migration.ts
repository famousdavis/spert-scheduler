// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

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
// B5, revised §3.8 (2026-08-02). Still true: the four-way collision ladder in the
// JSDoc directly above IS the contract, and the branching is that contract written
// out.
//
// The second half was FALSE and is removed. It read "effectively untestable in CI
// (it needs a live Firestore), so a refactor here would be unverifiable by
// construction." firestore-migration.test.ts now covers this function at 100% of
// lines and functions (97.61% statements) behind 15 falsified mutations
// (scripts/falsify-spec-firestore-migration.mjs), using the same
// vi.mock("firebase/firestore") pattern firestore-driver.test.ts and
// firestore-sharing.test.ts have used for months. No emulator, no live Firestore.
//
// ⚠️ THIS SUPPRESSION STAYS INTERIM, unlike migrateV5toV6's, which §3.8 made
// permanent in the same pass. The append-only argument that makes THAT one
// permanent does NOT hold here, and the difference was measured rather than
// assumed: `git log -L` over this body returns FOUR commits — 57714c3 (v0.12.0,
// introduction), 929419e (v0.15.2), ff9fe25 (v0.33.0) and ff7c5da (v0.42.6, a
// security fix). This code IS edited, so maintainability is a live concern here,
// not a theoretical one.
//
// Decomposition is DEFERRED, not declined, on one specific open question.
// firestore.rules gates `get` on membership, so the "exists but belongs to someone
// else" rung may be unreachable in production — that read is DENIED, not answered —
// and if a read of a MISSING doc is likewise denied (`resource` is null), the "no
// doc → keep the original id" rung never fires either, and every migrated project
// silently takes a new id. The ladder may need to CHANGE rather than be
// reorganised, and decomposing first would entrench a shape that is possibly wrong.
// The canonical ruleset lives in spert-landing-page and deploys via the Firebase
// Console; that question belongs to a session working there. Revisit this
// suppression once it is answered.
// eslint-disable-next-line sonarjs/cognitive-complexity
export async function migrateLocalToCloud(
  uid: string
): Promise<MigrationResult> {
  if (!db) throw new Error("Firestore not initialized");

  // v0.42.6 (M4): explicit "local" namespace — local-mode projects always
  // live there, regardless of what the active namespace currently is.
  const repo = new LocalStorageRepository("local");
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
      // eslint-disable-next-line sonarjs/no-unused-vars
      const { id: _id, ...rest } = cleaned; // NOSONAR — intentional destructuring discard

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
