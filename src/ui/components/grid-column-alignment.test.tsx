// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { UnifiedActivityGrid } from "./UnifiedActivityGrid";
import { GRID_COLUMNS, GRID_COLUMNS_WITH_CONSTRAINT } from "./grid-columns";
import { createScenario, createActivity } from "@app/api/project-service";
import type { Activity } from "@domain/models/types";

/**
 * The activity grid's column template is a bare positional string of unnamed widths,
 * shared by FIVE independent containers — the header, the subheader, the summary row,
 * every activity row, and the band header row. **Nothing named these columns**, and
 * nothing in the suite pinned their order, so a change applied to some containers and
 * not others misaligned the whole grid silently.
 *
 * ⚠️ **Three of the five cannot detect a mistake.** The subheader and the summary row
 * hold empty `<div />`s at the Confidence/Distribution positions, and `BandHeaderRow`
 * spans `gridColumn: "4 / -2"` across the whole data region. Only the header and the
 * activity row carry content there, so only those two can disagree — which is exactly
 * why the silence was structural rather than incidental.
 *
 * ⚠️ **G1 and G2 answer DIFFERENT questions and neither covers the other.**
 *   · **G1 — content order.** Does the header's Nth label sit above the row's Nth cell?
 *     Blind to widths: swapped content under unswapped widths passes G1 while every cell
 *     renders in the wrong-sized column.
 *   · **G2 — width order.** Does the template's Nth width belong to the Nth column?
 *     Blind to content: it would pass with the header and row disagreeing.
 *
 * ⚠️ **Neither is a LAYOUT guard, and that limit is deliberate.** jsdom has no layout, so
 * these cannot see a column whose `1fr` resolves differently per container — a real
 * defect (audit M3 / WI-8) that lives in the browser. **A green run here is not a claim
 * that the grid looks aligned.**
 */

// The intended column order, named. The production template is a bare width string; this
// list is the only place the columns have names, and the test says so rather than
// implying the names exist in the source.
const COLUMNS: { name: string; width: string; header?: string; field?: string }[] = [
  { name: "select", width: "24px" },
  { name: "grip", width: "20px" },
  { name: "name", width: "1fr", header: "Name", field: "name" },
  { name: "duration", width: "40px", header: "Dur." },
  { name: "start", width: "90px", header: "Start" },
  { name: "end", width: "90px", header: "End" },
  { name: "min", width: "38px", header: "Min", field: "min" },
  { name: "mostLikely", width: "38px", header: "ML", field: "ml" }, // data-field is "ml", not "mostLikely"
  { name: "max", width: "38px", header: "Max", field: "max" },
  { name: "distribution", width: "110px", header: "Distribution", field: "distribution" },
  { name: "confidence", width: "96px", header: "Confidence", field: "confidence" },
  { name: "status", width: "110px", header: "Status", field: "status" },
  { name: "actual", width: "40px", header: "Actual", field: "actual" },
  { name: "separator", width: "1px" },
  { name: "src", width: "40px", header: "Src" },
  { name: "trailing", width: "8px" },
];

const CONSTRAINT_COLUMN = { name: "constraint", width: "80px", header: "Constraint" };
const CONSTRAINT_INDEX = 6; // inserted after `end`

function withConstraint() {
  const out = [...COLUMNS];
  out.splice(CONSTRAINT_INDEX, 0, CONSTRAINT_COLUMN);
  return out;
}

/**
 * ⚠️ **In-progress on purpose.** The Actual cell's input renders only when the activity is
 * complete or in progress (`showActual`), so a `planned` fixture leaves that column empty
 * and the guard silently stops checking it. Every field must be present for the alignment
 * assertion to cover every field.
 */
function activityFixture(): Activity {
  return { ...createActivity("Design", settings), status: "inProgress", actualDuration: 3 };
}

function renderGrid(activities: Activity[], dependencyMode = false) {
  render(
    <UnifiedActivityGrid
      activities={activities}
      bands={[]}
      scheduledActivities={[]}
      activityProbabilityTarget={0.5}
      onUpdate={vi.fn()}
      onDelete={vi.fn()}
      onAdd={vi.fn()}
      onAddBand={vi.fn()}
      onDeleteBand={vi.fn()}
      onUpdateBand={vi.fn()}
      onReorderWithBands={vi.fn()}
      onValidityChange={vi.fn()}
      dependencyMode={dependencyMode}
    />,
  );
  // Every grid container carries the shared template inline.
  const containers = Array.from(
    document.querySelectorAll<HTMLElement>('[style*="grid-template-columns"]'),
  );
  return containers;
}

const settings = createScenario("S", "2026-09-07").settings;

afterEach(cleanup);

describe("G2 — the template's width order", () => {
  it("GRID_COLUMNS is exactly the named column list's widths, in order", () => {
    expect(GRID_COLUMNS).toBe(COLUMNS.map((c) => c.width).join(" "));
  });

  it("GRID_COLUMNS_WITH_CONSTRAINT inserts the constraint width without disturbing the rest", () => {
    expect(GRID_COLUMNS_WITH_CONSTRAINT).toBe(withConstraint().map((c) => c.width).join(" "));
  });

  it("Confidence and Distribution keep their own widths through any reorder", () => {
    // The two differ (96 vs 110), so a content swap that leaves the widths behind puts
    // each control in the other's column. Pinned by name, not by position.
    const byName = Object.fromEntries(COLUMNS.map((c) => [c.name, c.width]));
    expect(byName.confidence).toBe("96px");
    expect(byName.distribution).toBe("110px");
    // Distribution now precedes Confidence; each keeps its own width.
    expect(COLUMNS.findIndex((c) => c.name === "distribution"))
      .toBeLessThan(COLUMNS.findIndex((c) => c.name === "confidence"));
  });

  it("both variants declare the same number of tracks as the column list", () => {
    expect(GRID_COLUMNS.split(/\s+/)).toHaveLength(COLUMNS.length);
    expect(GRID_COLUMNS_WITH_CONSTRAINT.split(/\s+/)).toHaveLength(COLUMNS.length + 1);
  });
});

describe("G1 — header labels sit above the cells they name", () => {
  it("every grid container declares the same track count as the template", () => {
    const containers = renderGrid([activityFixture()]);
    expect(containers.length).toBeGreaterThanOrEqual(3); // header, subheader, row, summary

    for (const el of containers) {
      expect(el.style.gridTemplateColumns).toBe(GRID_COLUMNS);
      // A container with the right template but the wrong number of cells is the
      // silent half-swap this whole file exists to catch.
      expect(el.children.length).toBe(COLUMNS.length);
    }
  });

  it("the header's Nth label names the activity row's Nth cell", () => {
    const containers = renderGrid([activityFixture()]);
    const header = containers[0]!;
    // The activity row is the container owning the name input.
    const row = containers.find((c) => c.querySelector('[data-field="name"]'))!;
    expect(row).toBeDefined();
    expect(row).not.toBe(header);

    for (const [i, col] of COLUMNS.entries()) {
      if (col.header) {
        expect(header.children[i]!.textContent?.trim()).toContain(col.header);
      }
      if (col.field) {
        // ⚠️ The load-bearing assertion: the cell carrying this field must be the SAME
        // index as the header label naming it. Swap one and not the other and this fires.
        expect(
          row.children[i]!.querySelector(`[data-field="${col.field}"]`),
          `column ${i} (${col.name}) — header says "${col.header}" but the cell there is not ${col.field}`,
        ).not.toBeNull();
      }
    }
  });

  it("holds in dependency mode, where the constraint column shifts everything right", () => {
    const cols = withConstraint();
    const containers = renderGrid([activityFixture()], true);
    const header = containers[0]!;
    const row = containers.find((c) => c.querySelector('[data-field="name"]'))!;

    expect(header.style.gridTemplateColumns).toBe(GRID_COLUMNS_WITH_CONSTRAINT);

    for (const [i, col] of cols.entries()) {
      if (col.header) {
        expect(header.children[i]!.textContent?.trim()).toContain(col.header);
      }
      if (col.field) {
        expect(
          row.children[i]!.querySelector(`[data-field="${col.field}"]`),
          `dependency mode: column ${i} (${col.name}) misaligned`,
        ).not.toBeNull();
      }
    }
  });
});
