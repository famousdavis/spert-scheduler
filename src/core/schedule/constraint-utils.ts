// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

/**
 * Shared constraint utility — pure functions for activity scheduling constraints.
 *
 * Zero imports from UI, infrastructure, or state management.
 * Used by both the deterministic scheduler (date domain) and
 * the Monte Carlo engine (integer working-day offset domain).
 */

import type { Calendar, ConstraintType, ConstraintMode, ConstraintConflict } from "@domain/models/types";
import type { WorkCalendar } from "@core/calendar/work-calendar";
import {
  addWorkingDays,
  subtractWorkingDays,
  countWorkingDays,
  parseDateISO,
  formatDateISO,
} from "@core/calendar/calendar";

// -- Forward pass (deterministic, date domain) --------------------------------

export interface ConstraintForwardResult {
  es: string; // adjusted early start (ISO date)
  ef: string; // adjusted early finish (ISO date)
  conflict: ConstraintConflict | null;
}

/**
 * Apply forward-pass constraint adjustment in the deterministic (date) domain.
 * Soft constraints have no forward-pass effect.
 * Returns adjusted ES/EF and any conflict record.
 */
export function applyForwardConstraint(
  esNet: string,
  efNet: string,
  duration: number,
  constraintType: ConstraintType,
  constraintDate: string,
  constraintMode: ConstraintMode,
  activityId: string,
  activityName: string,
  calendar?: WorkCalendar | Calendar,
): ConstraintForwardResult {
  // Soft constraints: no forward-pass effect
  if (constraintMode === "soft") {
    return { es: esNet, ef: efNet, conflict: null };
  }

  // Hard constraints
  let es = esNet;
  let ef = efNet;
  let conflict: ConstraintConflict | null = null;

  switch (constraintType) {
    case "MSO": {
      // ES = constraintDate; EF = ES + duration
      es = constraintDate;
      ef = formatDateISO(addWorkingDays(parseDateISO(es), duration, calendar));
      // Conflict: network ES is later than constraint date (predecessor pushes past MSO)
      if (esNet > constraintDate) {
        const delta = countWorkingDays(parseDateISO(constraintDate), parseDateISO(esNet), calendar);
        conflict = buildConflict(
          "constraint-conflict", activityId, activityName, constraintType,
          constraintDate, constraintMode, esNet, delta, "error",
          `${activityName}: Must Start On ${constraintDate} conflicts with predecessor logic (network-driven ES: ${esNet}, delta: ${delta} working days). Constraint date held; downstream activities may be affected.`
        );
      }
      break;
    }

    case "MFO": {
      // EF = constraintDate; ES = EF − duration
      ef = constraintDate;
      es = formatDateISO(subtractWorkingDays(parseDateISO(ef), duration, calendar));
      // Conflict: network EF is later than constraint date
      if (efNet > constraintDate) {
        const delta = countWorkingDays(parseDateISO(constraintDate), parseDateISO(efNet), calendar);
        conflict = buildConflict(
          "constraint-conflict", activityId, activityName, constraintType,
          constraintDate, constraintMode, efNet, delta, "error",
          `${activityName}: Must Finish On ${constraintDate} conflicts with predecessor logic (network-driven EF: ${efNet}, delta: ${delta} working days). Constraint date held.`
        );
      }
      break;
    }

    case "SNET": {
      // ES = max(ES_net, constraintDate); EF = ES + duration
      if (constraintDate > esNet) {
        es = constraintDate;
      }
      ef = formatDateISO(addWorkingDays(parseDateISO(es), duration, calendar));
      break;
    }

    case "FNET": {
      // EF = max(EF_net, constraintDate); ES = EF − duration
      if (constraintDate > efNet) {
        ef = constraintDate;
      }
      es = formatDateISO(subtractWorkingDays(parseDateISO(ef), duration, calendar));
      break;
    }

    case "SNLT":
    case "FNLT":
      // No forward-pass effect
      break;
  }

  return { es, ef, conflict };
}

// -- Forward pass (MC, integer working-day offset domain) ---------------------

export interface ConstraintForwardIntResult {
  es: number; // adjusted early start offset
  ef: number; // adjusted early finish offset
}

/**
 * Apply forward-pass constraint adjustment in the MC integer domain.
 * Soft constraints have no per-trial effect.
 * SNLT/FNLT have no per-trial effect (evaluated post-simulation).
 */
export function applyForwardConstraintInt(
  esNet: number,
  efNet: number,
  duration: number,
  constraintType: ConstraintType,
  constraintOffset: number,
  constraintMode: ConstraintMode,
  maxPredEF: number,
): ConstraintForwardIntResult {
  if (constraintMode === "soft") {
    return { es: esNet, ef: efNet };
  }

  switch (constraintType) {
    case "MSO": {
      // es = max(esNet, constraintOffset); ef = es + duration
      const es = Math.max(esNet, constraintOffset);
      return { es, ef: es + duration };
    }

    case "MFO": {
      // ef = constraintOffset; es = ef - duration
      // Temporal inversion guard: es must not precede predecessor finish
      const ef = constraintOffset;
      let es = ef - duration;
      es = Math.max(es, maxPredEF);
      return { es, ef };
    }

    case "SNET": {
      // es = max(esNet, constraintOffset); ef = es + duration
      const es = Math.max(esNet, constraintOffset);
      return { es, ef: es + duration };
    }

    case "FNET": {
      // ef = max(efNet, constraintOffset); es = ef - duration
      // Temporal inversion guard: es must not precede predecessor finish
      const ef = Math.max(efNet, constraintOffset);
      let es = ef - duration;
      es = Math.max(es, maxPredEF);
      return { es, ef };
    }

    case "SNLT":
    case "FNLT":
      // No per-trial effect
      return { es: esNet, ef: efNet };
  }
}

// -- Backward pass (deterministic, date domain) -------------------------------

export interface ConstraintBackwardResult {
  ls: string; // adjusted late start (ISO date)
  lf: string; // adjusted late finish (ISO date)
}

/**
 * Apply backward-pass constraint adjustment in the deterministic (date) domain.
 * Only applies to the constraint-adjusted backward pass (pass #1).
 * The network-driven backward pass (pass #2) does NOT call this.
 * Soft constraints have no backward-pass effect.
 */
export function applyBackwardConstraint(
  lsNet: string,
  lfNet: string,
  duration: number,
  constraintType: ConstraintType,
  constraintDate: string,
  constraintMode: ConstraintMode,
  calendar?: WorkCalendar | Calendar,
): ConstraintBackwardResult {
  if (constraintMode === "soft") {
    return { ls: lsNet, lf: lfNet };
  }

  let ls = lsNet;
  let lf = lfNet;

  switch (constraintType) {
    case "SNLT": {
      // LS = min(network-driven LS, constraintDate); LF = LS + duration
      if (constraintDate < lsNet) {
        ls = constraintDate;
      }
      lf = formatDateISO(addWorkingDays(parseDateISO(ls), duration, calendar));
      break;
    }

    case "FNLT": {
      // LF = min(network-driven LF, constraintDate); LS = LF − duration
      if (constraintDate < lfNet) {
        lf = constraintDate;
      }
      ls = formatDateISO(subtractWorkingDays(parseDateISO(lf), duration, calendar));
      break;
    }

    case "MSO": {
      // LS = constraintDate; LF = LS + duration
      ls = constraintDate;
      lf = formatDateISO(addWorkingDays(parseDateISO(ls), duration, calendar));
      break;
    }

    case "MFO": {
      // LF = constraintDate; LS = LF − duration
      lf = constraintDate;
      ls = formatDateISO(subtractWorkingDays(parseDateISO(lf), duration, calendar));
      break;
    }

    case "SNET":
    case "FNET":
      // No direct modification of late dates
      break;
  }

  return { ls, lf };
}

// -- Conflict detection (deterministic) ---------------------------------------

/**
 * Detect constraint conflicts/violations after both forward and backward passes.
 * Uses network-driven dates for comparison (not constraint-adjusted dates).
 *
 * Hard conflicts: constraint cannot be satisfied by the network schedule.
 * Soft violations: the network schedule does not satisfy the advisory constraint.
 */
export function detectConstraintConflict(
  esNet: string,
  efNet: string,
  lsNet: string,
  lfNet: string,
  constraintType: ConstraintType,
  constraintDate: string,
  constraintMode: ConstraintMode,
  activityId: string,
  activityName: string,
  calendar?: WorkCalendar | Calendar,
): ConstraintConflict | null {
  if (constraintMode === "hard") {
    return detectHardConflict(
      esNet, efNet, lsNet, lfNet,
      constraintType, constraintDate,
      activityId, activityName, calendar,
    );
  }

  // Soft violations
  return detectSoftViolation(
    esNet, efNet, lsNet, lfNet,
    constraintType, constraintDate,
    activityId, activityName, calendar,
  );
}

function detectHardConflict(
  esNet: string,
  efNet: string,
  lsNet: string,
  lfNet: string,
  constraintType: ConstraintType,
  constraintDate: string,
  activityId: string,
  activityName: string,
  calendar?: WorkCalendar | Calendar,
): ConstraintConflict | null {
  switch (constraintType) {
    case "MSO": {
      if (esNet > constraintDate) {
        const delta = countWorkingDays(parseDateISO(constraintDate), parseDateISO(esNet), calendar);
        return buildConflict(
          "constraint-conflict", activityId, activityName, constraintType,
          constraintDate, "hard", esNet, delta, "error",
          `${activityName}: Must Start On ${constraintDate} conflicts with predecessor logic (network-driven ES: ${esNet}, delta: ${delta} working days). Constraint date held; downstream activities may be affected.`
        );
      }
      return null;
    }

    case "MFO": {
      if (efNet > constraintDate) {
        const delta = countWorkingDays(parseDateISO(constraintDate), parseDateISO(efNet), calendar);
        return buildConflict(
          "constraint-conflict", activityId, activityName, constraintType,
          constraintDate, "hard", efNet, delta, "error",
          `${activityName}: Must Finish On ${constraintDate} conflicts with predecessor logic (network-driven EF: ${efNet}, delta: ${delta} working days). Constraint date held.`
        );
      }
      return null;
    }

    case "SNLT": {
      if (lsNet > constraintDate) {
        const delta = countWorkingDays(parseDateISO(constraintDate), parseDateISO(lsNet), calendar);
        return buildConflict(
          "constraint-conflict", activityId, activityName, constraintType,
          constraintDate, "hard", lsNet, delta, "error",
          `${activityName}: Start No Later Than ${constraintDate} cannot be satisfied (network-driven LS: ${lsNet}).`
        );
      }
      return null;
    }

    case "FNLT": {
      if (lfNet > constraintDate) {
        const delta = countWorkingDays(parseDateISO(constraintDate), parseDateISO(lfNet), calendar);
        return buildConflict(
          "constraint-conflict", activityId, activityName, constraintType,
          constraintDate, "hard", lfNet, delta, "error",
          `${activityName}: Finish No Later Than ${constraintDate} cannot be satisfied (network-driven LF: ${lfNet}).`
        );
      }
      return null;
    }

    case "SNET":
    case "FNET":
      // Push-later constraints don't produce direct forward-pass conflicts
      return null;
  }
}

function detectSoftViolation(
  esNet: string,
  efNet: string,
  lsNet: string,
  lfNet: string,
  constraintType: ConstraintType,
  constraintDate: string,
  activityId: string,
  activityName: string,
  calendar?: WorkCalendar | Calendar,
): ConstraintConflict | null {
  let computedDate: string | null = null;

  switch (constraintType) {
    case "MSO":
      if (esNet !== constraintDate) computedDate = esNet;
      break;
    case "MFO":
      if (efNet !== constraintDate) computedDate = efNet;
      break;
    case "SNET":
      if (esNet < constraintDate) computedDate = esNet;
      break;
    case "FNET":
      if (efNet < constraintDate) computedDate = efNet;
      break;
    case "SNLT":
      if (lsNet > constraintDate) computedDate = lsNet;
      break;
    case "FNLT":
      if (lfNet > constraintDate) computedDate = lfNet;
      break;
  }

  if (computedDate === null) return null;

  const delta = countWorkingDays(parseDateISO(constraintDate), parseDateISO(computedDate), calendar);
  return buildConflict(
    "constraint-violation", activityId, activityName, constraintType,
    constraintDate, "soft", computedDate, delta, "warning",
    `${activityName}: Soft constraint ${constraintType} ${constraintDate} not met by current schedule (network-driven date: ${computedDate}, delta: ${delta} working days).`
  );
}

// -- Helpers ------------------------------------------------------------------

function buildConflict(
  type: ConstraintConflict["type"],
  activityId: string,
  activityName: string,
  constraintType: ConstraintType,
  constraintDate: string,
  constraintMode: ConstraintMode,
  computedDate: string,
  deltaWorkingDays: number,
  severity: ConstraintConflict["severity"],
  message: string,
): ConstraintConflict {
  return {
    type,
    activityId,
    activityName,
    constraintType,
    constraintDate,
    constraintMode,
    computedDate,
    deltaWorkingDays,
    severity,
    message,
  };
}
