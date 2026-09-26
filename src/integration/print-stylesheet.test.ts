// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

/**
 * In print, the app shell must paint no background under the report.
 *
 * ⚠️ jsdom applies no `@media print` rules, so this reads the stylesheet and pins the
 * MECHANISM. The outcome was measured on real PDFs: the shell's `dark:bg-gray-900` printed
 * as a navy block on page 1 and as a thin line down the right edge of every page, even
 * with the browser's Background graphics off, because `* { print-color-adjust: exact }`
 * prints every background. The light theme printed the same shapes in gray-50, too pale to
 * see. With the shell transparent, the dark and light PDFs are pixel-identical.
 */

/** `src/styles.css` with its comments removed, so a comment cannot satisfy or hide a match. */
function stylesheetWithoutComments(): string {
  // Not `new URL("../styles.css", import.meta.url)`: Vite rewrites that literal form into a
  // served asset URL, which readFileSync refuses.
  const raw = readFileSync(join(process.cwd(), "src/styles.css"), "utf8");
  let out = "";
  let from = 0;
  for (let open = raw.indexOf("/*"); open !== -1; open = raw.indexOf("/*", from)) {
    out += raw.slice(from, open);
    const close = raw.indexOf("*/", open + 2);
    from = close === -1 ? raw.length : close + 2;
  }
  return out + raw.slice(from);
}

/** The inside of the `@media print { … }` block, found by balancing braces. */
function printBlock(css: string): string {
  const open = css.indexOf("{", css.indexOf("@media print"));
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    if (css[i] === "}") depth--;
    if (depth === 0) return css.slice(open + 1, i);
  }
  return "";
}

/** The style rule whose selector list contains `selector`: its selectors and declarations. */
function ruleContaining(block: string, selector: string) {
  const at = block.indexOf(selector);
  const open = block.indexOf("{", at);
  const close = block.indexOf("}", open);
  const preludeStart = Math.max(block.lastIndexOf("}", at), block.lastIndexOf("{", at)) + 1;
  return {
    selectors: block.slice(preludeStart, open).split(",").map((s) => s.trim()),
    declarations: block
      .slice(open + 1, close)
      .split(";")
      .map((d) => d.trim().replace(/\s+/g, " "))
      .filter((d) => d !== ""),
  };
}

describe("Print stylesheet — the app shell paints no background in print", () => {
  it("the rule that neutralises the report's ancestors also makes their backgrounds transparent", () => {
    const block = printBlock(stylesheetWithoutComments());
    expect(block).not.toBe("");
    // `#root > *` is the Layout root, the one element on the chain that paints a background.
    const rule = ruleContaining(block, "#root > *");
    expect(rule.selectors).toContain("#root > *");
    // Positive control: the lookup found the neutraliser, whatever the pin below says.
    expect(rule.declarations).toContain("display: block !important");
    expect(rule.declarations).toContain("background: transparent !important");
  });
});

/**
 * In print, a `no-print` banner in <main> must take no space.
 *
 * The neutraliser's #root selectors carry an ID, so on every property both set they outrank
 * `.no-print` (one class) — display, height, margin, padding — and leave only
 * `visibility: hidden`. Anything they match prints invisible but full height. Measured on
 * real PDFs before this: with the first-run and local-storage banners on screen, page 1 of
 * the report started 104 CSS px lower. After: pixel-identical to a printout with no banner,
 * on every page, in both themes. jsdom applies no `@media print`, so this pins the
 * MECHANISM: which elements the neutraliser's selectors match, asked of the DOM itself.
 */
describe("Print stylesheet — a no-print child of <main> takes no space in print", () => {
  it("the neutraliser matches the report's ancestor in <main> but no no-print child of <main>", () => {
    const rule = ruleContaining(printBlock(stylesheetWithoutComments()), "#root > *");
    // Positive control: the lookup found the neutraliser.
    expect(rule.declarations).toContain("display: block !important");
    const neutraliser = rule.selectors.join(", ");

    // The shape the report prints from: #root > layout root > <main> > [banner, page root > report].
    const root = document.createElement("div");
    root.id = "root";
    const layoutRoot = document.createElement("div");
    const main = document.createElement("main");
    const banner = document.createElement("div");
    banner.className = "no-print";
    const pageRoot = document.createElement("div");
    const report = document.createElement("div");
    report.className = "print-report";
    pageRoot.append(report);
    main.append(banner, pageRoot);
    layoutRoot.append(main);
    root.append(layoutRoot);
    document.body.append(root);
    try {
      expect(banner.matches(neutraliser)).toBe(false);
      // The report's own ancestor must still be neutralised, or the report cannot flow
      // across printed pages.
      expect(pageRoot.matches(neutraliser)).toBe(true);
    } finally {
      root.remove();
    }
  });
});
