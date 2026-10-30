// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from "react";
import type { Activity, ScheduledActivity } from "@domain/models/types";
import {
  sparklineCurve,
  sparklineX,
  type SparklineCurve,
  type SparklineEstimate,
} from "./sparkline-curve";

interface DistributionSparklineProps {
  /** The row's activity: its estimate draws the curve, its status decides the duration marker. */
  activity: SparklineEstimate & Pick<Activity, "status">;
  /** The row's schedule entry, whose `duration` the grid's Duration cell shows. */
  scheduledActivity?: Pick<ScheduledActivity, "duration">;
  /** Where the card sits over its cell: centred on it (the default), or against its right edge. */
  anchor?: SparklineAnchor;
}

type SparklineAnchor = "centre" | "right";

/**
 * The card's place over its cell. Each is a WHOLE class string: Tailwind 4 writes CSS only for the
 * classes it finds spelled out in the source, so a placement pieced together from fragments could
 * ship with no style at all. The card is 90 px wide. Centred, it overhangs a 75-px Confidence cell by
 * 7.5 px on each side, and where the grid scrolls sideways, the scroll container clips the overhang
 * at the grid's right edge — the side where Max's wall and an edge-clamped duration line are drawn.
 * So the Confidence card is anchored to its cell's right edge and overhangs only to the left; the
 * Distribution cell, at 110 px, is wider than the card, which stays centred on it (owner ruling,
 * 2026-10-10).
 */
const CARD_PLACEMENT: Record<SparklineAnchor, string> = {
  centre: "absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block z-20 pointer-events-none",
  right: "absolute bottom-full right-0 mb-1 hidden group-hover:block z-20 pointer-events-none",
};

/** The sparkline is 80 × 30 px: the size the grid has always drawn it at. */
const WIDTH = 80;
const HEIGHT = 30;

/**
 * The activity grid's distribution sparkline: a card above its cell, shown while the cell is hovered,
 * drawing the distribution the simulation samples from the row's estimate (WI-77; the geometry is in
 * `sparkline-curve.ts`). It is the estimate as entered, not what the simulation then does with it —
 * no floor under each trial, and no conditioning of a row in progress on the days already worked
 * (owner ruling, 2026-10-10). Render it inside a `group relative` cell. The Distribution cell has one,
 * and so does the Confidence cell, where the level that reshapes T-Normal, LogNormal and Beta-PERT is
 * chosen (owner ruling, 2026-10-08).
 *
 * ⚠️ IT DECIDES FOR ITSELF WHETHER THERE IS ANYTHING TO SHOW, and renders nothing — no box — when
 * there is no curve. The box used to live at the call site, guarded only by "the Distribution is not
 * greyed", so an out-of-order Beta-PERT row, whose curve cannot be drawn, showed an empty box.
 *
 * Two dashed lines: Most Likely, in blue, and on a PLANNED row the scheduled duration — the number
 * the Duration cell shows, the duration at the scenario's Activity target — in green, so a switch of
 * distribution shows why that number moved (owner ruling, 2026-10-10). Not on an in-progress or a
 * complete row, whatever its days worked or actual duration (owner ruling, 2026-10-10): the chart is
 * the estimate as planned, while the simulation conditions a row in progress on the days it has
 * already worked and uses a complete row's actual duration — where those are entered. Where the two
 * lines meet, they are drawn as one line whose dashes alternate blue and green (`dashedLines`).
 */
export function DistributionSparkline({ activity, scheduledActivity, anchor = "centre" }: DistributionSparklineProps) {
  const curve = useMemo(() => sparklineCurve(activity, WIDTH, HEIGHT), [activity]);
  if (!curve) return null;
  const durationX =
    activity.status === "planned" && scheduledActivity
      ? sparklineX(curve, scheduledActivity.duration)
      : null;
  return (
    <div className={CARD_PLACEMENT[anchor]}>
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded shadow-lg p-1">
        <SparklineSvg curve={curve} durationX={durationX} />
      </div>
    </div>
  );
}

/** How close, in px, the two dashed lines' x positions must be for the lines to meet. */
const MEET_PX = 1;

/** One dashed line as drawn: its x, its dash pattern, and the offset of that pattern, if any. */
interface DashedLine {
  x: number;
  dashes: string;
  offset?: string;
}

/**
 * The two dashed lines as drawn. Apart, or with no green line, each keeps its own x and dashes: the blue
 * Most Likely line "2 1", the green duration line "3 1". Where they MEET — their x positions within 1 px
 * of each other — both are drawn at one x, the midpoint of the two, with dashes "2 2", the green's
 * pattern offset by 2 so its dashes fall in the blue's gaps: one straight line whose dashes alternate
 * blue and green (owner ruling, 2026-10-29). Drawn with their own dashes, the green covered the blue and
 * only the green showed; one line where two are expected says the two values coincide, even where the
 * colours cannot be told apart, and one x keeps it straight where two sub-pixel apart looked jagged.
 */
function dashedLines(
  mostLikelyX: number | null,
  durationX: number | null
): { mostLikely: DashedLine | null; duration: DashedLine | null } {
  const mostLikely = mostLikelyX === null ? null : { x: mostLikelyX, dashes: "2 1" };
  const duration = durationX === null ? null : { x: durationX, dashes: "3 1" };
  if (mostLikelyX === null || durationX === null || Math.abs(mostLikelyX - durationX) > MEET_PX) {
    return { mostLikely, duration };
  }
  const x = (mostLikelyX + durationX) / 2;
  return { mostLikely: { x, dashes: "2 2" }, duration: { x, dashes: "2 2", offset: "2" } };
}

function SparklineSvg({ curve, durationX }: { curve: SparklineCurve; durationX: number | null }) {
  const { mostLikely, duration } = dashedLines(curve.mostLikelyX, durationX);
  return (
    <svg
      width={WIDTH}
      height={HEIGHT}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="inline-block"
      aria-hidden="true"
    >
      {/* Fill area under the curve */}
      <path d={curve.fill} className="fill-blue-100 dark:fill-blue-900/40" />
      {/* Line on top */}
      <path
        d={curve.stroke}
        className="fill-none stroke-blue-500 dark:stroke-blue-400"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Most Likely (blue dashes), where the curve depends on it. OPAQUE (owner ruling, 2026-10-10): at
          the 0.6 opacity it had, it read under 3:1 against the card and the fill in light mode; opaque,
          these two colours clear 3:1 on both, in both themes. */}
      {mostLikely && (
        <line
          data-mark="most-likely"
          x1={mostLikely.x}
          y1={HEIGHT - 2}
          x2={mostLikely.x}
          y2={2}
          className="stroke-blue-600 dark:stroke-blue-300"
          strokeWidth="1"
          strokeDasharray={mostLikely.dashes}
        />
      )}
      {/* The scheduled duration (green dashes). Where it meets the Most Likely line, its dashes fall in the
          blue's gaps, so neither hides the other and the order they are drawn in no longer matters (owner
          ruling, 2026-10-29: it replaces 2026-10-10's "the green is drawn over the blue"). */}
      {duration && (
        <line
          data-mark="duration"
          x1={duration.x}
          y1={HEIGHT - 2}
          x2={duration.x}
          y2={2}
          className="stroke-green-700 dark:stroke-green-400"
          strokeWidth="1"
          strokeDasharray={duration.dashes}
          strokeDashoffset={duration.offset}
        />
      )}
    </svg>
  );
}
