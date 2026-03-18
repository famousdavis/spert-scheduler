// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useRef, useCallback } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type {
  ConstraintType,
  ConstraintMode,
  ConstraintConflict,
  DeterministicSchedule,
} from "@domain/models/types";
import { CONSTRAINT_TYPES, CONSTRAINT_MODES } from "@domain/models/types";
import { useProjectStore } from "@ui/hooks/use-project-store";
import { useWorkCalendar } from "@ui/hooks/use-work-calendar";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { parseDateISO, isWorkingDay, formatDateISO } from "@core/calendar/calendar";
import { detectConstraintConflict } from "@core/schedule/constraint-utils";

/** Human-readable labels for constraint types. */
const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  MSO: "Must Start On",
  MFO: "Must Finish On",
  SNET: "Start No Earlier Than",
  SNLT: "Start No Later Than",
  FNET: "Finish No Earlier Than",
  FNLT: "Finish No Later Than",
};

interface ActivityEditModalProps {
  activityId: string;
  scenarioId: string;
  projectId: string;
  onClose: () => void;
  schedule: DeterministicSchedule | undefined;
}

export function ActivityEditModal({
  activityId,
  scenarioId,
  projectId,
  onClose,
  schedule,
}: ActivityEditModalProps) {
  // -- Store selectors --
  const activity = useProjectStore((s) => {
    const project = s.projects.find((p) => p.id === projectId);
    const scenario = project?.scenarios.find((sc) => sc.id === scenarioId);
    return scenario?.activities.find((a) => a.id === activityId);
  });

  const updateActivityField = useProjectStore((s) => s.updateActivityField);

  const calendar = useWorkCalendar(projectId);
  const formatDate = useDateFormat();

  // -- Local draft state --
  const [constraintType, setConstraintType] = useState<ConstraintType | null>(
    activity?.constraintType ?? null
  );
  const [constraintDate, setConstraintDate] = useState<string | null>(
    activity?.constraintDate ?? null
  );
  const [constraintMode, setConstraintMode] = useState<ConstraintMode | null>(
    activity?.constraintMode ?? null
  );
  const [dateAdjustedNote, setDateAdjustedNote] = useState<string | null>(null);

  // -- Conflict preview (200ms debounce) --
  const [conflictPreview, setConflictPreview] = useState<ConstraintConflict | null>(null);
  const conflictTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!constraintType || !constraintDate || !constraintMode) {
      setConflictPreview(null); // eslint-disable-line react-hooks/set-state-in-effect
      return;
    }

    clearTimeout(conflictTimerRef.current);
    conflictTimerRef.current = setTimeout(() => {
      // Find this activity's scheduled entry
      const sa = schedule?.activities.find((a) => a.activityId === activityId);
      if (!sa) {
        setConflictPreview(null);
        return;
      }

      const esNet = sa.startDate;
      const efNet = sa.endDate;
      const lsNet = sa.lateStartNet ?? sa.startDate;
      const lfNet = sa.lateFinishNet ?? sa.endDate;

      const conflict = detectConstraintConflict(
        esNet,
        efNet,
        lsNet,
        lfNet,
        constraintType,
        constraintDate,
        constraintMode,
        activityId,
        activity?.name ?? "",
        calendar,
      );
      setConflictPreview(conflict);
    }, 200);

    return () => clearTimeout(conflictTimerRef.current);
  }, [constraintType, constraintDate, constraintMode, schedule, activityId, activity?.name, calendar]);

  // -- Milestone anchor guard --
  const hasMilestoneAnchor = !!activity?.startsAtMilestoneId;

  // -- Date picker handler: snap non-working days --
  const handleDateChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value;
      if (!raw) {
        setConstraintDate(null);
        setDateAdjustedNote(null);
        return;
      }

      const date = parseDateISO(raw);
      while (!isWorkingDay(date, calendar)) {
        date.setDate(date.getDate() + 1);
      }
      const normalized = formatDateISO(date);

      setConstraintDate(normalized);
      if (normalized !== raw) {
        setDateAdjustedNote(
          `Adjusted from ${formatDate(raw)} to ${formatDate(normalized)} (non-working day)`
        );
      } else {
        setDateAdjustedNote(null);
      }
    },
    [calendar, formatDate]
  );

  // -- Type change: auto-set mode to "hard" if first selection --
  const handleTypeChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const val = e.target.value;
      if (!val) {
        setConstraintType(null);
        setConstraintMode(null);
        setConstraintDate(null);
        setDateAdjustedNote(null);
        setConflictPreview(null);
        return;
      }
      const newType = val as ConstraintType;
      setConstraintType(newType);
      if (!constraintMode) {
        setConstraintMode("hard");
      }
    },
    [constraintMode]
  );

  // -- Save --
  const handleSave = useCallback(() => {
    updateActivityField(projectId, scenarioId, activityId, {
      constraintType: constraintType ?? null,
      constraintDate: constraintType ? (constraintDate ?? null) : null,
      constraintMode: constraintType ? (constraintMode ?? null) : null,
    });
    onClose();
  }, [
    updateActivityField,
    projectId,
    scenarioId,
    activityId,
    constraintType,
    constraintDate,
    constraintMode,
    onClose,
  ]);

  // -- Clear --
  const handleClear = useCallback(() => {
    setConstraintType(null);
    setConstraintDate(null);
    setConstraintMode(null);
    setDateAdjustedNote(null);
    setConflictPreview(null);
  }, []);

  // Determine if save is valid (either cleared or all three set)
  const isValid =
    !constraintType || (!!constraintType && !!constraintDate && !!constraintMode);

  if (!activity) return null;

  // Scheduled dates for context display
  const sa = schedule?.activities.find((a) => a.activityId === activityId);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-lg z-50">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            Edit Activity
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {activity.name}
          </Dialog.Description>

          {/* Scheduled dates context */}
          {sa && (
            <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 flex gap-4">
              <span>Start: {formatDate(sa.startDate)}</span>
              <span>End: {formatDate(sa.endDate)}</span>
              {sa.totalFloat != null && (
                <span>Float: {sa.totalFloat}d</span>
              )}
            </div>
          )}

          <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
            <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
              Scheduling Constraint
            </h3>

            {hasMilestoneAnchor ? (
              <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded p-3">
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Scheduling constraints are not available when a milestone anchor is set.
                  Remove the milestone anchor in the Milestone panel to enable constraints.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Constraint Type */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                    Type
                  </label>
                  <select
                    value={constraintType ?? ""}
                    onChange={handleTypeChange}
                    className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">None</option>
                    {CONSTRAINT_TYPES.map((ct) => (
                      <option key={ct} value={ct}>
                        {ct} — {CONSTRAINT_LABELS[ct]}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Constraint Date (only when type selected) */}
                {constraintType && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Date
                    </label>
                    <input
                      type="date"
                      value={constraintDate ?? ""}
                      onChange={handleDateChange}
                      className="w-full text-sm border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                    />
                    {dateAdjustedNote && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        {dateAdjustedNote}
                      </p>
                    )}
                  </div>
                )}

                {/* Constraint Mode (only when type selected) */}
                {constraintType && (
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Mode
                    </label>
                    <div className="flex gap-4">
                      {CONSTRAINT_MODES.map((mode) => (
                        <label key={mode} className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name="constraintMode"
                            value={mode}
                            checked={constraintMode === mode}
                            onChange={() => setConstraintMode(mode)}
                            className="text-blue-600"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300 capitalize">
                            {mode}
                          </span>
                        </label>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      {constraintMode === "hard"
                        ? "Hard: overrides computed dates. May cause conflicts."
                        : "Soft: advisory only. Violations shown as warnings."}
                    </p>
                  </div>
                )}

                {/* Clear button */}
                {constraintType && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                  >
                    Clear constraint
                  </button>
                )}

                {/* Conflict preview callout */}
                {conflictPreview && (
                  <div
                    className={`rounded p-3 text-sm ${
                      conflictPreview.severity === "error"
                        ? "bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-700 text-red-700 dark:text-red-300"
                        : "bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700 text-amber-700 dark:text-amber-300"
                    }`}
                  >
                    <p className="font-medium text-xs mb-1">
                      {conflictPreview.severity === "error" ? "Conflict" : "Warning"}
                    </p>
                    <p className="text-xs">{conflictPreview.message}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-6 flex justify-end gap-2">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200"
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              disabled={!isValid}
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
