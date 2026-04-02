// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { useState } from "react";
import type { Activity, Milestone, MilestoneBufferInfo } from "@domain/models/types";
import { useDateFormat } from "@ui/hooks/use-date-format";

interface MilestonePanelProps {
  milestones: Milestone[];
  activities: Activity[];
  milestoneBuffers: Map<string, MilestoneBufferInfo> | null;
  onAddMilestone: (name: string, targetDate: string) => void;
  onRemoveMilestone: (milestoneId: string) => void;
  onUpdateMilestone: (milestoneId: string, updates: Partial<Omit<Milestone, "id">>) => void;
  onAssignActivity: (activityId: string, milestoneId: string | null) => void;
  onSetStartsAt: (activityId: string, milestoneId: string | null) => void;
  isLocked?: boolean;
  formatActivityName?: (a: Activity) => string;
}

function formatMilestoneCount(count: number): string {
  if (count === 0) return "No milestones";
  return `${count} ${count === 1 ? "milestone" : "milestones"}`;
}

function HealthBadge({ health }: { health: "green" | "amber" | "red" }) {
  const colors = {
    green: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    amber: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
    red: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  };
  const labels = { green: "Healthy", amber: "At Risk", red: "Over" };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${colors[health]}`}>
      {labels[health]}
    </span>
  );
}

export function MilestonePanel({
  milestones,
  activities,
  milestoneBuffers,
  onAddMilestone,
  onRemoveMilestone,
  onUpdateMilestone,
  onAssignActivity,
  onSetStartsAt,
  isLocked,
  formatActivityName,
}: MilestonePanelProps) {
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");
  const formatDate = useDateFormat();

  const handleAdd = () => {
    if (!newName.trim() || !newDate) return;
    onAddMilestone(newName.trim(), newDate);
    setNewName("");
    setNewDate("");
  };

  // Build a map: milestoneId → assigned activities
  const milestoneActivities = new Map<string, Activity[]>();
  const startsAtActivities = new Map<string, Activity[]>();
  for (const m of milestones) {
    milestoneActivities.set(m.id, []);
    startsAtActivities.set(m.id, []);
  }
  for (const a of activities) {
    if (a.milestoneId) {
      milestoneActivities.get(a.milestoneId)?.push(a);
    }
    if (a.startsAtMilestoneId) {
      startsAtActivities.get(a.startsAtMilestoneId)?.push(a);
    }
  }

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
          Milestones
        </button>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          {formatMilestoneCount(milestones.length)}
        </span>
      </div>

      {!collapsed && (<div className="p-4 space-y-3">

      {/* Milestone list */}
      {milestones.map((m) => {
        const buffer = milestoneBuffers?.get(m.id);
        const assigned = milestoneActivities.get(m.id) ?? [];
        const startsAt = startsAtActivities.get(m.id) ?? [];

        return (
          <div
            key={m.id}
            className="border border-gray-100 dark:border-gray-700 rounded-md p-3 space-y-2"
          >
            {/* Header row: name, date, health, delete */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={m.name}
                onChange={(e) => onUpdateMilestone(m.id, { name: e.target.value })}
                disabled={isLocked}
                className="flex-1 min-w-0 px-2 py-1 text-sm font-medium border border-transparent hover:border-gray-200 dark:hover:border-gray-600 dark:bg-gray-800 dark:text-gray-100 rounded focus:border-blue-400 focus:outline-none disabled:opacity-60"
                placeholder="Milestone name"
              />
              <input
                type="date"
                value={m.targetDate}
                onChange={(e) => onUpdateMilestone(m.id, { targetDate: e.target.value })}
                disabled={isLocked}
                className="px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded focus:border-blue-400 focus:outline-none disabled:opacity-60"
              />
              {buffer && <HealthBadge health={buffer.health} />}
              {!isLocked && (
                <button
                  onClick={() => onRemoveMilestone(m.id)}
                  className="text-red-400 hover:text-red-600 dark:hover:text-red-300 p-1"
                  title="Remove milestone"
                  aria-label="Remove milestone"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Buffer/Slack info */}
            {buffer && buffer.bufferDays !== null && (
              <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 pl-2">
                <span>Target: {formatDate(m.targetDate)}</span>
                <span>Buffer: {buffer.bufferDays}d</span>
                {buffer.slackDays !== null && (
                  <span className={buffer.slackDays < 0 ? "text-red-500 dark:text-red-400 font-medium" : ""}>
                    Slack: {buffer.slackDays > 0 ? "+" : ""}{buffer.slackDays}d
                  </span>
                )}
              </div>
            )}

            {/* Assigned activities (must finish before milestone) */}
            <div className="space-y-1 pl-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Must finish before milestone ({assigned.length})
              </label>
              {!isLocked && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onAssignActivity(e.target.value, m.id);
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded focus:border-blue-400 focus:outline-none"
                >
                  <option value="">Assign activity...</option>
                  {activities
                    .filter((a) => a.milestoneId !== m.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>{formatActivityName ? formatActivityName(a) : a.name}</option>
                    ))}
                </select>
              )}
              {assigned.map((a) => (
                <div key={a.id} className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                  <span className="truncate">{formatActivityName ? formatActivityName(a) : a.name}</span>
                  {!isLocked && (
                    <button
                      onClick={() => onAssignActivity(a.id, null)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 ml-auto shrink-0"
                      title="Unassign"
                      aria-label="Unassign activity"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>

            {/* Starts at milestone */}
            <div className="space-y-1 pl-2">
              <label className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Starts at this milestone ({startsAt.length})
              </label>
              {!isLocked && (
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) onSetStartsAt(e.target.value, m.id);
                  }}
                  className="w-full px-2 py-1 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded focus:border-blue-400 focus:outline-none"
                >
                  <option value="">Set activity start...</option>
                  {activities
                    .filter((a) => a.startsAtMilestoneId !== m.id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>{formatActivityName ? formatActivityName(a) : a.name}</option>
                    ))}
                </select>
              )}
              {startsAt.map((a) => (
                <div key={a.id} className="flex items-center gap-1 text-sm text-gray-700 dark:text-gray-300">
                  <span className="truncate">{formatActivityName ? formatActivityName(a) : a.name}</span>
                  {!isLocked && (
                    <button
                      onClick={() => onSetStartsAt(a.id, null)}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 p-0.5 ml-auto shrink-0"
                      title="Remove start constraint"
                      aria-label="Remove start constraint"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* Add milestone form */}
      {!isLocked && (
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Milestone name"
            className="flex-1 min-w-0 px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded focus:border-blue-400 focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleAdd();
            }}
          />
          <input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="px-2 py-1.5 text-sm border border-gray-200 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 rounded focus:border-blue-400 focus:outline-none"
          />
          <button
            onClick={handleAdd}
            disabled={!newName.trim() || !newDate}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            Add
          </button>
        </div>
      )}
    </div>)}
    </section>
  );
}
