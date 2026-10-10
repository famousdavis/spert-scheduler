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
 * already worked and uses a complete row's actual duration — where those are entered.
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

function SparklineSvg({ curve, durationX }: { curve: SparklineCurve; durationX: number | null }) {
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
      {curve.mostLikelyX !== null && (
        <line
          data-mark="most-likely"
          x1={curve.mostLikelyX}
          y1={HEIGHT - 2}
          x2={curve.mostLikelyX}
          y2={2}
          className="stroke-blue-600 dark:stroke-blue-300"
          strokeWidth="1"
          strokeDasharray="2 1"
        />
      )}
      {/* The scheduled duration (green dashes), drawn last so it is never hidden */}
      {durationX !== null && (
        <line
          data-mark="duration"
          x1={durationX}
          y1={HEIGHT - 2}
          x2={durationX}
          y2={2}
          className="stroke-green-700 dark:stroke-green-400"
          strokeWidth="1"
          strokeDasharray="3 1"
        />
      )}
    </svg>
  );
}
