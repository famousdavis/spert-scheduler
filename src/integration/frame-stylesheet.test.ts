// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * The SPERT® Suite app frame's stylesheet (FRAME26, v0.88.0; v3 since v0.89.0, v4 since v0.90.0), vendored byte for byte from the canonical copy in
 * spert-suite-docs (`suite/frame/spert-frame.css`). Every adopting app pins the same md5, so a local edit, or a copy
 * that missed a canonical change, fails here, not in a user's window. It is a byte-identical shared artifact, like
 * `scripts/shipgate.mjs`: never edit it in one repo alone.
 *
 * If this fails because the canonical file changed: copy it again (`cp`), check `md5 -q` against the md5 the campaign
 * gives you, and update PINNED in the same commit. Never edit the vendored copy to make this pass.
 */
const PINNED = "7f8e40a37b008027e06123fe13e1b2f8"; // v4 (v0.90.0): adds the About page, `.sf-about`
const SRC = join(process.cwd(), "src");
const VENDORED = join(SRC, "styles", "spert-frame.css");
const STYLES = join(SRC, "styles.css");
/** An import of the stylesheet, in CSS (`@import "…spert-frame.css"`) or in a module (`import '…spert-frame.css'`). */
const IMPORTS_IT = /(?:@import\s+(?:url\()?|import\s+|from\s+)["'][^"']*spert-frame\.css["']/g;

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("the vendored frame stylesheet", () => {
  it("is byte-identical to the canonical copy whose md5 is pinned here", () => {
    // md5 is the campaign's identifier for the file (every adopting repo pins it, checked with `md5 -q`): a byte-identity
    // check, not a security use, which is what sonarjs/hashing guards against.
    // eslint-disable-next-line sonarjs/hashing -- byte-identity pin shared across the suite, not a security use
    const md5 = createHash("md5").update(readFileSync(VENDORED)).digest("hex");
    expect(md5).toBe(PINNED);
  });

  it("declares the version the pin was taken at", () => {
    expect(readFileSync(VENDORED, "utf8")).toMatch(/--sf-version: "4";/);
  });

  it("is imported exactly once, by styles.css, after Tailwind, unlayered", () => {
    const css = readFileSync(STYLES, "utf8");
    const imports = Array.from(css.matchAll(IMPORTS_IT)).map((m) => m[0]);
    expect(imports).toEqual(['@import "./styles/spert-frame.css"']);
    // A layer() would put it under Tailwind's utilities, and any utility could then move the frame (contract §9.2).
    const line = css.split("\n").find((l) => l.includes("spert-frame.css") && l.trimStart().startsWith("@import"));
    expect(line).toBe('@import "./styles/spert-frame.css";');
    expect(css.indexOf('@import "tailwindcss";')).toBeGreaterThan(-1);
    expect(css.indexOf('@import "tailwindcss";')).toBeLessThan(css.indexOf(line!));
  });

  it("is imported by nothing else under src/", () => {
    const others = filesUnder(SRC)
      .filter((f) => /\.(?:css|ts|tsx|js|jsx|mjs)$/.test(f) && f !== STYLES && !f.includes(".test."))
      .filter((f) => Array.from(readFileSync(f, "utf8").matchAll(IMPORTS_IT)).length > 0)
      .map((f) => relative(SRC, f));
    expect(others).toEqual([]);
  });

  it("the importer check can see an import (must-find control)", () => {
    expect(Array.from('import "../styles/spert-frame.css";'.matchAll(IMPORTS_IT))).toHaveLength(1);
    expect(Array.from("@import url('./styles/spert-frame.css');".matchAll(IMPORTS_IT))).toHaveLength(1);
    expect(Array.from("/* spert-frame.css is vendored */".matchAll(IMPORTS_IT))).toHaveLength(0);
  });
});
