// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useEffect, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useSimulation } from "@ui/hooks/use-simulation";
import { useSchedule } from "@ui/hooks/use-schedule";
import { useScheduleBuffer } from "@ui/hooks/use-schedule-buffer";
import { useMilestoneBuffers } from "@ui/hooks/use-milestone-buffers";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import { useAutoRunSimulation } from "@ui/hooks/use-auto-run-simulation";
import { getLastScenarioId, setLastScenarioId } from "@infrastructure/persistence/scenario-memory";
import type { ScenarioSettings } from "@domain/models/types";
import { BASELINE_SCENARIO_NAME } from "@domain/models/types";
import { formatDateISO } from "@core/calendar/calendar";
import { useWorkCalendar } from "@ui/hooks/use-work-calendar";
import { CalendarConfigurationError } from "@core/calendar/work-calendar";
import { computeDependencySchedule, computeDependencyDurations } from "@core/schedule/deterministic";
import { buildDependencyGraph, computeCriticalPathActivities } from "@core/schedule/dependency-graph";
import { buildSimulationParams } from "@ui/helpers/build-simulation-params";
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
import { PrintableReport } from "@ui/components/PrintableReport";
import { SensitivityPanel } from "@ui/components/SensitivityPanel";
import { SharingSection } from "@ui/components/SharingSection";
import { ScheduleExportButton } from "@ui/components/ScheduleExportButton";
import { ActivityEditModal } from "@ui/components/ActivityEditModal";
import { WarningsPanel } from "@ui/components/WarningsPanel";

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
    deleteActivity,
    updateActivityField,
    moveActivity,
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
    addMilestone,
    removeMilestone,
    updateMilestone,
    assignActivityToMilestone,
    setActivityStartsAtMilestone,
  } = useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
      loadProjects: s.loadProjects,
      addScenario: s.addScenario,
      deleteScenario: s.deleteScenario,
      duplicateScenario: s.duplicateScenario,
      addActivity: s.addActivity,
      deleteActivity: s.deleteActivity,
      updateActivityField: s.updateActivityField,
      moveActivity: s.moveActivity,
      setSimulationResults: s.setSimulationResults,
      updateScenarioStartDate: s.updateScenarioStartDate,
      updateScenarioSettings: s.updateScenarioSettings,
      renameProject: s.renameProject,
      renameScenario: s.renameScenario,
      bulkUpdateActivities: s.bulkUpdateActivities,
      bulkDeleteActivities: s.bulkDeleteActivities,
      undo: s.undo,
      redo: s.redo,
      canUndo: s.canUndo,
      canRedo: s.canRedo,
      toggleScenarioLock: s.toggleScenarioLock,
      addDependency: s.addDependency,
      removeDependency: s.removeDependency,
      updateDependencyLag: s.updateDependencyLag,
      addMilestone: s.addMilestone,
      removeMilestone: s.removeMilestone,
      updateMilestone: s.updateMilestone,
      assignActivityToMilestone: s.assignActivityToMilestone,
      setActivityStartsAtMilestone: s.setActivityStartsAtMilestone,
    }))
  );

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
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
  const [selectedForCompare, setSelectedForCompare] = useState<Set<string>>(
    () => new Set()
  );

  useEffect(() => {
    if (projects.length === 0) {
      loadProjects();
    }
  }, [projects.length, loadProjects]);

  const project = projects.find((p) => p.id === id);

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

  // Assembled work calendar: work week + holidays + converted work days
  const workCalendar = useWorkCalendar(id ?? "");

  // Deterministic schedule — uses sequential or dependency-aware engine
  const sequentialSchedule = useSchedule(
    scenario?.settings.dependencyMode ? [] : (scenario?.activities ?? []),
    scenario?.startDate ?? "2025-01-06",
    scenario?.settings.probabilityTarget ?? 0.5,
    workCalendar,
    setCalendarError
  );

  const depMode = scenario?.settings.dependencyMode;
  const activities = scenario?.activities;
  const dependencies = scenario?.dependencies;
  const startDate = scenario?.startDate;
  const probTarget = scenario?.settings.probabilityTarget;
  const milestones = scenario?.milestones;

  const dependencySchedule = useMemo(() => {
    if (!depMode || !activities || activities.length === 0 || !dependencies || !startDate || probTarget == null) return null;
    try {
      setCalendarError(null);
      return computeDependencySchedule(
        activities,
        dependencies,
        startDate,
        probTarget,
        workCalendar,
        milestones
      );
    } catch (err) {
      if (err instanceof CalendarConfigurationError) {
        setCalendarError(err.message);
      }
      return null;
    }
  }, [depMode, activities, dependencies, startDate, probTarget, workCalendar, milestones]);

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
      return null;
    }
  }, [depMode, activities, dependencies, probTarget]);

  const schedule = scenario?.settings.dependencyMode ? dependencySchedule : sequentialSchedule;

  // Schedule buffer = MC percentile at project target - deterministic total
  const buffer = useScheduleBuffer(
    schedule?.totalDurationDays ?? null,
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
      duplicateScenario(id, sourceScenarioId, name);
      const updatedProject = useProjectStore.getState().getProject(id);
      if (updatedProject && updatedProject.scenarios.length > 0) {
        setActiveScenarioId(
          updatedProject.scenarios[updatedProject.scenarios.length - 1]!.id
        );
      }
    },
    [id, project, duplicateScenario, setActiveScenarioId]
  );

  const handleDeleteScenario = useCallback(
    (scenarioId: string) => {
      if (!id || !project) return;
      // Protect baseline (first scenario) from deletion
      if (scenarioId === project.scenarios[0]?.id) return;
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
      duplicateScenario(id, cloneSourceId, newName, { dropCompleted });
      const updatedProject = useProjectStore.getState().getProject(id);
      if (updatedProject && updatedProject.scenarios.length > 0) {
        setActiveScenarioId(
          updatedProject.scenarios[updatedProject.scenarios.length - 1]!.id
        );
      }
    },
    [id, cloneSourceId, duplicateScenario, setActiveScenarioId]
  );

  const handleRunSimulation = useCallback(() => {
    if (!id || !scenario) return;

    const params = buildSimulationParams(
      scenario.activities,
      scenario.settings.dependencyMode,
      scenario.settings.probabilityTarget,
      scenario.dependencies,
      scenario.milestones,
      scenario.startDate,
      workCalendar,
    );
    simulation.run(
      scenario.activities,
      scenario.settings.trialCount,
      scenario.settings.rngSeed,
      params.deterministicDurations,
      (result) => {
        setSimulationResults(id, scenario.id, result);
      },
      params.dependencyParams,
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

  const handleToggleCompare = useCallback((scenarioId: string) => {
    setSelectedForCompare((prev) => {
      const next = new Set(prev);
      if (next.has(scenarioId)) {
        next.delete(scenarioId);
      } else if (next.size < 3) {
        next.add(scenarioId);
      }
      return next;
    });
  }, []);

  const handleToggleCompareMode = useCallback(() => {
    setCompareMode((prev) => {
      if (!prev) {
        // Entering compare mode: clear selection
        setSelectedForCompare(new Set());
      }
      return !prev;
    });
  }, []);

  const compareScenarios =
    compareMode && project
      ? project.scenarios.filter((s) => selectedForCompare.has(s.id))
      : [];

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400">Project not found.</p>
        <button
          onClick={() => navigate("/projects")}
          className="mt-2 text-blue-600 hover:underline text-sm"
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
            className="text-2xl font-bold text-gray-900 dark:text-gray-100"
            inputClassName="text-2xl font-bold text-gray-900 dark:text-gray-100"
          />
        </h1>
        <div className="flex items-center gap-1">
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
      <div className="flex items-center justify-between">
        <ScenarioTabs
          scenarios={project.scenarios}
          activeScenarioId={activeScenarioId}
          onSelect={setActiveScenarioId}
          onAdd={() => setNewScenarioOpen(true)}
          onClone={handleCloneStart}
          onDelete={handleDeleteScenario}
          onRename={(scenarioId, name) => renameScenario(id!, scenarioId, name)}
          onToggleLock={(scenarioId) => toggleScenarioLock(id!, scenarioId)}
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

      {/* Calendar configuration error banner */}
      {calendarError && (
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm font-medium text-red-800 dark:text-red-300">
            Calendar Configuration Error
          </p>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {calendarError} Check your work week settings in Settings.
          </p>
        </div>
      )}

      {/* Constraint conflict warnings */}
      {schedule?.constraintConflicts && schedule.constraintConflicts.length > 0 && (
        <WarningsPanel conflicts={schedule.constraintConflicts} />
      )}

      {/* Sequential-mode banner when constraints exist */}
      {scenario && !scenario.settings.dependencyMode && scenario.activities.some((a) => a.constraintType != null) && (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg p-4">
          <p className="text-sm text-blue-700 dark:text-blue-300">
            Scheduling constraints are inactive in sequential mode. Switch to dependency mode to enable constraint scheduling.
          </p>
        </div>
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
          />

          {/* Validation errors */}
          {!allActivitiesValid && (
            <ValidationSummary activities={scenario.activities} />
          )}

          {/* Unified Activity Grid — input + schedule merged */}
          <UnifiedActivityGrid
            activities={scenario.activities}
            scheduledActivities={schedule?.activities ?? []}
            activityProbabilityTarget={scenario.settings.probabilityTarget}
            onUpdate={(activityId, updates) =>
              updateActivityField(id!, scenario.id, activityId, updates)
            }
            onDelete={(activityId) =>
              deleteActivity(id!, scenario.id, activityId)
            }
            onMove={(from, to) => moveActivity(id!, scenario.id, from, to)}
            onAdd={(name) => addActivity(id!, scenario.id, name)}
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
          />

          {/* Schedule Export — XLSX / CSV */}
          <ScheduleExportButton
            projectName={project.name}
            scenarioName={scenario.name}
            activities={scenario.activities}
            schedule={schedule}
            buffer={buffer}
            settings={scenario.settings}
            dependencies={scenario.dependencies}
            milestones={scenario.milestones}
            calendar={workCalendar}
            hasSimulationResults={!!scenario.simulationResults}
            onRunSimulation={handleRunSimulation}
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
            />
          )}

          {/* Dependency Panel — only shown when dependency mode is on */}
          {scenario.settings.dependencyMode && (
            <DependencyPanel
              activities={scenario.activities}
              dependencies={scenario.dependencies}
              onAddDependency={(fromId, toId, type, lag) =>
                addDependency(id!, scenario.id, fromId, toId, type, lag)
              }
              onRemoveDependency={(fromId, toId) =>
                removeDependency(id!, scenario.id, fromId, toId)
              }
              onUpdateLag={(fromId, toId, lag) =>
                updateDependencyLag(id!, scenario.id, fromId, toId, lag)
              }
              isLocked={scenario.locked}
            />
          )}

          {/* Gantt Chart */}
          {schedule && scenario.activities.length > 0 && (
            <GanttSection
              projectName={project.name}
              activities={scenario.activities}
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
            projectName={project.name}
            scenarioName={scenario.name}
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

      {/* Activity Edit Modal (constraints) */}
      {editingActivityId && scenario && (
        <ActivityEditModal
          activityId={editingActivityId}
          scenarioId={scenario.id}
          projectId={id!}
          onClose={() => setEditingActivityId(null)}
          schedule={schedule ?? undefined}
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
        />
      )}
    </div>
  );
}
