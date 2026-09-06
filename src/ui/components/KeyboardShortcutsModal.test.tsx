// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { KeyboardShortcutsModal } from "./KeyboardShortcutsModal";

/**
 * The shortcuts modal documents what the app's key handlers actually do. Each row is
 * read back from the rendered <kbd> chips plus its description, so the assertion is on
 * what a user sees, not on the SHORTCUTS array.
 *
 * Ctrl+Y: `ProjectPage`'s undo/redo handler has accepted it since the handler existed
 * (`(e.key === "z" && e.shiftKey) || e.key === "y"`), and ProjectPage.test.tsx drives
 * it end to end. The modal omitted it until WI-16. Falsified at 1c9b1db: the Ctrl+Y
 * assertion fails; the Ctrl+Shift+Z one is the must-not-move twin and passes.
 */
afterEach(cleanup);

interface Row {
  keys: string[];
  description: string;
}

/** Every documented row, in render order. A row is the element holding one KeyCombo. */
function documentedRows(): Row[] {
  const dialog = screen.getByRole("dialog");
  const byRow = new Map<Element, string[]>();
  for (const kbd of dialog.querySelectorAll("kbd")) {
    // KeyCombo nests spans; the row is the nearest <div> above the chips.
    const row = kbd.closest("div")!;
    byRow.set(row, [...(byRow.get(row) ?? []), kbd.textContent!.trim()]);
  }
  return [...byRow.entries()].map(([row, keys]) => ({
    keys,
    description: row.lastElementChild!.textContent!.trim(),
  }));
}

function renderOpen() {
  render(<KeyboardShortcutsModal open onOpenChange={vi.fn()} />);
}

describe("KeyboardShortcutsModal", () => {
  it("documents Ctrl/Cmd+Y as redo, the shortcut the page has always accepted", () => {
    renderOpen();
    expect(documentedRows()).toContainEqual({
      keys: ["Ctrl/Cmd", "Y"],
      description: "Redo last action",
    });
  });

  it("documents Enter and Escape as name-edit keys only — an estimate cell commits on blur, not Enter", () => {
    // Measured on the sample project (2026-09-06): a real Enter keydown in a Min cell
    // leaves focus in the cell and the store unchanged; the click-away commits. Escape
    // is inert there too. Both rows used to claim "cell edit" for every cell.
    renderOpen();
    const rows = documentedRows();
    expect(rows).toContainEqual({ keys: ["Enter"], description: "Confirm a name edit" });
    expect(rows).toContainEqual({ keys: ["Escape"], description: "Cancel a name edit" });
    expect(rows.map((r) => r.description)).not.toContain("Confirm cell edit");
    expect(rows.map((r) => r.description)).not.toContain("Cancel cell edit");
  });

  it("still documents Ctrl/Cmd+Shift+Z as redo", () => {
    renderOpen();
    expect(documentedRows()).toContainEqual({
      keys: ["Ctrl/Cmd", "Shift", "Z"],
      description: "Redo last action",
    });
  });
});
