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
import { durationToFinishDateISO, formatDateShort } from "@core/calendar/calendar";
import type {
  Activity,
  ActivityBand,
  ActivityDependency,
  GanttAppearanceSettings,
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

/**
 * Attribute marking the invisible bar click targets (v0.64.15, WI-20).
 *
 * ⚠️ THE EXCLUSION BELOW IS THE ONLY REASON THE COMMITTED BASELINES DID NOT MOVE. Measured
 * before it existed: adding the hit layer failed exactly two tests — the interactive
 * geometry test (71 → 74 lines) and the long-span interactive test — both purely additive,
 * +3 each, one line per activity, zero modified lines. Print was untouched.
 *
 * Excluding rather than regenerating is deliberate. A regenerated baseline ratifies a
 * change instead of verifying it (see the header note); byte-identical baselines are
 * positive evidence that this interaction fix moved no visible geometry, rather than an
 * assertion that it did not.
 *
 * ⚠️ The skip matches THIS ATTRIBUTE AND NOTHING ELSE — no tag, class or shape heuristic —
 * so it cannot quietly swallow a real element that happens to resemble a hit rect. The
 * test below pins the excluded count to the bar count and forbids zero: an exclusion that
 * excludes nothing hides nothing while still looking like it works.
 */
const HIT_LAYER_ATTR = "data-hit-layer";

function serializeGeometry(container: HTMLElement): string[] {
  const svg = container.querySelector("svg[data-gantt-chart]");
  if (!svg) return ["NO SVG"];

  const out: string[] = [
    `svg viewBox=${svg.getAttribute("viewBox") ?? "-"} width=${svg.getAttribute("width") ?? "-"} height=${svg.getAttribute("height") ?? "-"}`,
  ];

  for (const el of Array.from(svg.querySelectorAll("*"))) {
    if (el.hasAttribute(HIT_LAYER_ATTR)) continue;
    const attrs = GEOMETRY_ATTRS.filter((a) => el.hasAttribute(a))
      .map((a) => `${a}=${el.getAttribute(a)}`)
      .join(" ");
    const text = el.tagName === "text" ? ` :: ${el.textContent ?? ""}` : "";
    if (attrs || text) out.push(`${el.tagName} ${attrs}${text}`.trim());
  }
  return out;
}

/**
 * ⚠️ `onEditActivity` is supplied so the bar HIT LAYER renders. It is UI state, not
 * layout — the layer is excluded from the serialised geometry (see HIT_LAYER_ATTR) and
 * the only other thing the prop reaches is a `cursor-pointer` class, which was never
 * serialised. The committed baselines are unchanged by its presence, which is the point.
 *
 * It was NOT here originally, and the non-vacuity assertion above caught that on its
 * first run: the exclusion was excluding nothing, and every geometry comparison still
 * passed. That is the failure mode the assertion exists for.
 */
function renderInteractive() {
  return render(
    <GanttChart
      {...SHARED}
      resolvedAppearance={APPEARANCE}
      appearancePanelOpen={false}
      onToggleAppearancePanel={() => {}}
      onEditActivity={() => {}}
    />,
  );
}

function renderPrint() {
  return render(
    <PrintGanttChart
      {...SHARED}
      bufferedEndDate={PRINT_BUFFERED_END}
      formatDate={(iso: string) => iso}
      formatDateShort={(iso: string) => iso}
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
      onEditActivity={() => {}}
    />,
  );
}

function renderLongPrint() {
  return render(
    <PrintGanttChart
      {...LONG_SHARED}
      bufferedEndDate={null}
      formatDate={(iso: string) => iso}
      formatDateShort={(iso: string) => iso}
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

  it("the hit layer is excluded, and the exclusion covers exactly one rect per bar", () => {
    // ⚠️ NON-VACUITY, both directions. A zero here would mean the marker attribute never
    // applied — the exclusion would be excluding nothing while every geometry comparison
    // below still passed, which is precisely the shape of a guard that has been muted.
    // Pinning it to the bar count also stops the skip growing to cover anything else.
    const { container } = renderInteractive();
    const svg = container.querySelector("svg[data-gantt-chart]")!;

    const hits = svg.querySelectorAll(`[${HIT_LAYER_ATTR}]`);
    expect(hits.length, "hit layer never rendered — exclusion is vacuous").toBeGreaterThan(0);
    expect(hits.length).toBe(ACTIVITIES.length);

    // ⚠️ Stated as "the serialisation does not change when the layer is removed", NOT as
    // "no line matches a hit rect". The first draft asserted the latter and failed: for
    // any bar at or above MIN_BAR_HIT_WIDTH the hit rect's x/y/width/height are IDENTICAL
    // to the bar's by construction, so a line-absence check can never pass and could
    // never have distinguished the two. This form compares the whole array against the
    // same DOM with the hit layer physically detached, which no coincidence can satisfy.
    const withLayer = serializeGeometry(container);
    for (const hit of Array.from(hits)) hit.remove();
    expect(withLayer, "the hit layer changed the serialised geometry").toEqual(
      serializeGeometry(container),
    );
  });

  it("the PRINT chart renders no hit layer at all", () => {
    // The hit layer is an interaction affordance; print has no pointer. If one ever
    // appeared there, the print baseline would be silently excluding it too.
    const { container } = renderPrint();
    expect(container.querySelectorAll(`[${HIT_LAYER_ATTR}]`)).toHaveLength(0);
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
  /**
   * In-bar date labels drop the year, in BOTH charts.
   *
   * ⚠️ This does not touch the frozen oracle JSON — `barLabel` defaults to "duration",
   * so the byte-compared fixtures never render a date. These renders opt in explicitly.
   *
   * What it guards is the WIRING, which no unit test can reach: `barLabelText` in
   * gantt-utils takes whatever formatter it is handed, so a chart passing `formatDate`
   * instead of `formatDateShort` would silently put the year back and every unit test
   * would still pass. That is a one-word mistake in two separate files.
   *
   * The interactive chart resolves its own formatter from the preferences store; the print
   * chart is handed one, exactly as PrintableReport hands it one. Both paths are exercised.
   */
  it("both drop the year from in-bar date labels", () => {
    const datesAppearance = { ...DEFAULT_GANTT_APPEARANCE, weekendShading: true, barLabel: "dates" as const };
    const durationAppearance = { ...datesAppearance, barLabel: "duration" as const };
    const shortFmt = (iso: string) => formatDateShort(iso, "MM/DD/YYYY");

    const interactiveWith = (a: GanttAppearanceSettings) =>
      render(
        <GanttChart
          {...SHARED}
          resolvedAppearance={resolveGanttAppearance(a, false)}
          appearancePanelOpen={false}
          onToggleAppearancePanel={() => {}}
        />,
      ).container;
    const printWith = (a: GanttAppearanceSettings) =>
      render(
        <PrintGanttChart
          {...SHARED}
          bufferedEndDate={PRINT_BUFFERED_END}
          formatDate={(iso: string) => iso}
          formatDateShort={shortFmt}
          ganttAppearance={a}
        />,
      ).container;

    const texts = (c: HTMLElement) =>
      Array.from(c.querySelectorAll("text")).map((t) => t.textContent ?? "");

    /**
     * Multiset difference. Everything here is asserted as "dates mode MINUS duration mode",
     * which isolates the BAR labels without coupling to fill or font-weight attributes.
     *
     * ⚠️ This indirection is not ceremony. The first draft matched short-date-shaped text
     * across the whole chart and asserted it was non-empty — and that assertion PASSED with
     * the bug deliberately reintroduced, because the timeline TICK labels ("Apr 6") match
     * the same shape. It was measuring the axis and reporting on the bars. The duration-mode
     * render is the control that cancels the axis out; ticks are identical in both.
     */
    const minus = (a: string[], b: string[]) => {
      const pool = [...b];
      return a.filter((v) => {
        const i = pool.indexOf(v);
        if (i === -1) return true;
        pool.splice(i, 1);
        return false;
      });
    };

    const SHORT_DATE = /^[A-Z][a-z]{2} \d{1,2}$/;
    const ANY_NUMERIC_DATE = /\d{1,4}[/-]\d{1,2}[/-]\d{1,4}/;

    for (const [label, withDates, withDurations] of [
      ["interactive", interactiveWith(datesAppearance), interactiveWith(durationAppearance)],
      ["print", printWith(datesAppearance), printWith(durationAppearance)],
    ] as const) {
      const gained = minus(texts(withDates), texts(withDurations));

      // Non-vacuity: bars actually gained short dates. Without this, "no year present"
      // is trivially true whenever the bars are too narrow to label at all.
      expect(gained.filter((t) => SHORT_DATE.test(t)), `${label}: no in-bar short dates`)
        .not.toHaveLength(0);

      // And nothing a bar gained carries a year in any numeric form.
      expect(gained.filter((t) => ANY_NUMERIC_DATE.test(t)), `${label}: bar label kept a year`)
        .toHaveLength(0);
    }
  });

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
