// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useCallback, useMemo } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import type { Activity, ActivityDependency, DependencyType } from "@domain/models/types";
import { DEPENDENCY_TYPES } from "@domain/models/types";
import { dependencyLabel } from "@domain/helpers/format-labels";

interface DependencyEditModalProps {
  fromActivityId?: string;
  toActivityId?: string;
  activities: Activity[];
  dependencies: ActivityDependency[];
  onSave: (fromId: string, toId: string, type: DependencyType, lagDays: number) => void;
  onDelete?: (fromId: string, toId: string) => void;
  onClose: () => void;
  formatActivityName?: (a: Activity) => string;
}

export function DependencyEditModal({
  fromActivityId,
  toActivityId,
  activities,
  dependencies,
  onSave,
  onDelete,
  onClose,
  formatActivityName,
}: DependencyEditModalProps) {
  const isEditMode = !!(fromActivityId && toActivityId);

  // Find existing dependency in edit mode
  const existingDep = useMemo(
    () =>
      isEditMode
        ? dependencies.find(
            (d) => d.fromActivityId === fromActivityId && d.toActivityId === toActivityId
          )
        : undefined,
    [isEditMode, dependencies, fromActivityId, toActivityId]
  );

  // Local form state
  const [fromId, setFromId] = useState<string>(fromActivityId ?? "");
  const [toId, setToId] = useState<string>(toActivityId ?? "");
  const [type, setType] = useState<DependencyType>(existingDep?.type ?? "FS");
  const [lagInput, setLagInput] = useState<string>(String(existingDep?.lagDays ?? 0));
  const [validationError, setValidationError] = useState<string | null>(null);

  // Validation
  const validate = useCallback(
    (from: string, to: string): string | null => {
      if (!from || !to) return null; // not ready yet, not an error
      if (from === to) return "An activity cannot depend on itself.";
      // Duplicate check (skip in edit mode for the same pair)
      const isDuplicate = dependencies.some(
        (d) =>
          d.fromActivityId === from &&
          d.toActivityId === to &&
          !(isEditMode && from === fromActivityId && to === toActivityId)
      );
      if (isDuplicate) return "This dependency already exists.";
      return null;
    },
    [dependencies, isEditMode, fromActivityId, toActivityId]
  );

  const handleSave = useCallback(() => {
    const error = validate(fromId, toId);
    if (error) {
      setValidationError(error);
      return;
    }
    const parsed = parseInt(lagInput, 10);
    const lagDays = Number.isNaN(parsed) ? 0 : Math.max(-365, Math.min(365, parsed));
    onSave(fromId, toId, type, lagDays);
    onClose();
  }, [fromId, toId, type, lagInput, validate, onSave, onClose]);

  const handleDelete = useCallback(() => {
    if (onDelete && fromActivityId && toActivityId) {
      onDelete(fromActivityId, toActivityId);
      onClose();
    }
  }, [onDelete, fromActivityId, toActivityId, onClose]);

  // Clear validation when fields change
  const handleFromChange = useCallback(
    (value: string) => {
      setFromId(value);
      setValidationError(null);
    },
    []
  );

  const handleToChange = useCallback(
    (value: string) => {
      setToId(value);
      setValidationError(null);
    },
    []
  );

  const canSave = !!(fromId && toId && fromId !== toId);

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white dark:bg-gray-800 rounded-lg shadow-xl p-6 w-full max-w-md z-50">
          <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {isEditMode ? "Edit Dependency" : "Add Dependency"}
          </Dialog.Title>
          <Dialog.Description className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isEditMode
              ? "Modify the relationship type or lag days."
              : "Define a dependency between two activities."}
          </Dialog.Description>

          <div className="mt-4 space-y-4">
            {/* Predecessor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Predecessor
              </label>
              <select
                value={fromId}
                onChange={(e) => handleFromChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select activity...</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {formatActivityName ? formatActivityName(a) : a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Successor */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Successor
              </label>
              <select
                value={toId}
                onChange={(e) => handleToChange(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">Select activity...</option>
                {activities.map((a) => (
                  <option key={a.id} value={a.id}>
                    {formatActivityName ? formatActivityName(a) : a.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Relationship Type + Lag Days (side-by-side) */}
            <div className="flex gap-3">
              <div className="flex-1 min-w-0">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Relationship Type
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as DependencyType)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md text-sm focus:border-blue-500 focus:outline-none"
                >
                  {DEPENDENCY_TYPES.map((dt) => (
                    <option key={dt} value={dt}>
                      {dependencyLabel(dt)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-24 shrink-0">
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Lag Days
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="-?[0-9]*"
                  value={lagInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "" || v === "-" || /^-?\d+$/.test(v)) {
                      setLagInput(v);
                    }
                  }}
                  onFocus={(e) => e.currentTarget.select()}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded-md text-sm focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 -mt-2">
              Positive values add delay; negative values represent lead time.
            </p>

            {/* Validation Error */}
            {validationError && (
              <p className="text-sm text-red-600 dark:text-red-400">{validationError}</p>
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
            {isEditMode && onDelete && (
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
              >
                Delete
              </button>
            )}
            <button
              type="button"
              disabled={!canSave}
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
