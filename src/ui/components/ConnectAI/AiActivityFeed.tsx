// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { AiOpResult } from "@app/api/ai-batch-service";
import { describeOutcome, OP_LABELS, type OutcomeTone } from "./describe-ai-outcome";

const TONE_CLASSES: Record<OutcomeTone, string> = {
  applied: "text-green-700 dark:text-green-400",
  partial: "text-amber-700 dark:text-amber-400",
  skipped: "text-gray-500 dark:text-gray-400",
};

/**
 * One feed row. `feedId` is a page-lifetime-unique key assigned at insertion
 * (ProjectPage's counter) — op `seq` alone is NOT unique across sessions (each
 * session's seq space restarts at 1), so keying rows by seq would collide after
 * a disconnect/reconnect.
 */
export interface AiFeedItem {
  feedId: number;
  result: AiOpResult;
}

interface AiActivityFeedProps {
  items: AiFeedItem[];
}

/**
 * Session-scoped feed of what the AI has done, newest first. Fed from
 * applyAiBatch's per-op results; kept in component state, never persisted.
 * Presentation logic lives in describe-ai-outcome.ts (pure, unit-tested).
 */
export function AiActivityFeed({ items }: AiActivityFeedProps) {
  if (items.length === 0) {
    return (
      <p className="text-xs text-gray-500 dark:text-gray-400">
        No AI activity yet. Operations will appear here as the AI works.
      </p>
    );
  }

  return (
    <ul className="max-h-48 overflow-y-auto space-y-1 text-xs" aria-label="AI activity feed">
      {items.map((item) => {
        const { text, tone } = describeOutcome(item.result.outcome);
        // WI-150 release C (Review 37, G2): the outcome WRAPS at the panel's width — it names each
        // skipped activity, so it can be long — and the label keeps its own width. Until v0.84.0
        // the label truncated and the outcome never shrank, so a long outcome pushed the label to
        // nothing and the list scrolled sideways.
        return (
          <li key={item.feedId} className="flex items-start justify-between gap-2">
            <span className="shrink-0 text-gray-700 dark:text-gray-300">
              {OP_LABELS[item.result.op.op] ?? item.result.op.op}
            </span>
            <span className={`min-w-0 break-words text-right ${TONE_CLASSES[tone]}`}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
