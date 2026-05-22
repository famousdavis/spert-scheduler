// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { deleteField } from "firebase/firestore";
import type { Project } from "@domain/models/types";

/**
 * Recursively strip `undefined` values from an object.
 * Firestore rejects explicit `undefined` — must omit the field entirely.
 *
 * Use this for `setDoc` calls WITHOUT `merge:true` (e.g. `create()`) where the
 * whole document is overwritten and there are no stale fields to worry about.
 * For merge writes, use `sanitizeForFirestoreMerge` instead — otherwise fields
 * that have transitioned to `undefined` will linger on the server document.
 */
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as T;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore) as T;
  if (typeof obj !== "object") return obj;

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean as T;
}

/**
 * Sanitizer for `setDoc(..., { merge: true })` writes.
 *
 * Replaces `undefined` map-keys with Firestore's `deleteField()` sentinel so
 * that stale values are actually removed from the server document on merge.
 * Stripping the key (as `sanitizeForFirestore` does) is wrong for merge writes
 * because Firestore's deep-merge leaves the old value in place — the symptom
 * was per-project custom Gantt colors resurrecting after a refresh once a
 * preset click had cleared them locally.
 *
 * Arrays are atomic under merge (the whole array is replaced), and Firestore
 * forbids `deleteField()` inside array elements, so once we descend into an
 * array we fall back to the strip-undefined behavior of `sanitizeForFirestore`.
 */
export function sanitizeForFirestoreMerge<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as T;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore) as T;
  if (typeof obj !== "object") return obj;

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
    if (value === undefined) {
      clean[key] = deleteField();
    } else {
      clean[key] = sanitizeForFirestoreMerge(value);
    }
  }
  return clean as T;
}

/**
 * Remove Firestore-only fields (owner, members, updatedAt) from loaded data.
 */
export function stripFirestoreFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  // eslint-disable-next-line sonarjs/no-unused-vars
  const { owner: _owner, members: _members, updatedAt: _updatedAt, ...rest } = data; // NOSONAR — intentional destructuring discard
  return rest;
}

/**
 * Strip all simulation results from a project before saving to Firestore.
 * Simulation data is transient and recomputable; it can also be very large
 * (100k+ samples) and would push documents well beyond Firestore's 1 MB limit.
 */
export function stripSimulationResultsForCloud(project: Project): Project {
  return {
    ...project,
    scenarios: project.scenarios.map((scenario) => ({
      ...scenario,
      simulationResults: undefined,
    })),
  };
}
