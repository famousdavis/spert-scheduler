// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { ConstraintType } from "@domain/models/types";

/** Human-readable labels for constraint types. */
export const CONSTRAINT_LABELS: Record<ConstraintType, string> = {
  MSO: "Must Start On",
  MFO: "Must Finish On",
  SNET: "Start No Earlier Than",
  SNLT: "Start No Later Than",
  FNET: "Finish No Earlier Than",
  FNLT: "Finish No Later Than",
};

/** Full display label for a constraint type. */
export function constraintLabel(type: ConstraintType): string {
  return CONSTRAINT_LABELS[type];
}
