// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * `zod-locale.ts` installs Zod's English messages, and `main.tsx` imports it first.
 *
 * ⚠️ vitest keeps Zod's OWN locale — nothing is tree-shaken here — so a test that does not
 * CLEAR the locale first passes whether or not the module does anything. Each test below clears
 * it and reads "Invalid input" (what a production build read) before importing the module.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

afterEach(() => {
  // Later tests in this file, and the files after it in this worker, read English messages.
  z.config(z.locales.en());
});

function firstMessage(schema: z.ZodType, value: unknown): string | undefined {
  return schema.safeParse(value).error?.issues[0]?.message;
}

describe("zod-locale", () => {
  it("installs the English messages a cleared locale lacks", async () => {
    const name = z.string().max(3);
    z.config({ localeError: undefined });
    expect(firstMessage(name, "abcd")).toBe("Invalid input");

    vi.resetModules();
    await import("./zod-locale");

    expect(firstMessage(name, "abcd")).toBe("Too big: expected string to have <=3 characters");
  });

  it("is the first import of main.tsx, so the locale is installed before any message is produced", () => {
    const main = readFileSync(join(process.cwd(), "src/main.tsx"), "utf-8");
    const imports = main.split("\n").filter((line) => line.startsWith("import "));
    expect(imports.length).toBeGreaterThan(1);
    expect(imports[0]).toBe('import "@domain/schemas/zod-locale";');
  });
});
