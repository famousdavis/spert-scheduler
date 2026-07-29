// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0. See LICENSE file in the project root for full license text.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * `public/CHANGELOG.md` is a static copy of the root `CHANGELOG.md`, served at
 * /CHANGELOG.md on the deployed site.
 *
 * Nothing in the app reads it — ChangelogPage renders from
 * `src/ui/pages/changelog-data.ts` — so no build, type check, lint run or other
 * test touches the file. It can therefore rot indefinitely without anyone
 * noticing, and it did: it was last written in the v0.16.2 commit on 2026-03-11
 * and by v0.59.2 was 43 releases behind, so the deployed URL served a March 2026
 * changelog for nearly five months.
 *
 * Four of the five SPERT® Suite repos that ship a public copy keep it byte-identical
 * to root. This test is what holds scheduler to that, since nothing else can.
 *
 * If this fails, the fix is: cp CHANGELOG.md public/CHANGELOG.md
 */
describe("CHANGELOG.md ↔ public/CHANGELOG.md sync", () => {
  const rootPath = path.resolve(process.cwd(), "CHANGELOG.md");
  const publicPath = path.resolve(process.cwd(), "public/CHANGELOG.md");

  it("both the root changelog and its public copy exist", () => {
    expect(fs.existsSync(rootPath)).toBe(true);
    expect(fs.existsSync(publicPath)).toBe(true);
  });

  it("the public copy is byte-identical to the root changelog", () => {
    const rootBuf = fs.readFileSync(rootPath);
    const publicBuf = fs.readFileSync(publicPath);

    if (!rootBuf.equals(publicBuf)) {
      const newestHeading = (buf: Buffer): string =>
        buf.toString("utf-8").match(/^## .*$/m)?.[0] ?? "(no version heading found)";

      throw new Error(
        "public/CHANGELOG.md has drifted from CHANGELOG.md.\n" +
          `  root:   ${rootBuf.length} bytes, newest entry ${newestHeading(rootBuf)}\n` +
          `  public: ${publicBuf.length} bytes, newest entry ${newestHeading(publicBuf)}\n` +
          "Fix with: cp CHANGELOG.md public/CHANGELOG.md"
      );
    }

    expect(publicBuf.equals(rootBuf)).toBe(true);
  });
});
