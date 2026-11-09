// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { ActivityBand, ScheduledActivity } from "@domain/models/types";
import type { GanttRenderItem } from "@ui/helpers/band-utils";
import { hexToRgb, type RgbColor } from "@ui/helpers/color-utils";

/**
 * WI-172: a Section stands out on the Gantt chart. Its own row is tinted in its colour across the
 * name column and the chart (the grid's 0.18), its name is drawn a shade darker so it still reads
 * 4.5:1 on that tint, and once it holds activities a summary bar on that row runs from their first
 * start to their last finish, as P6 and MS Project draw a WBS summary.
 *
 * ONE module for BOTH charts, so the interactive chart and the printed one cannot disagree about
 * which rows a Section covers, where its bar runs, or what colour its name is (print parity).
 */

/** A Section's own row is tinted with its colour at the grid's alpha (`hexToTintedBackground`'s 0.18). */
export const SECTION_ROW_TINT_ALPHA = 0.18;

/** The text a Section needs to read against its tint: WCAG 2.x, normal text. */
const SECTION_TEXT_RATIO = 4.5;

/** A Section's name as the chart shows it: trimmed, or the placeholder for a blank one. */
export function sectionDisplayName(band: ActivityBand): string {
  return band.name.trim() || "(unnamed section)";
}

export interface SectionGroup {
  band: ActivityBand;
  /** The Section's own row in the render list. */
  row: number;
  /** The first row after the group (exclusive): the next Section's row, or the end of the list. */
  endRow: number;
  /** The activities under the Section, in row order. Empty for an empty Section. */
  activityIds: string[];
}

/** Each Section with the rows it covers: its own row, down to the next Section or the end of the list. */
export function sectionGroups(items: GanttRenderItem[]): SectionGroup[] {
  const out: SectionGroup[] = [];
  let open: SectionGroup | undefined;
  for (let idx = 0; idx < items.length; idx++) {
    const item = items[idx]!;
    if (item.kind === "band") {
      open = { band: item.band, row: idx, endRow: idx + 1, activityIds: [] };
      out.push(open);
    } else if (open) {
      open.activityIds.push(item.activity.id);
      open.endRow = idx + 1;
    }
  }
  return out;
}

/**
 * A Section's dates: the first start and the last finish of its activities' scheduled dates — the
 * dates their SOLID bars are drawn from, in both views (the hatched tails of With Uncertainty are
 * each activity's own spread; nothing computes a Section-level one). Null for an empty Section.
 */
export function sectionSpan(
  activityIds: string[],
  scheduleMap: Map<string, ScheduledActivity>,
): { start: string; end: string } | null {
  let start: string | undefined;
  let end: string | undefined;
  for (const id of activityIds) {
    const sa = scheduleMap.get(id);
    if (!sa) continue;
    if (start === undefined || sa.startDate < start) start = sa.startDate;
    if (end === undefined || sa.endDate > end) end = sa.endDate;
  }
  return start !== undefined && end !== undefined ? { start, end } : null;
}

/**
 * The x extent of a Section's solid bars, by the rule each chart draws a solid bar with: from its
 * start's x, `max(minWidth, end x − start x)` wide. So the summary bar ends where the last solid bar
 * ends even when that bar is drawn at its minimum width. Null for an empty Section.
 */
export function solidBarsExtent(
  activityIds: string[],
  scheduleMap: Map<string, ScheduledActivity>,
  toX: (iso: string) => number,
  minWidth: number,
): { x1: number; x2: number } | null {
  let x1 = Infinity;
  let x2 = -Infinity;
  for (const id of activityIds) {
    const sa = scheduleMap.get(id);
    if (!sa) continue;
    const barX = toX(sa.startDate);
    x1 = Math.min(x1, barX);
    x2 = Math.max(x2, barX + Math.max(minWidth, toX(sa.endDate) - barX));
  }
  return x1 === Infinity ? null : { x1, x2 };
}

/**
 * A Section's summary bar, as P6 and MS Project draw a WBS summary: a thin bar from `x1` to `x2`,
 * with a point down at each end. `th` is the bar's thickness, `drop` how far each point reaches
 * below it. One path, so both charts draw one shape.
 */
export function summaryBarPath(x1: number, x2: number, top: number, th: number, drop: number): string {
  const cap = Math.min(th * 0.75, (x2 - x1) / 3);
  return `M${x1},${top} H${x2} V${top + th + drop} L${x2 - cap},${top + th} H${x1 + cap} L${x1},${top + th + drop} Z`;
}

/** WCAG 2.x relative luminance. */
function luminance({ r, g, b }: RgbColor): number {
  const lin = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG 2.x contrast ratio. */
export function contrastRatio(a: RgbColor, b: RgbColor): number {
  const [la, lb] = [luminance(a), luminance(b)];
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` at `alpha` over the opaque `bg`, rounded to 8 bits per channel. */
export function compositeOver(fg: RgbColor, alpha: number, bg: RgbColor): RgbColor {
  const mix = (f: number, b: number) => Math.round(f * alpha + b * (1 - alpha));
  return { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
}

/** A Section's tint: its colour (or the chart's muted grey, with none) at `alpha`. */
export function sectionTint(color: string | undefined, fallback: string, alpha: number): string {
  const rgb = hexToRgb(color ?? fallback) ?? hexToRgb(fallback)!;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

/**
 * The opaque colour a tint makes on the chart's ground — what a name or a bar on it is read against.
 * ⚠️ The alpha is taken at the 8 bits the browser composites with (0.18 → 46/255): with 0.18 itself,
 * two Sage names designed at 4.5:1 MEASURED 4.48:1 in Chrome, one level of green off (WI-172's prototype).
 */
export function tintGround(color: string | undefined, fallback: string, alpha: number, ground: string): RgbColor {
  const rgb = hexToRgb(color ?? fallback) ?? hexToRgb(fallback)!;
  return compositeOver(rgb, Math.round(alpha * 255) / 255, hexToRgb(ground)!);
}

const hexByte = (v: number): string => Math.round(v).toString(16).padStart(2, "0");
const toHex = ({ r, g, b }: RgbColor): string => `#${hexByte(r)}${hexByte(g)}${hexByte(b)}`;

/**
 * `hex`, moved toward black on a light ground or toward white on a dark one, by the least step of
 * 1/200 that reads `ratio` against `ground`: c′ = round(c × (1 − t)) toward black, round(c + (255 − c) × t)
 * toward white. Unchanged when it already reads, or when `hex` cannot be read.
 */
export function readableOn(hex: string, ground: RgbColor, ratio: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb || contrastRatio(rgb, ground) >= ratio) return hex;
  const towardWhite = luminance(ground) < 0.18;
  for (let step = 1; step <= 200; step++) {
    const t = step / 200;
    const c = towardWhite
      ? { r: rgb.r + (255 - rgb.r) * t, g: rgb.g + (255 - rgb.g) * t, b: rgb.b + (255 - rgb.b) * t }
      : { r: rgb.r * (1 - t), g: rgb.g * (1 - t), b: rgb.b * (1 - t) };
    const rounded = { r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) };
    if (contrastRatio(rounded, ground) >= ratio) return toHex(rounded);
  }
  return towardWhite ? "#ffffff" : "#000000";
}

/**
 * A Section's name colour, which is also its summary bar's: its own colour (or the muted grey, with
 * none) moved to 4.5:1 against its own tint on `ground`. The bar takes the TEXT ratio, not the
 * non-text 3:1, so it keeps 3:1 where weekend shading darkens the row (3:1 alone measured 2.76).
 */
export function sectionInk(color: string | undefined, muted: string, ground: string): string {
  return readableOn(color ?? muted, tintGround(color, muted, SECTION_ROW_TINT_ALPHA, ground), SECTION_TEXT_RATIO);
}

/** The summary bar's hover text, in the activity bars' form: `Name: start – finish (N activities)`. */
export function sectionTooltip(
  name: string,
  span: { start: string; end: string },
  count: number,
  formatDate: (iso: string) => string,
): string {
  const activities = count === 1 ? "1 activity" : `${count} activities`;
  return `${name}: ${formatDate(span.start)} – ${formatDate(span.end)} (${activities})`;
}

/** What a chart draws for one Section, computed once per change of its inputs. */
export interface SectionLayer {
  group: SectionGroup;
  /** The row's tint, an `rgba(…)` fill. */
  tint: string;
  /** The name's colour, and the summary bar's. */
  ink: string;
  /** The summary bar, or null for an empty Section (which has the tint alone). */
  bar: { d: string; start: string; end: string } | null;
}

/** The chart-specific numbers a Section's layers are drawn with. */
export interface SectionLayerGeometry {
  toX: (iso: string) => number;
  /** The minimum width the chart draws a solid bar at. */
  minBarWidth: number;
  topMargin: number;
  rowHeight: number;
  /** The summary bar's thickness, and how far it sits above the row's middle. */
  thickness: number;
  lift: number;
  /** How far each end's point reaches below the bar. */
  drop: number;
}

/** Each Section's tint, ink and summary bar, for one chart. */
export function sectionLayers(
  items: GanttRenderItem[],
  scheduleMap: Map<string, ScheduledActivity>,
  geo: SectionLayerGeometry,
  colors: { muted: string; ground: string },
): SectionLayer[] {
  return sectionGroups(items).map((group) => {
    const span = sectionSpan(group.activityIds, scheduleMap);
    const extent = solidBarsExtent(group.activityIds, scheduleMap, geo.toX, geo.minBarWidth);
    const top = geo.topMargin + group.row * geo.rowHeight + (geo.rowHeight - geo.thickness) / 2 - geo.lift;
    return {
      group,
      tint: sectionTint(group.band.color, colors.muted, SECTION_ROW_TINT_ALPHA),
      ink: sectionInk(group.band.color, colors.muted, colors.ground),
      bar: span && extent
        ? { d: summaryBarPath(extent.x1, extent.x2, top, geo.thickness, geo.drop), start: span.start, end: span.end }
        : null,
    };
  });
}
