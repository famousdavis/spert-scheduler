// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import {
  unsaveableCause,
  saveBlockedReason,
  unsaveableDescription,
  type UnsaveableCause,
} from "./unsaveable-cause";
import type { ConstraintMode, ConstraintType } from "@domain/models/types";

type Row = [
  nameMissing: boolean,
  negativeEstimate: boolean,
  constraintType: ConstraintType | null,
  constraintDate: string | null,
  constraintMode: ConstraintMode | null,
  expected: UnsaveableCause | null,
];

const D = "2026-12-01";

/**
 * Every combination the five inputs admit — 2 × 2 × 2 × 2 × 2 — each written out with the cause it
 * must produce. Not generated: a table computed by the rule it tests can only agree with it.
 */
const ROWS: Row[] = [
  // An empty name wins over everything: its own message is already on screen beside the field.
  [true, true, null, null, null, "name"],
  [true, true, null, null, "hard", "name"],
  [true, true, null, D, null, "name"],
  [true, true, null, D, "hard", "name"],
  [true, true, "SNET", null, null, "name"],
  [true, true, "SNET", null, "hard", "name"],
  [true, true, "SNET", D, null, "name"],
  [true, true, "SNET", D, "hard", "name"],
  [true, false, null, null, null, "name"],
  [true, false, null, null, "hard", "name"],
  [true, false, null, D, null, "name"],
  [true, false, null, D, "hard", "name"],
  [true, false, "SNET", null, null, "name"],
  [true, false, "SNET", null, "hard", "name"],
  [true, false, "SNET", D, null, "name"],
  [true, false, "SNET", D, "hard", "name"],
  // Then a negative estimate, whatever the constraint holds.
  [false, true, null, null, null, "negativeEstimate"],
  [false, true, null, null, "hard", "negativeEstimate"],
  [false, true, null, D, null, "negativeEstimate"],
  [false, true, null, D, "hard", "negativeEstimate"],
  [false, true, "SNET", null, null, "negativeEstimate"],
  [false, true, "SNET", null, "hard", "negativeEstimate"],
  [false, true, "SNET", D, null, "negativeEstimate"],
  [false, true, "SNET", D, "hard", "negativeEstimate"],
  // Then the constraint — and only when it has a Type. Without one, a stray date or mode blocks nothing.
  [false, false, null, null, null, null],
  [false, false, null, null, "hard", null],
  [false, false, null, D, null, null],
  [false, false, null, D, "hard", null],
  [false, false, "SNET", null, null, "constraintDate"],
  [false, false, "SNET", null, "hard", "constraintDate"],
  [false, false, "SNET", D, null, "constraintMode"],
  [false, false, "SNET", D, "hard", null],
];

const label = ([nameMissing, negative, type, date, mode]: Row) =>
  `[name ${nameMissing ? "missing" : "set"}, ${negative ? "negative" : "no negative"}, ` +
  `type ${type ?? "none"}, date ${date ?? "none"}, mode ${mode ?? "none"}]`;

/**
 * The pre-change `isValid`, `ActivityEditModal.tsx:624-627` at `757ff86`, re-expressed over the
 * five booleans: `!nameMissing` stands for `name.trim().length > 0`, exactly, because
 * `nameMissing` is defined as `name.trim().length === 0` (`:609`). An independent oracle — the old
 * expression, not the new function — so the parity rows can show the refactor changed no answer.
 */
const preChangeIsValid = (
  nameMissing: boolean,
  negativeEstimate: boolean,
  constraintType: ConstraintType | null,
  constraintDate: string | null,
  constraintMode: ConstraintMode | null,
) =>
  !nameMissing &&
  !negativeEstimate &&
  (!constraintType || (!!constraintType && !!constraintDate && !!constraintMode));

describe("unsaveableCause — the first reason the Edit Activity window cannot save", () => {
  it("covers all 32 combinations, once each", () => {
    expect(ROWS).toHaveLength(32);
    expect(new Set(ROWS.map(label)).size).toBe(32);
  });

  for (const row of ROWS) {
    const [n, neg, type, date, mode, expected] = row;
    it(`${label(row)} → ${expected ?? "saveable"}`, () => {
      expect(unsaveableCause(n, neg, type, date, mode)).toBe(expected);
    });
  }
});

describe("unsaveableCause — saveable exactly when the pre-change isValid was true", () => {
  for (const row of ROWS) {
    const [n, neg, type, date, mode] = row;
    it(`parity ${label(row)}`, () => {
      expect(unsaveableCause(n, neg, type, date, mode) === null).toBe(preChangeIsValid(n, neg, type, date, mode));
    });
  }
});

const REASONS: [UnsaveableCause, string][] = [
  ["name", "Save needs a name for this activity."],
  ["negativeEstimate", "Save needs every estimate to be 0 or more."],
  ["constraintDate", "Save needs a date for the scheduling constraint."],
  ["constraintMode", "Save needs a mode for the scheduling constraint."],
];

const DESCRIPTIONS: [UnsaveableCause, string][] = [
  ["name", "This activity needs a name, so your changes can't be saved. Discarding them can't be undone."],
  ["negativeEstimate", "An estimate is negative, so your changes can't be saved. Discarding them can't be undone."],
  ["constraintDate", "This activity's constraint needs a date, so your changes can't be saved. Discarding them can't be undone."],
  ["constraintMode", "This activity's constraint needs a mode, so your changes can't be saved. Discarding them can't be undone."],
];

describe("saveBlockedReason — the line beside a disabled Save", () => {
  for (const [cause, text] of REASONS) {
    it(`reason text for ${cause}`, () => {
      expect(saveBlockedReason(cause)).toBe(text);
    });
  }

  // The positive control for the four rows above: were two causes to share a sentence, a text
  // row asserting the wrong cause would still pass.
  it("gives each cause its own sentence", () => {
    expect(new Set(REASONS.map(([cause]) => saveBlockedReason(cause))).size).toBe(4);
  });
});

describe("unsaveableDescription — the discard prompt's sentence", () => {
  for (const [cause, text] of DESCRIPTIONS) {
    it(`prompt text for ${cause}`, () => {
      expect(unsaveableDescription(cause)).toBe(text);
    });
  }

  it("gives each cause its own sentence", () => {
    expect(new Set(DESCRIPTIONS.map(([cause]) => unsaveableDescription(cause))).size).toBe(4);
  });
});
