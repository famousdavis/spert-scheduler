// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { Project } from "@domain/models/types";

/**
 * Recursively strip `undefined` values from an object.
 * Firestore rejects explicit `undefined` — must omit the field entirely.
 */
export function sanitizeForFirestore<T>(obj: T): T {
  if (obj === null || obj === undefined) return null as T;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore) as T;
  if (typeof obj !== "object") return obj;

  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
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
  const { owner: _owner, members: _members, updatedAt: _updatedAt, ...rest } = data;
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
