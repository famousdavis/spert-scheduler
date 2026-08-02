// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Proof the §3.8 Item B characterisation tests can FAIL.
//
// `migrateLocalToCloud` was at 0% on all four coverage metrics, and all 15 tests
// passed on their first run. Over never-executed code that is a reason for
// suspicion, not confidence: nothing about them had ever been disproved by a red
// run, and a mock-driven test of a function whose collaborators are ALL mocked is
// the easiest place in this repo to write something vacuous.
//
// Each mutation is a slip a decomposition of the four-way collision ladder could
// plausibly make — collapsing a rung, inverting the membership test, losing the
// per-item isolation, or dropping a stamped field.
const FM = new URL("../src/infrastructure/firebase/firestore-migration.ts", import.meta.url)
  .pathname;

export const testFile = "src/infrastructure/firebase/firestore-migration.test.ts";

export const mutations = [
  // -- the collision ladder --------------------------------------------------
  {
    id: "F1  membership test inverted (mine ↔ someone else's)",
    file: FM,
    find: `        if (data.members && data.members[uid]) {`,
    replace: `        if (data.members && !data.members[uid]) {`,
    expectFailing: /doc exists, caller IS a member/,
  },
  {
    id: "F2  membership test ignores WHICH user is a member",
    file: FM,
    find: `        if (data.members && data.members[uid]) {`,
    replace: `        if (data.members) {`,
    expectFailing: /caller is NOT a member/,
  },
  {
    id: "F3  an empty members map reads as 'mine' (object truthiness, not per-key)",
    file: FM,
    find: `        if (data.members && data.members[uid]) {`,
    replace: `        if (data.members !== undefined) {`,
    expectFailing: /members map without the caller/,
  },
  {
    id: "F4  rung 2 collapsed into rung 4 — keep the original id on collision",
    file: FM,
    find: `        // Belongs to someone else — generate new ID\n        targetId = crypto.randomUUID();`,
    replace: `        // Belongs to someone else — generate new ID`,
    expectFailing: /caller is NOT a member/,
  },
  {
    id: "F5  denied read treated as 'no doc' rather than re-id",
    file: FM,
    find: `    } catch {\n      // PERMISSION_DENIED or other error — generate new ID to be safe\n      targetId = crypto.randomUUID();\n    }`,
    replace: `    } catch {\n      // PERMISSION_DENIED or other error — generate new ID to be safe\n    }`,
    expectFailing: /read denied/,
  },
  {
    id: "F6  the skip rung stops the whole migration instead of the item",
    file: FM,
    find: `          skipped++;\n          continue;\n        }\n        // Belongs to someone else`,
    replace: `          skipped++;\n          break;\n        }\n        // Belongs to someone else`,
    expectFailing: /skipped project does not stop the ones behind it/,
  },

  // -- the uploaded document -------------------------------------------------
  {
    id: "F7  owner stamped from the document rather than the caller",
    file: FM,
    find: `        owner: uid,`,
    replace: `        owner: "",`,
    expectFailing: /stamps owner, members, schemaVersion and updatedAt/,
  },
  {
    id: "F8  members map stamped with the wrong role",
    file: FM,
    find: `        members: { [uid]: "owner" as ProjectRole },`,
    replace: `        members: { [uid]: "editor" as ProjectRole },`,
    expectFailing: /stamps owner, members, schemaVersion and updatedAt/,
  },
  {
    id: "F9  the id field is no longer discarded before upload",
    file: FM,
    find: `      const { id: _id, ...rest } = cleaned; // NOSONAR — intentional destructuring discard`,
    replace: `      const rest = cleaned;`,
    expectFailing: /stamps owner, members, schemaVersion and updatedAt/,
  },
  {
    id: "F10 updatedAt written as a plain value instead of the server sentinel",
    file: FM,
    find: `        updatedAt: serverTimestamp(),`,
    replace: `        updatedAt: 0,`,
    expectFailing: /stamps owner, members, schemaVersion and updatedAt/,
  },
  {
    id: "F11 the new id is not written into the result",
    file: FM,
    find: `          status: "migrated-new-id",\n          newId: targetId,`,
    replace: `          status: "migrated-new-id",`,
    expectFailing: /caller is NOT a member/,
  },

  // -- per-item isolation ----------------------------------------------------
  {
    id: "F12 an unreadable local project aborts the run instead of being skipped",
    file: FM,
    find: `      items.push({ id, name: id, status: "skipped", reason: "corrupt" });\n      skipped++;\n      continue;`,
    replace: `      items.push({ id, name: id, status: "skipped", reason: "corrupt" });\n      skipped++;\n      break;`,
    expectFailing: /unreadable local project/,
  },
  {
    id: "F13 a failed write is counted as an upload",
    file: FM,
    find: `      failed++;`,
    replace: `      uploaded++;`,
    expectFailing: /records a failed write with its reason/,
  },
  {
    id: "F14 a non-Error rejection loses its reason",
    file: FM,
    find: `        reason: e instanceof Error ? e.message : String(e),`,
    replace: `        reason: e instanceof Error ? e.message : undefined,`,
    expectFailing: /stringifies a non-Error rejection/,
  },
  {
    id: "F15 a failed preferences write aborts the whole migration",
    file: FM,
    find: `  } catch (e) {\n    console.error("Failed to migrate preferences:", e);\n  }`,
    replace: `  } catch (e) {\n    throw e;\n  }`,
    expectFailing: /when the preferences write fails/,
  },
];
