// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";

import { describe, it, expect } from "vitest";

/**
 * The × that closes a window can be seen against it (WI-116, v0.79.31): each `aria-label="Close"` button under
 * src/ui — the Share, Connect AI and Storage & Sign In windows' — meets WCAG 1.4.11's 3 : 1 for a control's only
 * visual, on its window, in light and dark, at rest and on hover. Before, its `text-gray-400` measured 2.60 : 1
 * on the white window.
 *
 * ⚠️ jsdom has no paint, so nothing here is measured from a render. The colours below are the browser's: each
 * Tailwind 4 grey (an OKLCH value) painted onto a canvas and read back as a pixel in Chrome 153, written out as
 * literals. Contrast is computed HERE, from the WCAG 2.x definition. The class strings are read from the source,
 * as legibility-floor.test.ts reads font sizes, and a × added to another window fails the census row until it is
 * added to THE_THREE, and so checked.
 *
 * ⚠️ Each colour state needs its own class — `text-`, `hover:text-`, `dark:text-`, `dark:hover:text-` — so the
 * cascade is never guessed at. A grey with no measurement below fails loudly: measure it in the browser first.
 */
const MEASURED: Record<string, string> = {
  white: "#ffffff",
  "gray-100": "#f3f4f6",
  "gray-200": "#e5e7eb",
  "gray-300": "#d1d5dc",
  "gray-400": "#99a1af",
  "gray-500": "#6a7282",
  "gray-600": "#4a5565",
  "gray-700": "#364153",
  "gray-800": "#1e2939",
};

const FLOOR = 3;
const LABEL = 'aria-label="Close"';
const THE_THREE = [
  join("src", "ui", "components", "ShareProjectModal.tsx"),
  join("src", "ui", "components", "ConnectAI", "ConnectAiPanel.tsx"),
  join("src", "ui", "components", "StorageLoginModal.tsx"),
];

/** WCAG 2.x relative luminance of #rrggbb. */
function luminance(hex: string): number {
  const channel = (at: number) => {
    const s = Number.parseInt(hex.slice(at, at + 2), 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** WCAG 2.x contrast ratio between two #rrggbb colours. */
function contrast(a: string, b: string): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function measured(name: string, where: string): string {
  const hex = MEASURED[name];
  if (!hex) throw new Error(`${where}: no browser measurement for "${name}" — measure it before using it`);
  return hex;
}

const MEASURED_SHAPE = /^(?:white|gray-\d{2,3})$/;

/** The colour a class list gives one variant prefix (`""`, `hover:`, `dark:`, `dark:hover:`) for `text` or `bg`. */
function token(classes: string[], prefix: string, property: "text" | "bg"): string | undefined {
  const head = `${prefix}${property}-`;
  const hit = classes.find((c) => c.startsWith(head) && MEASURED_SHAPE.test(c.slice(head.length)));
  return hit?.slice(head.length);
}

/**
 * The static `className="…"` string of the JSX tag that starts at `open`. The tag is read up to the next `<`, never
 * the next `>`: an arrow function in an attribute (`onClick={() => …}`) holds a `>` long before the tag ends.
 */
function staticClassName(text: string, open: number, where: string): string[] {
  const key = 'className="';
  const at = text.indexOf(key, open);
  const nextTag = text.indexOf("<", open + 1);
  if (open === -1 || at === -1 || (nextTag !== -1 && at > nextTag)) {
    throw new Error(`${where}: no static className string`);
  }
  return text.slice(at + key.length, text.indexOf('"', at + key.length)).split(/\s+/);
}

interface CloseButton {
  file: string;
  button: string[];
  panel: string[];
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full));
    else if (entry.endsWith(".tsx") && !entry.includes(".test.")) out.push(full);
  }
  return out;
}

function closeButtonsIn(file: string): CloseButton[] {
  const text = readFileSync(file, "utf8");
  const rel = relative(process.cwd(), file);
  const found: CloseButton[] = [];
  for (let at = text.indexOf(LABEL); at !== -1; at = text.indexOf(LABEL, at + LABEL.length)) {
    found.push({
      file: rel,
      button: staticClassName(text, text.lastIndexOf("<button", at), `${rel} ×`),
      panel: staticClassName(text, text.lastIndexOf("<Dialog.Content", at), `${rel} window`),
    });
  }
  return found;
}

/** Each state: the ×'s colour and the ground beneath it, as the classes give them. */
const STATES = [
  {
    title: "light, at rest",
    fg: (b: CloseButton) => token(b.button, "", "text"),
    ground: (b: CloseButton) => token(b.panel, "", "bg"),
  },
  {
    title: "light, on hover",
    fg: (b: CloseButton) => token(b.button, "hover:", "text"),
    ground: (b: CloseButton) => token(b.button, "hover:", "bg") ?? token(b.panel, "", "bg"),
  },
  {
    title: "dark, at rest",
    fg: (b: CloseButton) => token(b.button, "dark:", "text"),
    ground: (b: CloseButton) => token(b.panel, "dark:", "bg"),
  },
  {
    title: "dark, on hover",
    fg: (b: CloseButton) => token(b.button, "dark:hover:", "text"),
    ground: (b: CloseButton) =>
      token(b.button, "dark:hover:", "bg") ?? token(b.button, "hover:", "bg") ?? token(b.panel, "dark:", "bg"),
  },
];

describe("the × close buttons meet 3 : 1 on their window (WI-116)", () => {
  it("the buttons labelled Close in a window are exactly the three checked below", () => {
    // Vacuity control, and the census: a reader that finds nothing would pass every row below, and a × added to
    // another window must join THE_THREE to be checked. Read inside the test, never at load, so a broken source
    // fails rows here instead of changing how many tests run.
    const found = sourceFiles(join(process.cwd(), "src", "ui")).flatMap(closeButtonsIn);
    expect(found.map((b) => b.file).sort()).toEqual([...THE_THREE].sort());
  });

  it("reproduces the browser's ratios for two pairs it measured", () => {
    // Instrument control, against Chrome 153's own readings: the old light × on the white window (the defect),
    // and the Storage window's old dark × on gray-800.
    expect(contrast(measured("gray-400", "control"), measured("white", "control"))).toBeCloseTo(2.6, 2);
    expect(contrast(measured("gray-500", "control"), measured("gray-800", "control"))).toBeCloseTo(3.03, 2);
  });

  // One row per window and state, fixed: a × removed from its window fails its rows rather than taking them away.
  for (const file of THE_THREE) {
    const name = file.split(sep).join("/");
    for (const state of STATES) {
      it(`${basename(file)} — ${state.title}`, () => {
        const found = closeButtonsIn(join(process.cwd(), file));
        expect(found, `${name}: one button labelled Close`).toHaveLength(1);
        const fg = state.fg(found[0]!);
        const ground = state.ground(found[0]!);
        expect(fg, `${name}: no class for the × ${state.title}`).toBeDefined();
        expect(ground, `${name}: no ground ${state.title}`).toBeDefined();
        const ratio = contrast(measured(fg!, name), measured(ground!, name));
        expect(ratio, `${name} ${state.title}: ${fg} on ${ground}`).toBeGreaterThanOrEqual(FLOOR);
      });
    }
  }
});
