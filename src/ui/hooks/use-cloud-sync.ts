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
import { toast } from "@ui/hooks/use-notification-store";
import { cloudSyncBus } from "@infrastructure/persistence/sync-bus";
import type { SyncEvent } from "@infrastructure/persistence/sync-bus";
import { FirestoreDriver } from "@infrastructure/firebase/firestore-driver";
import { INVITATIONS_ENABLED } from "@app/featureFlags";
import type { Unsubscribe } from "firebase/firestore";

// Module-level driver handle. Written by useCloudSync when the driver is
// created/destroyed; read by the sign-out cleanup registry so it can call
// cancelPendingSaves() before Firebase credentials are revoked. The handle
// is safe here because useCloudSync is invoked exactly once from Layout.
let currentDriver: FirestoreDriver | null = null;

/**
 * Returns the current FirestoreDriver instance, or null if cloud mode is
 * inactive. Exposed for the sign-out cleanup registry; do not use from UI.
 */
export function getCloudSyncDriver(): FirestoreDriver | null {
  return currentDriver;
}

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
      const unsub = driver.subscribeToProject(
        projectId,
        (updated) => {
          mergeProject(updated);
        },
        (error) => {
          console.error(
            `Real-time listener died for project ${projectId}:`,
            error
          );
          // Note: deleting from listenedIdsRef allows addProjectListener to re-subscribe,
          // but nothing currently triggers resubscription for existing projects.
          // A full reconnect mechanism is deferred.
          listenedIdsRef.current.delete(projectId);
        }
      );
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
      driver.onSaveError((e) => {
        console.error("Firestore write failed:", e);
        toast.error(
          "Cloud sync error — changes may not have saved. Check your connection."
        );
      });
      driverRef.current = driver;
      currentDriver = driver;
      initialLoadDoneRef.current = false;
      // Mirror initialLoadDoneRef into reactive store state so the UI can
      // gate the file picker on cloud-data hydration (pitfall #88/#89).
      useProjectStore.getState().setCloudDataLoaded(false);
      let cancelled = false;

      // Initial load from Firestore
      driver
        .loadAll()
        .then(async (cloudProjects) => {
          if (cancelled) return;

          // Strip _owner/_members metadata before setting in store, but
          // re-attach `_owner` as the in-memory `owner` field (Lesson 38) so
          // the SharingSection ownership gate can render synchronously without
          // waiting for `getProjectMembers` to resolve.
          const projects = cloudProjects.map(({ _owner, _members, ...project }) => ({
            ...project,
            owner: _owner,
          }));

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
          useProjectStore.getState().setCloudDataLoaded(true);

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
          // Defensive flip-to-true so the UI doesn't wedge on the disabled
          // state after a transient load failure (pitfall #88).
          useProjectStore.getState().setCloudDataLoaded(true);
        });

      return () => {
        cancelled = true;
        // Cancel (not flush) on teardown: if this runs after sign-out,
        // Firebase credentials are already revoked and a flush would
        // trigger PERMISSION_DENIED writes. The registry has already
        // cancelled during the signOut callback; this is a safety net
        // for the mode-switch case where the registry is not invoked.
        driver.cancelPendingSaves();
        driver.dispose();
        driverRef.current = null;
        currentDriver = null;
        cleanupListeners();
      };
    } else {
      // Switching to local mode or signing out
      if (driverRef.current) {
        driverRef.current.cancelPendingSaves();
        driverRef.current.dispose();
        driverRef.current = null;
        currentDriver = null;
      }
      initialLoadDoneRef.current = false;
      useProjectStore.getState().setCloudDataLoaded(false);
      cleanupListeners();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- user?.uid is the only relevant identity; full user object would cause unnecessary re-runs
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
              toast.error(
                "Cloud sync error — changes may not have saved. Check your connection."
              );
            });
            addProjectListener(project.id);
          }
          break;
        case "delete":
          driver.cancelPendingSave(event.projectId);
          driver.remove(event.projectId).catch((e) => {
            console.error("Failed to delete project from Firestore:", e);
            toast.error(
              "Cloud sync error — changes may not have saved. Check your connection."
            );
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

  // Flush pending writes on beforeunload.
  //
  // v0.42.6 (M3): guard against stale-auth flushes. If session expiry or
  // explicit sign-out fires between handler registration and tab close,
  // `user` is null but `driverRef.current` may still hold a reference whose
  // `uid` is the now-revoked Firebase session. A flush in that window would
  // attempt setDoc with revoked credentials, hit PERMISSION_DENIED, and the
  // error would be swallowed in driver.doSave's catch block — masking a
  // real symptom from observability. Returning early when `user === null`
  // closes the race at the source.
  const handleBeforeUnload = useCallback(() => {
    if (!user || !driverRef.current) return;
    driverRef.current.flushPendingSaves();
  }, [user]);

  useEffect(() => {
    if (!isCloudActive) return;
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isCloudActive, handleBeforeUnload]);

  // spert:models-changed listener — Pattern B re-fetch on successful claim.
  //
  // After AuthProvider's claimPendingInvitations CF call dispatches this event,
  // we re-run loadAll so newly-claimed projects appear in the store without
  // requiring a page reload, then attach a real-time listener for each.
  // Re-attaches `_owner` as `owner` (same pattern as the initial-load path).
  const handleModelsChanged = useCallback(() => {
    const driver = getCloudSyncDriver();
    if (!driver || mode !== "cloud") return;
    // Flip cloudDataLoaded false→true around the refresh so an open import
    // preview re-validates against the post-refresh project list (v8 / v7 C-1).
    // Without this, a peer-driven model refresh leaves the preview silently
    // stale because the cloud-invalidation effect is gated on false→true.
    useProjectStore.getState().setCloudDataLoaded(false);
    driver
      .loadAll()
      .then((cloudProjects) => {
        const projects = cloudProjects.map(({ _owner, _members, ...p }) => ({
          ...p,
          owner: _owner,
        }));
        setProjects(projects);
        for (const project of projects) {
          // Idempotent — listenedIdsRef guards re-subscription.
          addProjectListener(project.id);
        }
        useProjectStore.getState().setCloudDataLoaded(true);
      })
      .catch((err) => {
        console.error("spert:models-changed re-fetch failed:", err);
        // Defensive flip-to-true so the UI doesn't wedge on the disabled state.
        useProjectStore.getState().setCloudDataLoaded(true);
      });
  }, [mode, addProjectListener, setProjects]);

  useEffect(() => {
    if (!INVITATIONS_ENABLED) return;
    window.addEventListener("spert:models-changed", handleModelsChanged);
    return () =>
      window.removeEventListener("spert:models-changed", handleModelsChanged);
  }, [handleModelsChanged]);
}
