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
}
