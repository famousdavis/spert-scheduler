// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState, useEffect, useMemo } from "react";
import type { Activity, ActivityDependency, DependencyType } from "@domain/models/types";
import { validateDependencies, detectCycle } from "@core/schedule/dependency-graph";

interface DependencyPanelProps {
  activities: Activity[];
  dependencies: ActivityDependency[];
  onAddDependency: (
    fromActivityId: string,
    toActivityId: string,
    type?: DependencyType,
    lagDays?: number
  ) => void;
  onRemoveDependency: (fromActivityId: string, toActivityId: string) => void;
  onUpdateLag: (fromActivityId: string, toActivityId: string, lagDays: number) => void;
  isLocked?: boolean;
}

function LagInput({
  value,
  onChange,
  className,
}: {
  value: number;
  onChange: (v: number) => void;
  className?: string;
}) {
  const [input, setInput] = useState(value ? String(value) : "");

  useEffect(() => {
    setInput(value ? String(value) : ""); // eslint-disable-line react-hooks/set-state-in-effect -- sync local input with prop
  }, [value]);

  const commit = () => {
    const val = parseInt(input, 10);
    onChange(isNaN(val) ? 0 : val);
    if (input === "" || isNaN(parseInt(input, 10))) setInput("");
  };

  return (
    <input
      type="number"
      value={input}
      placeholder="0"
      onChange={(e) => setInput(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          commit();
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={className}
    />
  );
}

export function DependencyPanel({
  activities,
  dependencies,
  onAddDependency,
  onRemoveDependency,
  onUpdateLag,
  isLocked,
}: DependencyPanelProps) {
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [lagDays, setLagDays] = useState(0);

  const activityMap = useMemo(
    () => new Map(activities.map((a) => [a.id, a])),
    [activities]
  );
  const activityIds = useMemo(() => activities.map((a) => a.id), [activities]);

  // Validation errors for current dependencies
  const validationErrors = useMemo(
    () => validateDependencies(activityIds, dependencies),
    [activityIds, dependencies]
  );

  // Check if adding a new dep would create a cycle
  const wouldCreateCycle = useMemo(() => {
    if (!fromId || !toId || fromId === toId) return false;
    const testDeps: ActivityDependency[] = [
      ...dependencies,
      { fromActivityId: fromId, toActivityId: toId, type: "FS", lagDays: 0 },
    ];
    return detectCycle(activityIds, testDeps) !== null;
  }, [fromId, toId, activityIds, dependencies]);

  // Check if dep already exists
  const isDuplicate = useMemo(() => {
    if (!fromId || !toId) return false;
    return dependencies.some(
      (d) => d.fromActivityId === fromId && d.toActivityId === toId
    );
  }, [fromId, toId, dependencies]);

  const canAdd =
    fromId &&
    toId &&
    fromId !== toId &&
    !wouldCreateCycle &&
    !isDuplicate &&
    !isLocked;

  const handleAdd = () => {
    if (!canAdd) return;
    onAddDependency(fromId, toId, "FS", lagDays);
    setFromId("");
    setToId("");
    setLagDays(0);
  };

  const getActivityName = (id: string) =>
    activityMap.get(id)?.name ?? `Unknown (${id.slice(0, 8)})`;

  const [collapsed, setCollapsed] = useState(false);

  return (
    <section className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 dark:border-gray-700">
        <button
          className="flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          onClick={() => setCollapsed((c) => !c)}
        >
          <svg
            className={`w-4 h-4 transition-transform ${collapsed ? "" : "rotate-90"}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
          Dependencies
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {dependencies.length === 0
            ? "No dependencies — all activities will start in parallel"
            : `${dependencies.length} ${dependencies.length === 1 ? "dependency" : "dependencies"}`}
        </span>
      </div>

      {!collapsed && (<div className="p-4 space-y-3">

      {/* Validation errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-2">
          {validationErrors.map((err, i) => (
            <p key={i} className="text-xs text-red-600 dark:text-red-400">
              {err.message}
            </p>
          ))}
        </div>
      )}

      {/* Dependency list */}
      {dependencies.length > 0 && (
        <div className="space-y-1">
          {dependencies.map((dep, i) => (
            <div
              key={`${dep.fromActivityId}-${dep.toActivityId}-${i}`}
              className="flex items-center gap-2 text-sm py-1 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50 group"
            >
              <span className="text-gray-700 dark:text-gray-300 truncate max-w-[180px]" title={getActivityName(dep.fromActivityId)}>
                {getActivityName(dep.fromActivityId)}
              </span>
              <span className="text-gray-400 dark:text-gray-500 shrink-0">→</span>
              <span className="text-gray-700 dark:text-gray-300 truncate max-w-[180px]" title={getActivityName(dep.toActivityId)}>
                {getActivityName(dep.toActivityId)}
              </span>
              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">
                (FS{dep.lagDays !== 0 ? `, ${dep.lagDays > 0 ? "+" : ""}${dep.lagDays}d` : ""})
              </span>
              {/* Editable lag */}
              {!isLocked && (
                <div className="flex items-center gap-1 ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                  <label className="text-xs text-gray-400 dark:text-gray-500">Lag:</label>
                  <LagInput
                    value={dep.lagDays}
                    onChange={(val) => onUpdateLag(dep.fromActivityId, dep.toActivityId, val)}
                    className="w-14 px-1 py-0.5 text-xs border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-right tabular-nums focus:border-blue-400 focus:outline-none"
                  />
                  <button
                    onClick={() => onRemoveDependency(dep.fromActivityId, dep.toActivityId)}
                    className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-0.5"
                    title="Remove dependency"
                    aria-label="Remove dependency"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add dependency form */}
      {!isLocked && activities.length >= 2 && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <select
            value={fromId}
            onChange={(e) => setFromId(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded focus:border-blue-400 focus:outline-none"
          >
            <option value="">Predecessor…</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id} disabled={a.id === toId}>
                {a.name}
              </option>
            ))}
          </select>
          <span className="text-gray-400 dark:text-gray-500 text-sm shrink-0">→</span>
          <select
            value={toId}
            onChange={(e) => setToId(e.target.value)}
            className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded focus:border-blue-400 focus:outline-none"
          >
            <option value="">Successor…</option>
            {activities.map((a) => (
              <option key={a.id} value={a.id} disabled={a.id === fromId}>
                {a.name}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1 shrink-0">
            <label className="text-xs text-gray-400 dark:text-gray-500">Lag:</label>
            <LagInput
              value={lagDays}
              onChange={setLagDays}
              className="w-14 px-1 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded text-right tabular-nums focus:border-blue-400 focus:outline-none"
            />
          </div>
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            Add
          </button>
        </div>
      )}
      {/* Feedback for invalid add */}
      {fromId && toId && fromId === toId && (
        <p className="text-xs text-red-500 dark:text-red-400">An activity cannot depend on itself</p>
      )}
      {wouldCreateCycle && (
        <p className="text-xs text-red-500 dark:text-red-400">This dependency would create a cycle</p>
      )}
      {isDuplicate && (
        <p className="text-xs text-amber-500 dark:text-amber-400">This dependency already exists</p>
      )}
    </div>)}
    </section>
  );
}
