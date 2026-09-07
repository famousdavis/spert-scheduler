// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect } from "vitest";

/**
 * Every Radix dialog's overlay and content must declare a stacking level (WI-3, v0.66.1).
 *
 * ⚠️ WHY THIS IS A SOURCE GUARD AND NOT A RENDER TEST. The defect is that the app header
 * (`Layout.tsx`, `sticky top-0 z-50`) paints ON TOP of a dialog whose overlay and content
 * carry no z-index — so the page dims while the header stays bright, and the header can
 * overlap the dialog itself. jsdom has no paint order and no compositing, so it cannot
 * express that. The rendered check is a browser measurement, recorded in the PR.
 *
 * ⚠️ AND `elementFromPoint` CANNOT BE THAT CHECK, which is how this defect survived an
 * acceptance criterion written against it. Radix sets `pointer-events: none` on <body>
 * while a modal is open, and `elementFromPoint` skips such elements — so it returns the
 * overlay whether or not the header is painted above it. Measured 2026-09-05: it returned
 * the overlay with the bug fully present. It answers "what receives a click"; this defect
 * is about "what is painted on top". Same tool that was exactly right for the Gantt bar
 * hit-testing in v0.64.15, and exactly wrong here, because the question changed.
 *
 * Three dialogs deviated (`NewProjectDialog`, `CloneScenarioDialog`, `NewScenarioDialog`);
 * five others already carried `z-50` on both. This pins the house pattern so a new dialog
 * cannot quietly join the minority.
 */

const UI_ROOT = join(process.cwd(), "src/ui");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return tsxFiles(full);
    return entry.endsWith(".tsx") && !entry.includes(".test.") ? [full] : [];
  });
}

/** Each `<Dialog.Overlay …>` / `<Dialog.Content …>` opening tag, with its className. */
function dialogLayers(source: string): { tag: string; className: string }[] {
  const out: { tag: string; className: string }[] = [];
  for (const tag of ["Dialog.Overlay", "Dialog.Content"]) {
    const re = new RegExp(`<${tag.replace(".", "\\.")}\\s+className="([^"]*)"`, "g");
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) out.push({ tag, className: m[1]! });
  }
  return out;
}

describe("dialog stacking", () => {
  const layers = tsxFiles(UI_ROOT).flatMap((file) =>
    dialogLayers(readFileSync(file, "utf-8")).map((l) => ({ ...l, file: file.replace(process.cwd() + "/", "") })),
  );

  it("finds dialog layers to check — the guard is not vacuous", () => {
    // ⚠️ Without this, deleting every dialog (or breaking the regex) makes the assertion
    // below pass over an empty list. Both overlay AND content must be represented, since
    // the bug was present on both and a guard covering one would have missed half of it.
    //
    // ⚠️ THIS WAS A FLOOR (`> 10`) AND IT FAILED OPEN (fixed v0.67.8, WI-6a). The extractor
    // above sees only a STATIC, DOUBLE-QUOTED `className`, so a layer written as
    // `className={`… ${cond ? "z-[60]" : "z-50"}`}` becomes INVISIBLE to it — it silently
    // leaves the list and never reaches the z-index assertion below. Measured: giving
    // `ConfirmDialog` a dynamic className drops the list 28 → 26, which still cleared `> 10`
    // and stayed GREEN with two unchecked layers. A dynamic z-index is the obvious way to
    // stack a nested dialog, so the cheapest correct-looking implementation was the one that
    // blinded the guard. Falsified both ways before landing: the ratchet FAILS on that tree
    // ("expected 26 to be greater than or equal to 28") and `> 10` PASSES on it.
    //
    // ⚠️ It ratchets in BOTH directions on purpose. Legitimately deleting a dialog turns this
    // red; that is the point — lower the number in the SAME commit as the deletion, exactly
    // as `expectProblems` is handled. Never widen it back to a floor to make it quiet.
    expect(layers.length).toBeGreaterThanOrEqual(28);
    expect(layers.some((l) => l.tag === "Dialog.Overlay")).toBe(true);
    expect(layers.some((l) => l.tag === "Dialog.Content")).toBe(true);
  });

  it("gives every dialog overlay and content an explicit z-index", () => {
    // ⚠️ NO TRAILING \b. The arbitrary-value form `z-[60]` ends in `]`, and a word
    // boundary cannot match between `]` and the closing quote — so the first draft of this
    // regex reported DependencyEditModal (which correctly carries z-[60] on both layers)
    // as missing one. The guard was wrong and the file was right; checked by reading the
    // file rather than by "fixing" it.
    const missing = layers.filter((l) => !/z-(\[\d+\]|\d+)(?=\s|"|$)/.test(l.className));
    expect(
      missing.map((m) => `${m.file} <${m.tag}>`),
      "a dialog layer with no z-index lets the sticky z-50 header paint over it",
    ).toEqual([]);
  });
});
