// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { UserPreferencesSchema } from "@domain/schemas/preferences.schema";

/**
 * Extract the hasOnly key list from the spertscheduler_settings match block
 * in firestore.rules. This eliminates a manual third copy of truth — the test
 * reads the actual rules file at runtime.
 *
 * If you change the format of firestore.rules in a way that breaks this regex,
 * the test will fail with a descriptive message telling you to update the
 * extraction logic.
 */
function extractSettingsAllowlist(): string[] {
  const rulesPath = path.resolve(process.cwd(), "firestore.rules");
  const rulesContent = fs.readFileSync(rulesPath, "utf-8");

  // Match the hasOnly([...]) block inside the spertscheduler_settings section
  const settingsMatch = rulesContent.match(
    /spertscheduler_settings[\s\S]*?hasOnly\(\[([\s\S]*?)\]\)/
  );
  if (!settingsMatch?.[1]) {
    throw new Error(
      "Could not extract hasOnly list from firestore.rules spertscheduler_settings block. " +
        "If the rules file format changed, update the regex in preferences-firestore-sync.test.ts."
    );
  }

  // Extract all single-quoted key names from the matched block
  const keys = [...settingsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]!);
  if (keys.length === 0) {
    throw new Error(
      "Extracted zero keys from firestore.rules hasOnly block. " +
        "Check that the rules file uses single-quoted key names."
    );
  }

  return keys;
}

describe("preferences ↔ firestore.rules sync", () => {
  const zodKeys = Object.keys(UserPreferencesSchema.shape).sort();
  const rulesKeys = extractSettingsAllowlist().sort();

  it("every Zod schema key appears in firestore.rules hasOnly list", () => {
    const missingFromRules = zodKeys.filter((k) => !rulesKeys.includes(k));
    expect(missingFromRules).toEqual([]);
  });

  it("every firestore.rules hasOnly key appears in Zod schema", () => {
    const missingFromZod = rulesKeys.filter((k) => !zodKeys.includes(k));
    expect(missingFromZod).toEqual([]);
  });
});
