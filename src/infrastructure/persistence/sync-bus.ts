/**
 * Lightweight typed event bus for decoupling the Zustand store from cloud sync.
 *
 * The store emits events after local persistence; the cloud sync hook
 * subscribes and handles async Firestore writes. When no listeners are
 * registered (local-only mode), emits are no-ops.
 */

export type SyncEventType = "save" | "create" | "delete";

export interface SyncEvent {
  type: SyncEventType;
  projectId: string;
}

type SyncEventHandler = (event: SyncEvent) => void;

class SyncBus {
  private handlers: SyncEventHandler[] = [];

  subscribe(handler: SyncEventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  private emit(event: SyncEvent): void {
    for (const handler of this.handlers) {
      handler(event);
    }
  }

  emitSave(projectId: string): void {
    this.emit({ type: "save", projectId });
  }

  emitCreate(projectId: string): void {
    this.emit({ type: "create", projectId });
  }

  emitDelete(projectId: string): void {
    this.emit({ type: "delete", projectId });
  }
}

export const cloudSyncBus = new SyncBus();
