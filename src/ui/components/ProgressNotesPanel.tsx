// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ProgressNote } from "@domain/models/types";
import { useDateFormat } from "@ui/hooks/use-date-format";
import { progressNoteKey, progressNoteSentence } from "@ui/helpers/progress-note-words";

/**
 * WI-137 (look U3): the schedule's NEUTRAL notes — a recorded date the schedule keeps although a
 * link, a constraint or the Start Date would not have allowed it. A fact, not a problem (owner,
 * R599), so it is grey and blue, never amber or red, and it is NOT in "Scheduling Warnings".
 *
 * The wrapper is always rendered, as a polite live region, so a note that a Status change creates
 * is announced: a region inserted together with its text is not reliably read. It is
 * `display: contents`, so with no notes it adds no box and no gap to the page.
 */
export function ProgressNotesPanel({ notes }: { notes: ProgressNote[] | undefined }) {
  const formatDate = useDateFormat();
  const shown = notes ?? [];
  return (
    <div aria-live="polite" className="contents">
      {shown.length > 0 && (
        <section
          aria-label="Progress notes"
          className="mb-6 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/60 px-4 py-3 space-y-1.5"
        >
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Progress notes <span className="text-xs font-normal text-gray-600 dark:text-gray-400">({shown.length})</span>
          </h3>
          {shown.map((n) => (
            <p key={progressNoteKey(n)} className="flex items-start gap-2 text-xs text-gray-700 dark:text-gray-300">
              <span aria-hidden="true" className="mt-px inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-blue-300 dark:border-blue-500 text-xs font-semibold text-blue-700 dark:text-blue-300">
                i
              </span>
              <span>{progressNoteSentence(n, formatDate)}</span>
            </p>
          ))}
        </section>
      )}
    </div>
  );
}
