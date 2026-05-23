// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useShallow } from "zustand/react/shallow";
import { useProjectStore } from "@ui/hooks/use-project-store";

/**
 * Bundle of project-store state + actions consumed by ProjectPage. Extracted
 * to keep the page component focused on orchestration rather than the
 * 40-field shallow selector. Add new fields here when ProjectPage needs them
 * — keep the field set in sync with the page's destructure to avoid pulling
 * in subscriptions that aren't actually read.
 */
export function useProjectActions() {
  return useProjectStore(
    useShallow((s) => ({
      projects: s.projects,
      loadProjects: s.loadProjects,
      addScenario: s.addScenario,
      deleteScenario: s.deleteScenario,
      duplicateScenario: s.duplicateScenario,
      addActivity: s.addActivity,
      insertActivityAfterActivity: s.insertActivityAfterActivity,
      insertActivityAfterBand: s.insertActivityAfterBand,
      deleteActivity: s.deleteActivity,
      updateActivityField: s.updateActivityField,
      addBand: s.addBand,
      deleteBand: s.deleteBand,
      updateBand: s.updateBand,
      reorderWithBands: s.reorderWithBands,
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
      updateDependencyType: s.updateDependencyType,
      addMilestone: s.addMilestone,
      removeMilestone: s.removeMilestone,
      updateMilestone: s.updateMilestone,
      assignActivityToMilestone: s.assignActivityToMilestone,
      setActivityStartsAtMilestone: s.setActivityStartsAtMilestone,
      updateProjectField: s.updateProjectField,
      updateGanttAppearance: s.updateGanttAppearance,
      updateScenarioNotes: s.updateScenarioNotes,
      reorderScenarios: s.reorderScenarios,
      beginUndoGroup: s.beginUndoGroup,
      endUndoGroup: s.endUndoGroup,
    })),
  );
}
