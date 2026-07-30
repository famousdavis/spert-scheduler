// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

/**
 * `src/app/api/ai-op-contract.json` is a shared artifact: it must stay
 * byte-identical (in canonical form) to its copy in the spert-landing-page
 * repo at `functions/src/mcp/ai-op-contract.json`. The two halves of Connect AI
 * — this client and the MCP server — are written against the same document, and
 * a silent divergence means the server advertises a tool shape the client will
 * reject, or vice versa.
 *
 * That requirement was documented and tooled but never actually enforced.
 * `npm run contract:hash` PRINTS the digest and exits 0 whatever it finds, so
 * it only helps when a human runs it in both repos and compares by eye. Nothing
 * failed if they diverged. `ai-op-contract.test.ts` validates the Zod schema
 * shapes against the contract, which is a different property entirely — it
 * would stay green through any content change that remained schema-valid.
 *
 * This pins the digest so the file cannot change unnoticed. Verified on
 * 2026-07-30: both repos canonicalise to the constant below.
 *
 * IF THIS FAILS, the contract changed. That is allowed — but it is a cross-repo
 * change, so:
 *   1. make the same change in spert-landing-page's copy,
 *   2. confirm `npm run contract:hash` matches in BOTH repos,
 *   3. update the constant here,
 *   4. ship the server side first, so the assistant is never told about a tool
 *      the server cannot yet handle.
 * Do not update the constant on its own to make this pass.
 *
 * Canonical form (mirrors scripts/contract-hash.mjs): recursively key-sorted
 * JSON, no insignificant whitespace, UTF-8.
 */
const CANONICAL_CONTRACT_SHA256 =
  "25dabe86334f7599f4bf7daef2fdae1c2e51e7d70a714851b9b50096cd7e33f1";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function sortDeep(value: Json): Json {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    return Object.keys(value)
      .sort()
      .reduce<{ [key: string]: Json }>((acc, key) => {
        acc[key] = sortDeep((value as { [key: string]: Json })[key] as Json);
        return acc;
      }, {});
  }
  return value;
}

describe("ai-op-contract.json cross-repo hash", () => {
  it("matches the canonical digest shared with spert-landing-page", () => {
    const contractPath = path.resolve(process.cwd(), "src/app/api/ai-op-contract.json");
    const data = JSON.parse(fs.readFileSync(contractPath, "utf-8")) as Json;
    const canonical = JSON.stringify(sortDeep(data));
    const actual = createHash("sha256").update(canonical, "utf8").digest("hex");

    expect(
      actual,
      "ai-op-contract.json has changed. It is shared with spert-landing-page — " +
        "make the same change there, confirm `npm run contract:hash` matches in both " +
        "repos, then update CANONICAL_CONTRACT_SHA256."
    ).toBe(CANONICAL_CONTRACT_SHA256);
  });
});
