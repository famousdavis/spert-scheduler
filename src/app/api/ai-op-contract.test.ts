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
interface OpSpec {
  tool: string;
  array: string;
  cap: { min: number; max: number };
  item: Record<string, FieldSpec>;
}
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
};

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
function payload(op: OpSpec, items: unknown[]): Record<string, unknown> {
  return { [op.array]: items };
}

describe.each(Object.entries(contract.ops))("client contract — %s", (op, spec) => {
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

describe("client contract — op-name registry", () => {
  it("every bulk op is a scheduler op and disjoint from storymap", () => {
    for (const op of Object.keys(contract.ops)) {
      expect(contract.schedulerOps).toContain(op);
      expect(contract.storymapOps).not.toContain(op);
    }
  });
});
