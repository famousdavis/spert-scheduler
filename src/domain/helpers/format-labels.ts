// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { DistributionType, ActivityStatus } from "@domain/models/types";

/** Full display label for distribution types. */
export function distributionLabel(dt: DistributionType): string {
  switch (dt) {
    case "logNormal":
      return "LogNormal";
    case "normal":
      return "T-Normal";
    case "triangular":
      return "Triangular";
    case "uniform":
      return "Uniform";
  }
}

/** Short label for distribution recommendation badges. */
export function distributionShortLabel(dt: DistributionType): string {
  switch (dt) {
    case "logNormal":
      return "LogN";
    case "normal":
      return "Norm";
    case "triangular":
      return "Tri";
    case "uniform":
      return "Uni";
  }
}

/** Display label for activity statuses. */
export function statusLabel(status: ActivityStatus): string {
  switch (status) {
    case "inProgress":
      return "In Progress";
    case "planned":
      return "Planned";
    case "complete":
      return "Complete";
  }
}
