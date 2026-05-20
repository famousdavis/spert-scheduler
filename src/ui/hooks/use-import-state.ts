// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import {
  useState,
  useCallback,
  useRef,
  useEffect,
  startTransition,
} from "react";
import { flushSync } from "react-dom";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useStorage } from "@ui/providers/StorageProvider";
import type { StorageMode } from "@ui/providers/StorageProvider";
import { useAuth } from "@ui/providers/AuthProvider";
import {
  validateImport,
  mergeDecisions,
  MAX_FILE_SIZE_BYTES,
  type MergeDecisionsDiff,
  type ConflictDecision,
  type ConflictAction,
  type ConflictInfo,
  type ImportOutcome,
} from "@app/api/export-import-service";
import type { UserPreferences, Project } from "@domain/models/types";

// --- State machine types ---------------------------------------------------

export type ImportState =
  | { step: "idle" }
  | { step: "error"; error: string; details?: string }
  | {
      step: "preview";
      projects: Project[];
      conflicts: ConflictInfo[];
      nameConflicts: ConflictInfo[];
      decisions: ConflictDecision[];
      preferences?: UserPreferences;
      cloudRefreshed?: boolean;
      cloudRefreshDiff?: MergeDecisionsDiff;
    }
  | { step: "applying" }
  | { step: "done"; outcome: ImportOutcome; total: number };

// --- Transition helpers (pitfall #11) --------------------------------------

function showError(error: string, details?: string): ImportState {
  return { step: "error", error, details };
}

function showPreview(
  projects: Project[],
  conflicts: ConflictInfo[],
  nameConflicts: ConflictInfo[],
  decisions: ConflictDecision[],
  preferences?: UserPreferences
): ImportState {
  return {
    step: "preview",
    projects,
    conflicts,
    nameConflicts,
    decisions,
    preferences,
  };
}

function showApplying(): ImportState {
  return { step: "applying" };
}

function showDone(outcome: ImportOutcome, total: number): ImportState {
  return { step: "done", outcome, total };
}

function clearImportFlow(): ImportState {
  return { step: "idle" };
}

// --- Default-decision builder ----------------------------------------------

/**
 * ID conflicts default to 'skip' (pitfall #22 — avoid silent data loss).
 * Name conflicts default to 'copy' (incoming is probably worth keeping).
 */
function buildInitialDecisions(
  idConflicts: ConflictInfo[],
  nameConflicts: ConflictInfo[]
): ConflictDecision[] {
  return [
    ...idConflicts.map<ConflictDecision>((c) => ({
      importedProjectId: c.importedProject.id,
      kind: "id",
      originalExistingId: c.existingProject.id,
      action: "skip",
    })),
    ...nameConflicts.map<ConflictDecision>((c) => ({
      importedProjectId: c.importedProject.id,
      kind: "name",
      originalExistingId: c.existingProject.id,
      action: "copy",
    })),
  ];
}

// --- Hook contract ---------------------------------------------------------

export interface UseImportStateOptions {
  /**
   * Used by the cloud-invalidation effect to re-run validateImport against
   * the now-fresh project list. Handlers themselves read projects via
   * useProjectStore.getState() at call time (pitfall #49).
   */
  currentProjects: Project[];
}

export interface UseImportStateResult {
  importState: ImportState;
  mode: StorageMode;
  cloudDataLoaded: boolean;
  applyPreferences: boolean;
  toggleApplyPreferences: () => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  previewHeadingRef: React.RefObject<HTMLHeadingElement | null>;
  handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  updateDecision: (importedProjectId: string, action: ConflictAction) => void;
  handleConfirmImport: () => Promise<void>;
  cancelImport: () => void;
}

export function useImportState({
  currentProjects,
}: UseImportStateOptions): UseImportStateResult {
  const { mode } = useStorage();
  const { user } = useAuth();
  // Owner stamped here for adds/copies (importer's uid in cloud, null in local).
  // Replaces preserve existing.owner inside the store action (pitfall #7).
  const owner = mode === "cloud" && user ? user.uid : null;

  const cloudDataLoaded = useProjectStore((s) => s.cloudDataLoaded);

  const [importState, setImportState] = useState<ImportState>({ step: "idle" });
  // Default false: applying preferences is destructive (pitfall #90).
  const [applyPreferences, setApplyPreferences] = useState(false);
  const toggleApplyPreferences = useCallback(
    () => setApplyPreferences((p) => !p),
    []
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const readerPendingRef = useRef<FileReader | null>(null);
  /**
   * Cached file text — retained across cloud-hydration re-validation so the
   * preview can rebuild without re-reading the file. Cleared on error,
   * unmount, done, and cancel.
   */
  const lastFileTextRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);
  /**
   * Apply-active guard (pitfall #59 family / v7 C-2).
   * Set synchronously at handleConfirmImport entry; cleared in finally.
   * Closes the double-confirm race that the state-based guard cannot:
   * a rapid second click invokes the same useCallback closure (importState
   * is closure-captured) before React commits the applying state.
   */
  const inFlightRef = useRef(false);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      lastFileTextRef.current = null;
    },
    []
  );

  // Focus management — heading focused on preview entry and on re-pick.
  const prevStepRef = useRef<string>("idle");
  const previewProjectsRef = useRef<Project[] | null>(null);
  useEffect(() => {
    const step = importState.step;
    const prevStep = prevStepRef.current;
    prevStepRef.current = step;
    if (step === "preview") {
      const projects = (
        importState as Extract<ImportState, { step: "preview" }>
      ).projects;
      if (
        prevStep !== "preview" ||
        previewProjectsRef.current !== projects
      ) {
        previewHeadingRef.current?.focus();
      }
      previewProjectsRef.current = projects;
    } else {
      previewProjectsRef.current = null;
    }
  }, [importState]);

  // Mode-change preview invalidation (v7 H-1). When the user toggles storage
  // mode while a preview/error is showing, the underlying project list
  // semantics changed. Clear the flow rather than apply stale decisions.
  const prevModeRef = useRef(mode);
  useEffect(() => {
    if (prevModeRef.current !== mode) {
      prevModeRef.current = mode;
      const step = importState.step;
      if (step === "preview" || step === "error") {
        lastFileTextRef.current = null;
        setImportState(clearImportFlow());
      }
    }
  }, [mode, importState.step]);

  // Cloud-invalidation re-validation: fires when cloudDataLoaded flips true
  // (initial load OR peer-driven model refresh via handleModelsChanged).
  // Rebuilds the preview against the now-fresh project list and merges prior
  // user decisions via mergeDecisions.
  const prevCloudDataLoadedRef = useRef(cloudDataLoaded);
  useEffect(() => {
    const wasLoaded = prevCloudDataLoadedRef.current;
    prevCloudDataLoadedRef.current = cloudDataLoaded;
    if (!cloudDataLoaded || wasLoaded || mode !== "cloud") return;
    if (importState.step !== "preview") return;
    const rawText = lastFileTextRef.current;
    if (!rawText) {
      if (isMountedRef.current) {
        setImportState(
          showError(
            "Cloud projects finished loading.",
            "Please re-select your file to check for conflicts."
          )
        );
      }
      return;
    }
    startTransition(() => {
      const result = validateImport(rawText, currentProjects);
      if (!result.success) {
        if (isMountedRef.current) {
          setImportState(showError(result.error, result.details));
        }
        return;
      }
      const freshDecisions = buildInitialDecisions(
        result.conflicts,
        result.nameConflicts
      );
      const { decisions: mergedDecisions, diff } = mergeDecisions(
        (importState as Extract<ImportState, { step: "preview" }>).decisions,
        freshDecisions
      );
      if (isMountedRef.current) {
        // Reset opt-in: the conflict landscape changed; prior intent may not
        // apply to the rebuilt preview.
        setApplyPreferences(false);
        setImportState({
          step: "preview",
          projects: result.projects,
          conflicts: result.conflicts,
          nameConflicts: result.nameConflicts,
          decisions: mergedDecisions,
          preferences: result.preferences,
          cloudRefreshed: true,
          cloudRefreshDiff: diff,
        });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- effect fires on cloudDataLoaded false→true only; mode change is handled by the prevModeRef effect above.
  }, [cloudDataLoaded]);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return; // cancelled picker — leave state untouched

      // Cloud gate FIRST so we don't show a transient idle render on a known-failing pick.
      if (mode === "cloud" && !cloudDataLoaded) {
        setImportState(
          showError(
            "Cloud projects are still loading.",
            "Please wait for sync to complete before importing."
          )
        );
        e.target.value = "";
        return;
      }

      // fileError clear on new pick (pitfall #79): unconditional reset.
      setImportState(clearImportFlow());

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setImportState(
          showError(
            `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB)`,
            `Maximum allowed is ${(MAX_FILE_SIZE_BYTES / 1024 / 1024).toFixed(0)} MB.`
          )
        );
        e.target.value = "";
        return;
      }

      // Abort any in-flight read from a prior pick (pitfall #48 family).
      if (readerPendingRef.current) {
        readerPendingRef.current.abort();
      }

      const reader = new FileReader();
      readerPendingRef.current = reader;

      reader.onload = () => {
        if (readerPendingRef.current !== reader) return; // stale (aborted) reader
        if (!isMountedRef.current) return;
        readerPendingRef.current = null;
        try {
          const text = reader.result as string;
          lastFileTextRef.current = text;
          // Read CURRENT projects at handler-execution time (pitfall #49).
          const { projects } = useProjectStore.getState();
          const result = validateImport(text, projects);
          if (!result.success) {
            setImportState(showError(result.error, result.details));
            return;
          }
          const decisions = buildInitialDecisions(
            result.conflicts,
            result.nameConflicts
          );
          setApplyPreferences(false); // reset opt-in on new file (pitfall #90)
          setImportState(
            showPreview(
              result.projects,
              result.conflicts,
              result.nameConflicts,
              decisions,
              result.preferences
            )
          );
        } catch (err) {
          setImportState(
            showError(
              "The file could not be processed.",
              err instanceof Error
                ? err.message
                : "If this persists, please report a bug."
            )
          );
        }
      };

      reader.onerror = () => {
        if (readerPendingRef.current !== reader) return; // stale reader
        if (!isMountedRef.current) return;
        readerPendingRef.current = null;
        setImportState(
          showError(
            "Failed to read file.",
            "The file may be corrupted or inaccessible."
          )
        );
      };

      // pitfall #48: readAsText can throw synchronously (InvalidStateError).
      try {
        reader.readAsText(file);
      } catch {
        readerPendingRef.current = null;
        if (isMountedRef.current) {
          setImportState(showError("Could not read file.", "Please try again."));
        }
      }

      e.target.value = ""; // allow the same file to be re-selected
      // currentProjects NOT in deps — read via getState() (pitfall #49).
    },
    [mode, cloudDataLoaded]
  );

  // pitfall #19: immutable Map round-trip; do not mutate decisions in place.
  const updateDecision = useCallback(
    (importedProjectId: string, action: ConflictAction) => {
      setImportState((prev) => {
        if (prev.step !== "preview") return prev;
        const decisionsMap = new Map(
          prev.decisions.map((d) => [d.importedProjectId, d])
        );
        const existing = decisionsMap.get(importedProjectId);
        if (!existing) return prev;
        decisionsMap.set(importedProjectId, { ...existing, action });
        return { ...prev, decisions: [...decisionsMap.values()] };
      });
    },
    []
  );

  const cancelImport = useCallback(() => {
    if (importState.step === "applying") return; // no cancel mid-write
    if (inFlightRef.current) return; // ref guard mirrors state guard
    lastFileTextRef.current = null;
    setImportState(clearImportFlow());
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [importState.step]);

  const handleConfirmImport = useCallback(async () => {
    if (importState.step !== "preview") return;
    // Ref guard (v7 C-2): closure-stale state guard alone is insufficient
    // because a rapid second click reads the previous render's importState.
    if (inFlightRef.current) return;
    if (mode === "cloud" && !cloudDataLoaded) {
      setImportState(
        showError("Cloud data is still loading. Please wait and try again.")
      );
      return;
    }

    inFlightRef.current = true;
    try {
      const { projects, decisions, preferences } = importState;
      const total = projects.length;
      // Stamp owner for adds/copies (pitfall #7). Replaces override this with
      // existing.owner inside the store action — the spread order makes it
      // deterministic.
      const stampedProjects = projects.map((p) => ({ ...p, owner }));

      // Applying-state observability (pitfall #86 + v7 reconciliation):
      // flushSync forces synchronous React commit (a11y tree updated
      // immediately); the subsequent setTimeout(0) yields a macrotask so the
      // browser can actually paint before the synchronous merge runs.
      // flushSync alone does not paint on fast devices; setTimeout alone
      // does not guarantee React commits before the yield resumes.
      flushSync(() => setImportState(showApplying()));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      try {
        const outcome = useProjectStore.getState().importProjects({
          importedProjects: stampedProjects,
          decisions,
        });
        if (preferences && applyPreferences) {
          // Restore-to-bundle semantics: overwrites ALL preference fields
          // with bundle values. User opted in explicitly.
          usePreferencesStore.getState().updatePreferences(preferences);
        }
        if (isMountedRef.current) {
          lastFileTextRef.current = null;
          setImportState(showDone(outcome, total));
        }
      } catch (err) {
        if (isMountedRef.current) {
          setImportState(
            showError(
              "Import failed.",
              err instanceof Error
                ? err.message
                : "An unexpected error occurred."
            )
          );
        }
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [importState, owner, mode, cloudDataLoaded, applyPreferences]);

  return {
    importState,
    mode,
    cloudDataLoaded,
    applyPreferences,
    toggleApplyPreferences,
    fileInputRef,
    previewHeadingRef,
    handleFileChange,
    updateDecision,
    handleConfirmImport,
    cancelImport,
  };
}
