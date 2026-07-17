// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useProjectActions } from "@ui/hooks/use-project-actions";
import { useSimulation } from "@ui/hooks/use-simulation";
import { useSchedule, type ScheduleError } from "@ui/hooks/use-schedule";
import { useScheduleBuffer } from "@ui/hooks/use-schedule-buffer";
import { useMilestoneBuffers } from "@ui/hooks/use-milestone-buffers";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useAutoRunSimulation } from "@ui/hooks/use-auto-run-simulation";
import { getLastScenarioId, setLastScenarioId } from "@infrastructure/persistence/scenario-memory";
import type { Activity, ScenarioSettings, DeterministicSchedule } from "@domain/models/types";
import { BASELINE_SCENARIO_NAME, DEFAULT_GANTT_APPEARANCE, MAX_SCENARIOS_PER_PROJECT } from "@domain/models/types";
import { formatDateISO, parseDateISO, countWorkingDays, durationToFinishDateISO } from "@core/calendar/calendar";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { useWorkCalendar } from "@ui/hooks/use-work-calendar";
import { computeTargetRAGColor } from "@core/schedule/target-rag";
import { isCalendarError } from "@core/calendar/work-calendar";
import { computeDependencySchedule, computeDependencyDurations } from "@core/schedule/deterministic";
import { buildDependencyGraph, computeCriticalPathActivities } from "@core/schedule/dependency-graph";
import { buildSimulationParams, type SimulationParams } from "@ui/helpers/build-simulation-params";
import { currentSimulationGeneration } from "@infrastructure/simulation/simulation-cancellation";
import { toast } from "@ui/hooks/use-notification-store";
import { ScenarioTabs } from "@ui/components/ScenarioTabs";
import { DependencyPanel } from "@ui/components/DependencyPanel";
import { MilestonePanel } from "@ui/components/MilestonePanel";
import { GanttSection } from "@ui/components/GanttSection";
import { UnifiedActivityGrid } from "@ui/components/UnifiedActivityGrid";
import { ScenarioSummaryCard } from "@ui/components/ScenarioSummaryCard";
import { SimulationPanel } from "@ui/components/SimulationPanel";
import { NewScenarioDialog } from "@ui/components/NewScenarioDialog";
import { CloneScenarioDialog } from "@ui/components/CloneScenarioDialog";
import { InlineEdit } from "@ui/components/InlineEdit";

import { ValidationSummary } from "@ui/components/ValidationSummary";
import { ScenarioComparisonTable } from "@ui/components/ScenarioComparison";
import { useScenarioComparison } from "@ui/hooks/use-scenario-comparison";
import { PrintableReport } from "@ui/components/PrintableReport";
import { SensitivityPanel } from "@ui/components/SensitivityPanel";
import { SharingSection } from "@ui/components/SharingSection";
import { ActivityEditModal } from "@ui/components/ActivityEditModal";
import { DependencyEditModal } from "@ui/components/DependencyEditModal";
import { WarningsPanel } from "@ui/components/WarningsPanel";
import { isFirebaseAvailable } from "@infrastructure/firebase/firebase";
import { useAiConnectivity } from "@ui/hooks/use-ai-connectivity";
import { ConnectAiConsentModal } from "@ui/components/ConnectAI/ConnectAiConsentModal";
import { ConnectAiPanel } from "@ui/components/ConnectAI/ConnectAiPanel";
import { AI_CONSENT_KEY, AI_SESSION_ID_KEY, AI_CONSENT_VERSION } from "@app/ai-connectivity-constants";
import type { AiOpResult } from "@app/api/ai-batch-service";

/**
 * Banner copy for a schedule-computation error. isCalendarError (set via the
 * shared, two-shape work-calendar.ts predicate) picks the calendar-specific
 * heading/advice; every other error gets the generic estimate-oriented copy.
 * Module-level early-null-return helper so the branch stays out of ProjectPage's
 * render body (keeps the component's cognitive complexity down).
 */
function getScheduleErrorBanner(
  error: ScheduleError | null
): { heading: string; message: string; advice: string } | null {
  if (!error) return null;
  return error.isCalendarError
    ? {
        heading: "Calendar Configuration Error",
        message: error.message,
        advice: "Check your work week settings in Settings.",
      }
    : {
        heading: "Schedule Error",
        message: error.message,
        advice: "Check the affected activity's estimates and settings.",
      };
}

export function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    projects,
    loadProjects,
    addScenario,
    deleteScenario,
    duplicateScenario,
    addActivity,
    insertActivityAfterActivity,
    insertActivityAfterBand,
    deleteActivity,
    updateActivityField,
    addBand,
    deleteBand,
    updateBand,
    reorderWithBands,
    setSimulationResults,
    updateScenarioStartDate,
    updateScenarioSettings,
    renameProject,
    renameScenario,
    bulkUpdateActivities,
    bulkDeleteActivities,
    undo,
    redo,
    canUndo,
    canRedo,
    toggleScenarioLock,
    addDependency,
    removeDependency,
    updateDependencyLag,
    updateDependencyType,
    addMilestone,
    removeMilestone,
    updateMilestone,
    assignActivityToMilestone,
    setActivityStartsAtMilestone,
    updateProjectField,
    updateGanttAppearance,
    updateScenarioNotes,
    reorderScenarios,
    beginUndoGroup,
    endUndoGroup,
  } = useProjectActions();

  const simulation = useSimulation();

  const [activeScenarioId, setActiveScenarioIdRaw] = useState<string | null>(null);
  // Persist active scenario to localStorage whenever it changes
  const setActiveScenarioId = useCallback(
    (scenarioId: string | null) => {
      setActiveScenarioIdRaw(scenarioId);
      if (id && scenarioId) setLastScenarioId(id, scenarioId);
    },
    [id],
  );
  const [newScenarioOpen, setNewScenarioOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [allActivitiesValid, setAllActivitiesValid] = useState(true);
  const [sequentialScheduleError, setSequentialScheduleError] = useState<ScheduleError | null>(null);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [editingDependency, setEditingDependency] = useState<{ fromActivityId: string; toActivityId: string } | null>(null);
  const [addingDependencyFromId, setAddingDependencyFromId] = useState<string | null>(null);

  useEffect(() => {
    if (projects.length === 0) {
      loadProjects();
    }
  }, [projects.length, loadProjects]);

  const project = projects.find((p) => p.id === id);
  const showActivityNumbers = project?.showActivityIds ?? false;

  // Backfill legacy projects that have no scenarios
  useEffect(() => {
    if (project && project.scenarios.length === 0) {
      addScenario(project.id, BASELINE_SCENARIO_NAME, formatDateISO(new Date()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally fires only on project existence/count change, not full object
  }, [project?.id, project?.scenarios.length, addScenario]);

  useEffect(() => {
    if (project && project.scenarios.length > 0 && !activeScenarioId) {
      // Restore last-active scenario from localStorage, fallback to first scenario
      const stored = getLastScenarioId(project.id);
      const match = stored && project.scenarios.find((s) => s.id === stored);
      setActiveScenarioIdRaw(match ? stored : project.scenarios[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs on id/scenario count change only
  }, [project?.id, project?.scenarios.length, activeScenarioId]);

  const scenario = project?.scenarios.find((s) => s.id === activeScenarioId);

  // Set document.title so "Save as PDF" defaults to a descriptive filename
  const projectName = project?.name;
  useEffect(() => {
    if (!projectName) return;
    const today = new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    document.title = `SPERT Scheduler for ${projectName} - ${today}`;
    return () => {
      document.title = "SPERT Scheduler";
    };
  }, [projectName]);

  // Activity numbering map — session-only, built when toggle is on
  const activityNumberMap = useMemo(() => {
    if (!showActivityNumbers || !scenario) return null;
    const map = new Map<string, number>();
    scenario.activities.forEach((a, i) => map.set(a.id, i + 1));
    return map;
  }, [showActivityNumbers, scenario]);

  const formatActivityName = useCallback(
    (a: Activity) => {
      const num = activityNumberMap?.get(a.id);
      return num ? `#${num} ${a.name}` : a.name;
    },
    [activityNumberMap]
  );

  // Assembled work calendar: work week + holidays + converted work days
  const workCalendar = useWorkCalendar(id ?? "");

  // ── AI Connectivity ──────────────────────────────────────────────────────
  // Mounted here (not a wrapping layout) because activeScenarioId and the
  // assembled workCalendar are both local to this component.
  const applyAiBatch = useProjectStore((s) => s.applyAiBatch);
  const clearAiUndoFrame = useProjectStore((s) => s.clearAiUndoFrame);
  const [aiFeed, setAiFeed] = useState<AiOpResult[]>([]);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const handleAiResults = useCallback((results: AiOpResult[]) => {
    setAiFeed((prev) => [...results, ...prev].slice(0, 100));
  }, []);
  const { sessionState, startSession, stopSession, changePermissions } = useAiConnectivity({
    project: project ?? null,
    activeScenarioId,
    workCalendar,
    applyAiBatch,
    clearAiUndoFrame,
    onResults: handleAiResults,
  });
  const handleConnectAiClick = useCallback(() => {
    if (sessionState.sessionActive) {
      setShowAiPanel(true);
      return;
    }
    const stored = (() => {
      try {
        return JSON.parse(localStorage.getItem(AI_CONSENT_KEY) ?? "null") as
          | { version?: number; read?: boolean }
          | null;
      } catch {
        return null;
      }
    })();
    const storedSessionId = localStorage.getItem(AI_SESSION_ID_KEY);
    if (stored?.version === AI_CONSENT_VERSION && storedSessionId) {
      startSession(stored.read ?? false)
        .then((ok) => { if (ok) setShowAiPanel(true); })
        .catch(console.error);
    } else {
      setShowAiConsent(true);
    }
  }, [sessionState.sessionActive, startSession]);
  const handleAiConsentConnect = useCallback(async (consentRead: boolean) => {
    const ok = await startSession(consentRead);
    if (ok) {
      setShowAiConsent(false);
      setShowAiPanel(true);
    }
    return ok;
  }, [startSession]);

  // Deterministic schedule — uses sequential or dependency-aware engine
  const sequentialSchedule = useSchedule(
    scenario?.settings.dependencyMode ? [] : (scenario?.activities ?? []),
    scenario?.startDate ?? "2025-01-06",
    scenario?.settings.probabilityTarget ?? 0.5,
    workCalendar,
    setSequentialScheduleError
  );

  const depMode = scenario?.settings.dependencyMode;
  const activities = scenario?.activities;
  const dependencies = scenario?.dependencies;
  const startDate = scenario?.startDate;
  const probTarget = scenario?.settings.probabilityTarget;
  const milestones = scenario?.milestones;

  // Compute the dependency schedule purely — no state-setting during render.
  // null = no error (including "not yet computed"/n/a); every thrown error has an
  // owner now, so this is a simple ScheduleError | null contract — no third,
  // "undefined" state. isCalendarError (via the shared work-calendar.ts predicate)
  // distinguishes a genuine calendar problem from every other schedule error, so
  // the banner (below) can show the right advice for each.
  const dependencyScheduleResult = useMemo<{
    schedule: DeterministicSchedule | null;
    scheduleError: ScheduleError | null;
  }>(() => {
    if (!depMode || !activities || activities.length === 0 || !dependencies || !startDate || probTarget == null) {
      return { schedule: null, scheduleError: null };
    }
    try {
      const schedule = computeDependencySchedule(
        activities,
        dependencies,
        startDate,
        probTarget,
        workCalendar,
        milestones
      );
      return { schedule, scheduleError: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { schedule: null, scheduleError: { message, isCalendarError: isCalendarError(err) } };
    }
  }, [depMode, activities, dependencies, startDate, probTarget, workCalendar, milestones]);

  const dependencySchedule = dependencyScheduleResult.schedule;

  // Unified schedule error for display. In dependency mode the schedule memo above
  // derives it (no state write); otherwise the sequential useSchedule drives
  // `sequentialScheduleError`. The two paths are mutually exclusive on depMode.
  const scheduleError = depMode ? dependencyScheduleResult.scheduleError : sequentialScheduleError;
  const scheduleErrorBanner = getScheduleErrorBanner(scheduleError);

  // Critical path activity IDs (only in dependency mode)
  const criticalPathIds = useMemo(() => {
    if (!depMode || !activities || activities.length === 0 || !dependencies || probTarget == null) return null;
    try {
      const graph = buildDependencyGraph(
        activities.map((a) => a.id),
        dependencies
      );
      const durationMap = computeDependencyDurations(activities, probTarget);
      return computeCriticalPathActivities(graph, durationMap).criticalActivityIds;
    } catch {
      // Deliberately left as a bare, silent catch — not generalized like the memos
      // above (see ProjectPage.tsx's dependencyScheduleResult memo, and
      // use-schedule.ts). computeDependencyDurations (called here) and
      // computeDependencySchedule (called by dependencyScheduleResult, same
      // activities/dependencies) both route every activity through the same
      // createDistributionForActivity call — whatever throws here also throws
      // there, so the schedule-error banner is already showing the same
      // underlying message whenever this silently drops, for any well-formed
      // scenario (one with a non-empty startDate — the one guard this memo and
      // dependencyScheduleResult's don't share, practically unreachable
      // otherwise). The cost of a swallowed failure here is critical-path
      // highlighting on the Gantt not appearing — cosmetic, not the "app looks
      // broken" failure mode this release exists to fix. This is a deliberate
      // scope decision (see the v0.53.0 implementation plan, §2/§3/§5/§9), not
      // an oversight.
      return null;
    }
  }, [depMode, activities, dependencies, probTarget]);

  const schedule = scenario?.settings.dependencyMode ? dependencySchedule : sequentialSchedule;

  // Schedule buffer = MC percentile at project target - deterministic span
  const buffer = useScheduleBuffer(
    schedule?.spanDays ?? null,
    scenario?.simulationResults,
    scenario?.settings.probabilityTarget ?? 0.5,
    scenario?.settings.projectProbabilityTarget ?? 0.95
  );

  // Activity IDs with soft constraint warnings (for grid badge highlighting)
  const constraintWarningIds = useMemo(() => {
    const conflicts = schedule?.constraintConflicts;
    if (!conflicts || conflicts.length === 0) return undefined;
    const ids = new Set<string>();
    for (const c of conflicts) {
      if (c.constraintMode === "soft" && c.severity === "warning") {
        ids.add(c.activityId);
      }
    }
    return ids.size > 0 ? ids : undefined;
  }, [schedule?.constraintConflicts]);

  // Milestone buffers
  const milestoneBuffers = useMilestoneBuffers(
    scenario?.milestones ?? [],
    schedule?.activities ?? [],
    scenario?.activities ?? [],
    scenario?.simulationResults,
    scenario?.startDate ?? "2025-01-06",
    scenario?.settings.projectProbabilityTarget ?? 0.95,
    workCalendar
  );

  const autoRunSimulation = usePreferencesStore(
    (s) => s.preferences.autoRunSimulation,
  );
  const targetFinishGreenPct = usePreferencesStore((s) => s.preferences.targetFinishGreenPct ?? 80);
  const targetFinishAmberPct = usePreferencesStore((s) => s.preferences.targetFinishAmberPct ?? 50);

  // Compute Finish Target RAG color
  const targetRAGColor = useMemo(
    () =>
      computeTargetRAGColor({
        targetFinishDate: project?.targetFinishDate,
        percentiles: scenario?.simulationResults?.percentiles,
        startDate: scenario?.startDate,
        greenPct: targetFinishGreenPct,
        amberPct: targetFinishAmberPct,
        calendar: workCalendar,
      }),
    [project?.targetFinishDate, scenario?.simulationResults?.percentiles, scenario?.startDate, targetFinishGreenPct, targetFinishAmberPct, workCalendar],
  );

  // Format a simulation duration (days) as a projected finish date for CDF tooltips
  const formatDate = useDateFormat();
  const formatDurationAsDate = useCallback(
    (days: number): string => {
      const sd = scenario?.startDate;
      if (!sd) return "";
      const finish = durationToFinishDateISO(sd, days, workCalendar);
      return finish ? formatDate(finish) : "";
    },
    [scenario?.startDate, workCalendar, formatDate]
  );

  // Convert a target date to working days from scenario start (for CDF date lookup)
  const dateToWorkingDays = useCallback(
    (targetDateISO: string): number | null => {
      const sd = scenario?.startDate;
      if (!sd) return null;
      const days = countWorkingDays(parseDateISO(sd), parseDateISO(targetDateISO), workCalendar) + 1;
      return days > 0 ? days : null;
    },
    [scenario?.startDate, workCalendar]
  );

  // Auto-run simulation on activity/settings changes (debounced 500ms)
  useAutoRunSimulation({
    projectId: id,
    scenario,
    allActivitiesValid,
    workCalendar,
    isRunning: simulation.isRunning,
    runSimulation: simulation.run,
    setSimulationResults,
  });

  // Undo/Redo keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.key === "z" && e.shiftKey) || e.key === "y") {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [undo, redo]);

  const handleAddScenario = useCallback(
    (name: string, sourceScenarioId: string) => {
      if (!id || !project) return;
      if (project.scenarios.length >= MAX_SCENARIOS_PER_PROJECT) {
        toast.error(
          `This project already has the maximum of ${MAX_SCENARIOS_PER_PROJECT} scenarios. Remove one to add another.`
        );
        return;
      }
      const newId = duplicateScenario(id, sourceScenarioId, name);
      if (newId) setActiveScenarioId(newId);
    },
    [id, project, duplicateScenario, setActiveScenarioId]
  );

  const handleDeleteScenario = useCallback(
    (scenarioId: string) => {
      if (!id || !project) return;
      // Protect last remaining scenario from deletion
      if (project.scenarios.length <= 1) return;
      if (!confirm("Delete this scenario?")) return;
      deleteScenario(id, scenarioId);
      if (scenarioId === activeScenarioId) {
        const updatedProject = useProjectStore.getState().getProject(id);
        setActiveScenarioId(updatedProject?.scenarios[0]?.id ?? null);
      }
    },
    [id, project, activeScenarioId, deleteScenario, setActiveScenarioId]
  );

  const handleCloneStart = useCallback((scenarioId: string) => {
    setCloneSourceId(scenarioId);
    setCloneDialogOpen(true);
  }, []);

  const handleClone = useCallback(
    (newName: string, dropCompleted: boolean) => {
      if (!id || !cloneSourceId) return;
      if (project && project.scenarios.length >= MAX_SCENARIOS_PER_PROJECT) {
        toast.error(
          `This project already has the maximum of ${MAX_SCENARIOS_PER_PROJECT} scenarios. Remove one to add another.`
        );
        return;
      }
      const newId = duplicateScenario(id, cloneSourceId, newName, { dropCompleted });
      if (newId) setActiveScenarioId(newId);
    },
    [id, project, cloneSourceId, duplicateScenario, setActiveScenarioId]
  );

  const handleRunSimulation = useCallback(() => {
    if (!id || !scenario) return;

    let params: SimulationParams;
    try {
      params = buildSimulationParams(
        scenario.activities,
        scenario.settings.dependencyMode,
        scenario.settings.probabilityTarget,
        scenario.dependencies,
        scenario.milestones,
        scenario.startDate,
        workCalendar,
        scenario.settings.parkinsonsLawEnabled ?? true,
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
      return;
    }
    // v0.42.6 (M2): see use-auto-run-simulation.ts for the full pattern.
    // Capture generation at dispatch; discard the result if sign-out has
    // bumped the counter while the worker was in flight.
    const startGen = currentSimulationGeneration();
    simulation.run(
      scenario.activities,
      scenario.settings.trialCount,
      scenario.settings.rngSeed,
      params.deterministicDurations,
      (result) => {
        if (currentSimulationGeneration() !== startGen) return;
        setSimulationResults(id, scenario.id, result);
      },
      params.dependencyParams,
      params.sequentialConstraints,
    );
  }, [id, scenario, simulation, setSimulationResults, workCalendar]);

  const handleSettingsChange = useCallback(
    (updates: Partial<ScenarioSettings>) => {
      if (!id || !scenario) return;
      updateScenarioSettings(id, scenario.id, updates);
    },
    [id, scenario, updateScenarioSettings]
  );

  const handleNewSeed = useCallback(() => {
    if (!id || !scenario) return;
    const newSeed = crypto.randomUUID();
    updateScenarioSettings(id, scenario.id, { rngSeed: newSeed });
  }, [id, scenario, updateScenarioSettings]);

  const {
    compareMode,
    selectedForCompare,
    handleToggleCompare,
    handleToggleCompareMode,
    compareScenarios,
  } = useScenarioComparison(project?.scenarios ?? []);

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-lg font-medium text-gray-900 dark:text-gray-100">
          This project is no longer available.
        </p>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          It may have been deleted or is no longer shared with you.
        </p>
        <button
          onClick={() => navigate("/projects")}
          className="mt-4 text-blue-600 hover:underline text-sm"
        >
          Back to projects
        </button>
      </div>
    );
  }

  const cloneSource = project.scenarios.find((s) => s.id === cloneSourceId);

  return (
    <div className="space-y-6">
      {/* Header with project name and actions */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
          <InlineEdit
            value={project.name}
            onSave={(name) => renameProject(id!, name)}
            name="projectName"
            ariaLabel="Project name"
            className="text-2xl font-bold text-gray-900 dark:text-gray-100"
            inputClassName="text-2xl font-bold text-gray-900 dark:text-gray-100"
          />
        </h1>
        <div className="flex items-center gap-1">
          {isFirebaseAvailable && (
            <button
              onClick={handleConnectAiClick}
              title={sessionState.sessionActive ? "AI session active" : "Connect an AI assistant"}
              aria-label={sessionState.sessionActive ? "AI session active" : "Connect an AI assistant"}
              className={`flex items-center gap-1.5 px-2 py-1 text-sm rounded-md no-print transition-colors ${
                sessionState.sessionActive
                  ? "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20"
                  : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {sessionState.sessionActive && (
                <span className={`w-1.5 h-1.5 rounded-full ${
                  sessionState.aiConnected ? "bg-blue-500 animate-pulse" : "bg-gray-400"
                }`} />
              )}
              {sessionState.sessionActive ? "AI" : "Connect AI"}
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 no-print"
            title="Print Report"
            aria-label="Print project report"
          >
            <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            Print
          </button>
          <button
            onClick={undo}
            disabled={!canUndo()}
            className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:text-gray-200 dark:disabled:text-gray-600"
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            onClick={redo}
            disabled={!canRedo()}
            className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700 disabled:text-gray-300 disabled:cursor-not-allowed dark:text-gray-400 dark:hover:text-gray-200 dark:disabled:text-gray-600"
            title="Redo (Ctrl+Shift+Z)"
          >
            Redo
          </button>
        </div>
      </div>

      {/* Scenario tabs + compare toggle */}
      <div className="flex items-center justify-between min-w-0">
        <ScenarioTabs
          scenarios={project.scenarios}
          activeScenarioId={activeScenarioId}
          onSelect={setActiveScenarioId}
          onAdd={() => setNewScenarioOpen(true)}
          onClone={handleCloneStart}
          onDelete={handleDeleteScenario}
          onRename={(scenarioId, name) => renameScenario(id!, scenarioId, name)}
          onToggleLock={(scenarioId) => toggleScenarioLock(id!, scenarioId)}
          onReorder={(from, to) => reorderScenarios(id!, from, to)}
          compareMode={compareMode}
          selectedForCompare={selectedForCompare}
          onToggleCompare={handleToggleCompare}
        />
        {project.scenarios.length >= 2 && (
          <button
            onClick={handleToggleCompareMode}
            className={`px-3 py-1.5 text-sm rounded transition-colors shrink-0 ${
              compareMode
                ? "bg-blue-100 text-blue-700 font-medium"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
            }`}
          >
            {compareMode ? "Exit Compare" : "Compare"}
          </button>
        )}
      </div>

      {/* Scenario comparison table */}
      {compareMode && compareScenarios.length >= 2 && (
        <ScenarioComparisonTable
          scenarios={compareScenarios}
          calendar={workCalendar}
        />
      )}
      {compareMode && compareScenarios.length < 2 && (
        <p className="text-sm text-gray-400">
          Select 2-3 scenarios above to compare.
        </p>
      )}

      {/* Schedule computation error banner (was calendar-specific; now general).
          Heading + advice come from getScheduleErrorBanner (module-level), whose
          isCalendarError branch uses the shared, two-shape work-calendar.ts
          predicate — not a narrower reimplementation. */}
      {scheduleErrorBanner && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            {scheduleErrorBanner.heading}
          </p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {scheduleErrorBanner.message} {scheduleErrorBanner.advice}
          </p>
        </div>
      )}

      {/* Constraint conflict / dependency violation warnings */}
      {((schedule?.constraintConflicts && schedule.constraintConflicts.length > 0) ||
        (schedule?.dependencyConflicts && schedule.dependencyConflicts.length > 0)) && (
        <WarningsPanel
          conflicts={schedule?.constraintConflicts ?? []}
          dependencyConflicts={schedule?.dependencyConflicts}
          activityNumberMap={activityNumberMap}
        />
      )}

      {/* Active scenario content */}
      {scenario ? (
        <div className="space-y-6">
          {/* Scenario Summary Card — prominent dates, targets, buffer */}
          <ScenarioSummaryCard
            startDate={scenario.startDate}
            schedule={schedule}
            buffer={buffer}
            calendar={workCalendar}
            settings={scenario.settings}
            hasSimulationResults={!!scenario.simulationResults}
            onSettingsChange={handleSettingsChange}
            onStartDateChange={(startDate) =>
              updateScenarioStartDate(id!, scenario.id, startDate)
            }
            onNewSeed={handleNewSeed}
            isLocked={scenario.locked}
            onToggleLock={() => toggleScenarioLock(id!, scenario.id)}
            milestoneBuffers={milestoneBuffers}
            projectName={project.name}
            scenarioName={scenario.name}
            activities={scenario.activities}
            bands={scenario.bands ?? []}
            dependencies={scenario.dependencies}
            milestones={scenario.milestones}
            onRunSimulation={handleRunSimulation}
            targetFinishDate={project.targetFinishDate ?? null}
            onTargetFinishDateChange={(date) =>
              updateProjectField(id!, {
                targetFinishDate: date,
              })
            }
            targetRAGColor={targetRAGColor}
            scenarioNotes={scenario.notes}
            onScenarioNotesChange={(notes) => {
              // Defensive begin: idempotent during normal typing (group already
              // active from onFocus); the only time it does work is the keystroke
              // immediately after a mid-edit undo()/redo() cleared the group.
              beginUndoGroup(id!);
              updateScenarioNotes(id!, scenario.id, notes);
            }}
            onScenarioNotesFocus={() => beginUndoGroup(id!)}
            onScenarioNotesBlur={() => endUndoGroup()}
          />

          {/* Validation errors */}
          {!allActivitiesValid && (
            <ValidationSummary activities={scenario.activities} />
          )}

          {/* Unified Activity Grid — input + schedule merged */}
          <UnifiedActivityGrid
            activities={scenario.activities}
            bands={scenario.bands ?? []}
            scheduledActivities={schedule?.activities ?? []}
            activityProbabilityTarget={scenario.settings.probabilityTarget}
            onUpdate={(activityId, updates) =>
              updateActivityField(id!, scenario.id, activityId, updates)
            }
            onDelete={(activityId) =>
              deleteActivity(id!, scenario.id, activityId)
            }
            onAdd={(name) => addActivity(id!, scenario.id, name)}
            onInsertAfterActivity={(afterId) =>
              insertActivityAfterActivity(id!, scenario.id, afterId)
            }
            onInsertAfterBand={(bandId) =>
              insertActivityAfterBand(id!, scenario.id, bandId)
            }
            onAddBand={() => addBand(id!, scenario.id)}
            onDeleteBand={(bandId) => deleteBand(id!, scenario.id, bandId)}
            onUpdateBand={(bandId, updates) =>
              updateBand(id!, scenario.id, bandId, updates)
            }
            onReorderWithBands={(activities, bands) =>
              reorderWithBands(id!, scenario.id, activities, bands)
            }
            onValidityChange={setAllActivitiesValid}
            onBulkUpdate={(activityIds, updates) =>
              bulkUpdateActivities(id!, scenario.id, activityIds, updates)
            }
            onBulkDelete={(activityIds) =>
              bulkDeleteActivities(id!, scenario.id, activityIds)
            }
            isScenarioLocked={scenario.locked}
            heuristicEnabled={scenario.settings.heuristicEnabled}
            heuristicMinPercent={scenario.settings.heuristicMinPercent}
            heuristicMaxPercent={scenario.settings.heuristicMaxPercent}
            calendar={workCalendar}
            dependencyMode={scenario.settings.dependencyMode}
            onEditActivity={setEditingActivityId}
            constraintWarningIds={constraintWarningIds}
            activityNumberMap={activityNumberMap}
          />

          {/* Milestone Panel — only shown when dependency mode is on */}
          {scenario.settings.dependencyMode && (
            <MilestonePanel
              milestones={scenario.milestones}
              activities={scenario.activities}
              milestoneBuffers={milestoneBuffers}
              onAddMilestone={(name, targetDate) =>
                addMilestone(id!, scenario.id, name, targetDate)
              }
              onRemoveMilestone={(milestoneId) =>
                removeMilestone(id!, scenario.id, milestoneId)
              }
              onUpdateMilestone={(milestoneId, updates) =>
                updateMilestone(id!, scenario.id, milestoneId, updates)
              }
              onAssignActivity={(activityId, milestoneId) =>
                assignActivityToMilestone(id!, scenario.id, activityId, milestoneId)
              }
              onSetStartsAt={(activityId, milestoneId) =>
                setActivityStartsAtMilestone(id!, scenario.id, activityId, milestoneId)
              }
              isLocked={scenario.locked}
              formatActivityName={formatActivityName}
            />
          )}

          {/* Dependency Panel — only shown when dependency mode is on */}
          {scenario.settings.dependencyMode && (
            <DependencyPanel
              activities={scenario.activities}
              dependencies={scenario.dependencies}
              schedule={schedule ?? undefined}
              onAddDependency={(fromId, toId, type, lag) =>
                addDependency(id!, scenario.id, fromId, toId, type, lag)
              }
              onRemoveDependency={(fromId, toId) =>
                removeDependency(id!, scenario.id, fromId, toId)
              }
              onUpdateLag={(fromId, toId, lag) =>
                updateDependencyLag(id!, scenario.id, fromId, toId, lag)
              }
              onUpdateType={(fromId, toId, type) =>
                updateDependencyType(id!, scenario.id, fromId, toId, type)
              }
              onEditDependency={(fromId, toId) => setEditingDependency({ fromActivityId: fromId, toActivityId: toId })}
              isLocked={scenario.locked}
              formatActivityName={formatActivityName}
            />
          )}

          {/* Gantt Chart */}
          {schedule && scenario.activities.length > 0 && (
            <GanttSection
              projectName={project.name}
              activities={scenario.activities}
              bands={scenario.bands ?? []}
              scheduledActivities={schedule.activities}
              projectStartDate={scenario.startDate}
              projectEndDate={schedule.projectEndDate}
              buffer={buffer}
              dependencies={scenario.dependencies}
              dependencyMode={scenario.settings.dependencyMode}
              activityTarget={scenario.settings.probabilityTarget}
              projectTarget={scenario.settings.projectProbabilityTarget}
              calendar={workCalendar}
              milestones={scenario.milestones}
              milestoneBuffers={milestoneBuffers}
              criticalPathIds={criticalPathIds}
              onEditActivity={setEditingActivityId}
              onRenameActivity={(activityId, newName) =>
                updateActivityField(id!, scenario.id, activityId, { name: newName })
              }
              onRenameBand={(bandId, newName) =>
                updateBand(id!, scenario.id, bandId, { name: newName })
              }
              onEditDependency={(fromId, toId) => setEditingDependency({ fromActivityId: fromId, toActivityId: toId })}
              isLocked={scenario.locked}
              showActivityNumbers={showActivityNumbers}
              onToggleActivityNumbers={(v) =>
                updateProjectField(id!, { showActivityIds: v })
              }
              showTargetOnGantt={project.showTargetOnGantt ?? false}
              onToggleShowTarget={(v) =>
                updateProjectField(id!, { showTargetOnGantt: v })
              }
              hasTargetDate={!!project.targetFinishDate}
              targetFinishDate={project.targetFinishDate ?? null}
              targetRAGColor={targetRAGColor}
              ganttAppearance={project.ganttAppearance ?? DEFAULT_GANTT_APPEARANCE}
              onAppearanceChange={(a) => updateGanttAppearance(id!, a)}
            />
          )}

          {/* Monte Carlo Simulation */}
          <SimulationPanel
            simulationResults={scenario.simulationResults}
            probabilityTarget={scenario.settings.projectProbabilityTarget}
            activityProbabilityTarget={scenario.settings.probabilityTarget}
            isRunning={simulation.isRunning}
            progress={simulation.progress}
            error={simulation.error}
            elapsedMs={simulation.elapsedMs}
            allActivitiesValid={allActivitiesValid}
            hasActivities={scenario.activities.length > 0}
            autoRunEnabled={autoRunSimulation}
            deterministicSpan={schedule?.spanDays}
            projectName={project.name}
            scenarioName={scenario.name}
            formatDurationAsDate={formatDurationAsDate}
            dateToWorkingDays={dateToWorkingDays}
            targetFinishGreenPct={targetFinishGreenPct}
            targetFinishAmberPct={targetFinishAmberPct}
            onRun={handleRunSimulation}
            onCancel={simulation.cancel}
          />

          {/* Sensitivity Analysis */}
          {scenario.activities.length >= 2 && (
            <SensitivityPanel activities={scenario.activities} />
          )}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-gray-400">
            No scenarios yet. Create one to start estimating.
          </p>
        </div>
      )}

      {/* Project Sharing (cloud mode only) */}
      <SharingSection projectId={id!} />

      {/* Dialogs */}
      <NewScenarioDialog
        open={newScenarioOpen}
        onOpenChange={setNewScenarioOpen}
        scenarios={project.scenarios}
        onCreate={handleAddScenario}
      />
      {cloneSource && (
        <CloneScenarioDialog
          open={cloneDialogOpen}
          onOpenChange={setCloneDialogOpen}
          sourceName={cloneSource.name}
          onClone={handleClone}
        />
      )}

      {/* Activity Edit Modal (full editor) */}
      {editingActivityId && scenario && (
        <ActivityEditModal
          activityId={editingActivityId}
          scenarioId={scenario.id}
          projectId={id!}
          onClose={() => setEditingActivityId(null)}
          schedule={schedule ?? undefined}
          dependencyMode={scenario.settings.dependencyMode}
          heuristicEnabled={scenario.settings.heuristicEnabled}
          heuristicMinPercent={scenario.settings.heuristicMinPercent}
          heuristicMaxPercent={scenario.settings.heuristicMaxPercent}
          onEditDependency={(fromId, toId) => {
            setEditingActivityId(null);
            setEditingDependency({ fromActivityId: fromId, toActivityId: toId });
          }}
          onAddDependency={(fromId) => {
            setEditingActivityId(null);
            setAddingDependencyFromId(fromId);
          }}
          activityNumberMap={activityNumberMap}
        />
      )}

      {/* Dependency Edit Modal (edit mode — from arrow click or activity modal) */}
      {editingDependency && scenario && (
        <DependencyEditModal
          fromActivityId={editingDependency.fromActivityId}
          toActivityId={editingDependency.toActivityId}
          activities={scenario.activities}
          dependencies={scenario.dependencies}
          onSave={(fromId, toId, type, lagDays) => {
            const pairChanged = fromId !== editingDependency.fromActivityId || toId !== editingDependency.toActivityId;
            if (pairChanged) {
              // Predecessor/successor changed: delete old, add new
              removeDependency(id!, scenario.id, editingDependency.fromActivityId, editingDependency.toActivityId);
              addDependency(id!, scenario.id, fromId, toId, type, lagDays);
            } else {
              // Same pair: just update type and lag
              updateDependencyType(id!, scenario.id, fromId, toId, type);
              updateDependencyLag(id!, scenario.id, fromId, toId, lagDays);
            }
          }}
          onDelete={(fromId, toId) => {
            removeDependency(id!, scenario.id, fromId, toId);
          }}
          onClose={() => setEditingDependency(null)}
          formatActivityName={formatActivityName}
        />
      )}

      {/* Dependency Edit Modal (add mode — from activity modal) */}
      {addingDependencyFromId && scenario && (
        <DependencyEditModal
          fromActivityId={addingDependencyFromId}
          activities={scenario.activities}
          dependencies={scenario.dependencies}
          onSave={(fromId, toId, type, lagDays) => {
            addDependency(id!, scenario.id, fromId, toId, type, lagDays);
          }}
          onClose={() => setAddingDependencyFromId(null)}
          formatActivityName={formatActivityName}
        />
      )}

      {/* Printable Report (hidden on screen, visible when printing) */}
      {scenario && (
        <PrintableReport
          project={project}
          scenario={scenario}
          schedule={schedule}
          scheduledActivities={schedule?.activities ?? []}
          buffer={buffer}
          milestoneBuffers={milestoneBuffers}
          calendar={workCalendar}
          criticalPathIds={criticalPathIds}
          targetRAGColor={targetRAGColor}
        />
      )}

      <ConnectAiConsentModal
        open={showAiConsent}
        onClose={() => setShowAiConsent(false)}
        onConnect={handleAiConsentConnect}
      />
      <ConnectAiPanel
        open={showAiPanel}
        onClose={() => setShowAiPanel(false)}
        sessionState={sessionState}
        onChangePermissions={changePermissions}
        onDisconnect={stopSession}
        feedItems={aiFeed}
      />
    </div>
  );
}
