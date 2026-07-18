// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ZodType } from "zod";
import {
  BulkCreateActivitiesSchema,
  BulkCreateDependenciesSchema,
  BulkCreateMilestonesSchema,
  BulkAssignMilestonesSchema,
  BulkUpdateActivitiesSchema,
  BulkImportScheduleSchema,
  ReorderActivitiesSchema,
} from "./ai-bulk-schemas";

// Contract test (client half, P0.2 / F3-7). The client validates the drained OP
// PAYLOAD — sessionId is a server-only tool arg, scenarioId is optional routing
// — and its structural schemas deliberately omit enums and content bounds
// (decision 9). So this test asserts op names + item fields + required/optional
// + array caps ONLY. The enum-domain and bounds rows in the fixture are
// landing-only assertions (see the landing aiOpContract test). The fixture is
// duplicated verbatim across repos; `npm run contract:hash` pins that.

interface FieldSpec {
  required: boolean;
  type: "string" | "number";
  enum?: string[];
  minLen?: number;
  maxLen?: number;
  min?: number;
  max?: number;
  int?: boolean;
  nonnegative?: boolean;
  pattern?: string;
}
// Three op shapes: single-array ops carry `array`/`cap`/`item`; the composite
// `bulk_import_schedule` carries `sections` (each an optional array with its own
// `cap`/`item`); the scalar-array op `reorder_activities` carries
// `array`/`cap`/`element` (a bare string array — no per-item object). Partition
// and drive each shape with its own describe.each.
interface SingleArrayOpSpec {
  tool: string;
  array: string;
  cap: { min: number; max: number };
  item: Record<string, FieldSpec>;
}
interface SectionSpec {
  cap: { max: number };
  item: Record<string, FieldSpec>;
}
interface MultiSectionOpSpec {
  tool: string;
  sections: Record<string, SectionSpec>;
}
interface ScalarArrayOpSpec {
  tool: string;
  array: string;
  cap: { min: number; max: number };
  element: { type: "string" | "number"; minLen?: number; maxLen?: number };
}
type OpSpec = SingleArrayOpSpec | MultiSectionOpSpec | ScalarArrayOpSpec;
interface Contract {
  ops: Record<string, OpSpec>;
  schedulerOps: string[];
  storymapOps: string[];
}

// vitest runs from the repo root; read the fixture from its repo-relative path
// (this file's directory) rather than an import (no resolveJsonModule needed).
const contract = JSON.parse(
  readFileSync(resolve("src/app/api/ai-op-contract.json"), "utf8")
) as Contract;

const SCHEMAS: Record<string, ZodType> = {
  bulk_create_activities: BulkCreateActivitiesSchema,
  bulk_create_dependencies: BulkCreateDependenciesSchema,
  bulk_create_milestones: BulkCreateMilestonesSchema,
  bulk_assign_milestones: BulkAssignMilestonesSchema,
  bulk_update_activities: BulkUpdateActivitiesSchema,
  bulk_import_schedule: BulkImportScheduleSchema,
  reorder_activities: ReorderActivitiesSchema,
};

// Partition by shape. `array`+`item` → single-array; `array`+`element` →
// scalar-array; `sections` → composite. (Testing `"array" in s` alone would
// misclassify the itemless scalar-array op.)
const isSingleArray = (s: OpSpec): s is SingleArrayOpSpec =>
  "array" in s && "item" in s;
const isScalarArray = (s: OpSpec): s is ScalarArrayOpSpec =>
  "array" in s && "element" in s;
const isSection = (s: OpSpec): s is MultiSectionOpSpec => "sections" in s;
const singleArrayOps = Object.entries(contract.ops).filter(([, s]) =>
  isSingleArray(s)
) as [string, SingleArrayOpSpec][];
const scalarArrayOps = Object.entries(contract.ops).filter(([, s]) =>
  isScalarArray(s)
) as [string, ScalarArrayOpSpec][];
const sectionOps = Object.entries(contract.ops).filter(([, s]) =>
  isSection(s)
) as [string, MultiSectionOpSpec][];

function sample(spec: FieldSpec): unknown {
  return spec.type === "number" ? 1 : "x";
}
function wrongType(spec: FieldSpec): unknown {
  return spec.type === "number" ? "not-a-number" : 123;
}
function minimalItem(item: Record<string, FieldSpec>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [field, spec] of Object.entries(item)) {
    if (spec.required) out[field] = sample(spec);
  }
  return out;
}
function payload(op: SingleArrayOpSpec, items: unknown[]): Record<string, unknown> {
  return { [op.array]: items };
}

describe.each(singleArrayOps)("client contract — %s", (op, spec) => {
  const schema = SCHEMAS[op]!;

  it("has a matching client structural schema", () => {
    expect(schema).toBeDefined();
  });

  it("parses a minimal valid payload (required fields only)", () => {
    expect(schema.safeParse(payload(spec, [minimalItem(spec.item)])).success).toBe(true);
  });

  it("requires the array field", () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("enforces the array-length cap", () => {
    const item = minimalItem(spec.item);
    expect(schema.safeParse(payload(spec, [])).success).toBe(false);
    expect(schema.safeParse(payload(spec, Array(spec.cap.max).fill(item))).success).toBe(true);
    expect(schema.safeParse(payload(spec, Array(spec.cap.max + 1).fill(item))).success).toBe(false);
  });

  it("validates every declared item field's presence and primitive type", () => {
    for (const [field, fspec] of Object.entries(spec.item)) {
      const badType = { ...minimalItem(spec.item), [field]: wrongType(fspec) };
      expect(schema.safeParse(payload(spec, [badType])).success).toBe(false);
      if (fspec.required) {
        const missing = { ...minimalItem(spec.item) };
        delete missing[field];
        expect(schema.safeParse(payload(spec, [missing])).success).toBe(false);
      }
    }
  });
});

describe.each(sectionOps)("client contract (composite) — %s", (op, spec) => {
  const schema = SCHEMAS[op]!;

  it("has a matching client structural schema", () => {
    expect(schema).toBeDefined();
  });

  it("accepts an all-absent payload structurally (empty_import is a handler check)", () => {
    // The client schema makes every section optional with no `.min` — the
    // "at least one section" rule is a server inline check + a drain-time floor,
    // never structural. So `{}` parses here on purpose.
    expect(schema.safeParse({}).success).toBe(true);
  });

  describe.each(Object.entries(spec.sections))("section %s", (section, sspec) => {
    const build = (items: unknown[]) => ({ [section]: items });

    it("parses a minimal valid section payload", () => {
      expect(schema.safeParse(build([minimalItem(sspec.item)])).success).toBe(true);
    });

    it("allows an explicitly-empty section array (no .min)", () => {
      expect(schema.safeParse(build([])).success).toBe(true);
    });

    it("enforces the section cap", () => {
      const item = minimalItem(sspec.item);
      expect(schema.safeParse(build(Array(sspec.cap.max).fill(item))).success).toBe(true);
      expect(schema.safeParse(build(Array(sspec.cap.max + 1).fill(item))).success).toBe(false);
    });

    it("validates every declared item field's presence and primitive type", () => {
      for (const [field, fspec] of Object.entries(sspec.item)) {
        const badType = { ...minimalItem(sspec.item), [field]: wrongType(fspec) };
        expect(schema.safeParse(build([badType])).success).toBe(false);
        if (fspec.required) {
          const missing = { ...minimalItem(sspec.item) };
          delete missing[field];
          expect(schema.safeParse(build([missing])).success).toBe(false);
        }
      }
    });
  });
});

// Scalar-array op (reorder_activities). The client schema is structural
// (z.string(), no element bounds), so this asserts the array field, caps, and
// element primitive type only — element minLen/maxLen are landing-only rows.
describe.each(scalarArrayOps)("client contract (scalar array) — %s", (op, spec) => {
  const schema = SCHEMAS[op]!;
  const el = spec.element.type === "number" ? 1 : "x";
  const build = (items: unknown[]) => ({ [spec.array]: items });

  it("has a matching client structural schema", () => {
    expect(schema).toBeDefined();
  });

  it("parses a minimal valid payload (cap.min elements)", () => {
    expect(schema.safeParse(build(Array(spec.cap.min).fill(el))).success).toBe(true);
  });

  it("requires the array field", () => {
    expect(schema.safeParse({}).success).toBe(false);
  });

  it("enforces the array-length cap (min and max)", () => {
    expect(schema.safeParse(build(Array(spec.cap.min - 1).fill(el))).success).toBe(false);
    expect(schema.safeParse(build(Array(spec.cap.max).fill(el))).success).toBe(true);
    expect(schema.safeParse(build(Array(spec.cap.max + 1).fill(el))).success).toBe(false);
  });

  it("rejects a wrong-typed element", () => {
    const wrong = spec.element.type === "number" ? "no" : 123;
    expect(schema.safeParse(build([wrong, el])).success).toBe(false);
  });
});

describe("client contract — op-name registry", () => {
  it("every bulk op is a scheduler op and disjoint from storymap", () => {
    for (const op of Object.keys(contract.ops)) {
      expect(contract.schedulerOps).toContain(op);
      expect(contract.storymapOps).not.toContain(op);
    }
  });
});
