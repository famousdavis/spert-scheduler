// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { AiOpResult, AiOpOutcome } from "@app/api/ai-batch-service";

const OP_LABELS: Record<string, string> = {
  create_activity: "Create activity",
  update_activity_estimate: "Update estimate",
  rename_activity: "Rename activity",
  set_activity_description: "Set description",
  append_activity_note: "Add note",
  add_checklist_items: "Add checklist items",
  add_deliverable_items: "Add deliverable items",
  toggle_checklist_item: "Toggle checklist item",
  toggle_deliverable_item: "Toggle deliverable item",
  create_milestone: "Create milestone",
  update_milestone: "Update milestone",
  assign_milestone: "Assign milestone",
  unassign_milestone: "Unassign milestone",
  create_dependency: "Create dependency",
  remove_dependency: "Remove dependency",
  update_dependency: "Update dependency",
};

const REASON_LABELS: Record<string, string> = {
  not_found: "not found",
  duplicate: "duplicate",
  cycle: "would create a cycle",
  cap_exceeded: "limit reached",
  invalid: "invalid",
  value_unchanged: "no change",
  locked: "scenario locked",
  no_open_scenario: "no open scenario",
  would_exceed_length: "too long",
  dependency_mode_off: "dependency mode off",
  unknown_noop: "no change",
  unknown_op: "unknown operation",
};

function describeOutcome(outcome: AiOpOutcome): { text: string; tone: "applied" | "partial" | "skipped" } {
  if (outcome.status === "applied") return { text: "Applied", tone: "applied" };
  if (outcome.status === "partial") {
    const skipped = outcome.skippedItems.length;
    return {
      text: skipped === 0
        ? `Applied ${outcome.appliedCount}`
        : `${outcome.appliedCount} applied · ${skipped} skipped`,
      tone: outcome.appliedCount > 0 ? "partial" : "skipped",
    };
  }
  return { text: `Skipped — ${REASON_LABELS[outcome.reason] ?? outcome.reason}`, tone: "skipped" };
}

const TONE_CLASSES: Record<"applied" | "partial" | "skipped", string> = {
  applied: "text-green-700 dark:text-green-400",
  partial: "text-amber-700 dark:text-amber-400",
  skipped: "text-gray-500 dark:text-gray-400",
};

interface AiActivityFeedProps {
  items: AiOpResult[];
}

/**
 * Session-scoped feed of what the AI has done, newest first. Fed from
 * applyAiBatch's per-op results; kept in component state, never persisted.
 */
export function AiActivityFeed({ items }: AiActivityFeedProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-gray-400 dark:text-gray-500">
        No AI activity yet. Operations will appear here as the AI works.
      </p>
    );
  }

  return (
    <ul className="max-h-48 overflow-y-auto space-y-1 text-xs" aria-label="AI activity feed">
      {items.map((item) => {
        const { text, tone } = describeOutcome(item.outcome);
        return (
          <li key={item.op.seq} className="flex items-center justify-between gap-2">
            <span className="text-gray-700 dark:text-gray-300 truncate">
              {OP_LABELS[item.op.op] ?? item.op.op}
            </span>
            <span className={`shrink-0 ${TONE_CLASSES[tone]}`}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
