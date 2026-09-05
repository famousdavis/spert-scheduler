// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Activity } from "@domain/models/types";
import { NAME_CLICK_DELAY_MS } from "./gantt-constants";
import { useSingleOrDoubleClick } from "@ui/hooks/use-single-or-double-click";
import type { EditTarget } from "./GanttActivityRow";
import { activityDisplayName, truncateLabel } from "./gantt-utils";

export interface GanttActivityNameProps {
  act: Activity;
  /** Top of the row band; the label is centred within it. */
  y: number;
  rowHeight: number;
  leftMargin: number;
  fontSize: number;
  nameCharLimit: number;
  fill: string;
  isLocked: boolean | undefined;
  onEditActivity: ((activityId: string) => void) | undefined;
  onRenameActivity: ((activityId: string, newName: string) => void) | undefined;
  editTarget: EditTarget | null;
  setEditTarget: (t: EditTarget | null) => void;
  setEditValue: (v: string) => void;
  activityIndexMap: Map<string, number> | null;
}

/**
 * The activity's name label in the Gantt chart's left margin, and the two gestures it
 * carries: a single click opens the activity editor, a double click renames in place.
 *
 * ⚠️ EXTRACTED FROM `GanttActivityRow` (v0.64.16, WI-21) BECAUSE OF A MEASURED NUMBER, not
 * a preference. Adding the second gesture inline took that component from cognitive
 * complexity 12 to 20 — past the 15 the lint gate allows, which would have added a fourth
 * finding to a baseline whose whole value is that it does not move. Measured again after
 * the split; see the row component's own note for the result.
 *
 * ⚠️ Renders exactly the `<text>` it replaced, attribute for attribute. That is verifiable
 * rather than asserted: `gantt-parity-oracle` byte-compares this element's geometry and
 * its text content against a committed baseline, and the baseline was not regenerated.
 *
 * ⚠️ SECTION-BAND NAMES ARE NOT THIS. They render in GanttChart's own band pass and keep
 * single-click-to-rename by the owner's decision. Confirmed live 2026-09-05 that the two
 * are separate elements in separate files, before either was touched.
 */
export function GanttActivityName({
  act, y, rowHeight, leftMargin, fontSize, nameCharLimit, fill, isLocked,
  onEditActivity, onRenameActivity, editTarget, setEditTarget, setEditValue,
  activityIndexMap,
}: GanttActivityNameProps) {
  const nameClick = useSingleOrDoubleClick({
    enabled: !isLocked,
    onSingle: onEditActivity && (() => onEditActivity(act.id)),
    onDouble:
      onRenameActivity &&
      (() => {
        setEditTarget({ kind: "activity", id: act.id });
        setEditValue(act.name);
      }),
    delayMs: NAME_CLICK_DELAY_MS,
  });

  const label = truncateLabel(activityDisplayName(act.name, act.id, activityIndexMap), nameCharLimit);
  const isEditingThis = editTarget?.kind === "activity" && editTarget.id === act.id;

  return (
    <text
      x={leftMargin - 8}
      y={y + rowHeight / 2}
      textAnchor="end"
      dominantBaseline="central"
      fontSize={fontSize}
      fill={fill}
      className={nameClick.interactive ? "cursor-pointer" : "pointer-events-none"}
      style={isEditingThis ? { display: "none" } : undefined}
      onClick={nameClick.onClick}
      onDoubleClick={nameClick.onDoubleClick}
    >
      {label}
    </text>
  );
}
