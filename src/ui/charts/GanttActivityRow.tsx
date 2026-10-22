// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity, ScheduledActivity } from "@domain/models/types";
import { BAR_RADIUS } from "./gantt-constants";
import type { ResolvedGanttAppearance } from "./gantt-constants";
import { buildActivityTooltip, type ActivityRowGeometry } from "./gantt-utils";
import { GanttActivityName } from "./GanttActivityName";

export interface EditTarget {
  kind: "activity" | "band";
  id: string;
}

export interface GanttActivityRowProps {
  act: Activity;
  sa: ScheduledActivity;
  /** Every derived number and colour, from computeActivityRowGeometry. */
  geo: ActivityRowGeometry;
  ra: ResolvedGanttAppearance;
  c: { text: string; [k: string]: string };
  chartWidth: number;
  isLocked: boolean | undefined;
  onEditActivity: ((activityId: string) => void) | undefined;
  onRenameActivity: ((activityId: string, newName: string) => void) | undefined;
  editTarget: EditTarget | null;
  setEditTarget: (t: EditTarget | null) => void;
  setEditValue: (v: string) => void;
  activityIndexMap: Map<string, number> | null;
  dependencyMode: boolean;
  formatDate: (iso: string) => string;
  scheduleTooltip: (x: number, y: number, text: string) => void;
  moveTooltip: (x: number, y: number) => void;
  hideTooltip: () => void;
  showCriticalPath: boolean;
  criticalPathIds: Set<string> | null | undefined;
  terminalIds: Set<string> | null;
  barLabelText: (sa: ScheduledActivity) => string | null;
}

/**
 * One activity row of the interactive Gantt chart: seven conditional render blocks —
 * hover background, hatched bar, solid bar, critical-path stripe, terminal stripe, bar
 * label and constraint icon. The name label is its own component, `GanttActivityName`.
 *
 * ⚠️ DECOMPOSED §3.3 (2026-08-03) from a cc 20 anonymous JSX callback at
 * `GanttChart.tsx:952`, into computeActivityRowGeometry (cc 6) + this (cc 12) + a cc 2
 * residual in the chart. Region mode measured the split before a line moved: the compute
 * and render halves were 8 and 12, summing exactly to the original 20.
 *
 * ⚠️ NOW cc 4, NOT THE 12 THIS COMMENT USED TO CLAIM. The name label left for
 * `GanttActivityName` in v0.64.16 (WI-21). That was NOT a tidy-up: giving the name a
 * second gesture inline measured this component at 20, past the lint gate's 15, so the
 * split was forced by a number and its result is a number. The paragraph below is kept
 * because its reasoning still stands for what remains here — but note that the split it
 * calls uncostable is the one that eventually happened, and it was costed, by measuring
 * a whole component rather than a JSX region.
 *
 * ⚠️ A THREE-WAY SPLIT WAS CONSIDERED AND NOT COSTED, deliberately. Splitting this render
 * half further would plausibly land every unit under 10 — but `npm run cc`'s region mode
 * CANNOT cost it: every slice of a single `return (...)` expression cuts the JSX tree
 * mid-node and parse-errors, correctly, rather than reporting a wrong number. So the
 * measurement and the work are the same 213 lines, which removes the usual reason to
 * measure first. A three-way split also threads props through two boundaries instead of
 * one, and prop-threading is where this kind of extraction gets expensive — see the ~30
 * closed-over identifiers this component's props already represent.
 *
 * ⚠️ The §3.6 argument for tolerating the 10–15 band still applies to what is left: this
 * is flat conditional rendering, pinned at SUB-PIXEL granularity by `gantt-parity-oracle`,
 * which has been demonstrated to fail on this exact code (probes A and B, and the
 * committed G7/G8). Nothing here should be refactored merely to satisfy a threshold,
 * which §2 forbids — the extraction above happened because the number crossed the gate,
 * not to make a passing number smaller.
 */
export function GanttActivityRow({
  act, sa, geo, ra, c, chartWidth, isLocked, onEditActivity, onRenameActivity,
  editTarget, setEditTarget, setEditValue, activityIndexMap, dependencyMode,
  formatDate, scheduleTooltip, moveTooltip, hideTooltip, showCriticalPath,
  criticalPathIds, terminalIds, barLabelText,
}: GanttActivityRowProps) {
  const { y, barY, barX, barEndX, barWidth, barColor, showHatch, hatchEndX, hatchStrokeColor } = geo;

            return (
              <g key={act.id}>
                {/* Row background on hover area */}
                <rect
                  x={0}
                  y={y}
                  width={chartWidth}
                  height={ra.rowHeight}
                  fill="transparent"
                  onMouseEnter={(e) =>
                    scheduleTooltip(
                      e.clientX,
                      e.clientY,
                      buildActivityTooltip({
                        name: act.name, activityId: act.id, activityIndexMap,
                        startDate: sa.startDate, endDate: sa.endDate, duration: sa.duration,
                        totalFloat: sa.totalFloat, freeFloat: sa.freeFloat,
                        dependencyMode, formatDate,
                      }),
                    )
                  }
                  onMouseMove={(e) => moveTooltip(e.clientX, e.clientY)}
                  onMouseLeave={hideTooltip}
                />

                {/* Activity name — single click opens the editor, double click renames */}
                <GanttActivityName
                  act={act} y={y} rowHeight={ra.rowHeight} leftMargin={ra.leftMargin}
                  fontSize={ra.nameFontSize} nameCharLimit={ra.nameCharLimit} fill={c.text}
                  isLocked={isLocked} onEditActivity={onEditActivity} onRenameActivity={onRenameActivity}
                  editTarget={editTarget} setEditTarget={setEditTarget} setEditValue={setEditValue}
                  activityIndexMap={activityIndexMap}
                />

                {/* Hatched bar (uncertainty extension) — behind solid */}
                {showHatch && (
                  <rect
                    x={barEndX}
                    y={barY}
                    width={Math.max(2, hatchEndX - barEndX)}
                    height={ra.barHeight}
                    rx={BAR_RADIUS}
                    fill={`url(#hatch-${act.id})`}
                    stroke={hatchStrokeColor}
                    strokeWidth="1"
                    strokeOpacity="0.4"
                  />
                )}

                {/* Solid bar — clickable to open activity editor */}
                <rect
                  x={barX}
                  y={barY}
                  width={barWidth}
                  height={ra.barHeight}
                  rx={BAR_RADIUS}
                  fill={barColor}
                  stroke={barColor}
                  strokeWidth="1"
                  className={!isLocked && onEditActivity ? "cursor-pointer" : ""}
                  onClick={!isLocked && onEditActivity ? (e) => {
                    e.stopPropagation();
                    onEditActivity(act.id);
                  } : undefined}
                />

                {/* Critical path indicator — left stripe */}
                {showCriticalPath && dependencyMode && criticalPathIds?.has(act.id) && (
                  <rect
                    x={barX}
                    y={barY}
                    width={4}
                    height={ra.barHeight}
                    rx={BAR_RADIUS}
                    fill={ra.criticalPath}
                    className="pointer-events-none"
                  />
                )}

                {/* Terminal activity indicator — right stripe */}
                {terminalIds?.has(act.id) && (
                  <rect
                    x={barX + barWidth - 4}
                    y={barY}
                    width={4}
                    height={ra.barHeight}
                    rx={BAR_RADIUS}
                    fill={c.terminal}
                    className="pointer-events-none"
                  />
                )}

                {/* Bar label — only render if text fits within bar width */}
                {(() => {
                  const label = barLabelText(sa);
                  if (!label) return null;
                  const estWidth = label.length * ra.barLabelFontSize * 0.6 + 8;
                  if (estWidth > barWidth) return null;
                  return (
                    <text
                      x={ra.barLabel === "dates" ? barX + barWidth - 4 : barX + barWidth / 2}
                      y={barY + ra.barHeight / 2}
                      textAnchor={ra.barLabel === "dates" ? "end" : "middle"}
                      dominantBaseline="central"
                      fontSize={ra.barLabelFontSize}
                      fill="#ffffff"
                      fontWeight="600"
                      className="pointer-events-none"
                    >
                      {label}
                    </text>
                  );
                })()}

                {/* Constraint indicator icon */}
                {act.constraintType && (() => {
                  const isStart = act.constraintType === "MSO" || act.constraintType === "SNET" || act.constraintType === "SNLT";
                  const iconX = isStart ? barX - 2 : barX + barWidth - 6;
                  const iconColor = act.constraintMode === "hard" ? "#3b82f6" : "#9ca3af";
                  return (
                    <g
                      className={!isLocked && onEditActivity ? "cursor-pointer" : ""}
                      onClick={!isLocked && onEditActivity ? (e) => { e.stopPropagation(); onEditActivity(act.id); } : undefined}
                    >
                      <rect
                        x={iconX}
                        y={barY - 3}
                        width={8}
                        height={8}
                        rx={2}
                        fill={iconColor}
                        opacity={act.constraintMode === "soft" ? 0.5 : 0.9}
                      />
                      <text
                        x={iconX + 4}
                        y={barY + 1}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize="6"
                        fill="#ffffff"
                        fontWeight="700"
                        className="pointer-events-none"
                      >
                        C
                      </text>
                    </g>
                  );
                })()}

              </g>
            );
}
