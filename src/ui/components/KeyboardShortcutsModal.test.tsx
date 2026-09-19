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

  it("documents Enter and Escape for name edits and the estimate cells — and still for no other cell", () => {
    // ⚠️ v0.70.0 — MOVED ON PURPOSE. This pinned the name-only rows ("Confirm a name edit",
    // "Cancel a name edit"), because until v0.70.0 an estimate cell ignored both keys (measured on
    // the sample project, 2026-09-06: Enter left focus in the cell and the store unchanged).
    // WI-50 made the estimate cells take them — Enter commits the row's three cells and moves on,
    // Escape reverts them — so the rows name estimates too. They must still not claim EVERY cell:
    // the grid handles neither key in Distribution, Confidence, Status or Actual.
    renderOpen();
    const rows = documentedRows();
    expect(rows).toContainEqual({ keys: ["Enter"], description: "Confirm a name or estimate edit" });
    expect(rows).toContainEqual({ keys: ["Escape"], description: "Cancel a name or estimate edit" });
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
