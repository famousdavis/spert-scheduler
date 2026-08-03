// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render } from "@testing-library/react";

import { GanttChart } from "./GanttChart";
import { PrintGanttChart } from "./PrintGanttChart";
import { resolveGanttAppearance } from "./gantt-constants";
import { DEFAULT_GANTT_APPEARANCE } from "@domain/models/types";
import { buildWorkCalendar } from "@core/calendar/work-calendar";
import { durationToFinishDateISO } from "@core/calendar/calendar";
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
 * ⚠️ WHAT THIS DOES NOT PIN — audited 2026-08-02, and written here so the next reader
 * learns the limits by READING rather than by accident.
 *
 * The audit broke each candidate path and checked whether this file noticed. Two were
 * UNPINNED and are now covered: `computeWeekendShadingRects` (neutered to `[]`, oracle
 * passed 9/9) and `suppressOverlappingTicks` (passthrough, oracle passed 9/9). Both now
 * fail the oracle when broken.
 *
 * ⚠️ Weekend shading was off for TWO independent reasons — no `calendar` prop AND
 * `weekendShading` defaulting to false. Supplying only the calendar would have looked
 * exactly like a fix and changed nothing. Both halves are set above; keep them together.
 *
 * Still deliberately out of scope, none of which is geometry this pair is likely to
 * diverge on:
 *   · `milestoneBuffers` — milestone buffer bars
 *   · `showActivityNumbers`, `isLocked` — UI state, not layout
 *   · appearance variants beyond the default: `fitToWindow`, `timelineDensity`,
 *     `barLabel`, font sizes, colour presets, dark mode
 *   · `distributionType` other than "normal" — does not reach layout
 * Adding any of these means growing the fixture above and regenerating, or a third
 * fixture if it would move every tick (see the long-span note).
 *
 * ⚠️ TIME IS FROZEN. Both charts read `new Date()` inline — `GanttChart` through
 * `use-gantt-layout`, `PrintGanttChart` at its own line 141 — so geometry is a function of
 * the render date. Measured: the same project rendered on 2026-04-15 and 2027-01-01
 * produces 4 dashed lines and a "Today" label versus 2 and none. Without the freeze this
 * file would pass today and fail on some later date, which is a test that rots on a
 * calendar rather than on a code change.
 */

const ORACLE_PATH = join(process.cwd(), "src/ui/charts/gantt-parity-oracle.json");
const LONG_ORACLE_PATH = join(process.cwd(), "src/ui/charts/gantt-parity-oracle-longspan.json");

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
  // ⚠️ Status and constraint variants are deliberate. Every activity used to be
  // `planned` with no constraint, which is the same happy-path blind spot the charter
  // records for the Monte Carlo oracle — the branches that exist for UNUSUAL states
  // were the ones nothing reached.
  { ...activity("a1", "Discovery"), status: "complete" } as Activity,
  { ...activity("a2", "Build"), status: "inProgress", actualDuration: 6 } as Activity,
  {
    ...activity("a3", "Cutover"),
    constraintType: "SNET",
    constraintDate: "2026-04-27",
    constraintMode: "hard",
  } as Activity,
];

const BANDS: ActivityBand[] = [
  { id: "b1", name: "Phase 2", insertBeforeActivityId: "a2" },
];

const SCHEDULED: ScheduledActivity[] = [
  { ...scheduled("a1", "2026-04-06", "2026-04-10", 5), isActual: true },
  { ...scheduled("a2", "2026-04-13", "2026-04-24", 10), isActual: true },
  scheduled("a3", "2026-04-27", "2026-05-01", 5),
];

const DEPENDENCIES: ActivityDependency[] = [
  { fromActivityId: "a1", toActivityId: "a2", type: "FS", lagDays: 0 },
  { fromActivityId: "a2", toActivityId: "a3", type: "FS", lagDays: 0 },
];

const MILESTONES: Milestone[] = [{ id: "m1", name: "Go Live", targetDate: "2026-05-01" }];

/**
 * ⚠️ Mon–Fri work week with one holiday, so weekend shading has something to draw.
 * Supplying the calendar is NOT sufficient on its own — `weekendShading` defaults to
 * FALSE, so the appearance below must enable it too. Both halves were missing, and
 * adding only the calendar would have looked exactly like a fix.
 */
const CALENDAR = buildWorkCalendar(
  [1, 2, 3, 4, 5],
  [{ id: "h1", name: "Spring Holiday", startDate: "2026-04-20", endDate: "2026-04-20" }],
  [],
);

/** Weekend shading on — see CALENDAR. Everything else is the default appearance. */
const APPEARANCE = resolveGanttAppearance(
  { ...DEFAULT_GANTT_APPEARANCE, weekendShading: true },
  false,
);

const BUFFER = {
  deterministicSpan: 20,
  projectTargetDuration: 26,
  bufferDays: 6,
  activityProbabilityTarget: 0.5,
  projectProbabilityTarget: 0.95,
};

/**
 * ⚠️ MIRRORS PRODUCTION, and must keep doing so. `GanttChart` derives its own buffered
 * end date internally (`GanttChart.tsx:406` — null unless `bufferDays > 0`), while
 * `PrintGanttChart` receives it as a prop; `PrintableReport.tsx:68` computes exactly
 * that guarded value and passes it in. This harness used to hard-code `null` for print,
 * which agreed with the interactive chart only because `buffer` was null. The moment a
 * real buffer arrived the two charts were fed DIFFERENT timelines and the tick-parity
 * property failed — a harness artifact that reads exactly like a product divergence.
 */
const PRINT_BUFFERED_END =
  BUFFER.bufferDays > 0
    ? durationToFinishDateISO("2026-04-06", BUFFER.projectTargetDuration, CALENDAR)
    : null;

const SHARED = {
  activities: ACTIVITIES,
  bands: BANDS,
  scheduledActivities: SCHEDULED,
  projectStartDate: "2026-04-06",
  projectEndDate: "2026-05-01",
  buffer: BUFFER,
  dependencies: DEPENDENCIES,
  dependencyMode: true,
  activityTarget: 0.5,
  projectTarget: 0.95,
  milestones: MILESTONES,
  projectName: "Oracle Project",
  criticalPathIds: new Set(["a1", "a2", "a3"]),
  calendar: CALENDAR,
  targetFinishDate: "2026-04-28",
  showTargetOnGantt: true,
  hasTargetDate: true,
  targetRAGColor: "#dc2626",
};

// -- Long-span fixture --------------------------------------------------------
//
// ⚠️ A SECOND FIXTURE, NOT A LONGER FIRST ONE. `suppressOverlappingTicks` only does
// work at spans long enough to crowd ticks; the 25-day fixture above is too short, so
// passthrough was indistinguishable from correct and the function was UNPINNED. Growing
// that fixture's span would have moved every tick in it and rewritten the whole committed
// baseline — destroying a pin to add one. A second case adds a pin and leaves the first
// byte-identical.
//
// Deliberately minimal: three activities over ~18 months, no bands, dependencies,
// milestones, buffer, calendar or target line. Everything those exercise is already
// pinned by the fixture above. The only reason this exists is span, and keeping the
// committed JSON small keeps it REVIEWABLE — a large regenerated oracle is a diff nobody
// reads, which is the regenerable-expectation failure this file was written to avoid.

const LONG_ACTIVITIES: Activity[] = [
  activity("L1", "Phase One"),
  activity("L2", "Phase Two"),
  activity("L3", "Phase Three"),
];

const LONG_SCHEDULED: ScheduledActivity[] = [
  scheduled("L1", "2026-01-05", "2026-06-30", 126),
  scheduled("L2", "2026-07-01", "2026-12-31", 131),
  scheduled("L3", "2027-01-04", "2027-06-30", 128),
];

const LONG_SHARED = {
  activities: LONG_ACTIVITIES,
  scheduledActivities: LONG_SCHEDULED,
  projectStartDate: "2026-01-05",
  projectEndDate: "2027-06-30",
  buffer: null,
  dependencies: [] as ActivityDependency[],
  dependencyMode: false,
  activityTarget: 0.5,
  projectTarget: 0.95,
  projectName: "Long Span",
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
      resolvedAppearance={APPEARANCE}
      appearancePanelOpen={false}
      onToggleAppearancePanel={() => {}}
    />,
  );
}

function renderPrint() {
  return render(
    <PrintGanttChart
      {...SHARED}
      bufferedEndDate={PRINT_BUFFERED_END}
      formatDate={(iso: string) => iso}
    />,
  );
}

function renderLongInteractive() {
  return render(
    <GanttChart
      {...LONG_SHARED}
      resolvedAppearance={resolveGanttAppearance(undefined, false)}
      appearancePanelOpen={false}
      onToggleAppearancePanel={() => {}}
    />,
  );
}

function renderLongPrint() {
  return render(
    <PrintGanttChart
      {...LONG_SHARED}
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

describe("gantt parity oracle — long-span geometry (tick suppression)", () => {
  // ⚠️ Regenerating BOTH oracles is an explicit act, matching the other three in this
  // repo and never `vitest -u`:
  //
  //     ORACLE_WRITE=1 npx vitest run src/ui/charts/gantt-parity-oracle.test.tsx
  //
  // and the resulting diff must be READ. This file had no write path at all until the
  // 2026-08-02 audit — the committed JSON could not be regenerated by its own mechanism,
  // unlike its three siblings.
  if (process.env.ORACLE_WRITE === "1") {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(FROZEN_NOW));
    writeFileSync(
      ORACLE_PATH,
      JSON.stringify(
        {
          frozenNow: FROZEN_NOW,
          charts: {
            interactive: serializeGeometry(renderInteractive().container),
            print: serializeGeometry(renderPrint().container),
          },
        },
        null,
        2,
      ) + "\n",
    );
    writeFileSync(
      LONG_ORACLE_PATH,
      JSON.stringify(
        {
          frozenNow: FROZEN_NOW,
          charts: {
            interactive: serializeGeometry(renderLongInteractive().container),
            print: serializeGeometry(renderLongPrint().container),
          },
        },
        null,
        2,
      ) + "\n",
    );
    vi.useRealTimers();
  }

  it("the committed long-span oracle exists and pins both charts", () => {
    expect(existsSync(LONG_ORACLE_PATH)).toBe(true);
    const long = JSON.parse(readFileSync(LONG_ORACLE_PATH, "utf-8")) as OracleFile;
    expect(Object.keys(long.charts).sort()).toEqual(["interactive", "print"]);
    expect(long.frozenNow).toBe(FROZEN_NOW);
  });

  it("the long-span INTERACTIVE chart matches its committed geometry", () => {
    const long = JSON.parse(readFileSync(LONG_ORACLE_PATH, "utf-8")) as OracleFile;
    expect(serializeGeometry(renderLongInteractive().container)).toEqual(long.charts.interactive);
  });

  it("the long-span PRINT chart matches its committed geometry", () => {
    const long = JSON.parse(readFileSync(LONG_ORACLE_PATH, "utf-8")) as OracleFile;
    expect(serializeGeometry(renderLongPrint().container)).toEqual(long.charts.print);
  });

  it("the long span actually crowds ticks — otherwise this fixture pins nothing new", () => {
    // Premise, asserted rather than assumed. If the span stopped producing more tick
    // candidates than fit, suppression would be a no-op again and these baselines would
    // pin the same nothing the 25-day fixture did.
    const ticks = Array.from(renderLongInteractive().container.querySelectorAll("text"))
      .map((t) => t.textContent ?? "")
      .filter((t) => /\d{4}$|^[A-Z][a-z]{2}/.test(t));
    expect(ticks.length).toBeGreaterThan(4);
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

  it("both draw ticks from the same candidate set — the narrower chart suppresses more", () => {
    // ⚠️ THIS TEST USED TO ASSERT THE TWO SETS WERE EQUAL, and it passed only because the
    // 25-day fixture was too short for `suppressOverlappingTicks` to remove anything.
    // Equality is NOT a property of the pair: suppression branches on AVAILABLE WIDTH,
    // and the two charts legitimately differ there (LEFT_MARGIN vs printLeftMargin, and
    // different chart widths). With a buffer extending the range to mid-May, the print
    // chart drops "Apr 13" and the interactive chart keeps it — correct behaviour in both.
    //
    // What IS a property: both generate the same candidates over the same range and then
    // each suppresses for itself, so one set must be a SUBSEQUENCE of the other — same
    // members, same order. A chart deriving a tick date the other's candidates could not
    // contain is real drift, and that is what this now catches.
    const tickText = (c: HTMLElement) =>
      Array.from(c.querySelectorAll("text"))
        .map((t) => t.textContent ?? "")
        .filter((t) => /^[A-Z][a-z]{2} \d/.test(t));

    const interactive = tickText(renderInteractive().container);
    const print = tickText(renderPrint().container);
    expect(interactive.length).toBeGreaterThan(0);
    expect(print.length).toBeGreaterThan(0);

    const [wider, narrower] =
      interactive.length >= print.length ? [interactive, print] : [print, interactive];
    // Subsequence, not merely subset: filtering the wider set down to the narrower's
    // members must reproduce the narrower set exactly, order included.
    expect(narrower).toEqual(wider.filter((t) => narrower.includes(t)));
    // Both timelines start at the same date whatever each suppresses after it.
    expect(print[0]).toBe(interactive[0]);
  });
});
