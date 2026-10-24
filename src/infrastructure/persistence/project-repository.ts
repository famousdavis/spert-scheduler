// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Project } from "@domain/models/types";

/**
 * Repository interface for Project persistence.
 * Swappable implementation: localStorage, IndexedDB, HTTP, etc.
 */
export interface ProjectRepository {
  list(): string[];
  load(id: string): Project | null;
  save(project: Project): void;
  remove(id: string): void;
  /** Orders the given projects; each stored project not given keeps its place (WI-130). */
  reorderIndex(ids: string[]): void;
  /** Replaces the whole list with the given ids (WI-130: the cloud's answer). */
  replaceIndex(ids: string[]): void;
}
