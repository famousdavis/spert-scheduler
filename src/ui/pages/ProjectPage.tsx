import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useSimulation } from "@ui/hooks/use-simulation";
import { useSchedule } from "@ui/hooks/use-schedule";
import { useScheduleBuffer } from "@ui/hooks/use-schedule-buffer";
import { usePreferencesStore } from "@ui/hooks/use-preferences-store";
import type { ScenarioSettings } from "@domain/models/types";
import { BASELINE_SCENARIO_NAME } from "@domain/models/types";
import { formatDateISO } from "@core/calendar/calendar";
import { computeDeterministicDurations } from "@core/schedule/deterministic";
import { ScenarioTabs } from "@ui/components/ScenarioTabs";
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
    duplicateActivity,
    deleteActivity,
    updateActivityField,
    moveActivity,
    setSimulationResults,
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
  } = useProjectStore();

  const simulation = useSimulation();

  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [newScenarioOpen, setNewScenarioOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [allActivitiesValid, setAllActivitiesValid] = useState(true);
  const [compareMode, setCompareMode] = useState(false);
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
  }, [project?.id, project?.scenarios.length, addScenario]);

  useEffect(() => {
    if (project && project.scenarios.length > 0 && !activeScenarioId) {
      setActiveScenarioId(project.scenarios[0]!.id);
    }
  }, [project, activeScenarioId]);

  const scenario = project?.scenarios.find((s) => s.id === activeScenarioId);

  // Deterministic schedule uses the activity-level probability target
  const schedule = useSchedule(
    scenario?.activities ?? [],
    scenario?.startDate ?? "2025-01-06",
    scenario?.settings.probabilityTarget ?? 0.5,
    project?.globalCalendarOverride
  );

  // Schedule buffer = MC percentile at project target - deterministic total
  const buffer = useScheduleBuffer(
    schedule?.totalDurationDays ?? null,
    scenario?.simulationResults,
    scenario?.settings.probabilityTarget ?? 0.5,
    scenario?.settings.projectProbabilityTarget ?? 0.95
  );

  // Auto-run simulation on activity/settings changes (debounced 500ms)
  const autoRunSimulation = usePreferencesStore(
    (s) => s.preferences.autoRunSimulation
  );
  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const activitiesRef = useRef(scenario?.activities);
  activitiesRef.current = scenario?.activities;

  useEffect(() => {
    if (
      !autoRunSimulation ||
      !allActivitiesValid ||
      !scenario ||
      scenario.activities.length === 0 ||
      simulation.isRunning
    ) {
      return;
    }

    clearTimeout(autoRunTimerRef.current);
    autoRunTimerRef.current = setTimeout(() => {
      if (!id || !activitiesRef.current || activitiesRef.current.length === 0)
        return;
      const deterministicDurations = computeDeterministicDurations(
        activitiesRef.current,
        scenario.settings.probabilityTarget
      );
      simulation.run(
        activitiesRef.current,
        scenario.settings.trialCount,
        scenario.settings.rngSeed,
        deterministicDurations,
        (result) => {
          setSimulationResults(id, scenario.id, result);
        }
      );
    }, 500);

    return () => clearTimeout(autoRunTimerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    autoRunSimulation,
    allActivitiesValid,
    scenario?.activities,
    scenario?.settings.probabilityTarget,
    scenario?.settings.projectProbabilityTarget,
    scenario?.settings.trialCount,
    scenario?.settings.rngSeed,
  ]);

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
    [id, project, duplicateScenario]
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
    [id, project, activeScenarioId, deleteScenario]
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
    [id, cloneSourceId, duplicateScenario]
  );

  const handleRunSimulation = useCallback(() => {
    if (!id || !scenario) return;

    const deterministicDurations = computeDeterministicDurations(
      scenario.activities,
      scenario.settings.probabilityTarget
    );

    simulation.run(
      scenario.activities,
      scenario.settings.trialCount,
      scenario.settings.rngSeed,
      deterministicDurations,
      (result) => {
        setSimulationResults(id, scenario.id, result);
      }
    );
  }, [id, scenario, simulation, setSimulationResults]);

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
          calendar={project.globalCalendarOverride}
        />
      )}
      {compareMode && compareScenarios.length < 2 && (
        <p className="text-sm text-gray-400">
          Select 2-3 scenarios above to compare.
        </p>
      )}

      {/* Active scenario content */}
      {scenario ? (
        <div className="space-y-6">
          {/* Scenario Summary Card — prominent dates, targets, buffer */}
          <ScenarioSummaryCard
            startDate={scenario.startDate}
            schedule={schedule}
            buffer={buffer}
            calendar={project.globalCalendarOverride}
            settings={scenario.settings}
            hasSimulationResults={!!scenario.simulationResults}
            onSettingsChange={handleSettingsChange}
            onNewSeed={handleNewSeed}
            isLocked={scenario.locked}
            onToggleLock={() => toggleScenarioLock(id!, scenario.id)}
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
            onDuplicate={(activityId) =>
              duplicateActivity(id!, scenario.id, activityId)
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
          />

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

      {/* Printable Report (hidden on screen, visible when printing) */}
      {scenario && (
        <PrintableReport
          project={project}
          scenario={scenario}
          schedule={schedule}
          scheduledActivities={schedule?.activities ?? []}
          buffer={buffer}
        />
      )}
    </div>
  );
}
