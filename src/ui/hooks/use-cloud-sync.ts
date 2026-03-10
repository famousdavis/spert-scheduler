// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Cloud sync hook — bridges the Zustand store with Firestore.
 *
 * When cloud mode is active:
 * - Subscribes to the sync bus for store mutations → debounced Firestore writes
 * - Sets up onSnapshot listeners for real-time updates from other clients
 * - Syncs user preferences bidirectionally with Firestore
 * - Flushes pending writes on beforeunload
 *
 * When local-only mode is active, this hook is a no-op.
 */

import { useEffect, useRef, useCallback } from "react";
import { useAuth } from "@ui/providers/AuthProvider";
import { useStorage } from "@ui/providers/StorageProvider";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
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
  const listenedIdsRef = useRef<Set<string>>(new Set());
  const initialLoadDoneRef = useRef(false);

  const isCloudActive = mode === "cloud" && user !== null;

  // Get store actions
  const mergeProject = useProjectStore((s) => s.mergeProject);
  const setProjects = useProjectStore((s) => s.setProjects);
  const getProject = useProjectStore((s) => s.getProject);

  // Helper: add a real-time listener for a project if not already listening
  const addProjectListener = useCallback(
    (projectId: string) => {
      const driver = driverRef.current;
      if (!driver || listenedIdsRef.current.has(projectId)) return;
      listenedIdsRef.current.add(projectId);
      const unsub = driver.subscribeToProject(projectId, (updated) => {
        mergeProject(updated);
      });
      unsubscribersRef.current.push(unsub);
    },
    [mergeProject]
  );

  // Helper: clean up all real-time listeners
  const cleanupListeners = useCallback(() => {
    for (const unsub of unsubscribersRef.current) unsub();
    unsubscribersRef.current = [];
    listenedIdsRef.current.clear();
  }, []);

  // Create/dispose driver when cloud mode or user changes
  useEffect(() => {
    if (isCloudActive && user) {
      const driver = new FirestoreDriver(user.uid);
      driverRef.current = driver;
      initialLoadDoneRef.current = false;
      let cancelled = false;

      // Initial load from Firestore
      driver
        .loadAll()
        .then(async (cloudProjects) => {
          if (cancelled) return;

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

          // Load and merge cloud preferences (cloud wins for existing fields)
          try {
            const cloudPrefs = await driver.loadPreferences();
            if (!cancelled && Object.keys(cloudPrefs).length > 0) {
              usePreferencesStore.getState().updatePreferences(cloudPrefs);
            }
          } catch (e) {
            console.error("Failed to load cloud preferences:", e);
          }

          initialLoadDoneRef.current = true;

          // Set up real-time listeners for all loaded projects
          if (!cancelled) {
            for (const project of projects) {
              addProjectListener(project.id);
            }
          }
        })
        .catch((e) => {
          if (cancelled) return;
          console.error("Failed to load projects from Firestore:", e);
          initialLoadDoneRef.current = true;
        });

      return () => {
        cancelled = true;
        driver.flushPendingSaves();
        driver.dispose();
        driverRef.current = null;
        cleanupListeners();
      };
    } else {
      // Switching to local mode or signing out
      if (driverRef.current) {
        driverRef.current.flushPendingSaves();
        driverRef.current.dispose();
        driverRef.current = null;
      }
      initialLoadDoneRef.current = false;
      cleanupListeners();
    }
  }, [isCloudActive, user?.uid, setProjects, addProjectListener, cleanupListeners]);

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
          if (project) {
            driver.cancelPendingSave(project.id);
            driver.create(project).catch((e) => {
              console.error("Failed to create project in Firestore:", e);
            });
            addProjectListener(project.id);
          }
          break;
        case "delete":
          driver.cancelPendingSave(event.projectId);
          driver.remove(event.projectId).catch((e) => {
            console.error("Failed to delete project from Firestore:", e);
          });
          break;
      }
    };

    return cloudSyncBus.subscribe(handleSyncEvent);
  }, [isCloudActive, getProject, addProjectListener]);

  // Sync preferences to cloud when they change
  useEffect(() => {
    if (!isCloudActive) return;

    return usePreferencesStore.subscribe((state) => {
      if (initialLoadDoneRef.current && driverRef.current) {
        driverRef.current.savePreferences(state.preferences);
      }
    });
  }, [isCloudActive]);

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
