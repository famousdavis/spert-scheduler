// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

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
      <p className="text-xs text-gray-400 dark:text-gray-500">
        No AI activity yet. Operations will appear here as the AI works.
      </p>
    );
  }

  return (
    <ul className="max-h-48 overflow-y-auto space-y-1 text-xs" aria-label="AI activity feed">
      {items.map((item) => {
        const { text, tone } = describeOutcome(item.result.outcome);
        return (
          <li key={item.feedId} className="flex items-center justify-between gap-2">
            <span className="text-gray-700 dark:text-gray-300 truncate">
              {OP_LABELS[item.result.op.op] ?? item.result.op.op}
            </span>
            <span className={`shrink-0 ${TONE_CLASSES[tone]}`}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}
