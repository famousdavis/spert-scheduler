// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { resolveGanttAppearance } from "./gantt-constants";
import type {
  Activity,
  ActivityBand,
  ActivityDependency,
  Milestone,
  ScheduledActivity,
} from "@domain/models/types";

/**
 * Output contract for BOTH Gantt charts, pinned while they are still duplicated.
 *
 * WHY IT EXISTS, AND WHY NOW
 * `GanttChart` and `PrintGanttChart` are separate implementations that must stay visually
 * aligned — an obligation currently enforced by one sentence in CLAUDE.md and nothing
 * else. That sentence was already wrong in three call-site comments about
 * `buildActivitySlotMap`, duplicated across both files, which is what this contract is for.
 *
 * ⚠️ It is written BEFORE the unification, not after. That is the whole point, and it is
 * the property that made the C4 oracle work: an expectation recorded after a refactor
 * ratifies the change instead of verifying it. The planned extraction — lifting the layout
 * assembly into a pure function taking `now` as a parameter — must leave every value below
 * byte-identical. If it does not, the extraction changed something.
 *
 * ⚠️ Each chart is pinned against its OWN baseline, not against the other. Their layout
 * constants legitimately differ (`LEFT_MARGIN` vs `printLeftMargin`, and so on), so equal
 * geometry is not the contract. Not-drifting is.
 *
 * ⚠️ NOT a vitest snapshot, deliberately. `vitest -u` would silently absorb the very
 * regression this exists to catch. The expectations live in a committed JSON file that is
 * read at runtime and compared by value; regenerating it is a visible, reviewable edit.
 *
 * ⚠️ TIME IS FROZEN. Both charts read `new Date()` inline — `GanttChart` through
 * `use-gantt-layout`, `PrintGanttChart` at its own line 141 — so geometry is a function of
 * the render date. Measured: the same project rendered on 2026-04-15 and 2027-01-01
 * produces 4 dashed lines and a "Today" label versus 2 and none. Without the freeze this
 * file would pass today and fail on some later date, which is a test that rots on a
 * calendar rather than on a code change.
 */

const ORACLE_PATH = join(process.cwd(), "src/ui/charts/gantt-parity-oracle.json");

/** Frozen render date. Inside the fixture's span, so the today-line is exercised. */
const FROZEN_NOW = "2026-04-15T09:00:00";

// -- Fixture ------------------------------------------------------------------

const activity = (id: string, name: string): Activity =>
  ({
    id,
    name,
    min: 3,
    mostLikely: 5,
    max: 10,
    confidenceLevel: "mediumConfidence",
    distributionType: "normal",
    status: "planned",
  }) as Activity;

const scheduled = (
  activityId: string,
  startDate: string,
  endDate: string,
  duration: number,
): ScheduledActivity => ({
  activityId,
  name: activityId,
  duration,
  startDate,
  endDate,
  isActual: false,
});

const ACTIVITIES: Activity[] = [
  activity("a1", "Discovery"),
  activity("a2", "Build"),
  activity("a3", "Cutover"),
];

const BANDS: ActivityBand[] = [
  { id: "b1", name: "Phase 2", insertBeforeActivityId: "a2" },
];

const SCHEDULED: ScheduledActivity[] = [
  scheduled("a1", "2026-04-06", "2026-04-10", 5),
  scheduled("a2", "2026-04-13", "2026-04-24", 10),
  scheduled("a3", "2026-04-27", "2026-05-01", 5),
];

const DEPENDENCIES: ActivityDependency[] = [
  { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
  { fromActivityId: "a2", toActivityId: "a3", type: "FS", lagDays: 0 },
];

const MILESTONES: Milestone[] = [{ id: "m1", name: "Go Live", targetDate: "2026-05-01" }];

const SHARED = {
  activities: ACTIVITIES,
  bands: BANDS,
  scheduledActivities: SCHEDULED,
  projectStartDate: "2026-04-06",
  projectEndDate: "2026-05-01",
  buffer: null,
  dependencies: DEPENDENCIES,
  dependencyMode: true,
  activityTarget: 0.5,
  projectTarget: 0.95,
  milestones: MILESTONES,
  projectName: "Oracle Project",
  criticalPathIds: new Set(["a1", "a2", "a3"]),
};

// -- Serialisation ------------------------------------------------------------

/**
 * Every geometry-bearing attribute, in document order. Presentation-only attributes
 * (fill, stroke, class) are excluded on purpose: this contract is about POSITION, and
 * including colour would make it fail on a palette change that moves nothing.
 */
const GEOMETRY_ATTRS = ["x", "y", "width", "height", "x1", "y1", "x2", "y2", "d", "cx", "cy", "r", "points", "transform"];

function serializeGeometry(container: HTMLElement): string[] {
  const svg = container.querySelector("svg[data-gantt-chart]");
  if (!svg) return ["NO SVG"];

  const out: string[] = [
    `svg viewBox=${svg.getAttribute("viewBox") ?? "-"} width=${svg.getAttribute("width") ?? "-"} height=${svg.getAttribute("height") ?? "-"}`,
  ];

  for (const el of Array.from(svg.querySelectorAll("*"))) {
    const attrs = GEOMETRY_ATTRS.filter((a) => el.hasAttribute(a))
      .map((a) => `${a}=${el.getAttribute(a)}`)
      .join(" ");
    const text = el.tagName === "text" ? ` :: ${el.textContent ?? ""}` : "";
    if (attrs || text) out.push(`${el.tagName} ${attrs}${text}`.trim());
  }
  return out;
}

function renderInteractive() {
  return render(
    <GanttChart
      {...SHARED}
      resolvedAppearance={resolveGanttAppearance(undefined, false)}
      appearancePanelOpen={false}
      onToggleAppearancePanel={() => {}}
    />,
  );
}

function renderPrint() {
  return render(
    <PrintGanttChart
      {...SHARED}
      bufferedEndDate={null}
      formatDate={(iso: string) => iso}
    />,
  );
}

// -- Oracle -------------------------------------------------------------------

interface OracleFile {
  frozenNow: string;
  charts: Record<string, string[]>;
}

let oracle: OracleFile;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(FROZEN_NOW));
  oracle = JSON.parse(readFileSync(ORACLE_PATH, "utf-8")) as OracleFile;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("gantt parity oracle — the contract itself", () => {
  it("the committed oracle file exists", () => {
    // Guards the shape of the guard: a missing file must fail loudly rather than let the
    // comparisons below quietly compare nothing.
    expect(existsSync(ORACLE_PATH)).toBe(true);
  });

  it("pins exactly the two charts, by name", () => {
    expect(Object.keys(oracle.charts).sort()).toEqual(["interactive", "print"]);
  });

  it("records the frozen render date it was captured at", () => {
    // If this drifts from FROZEN_NOW the recorded geometry describes a different day.
    expect(oracle.frozenNow).toBe(FROZEN_NOW);
  });

  it("holds a non-trivial amount of geometry for each chart", () => {
    // A serializer that silently returned [] would make every comparison below pass.
    for (const [name, lines] of Object.entries(oracle.charts)) {
      expect(lines.length, `${name} is suspiciously small`).toBeGreaterThan(40);
    }
  });
});

describe("gantt parity oracle — geometry", () => {
  it("the INTERACTIVE chart matches its committed geometry", () => {
    const { container } = renderInteractive();
    expect(serializeGeometry(container)).toEqual(oracle.charts.interactive);
  });

  it("the PRINT chart matches its committed geometry", () => {
    const { container } = renderPrint();
    expect(serializeGeometry(container)).toEqual(oracle.charts.print);
  });
});

describe("gantt parity oracle — properties that must hold across both", () => {
  /**
   * Absolute geometry legitimately differs between the two (different margins, row heights
   * and densities), so these assert the STRUCTURE both must share. These are the ones a
   * unification could plausibly break while each chart still matched its own baseline —
   * for example by changing row ordering in one and not the other.
   */
  it("both render every activity's label, in the same order", () => {
    const labels = (c: HTMLElement) =>
      Array.from(c.querySelectorAll("text"))
        .map((t) => t.textContent ?? "")
        .filter((t) => ["Discovery", "Build", "Cutover"].includes(t));

    expect(labels(renderInteractive().container)).toEqual(["Discovery", "Build", "Cutover"]);
    expect(labels(renderPrint().container)).toEqual(["Discovery", "Build", "Cutover"]);
  });

  it("both draw the band ABOVE the activity it is anchored before, and below the one before it", () => {
    // ⚠️ Asserted on Y, not on DOM order. Both charts render bands in a SEPARATE PASS
    // before activities, so document order is [Phase 2, Discovery, Build, Cutover] in
    // both — they agree with each other, but it does not reflect what the reader sees.
    // The first draft of this test asserted DOM order and failed for that reason, which
    // is a good demonstration of why the contract is vertical position: the band is
    // anchored before "Build", so it must sit between "Discovery" and "Build" on screen.
    const yOf = (c: HTMLElement, label: string): number => {
      const el = Array.from(c.querySelectorAll("text")).find(
        (t) => (t.textContent ?? "") === label,
      );
      expect(el, `no text element for "${label}"`).toBeDefined();
      return Number(el!.getAttribute("y"));
    };

    for (const [name, container] of [
      ["interactive", renderInteractive().container],
      ["print", renderPrint().container],
    ] as const) {
      const discovery = yOf(container, "Discovery");
      const band = yOf(container, "Phase 2");
      const build = yOf(container, "Build");
      const cutover = yOf(container, "Cutover");

      expect(band, `${name}: band above Discovery`).toBeGreaterThan(discovery);
      expect(band, `${name}: band below Build`).toBeLessThan(build);
      expect(build, `${name}: Build above Cutover`).toBeLessThan(cutover);
    }
  });

  it("both derive the same tick DATES, whatever their pixel positions", () => {
    const tickText = (c: HTMLElement) =>
      Array.from(c.querySelectorAll("text"))
        .map((t) => t.textContent ?? "")
        .filter((t) => /^[A-Z][a-z]{2} \d/.test(t));

    const interactive = tickText(renderInteractive().container);
    const print = tickText(renderPrint().container);
    expect(interactive.length).toBeGreaterThan(0);
    expect(print).toEqual(interactive);
  });
});
