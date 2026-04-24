// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import type { DistributionType, ActivityStatus, DependencyType } from "@domain/models/types";

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

/** Full display label for dependency types. */
export function dependencyLabel(dt: DependencyType): string {
  switch (dt) {
    case "FS":
      return "Finish-to-Start";
    case "SS":
      return "Start-to-Start";
    case "FF":
      return "Finish-to-Finish";
  }
}

// -- Milestone health --------------------------------------------------------

export type MilestoneHealth = "green" | "amber" | "red";

/** Maps slackDays to a milestone health status. */
export function computeMilestoneHealth(slackDays: number | null): MilestoneHealth {
  if (slackDays === null || slackDays >= 5) return "green";
  if (slackDays >= 0) return "amber";
  return "red";
}

/** CSS class for a milestone health dot indicator. */
export function milestoneHealthDotClass(health: MilestoneHealth): string {
  if (health === "green") return "bg-green-500";
  if (health === "amber") return "bg-amber-500";
  return "bg-red-500";
}

/** CSS text color class for inline milestone health labels. */
export function milestoneHealthTextClass(health: MilestoneHealth): string {
  if (health === "green") return "text-green-700";
  if (health === "amber") return "text-amber-700";
  return "text-red-700 font-medium";
}

/** Human-readable milestone health label. */
export function milestoneHealthLabel(health: MilestoneHealth): string {
  if (health === "green") return "On Track";
  if (health === "amber") return "Warning";
  return "At Risk";
}
