// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ActualDatesFault } from "@domain/helpers/actual-dates-rules";

// WI-150: the rule itself lives in `/domain`, so the CSV importer in `/core` asks the window's question.
export { actualDatesFault, type ActualDatesFault } from "@domain/helpers/actual-dates-rules";

/** The field each fault marks `aria-invalid` and describes. */
export const ACTUAL_DATES_FAULT_FIELD: Record<ActualDatesFault, "start" | "finish"> = {
  finishWithoutStart: "finish",
  startBeforeStartDate: "start",
  startAfterToday: "start",
  finishAfterToday: "finish",
  startAfterFinish: "start",
  finishBeforeStart: "finish",
};

/** The red line under the dates, tied to the field at fault by `aria-describedby`. */
export const ACTUAL_DATES_FAULT_LINE: Record<ActualDatesFault, string> = {
  finishWithoutStart: "Enter the Actual Start first.",
  startBeforeStartDate: "The Actual Start cannot be before this scenario's Start Date.",
  startAfterToday: "The Actual Start cannot be after today.",
  finishAfterToday: "The Actual Finish cannot be after today.",
  startAfterFinish: "The Actual Start cannot be after the Actual Finish.",
  finishBeforeStart: "The Actual Finish cannot be before the Actual Start.",
};
