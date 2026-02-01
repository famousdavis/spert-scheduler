import { useState, useCallback, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useSimulation } from "@ui/hooks/use-simulation";
import { useSchedule } from "@ui/hooks/use-schedule";
import { useScheduleBuffer } from "@ui/hooks/use-schedule-buffer";
import type { ScenarioSettings } from "@domain/models/types";
import { createDistributionForActivity } from "@core/distributions/factory";
import { ScenarioTabs } from "@ui/components/ScenarioTabs";
import { UnifiedActivityGrid } from "@ui/components/UnifiedActivityGrid";
import { ScenarioSummaryCard } from "@ui/components/ScenarioSummaryCard";
import { SimulationPanel } from "@ui/components/SimulationPanel";
import { NewScenarioDialog } from "@ui/components/NewScenarioDialog";
import { CloneScenarioDialog } from "@ui/components/CloneScenarioDialog";

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
    updateScenarioSettings,
  } = useProjectStore();

  const simulation = useSimulation();

  const [activeScenarioId, setActiveScenarioId] = useState<string | null>(null);
  const [newScenarioOpen, setNewScenarioOpen] = useState(false);
  const [cloneDialogOpen, setCloneDialogOpen] = useState(false);
  const [cloneSourceId, setCloneSourceId] = useState<string | null>(null);
  const [allActivitiesValid, setAllActivitiesValid] = useState(true);

  useEffect(() => {
    if (projects.length === 0) {
      loadProjects();
    }
  }, [projects.length, loadProjects]);

  const project = projects.find((p) => p.id === id);

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

  const handleAddScenario = useCallback(
    (name: string, startDate: string) => {
      if (!id) return;
      addScenario(id, name, startDate);
      const updatedProject = useProjectStore.getState().getProject(id);
      if (updatedProject && updatedProject.scenarios.length > 0) {
        setActiveScenarioId(
          updatedProject.scenarios[updatedProject.scenarios.length - 1]!.id
        );
      }
    },
    [id, addScenario]
  );

  const handleDeleteScenario = useCallback(
    (scenarioId: string) => {
      if (!id) return;
      if (!confirm("Delete this scenario?")) return;
      deleteScenario(id, scenarioId);
      if (scenarioId === activeScenarioId) {
        const updatedProject = useProjectStore.getState().getProject(id);
        setActiveScenarioId(updatedProject?.scenarios[0]?.id ?? null);
      }
    },
    [id, activeScenarioId, deleteScenario]
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

    // Compute Parkinson's Law floor for each non-complete activity:
    // work expands to fill the time allotted (scheduled duration).
    const deterministicDurations = scenario.activities
      .filter((a) => !(a.status === "complete" && a.actualDuration != null))
      .map((a) => {
        const dist = createDistributionForActivity(a);
        return Math.max(1, Math.ceil(dist.inverseCDF(scenario.settings.probabilityTarget)));
      });

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
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate("/projects")}
          className="text-gray-400 hover:text-gray-600"
        >
          &larr;
        </button>
        <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
      </div>

      {/* Scenario tabs */}
      <ScenarioTabs
        scenarios={project.scenarios}
        activeScenarioId={activeScenarioId}
        onSelect={setActiveScenarioId}
        onAdd={() => setNewScenarioOpen(true)}
        onClone={handleCloneStart}
        onDelete={handleDeleteScenario}
      />

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
          />

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
          />

          {/* Monte Carlo Simulation */}
          <SimulationPanel
            simulationResults={scenario.simulationResults}
            probabilityTarget={scenario.settings.projectProbabilityTarget}
            isRunning={simulation.isRunning}
            progress={simulation.progress}
            error={simulation.error}
            elapsedMs={simulation.elapsedMs}
            allActivitiesValid={allActivitiesValid}
            hasActivities={scenario.activities.length > 0}
            onRun={handleRunSimulation}
            onCancel={simulation.cancel}
          />
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
    </div>
  );
}
