/**
 * Cloud sync hook — bridges the Zustand store with Firestore.
 *
 * When cloud mode is active:
 * - Subscribes to the sync bus for store mutations → debounced Firestore writes
 * - Sets up onSnapshot listeners for real-time updates from other clients
 * - Flushes pending writes on beforeunload
 *
 * When local-only mode is active, this hook is a no-op.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { cloudSyncBus } from "@infrastructure/persistence/sync-bus";
import type { SyncEvent } from "@infrastructure/persistence/sync-bus";
import { FirestoreDriver } from "@infrastructure/firebase/firestore-driver";
import type { Unsubscribe } from "firebase/firestore";

/**
 * Initialize and manage cloud sync. Call once in the Layout component.
 */
export function useCloudSync(): void {
  const { user } = useAuth();
  const { mode } = useStorage();
  const driverRef = useRef<FirestoreDriver | null>(null);
  const unsubscribersRef = useRef<Unsubscribe[]>([]);
  const initialLoadDoneRef = useRef(false);

  const isCloudActive = mode === "cloud" && user !== null;

  // Get store actions
  const mergeProject = useProjectStore((s) => s.mergeProject);
  const setProjects = useProjectStore((s) => s.setProjects);
  const getProject = useProjectStore((s) => s.getProject);

  // Create/dispose driver when cloud mode or user changes
  useEffect(() => {
    if (isCloudActive && user) {
      const driver = new FirestoreDriver(user.uid);
      driverRef.current = driver;
      initialLoadDoneRef.current = false;

      // Initial load from Firestore
      driver.loadAll().then((cloudProjects) => {
        // Strip _owner/_members metadata before setting in store
        const projects = cloudProjects.map(
          ({ _owner, _members, ...project }) => project
        );

        // Data-loss guard: if cloud is empty but local has projects, skip
        // replacement to protect un-migrated local data
        const localProjects = useProjectStore.getState().projects;
        if (projects.length === 0 && localProjects.length > 0) {
          console.warn(
            `Cloud returned 0 projects but local has ${localProjects.length} — skipping replacement to protect local data`
          );
        } else {
          setProjects(projects);
        }

        initialLoadDoneRef.current = true;
      }).catch((e) => {
        console.error("Failed to load projects from Firestore:", e);
        initialLoadDoneRef.current = true;
      });

      return () => {
        driver.flushPendingSaves();
        driver.dispose();
        driverRef.current = null;
      };
    } else {
      // Switching to local mode or signing out
      if (driverRef.current) {
        driverRef.current.flushPendingSaves();
        driverRef.current.dispose();
        driverRef.current = null;
      }
      initialLoadDoneRef.current = false;
    }
  }, [isCloudActive, user?.uid, setProjects]);

  // Subscribe to sync bus events (store → Firestore)
  useEffect(() => {
    if (!isCloudActive) return;

    const handleSyncEvent = (event: SyncEvent) => {
      const driver = driverRef.current;
      if (!driver || !initialLoadDoneRef.current) return;

      const project = getProject(event.projectId);

      switch (event.type) {
        case "save":
          if (project) driver.save(project);
          break;
        case "create":
          if (project) driver.create(project).catch((e) => {
            console.error("Failed to create project in Firestore:", e);
          });
          break;
        case "delete":
          driver.remove(event.projectId).catch((e) => {
            console.error("Failed to delete project from Firestore:", e);
          });
          break;
      }
    };

    return cloudSyncBus.subscribe(handleSyncEvent);
  }, [isCloudActive, getProject]);

  // Set up real-time listeners for projects (Firestore → store)
  useEffect(() => {
    if (!isCloudActive || !initialLoadDoneRef.current) return;

    const driver = driverRef.current;
    if (!driver) return;

    // We'll set up listeners after the initial load
    // Use a small delay to ensure initialLoadDoneRef is set
    const timer = setTimeout(() => {
      const projects = useProjectStore.getState().projects;
      for (const project of projects) {
        const unsub = driver.subscribeToProject(project.id, (updated) => {
          mergeProject(updated);
        });
        unsubscribersRef.current.push(unsub);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
      for (const unsub of unsubscribersRef.current) {
        unsub();
      }
      unsubscribersRef.current = [];
    };
  }, [isCloudActive, mergeProject, initialLoadDoneRef.current]);

  // Flush pending writes on beforeunload
  const handleBeforeUnload = useCallback(() => {
    driverRef.current?.flushPendingSaves();
  }, []);

  useEffect(() => {
    if (!isCloudActive) return;
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isCloudActive, handleBeforeUnload]);
}
