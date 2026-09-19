// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useMemo, useState } from "react";
import type { Activity, Scenario } from "@domain/models/types";
import { ActivitySchema } from "@domain/schemas/project.schema";
import { estimateOrderIssues, type EstimateKey } from "@domain/helpers/estimate-rules";
import { nameOrUnnamed } from "@domain/helpers/display-name";
import { computeDependencyDurations } from "@core/schedule/deterministic";

/**
 * What a grid row reports about itself: the two things SAVED DATA CANNOT SEE (v0.69.0).
 * Everything else about an activity's validity is derived below from the saved activity, so it
 * survives a reload, an undo and a cloud echo — which a report cannot.
 *
 * The two flags coexist (a half-typed row can also hold a cleared cell), and the report is the
 * row's LAST one: absent means clean.
 */
export interface RowReport {
  /**
   * The row is half-typed — some estimate cell has not been visited since the row mounted
   * all-equal — carrying the saved triple the row expected when it reported. While the saved
   * triple still matches it, the row's ORDERING issues are held back from the summary, the
   * banner and the red cells (v0.67.23's rule, kept until the estimate cells commit as a group).
   * A different saved triple — a dialog save, an undo — means the stamp no longer describes what
   * is stored, and the ordering issue shows. `null`: the row is not mid-entry.
   */
  midEntry: EstimateTriple | null;
  /** Cells holding an entry the row refused to store (cleared, negative), with their messages. */
  refused: Partial<Record<EstimateKey, string>>;
}

export interface EstimateTriple {
  min: number;
  mostLikely: number;
  max: number;
}

/** An activity and what is wrong with it, as the summary, the Run reason and the toast list it. */
export interface ActivityProblem {
  id: string;
  name: string;
  messages: string[];
}

/** The red estimate cells of one activity, by field, with each cell's message. */
export type CellIssues = Partial<Record<EstimateKey, string>>;

export interface EstimateValidity {
  /** No activity is saved-invalid or holds a refused entry. Every Run control reads this. */
  runnable: boolean;
  /** Every activity that stops Run, with every reason — saved issues and refused cells alike. */
  runBlockers: readonly ActivityProblem[];
  /**
   * The FLAGGED activities, as the validation summary renders them: saved issues and refused
   * cells, minus a half-typed row's ordering issues. Reference-stable, so it can be held.
   */
  flaggedRows: readonly ActivityProblem[];
  /** Per activity, the estimate cells to paint red: the saved issues minus the held-back ones. */
  cellIssues: ReadonlyMap<string, CellIssues>;
  /**
   * The first activity, in the engine's own order, whose distribution cannot be built AND that
   * has a saved issue not held back — its own build message. `null` when there is none. This, not
   * the engine's error, is what the generic schedule-error banner may show; see the helper.
   */
  flaggedThrow: string | null;
  /** Where a row sends its report. Stable per scenario. */
  reportRow: (activityId: string, report: RowReport) => void;
}

const ESTIMATE_LABELS: Record<EstimateKey, string> = {
  min: "Min",
  mostLikely: "Most Likely",
  max: "Max",
};

const ESTIMATE_KEYS: readonly EstimateKey[] = ["min", "mostLikely", "max"];

interface SavedIssue {
  field: string;
  message: string;
}

interface ReportEntry {
  scenarioId: string;
  report: RowReport;
}

type ReportBook = ReadonlyMap<string, ReportEntry>;

const EMPTY_BOOK: ReportBook = new Map();
const NO_ACTIVITIES: readonly Activity[] = [];

/** The saved-data half: every activity the STRICT schema rejects, with its issues in order. */
export function parseSavedActivities(activities: readonly Activity[]): ReadonlyMap<string, SavedIssue[]> {
  const invalid = new Map<string, SavedIssue[]>();
  for (const activity of activities) {
    const result = ActivitySchema.safeParse(activity);
    if (!result.success) {
      invalid.set(
        activity.id,
        result.error.issues.map((issue) => ({ field: String(issue.path[0] ?? ""), message: issue.message }))
      );
    }
  }
  return invalid;
}

/**
 * The reports that can still describe a row on screen. An entry dies when its row leaves: when
 * the scenario changes (every row unmounts) and when its activity is no longer in the scenario (a
 * delete). Without this, a row that remounts — back from another scenario, or restored by an
 * undo — shows the STORED number while its old report still said a cell was cleared, and Run
 * stayed off naming a cell that shows a number. Returns `book` itself when nothing has died, so
 * the caller can compare by reference.
 */
export function liveReports(
  book: ReportBook,
  scenarioId: string | null,
  activities: readonly Activity[]
): ReportBook {
  if (book.size === 0) return book;
  const ids = new Set(activities.map((a) => a.id));
  const isLive = ([id, entry]: [string, ReportEntry]) => entry.scenarioId === scenarioId && ids.has(id);
  const entries = [...book];
  return entries.every(isLive) ? book : new Map(entries.filter(isLive));
}

function roundedEqual(a: number, b: number): boolean {
  return Math.round(a) === Math.round(b);
}

/**
 * Does this report's mid-entry stamp still describe what is stored? Compared ROUNDED: the grid
 * shows and writes whole numbers, and a cell that was only looked at writes nothing over a stored
 * fraction (R40), so its stamp holds the displayed number.
 */
function stillMidEntry(report: RowReport | undefined, activity: Activity): boolean {
  const stamp = report?.midEntry;
  if (!stamp) return false;
  return (
    roundedEqual(stamp.min, activity.min) &&
    roundedEqual(stamp.mostLikely, activity.mostLikely) &&
    roundedEqual(stamp.max, activity.max)
  );
}

/** A half-typed row's ORDERING issues, and only those, are held back — never 3.8's or any other. */
function unsuppressedIssues(issues: SavedIssue[], activity: Activity, midEntry: boolean): SavedIssue[] {
  if (!midEntry) return issues;
  const ordering = estimateOrderIssues(activity.min, activity.mostLikely, activity.max);
  return issues.filter((i) => !ordering.some((o) => o.field === i.field && o.message === i.message));
}

function refusedMessages(refused: RowReport["refused"] | undefined): string[] {
  if (!refused) return [];
  return ESTIMATE_KEYS.filter((key) => refused[key] !== undefined).map(
    (key) => `${ESTIMATE_LABELS[key]}: ${refused[key]}`
  );
}

function toCellIssues(issues: SavedIssue[]): CellIssues | undefined {
  let cells: CellIssues | undefined;
  for (const issue of issues) {
    const key = ESTIMATE_KEYS.find((k) => k === issue.field);
    if (key !== undefined && cells?.[key] === undefined) cells = { ...cells, [key]: issue.message };
  }
  return cells;
}

/**
 * The engine's own per-activity build, without the schedule: the same `resolveActivityDuration`
 * path, so a complete activity with an actual duration is skipped exactly as the engine skips it.
 * Returns the build's error message, or `null` when it builds.
 */
function buildFailure(activity: Activity, probabilityTarget: number): string | null {
  try {
    computeDependencyDurations([activity], probabilityTarget);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}

interface Derived {
  runnable: boolean;
  runBlockers: ActivityProblem[];
  flaggedRows: ActivityProblem[];
  cellIssues: Map<string, CellIssues>;
  flaggedThrow: string | null;
}

/**
 * Every set the page reads, in one pass over the activities in ARRAY order — the order the
 * engine builds distributions in, in both modes (`computeDeterministicSchedule`'s loop, and
 * `computeDependencyDurations` before any graph walk). That order is why `flaggedThrow` is the
 * first qualifying thrower and not merely any.
 */
export function deriveEstimateValidity(
  activities: readonly Activity[],
  saved: ReadonlyMap<string, SavedIssue[]>,
  book: ReportBook,
  probabilityTarget: number
): Derived {
  const derived: Derived = { runnable: true, runBlockers: [], flaggedRows: [], cellIssues: new Map(), flaggedThrow: null };
  for (const activity of activities) {
    const issues = saved.get(activity.id) ?? [];
    const report = book.get(activity.id)?.report;
    const shown = unsuppressedIssues(issues, activity, stillMidEntry(report, activity));
    const refused = refusedMessages(report?.refused);
    const name = nameOrUnnamed(activity.name);
    if (issues.length > 0 || refused.length > 0) {
      derived.runnable = false;
      derived.runBlockers.push({ id: activity.id, name, messages: [...refused, ...issues.map((i) => i.message)] });
    }
    if (shown.length > 0 || refused.length > 0) {
      derived.flaggedRows.push({ id: activity.id, name, messages: [...refused, ...shown.map((i) => i.message)] });
    }
    const cells = toCellIssues(shown);
    if (cells) derived.cellIssues.set(activity.id, cells);
    // `unparseable` never qualifies a thrower: a refused cell leaves the old number in the store.
    if (derived.flaggedThrow === null && shown.length > 0) {
      derived.flaggedThrow = buildFailure(activity, probabilityTarget);
    }
  }
  return derived;
}

/**
 * Estimate validity for the page (WI-49, v0.69.0): DERIVED from the saved activities, plus the
 * two row states saved data cannot see. It replaces a `useState(true)` that only the grid's rows
 * could move, so a project loaded with a bad row showed every signal as valid at mount (WI-28's
 * mechanism, and the reason a relaxed load gate alone measured worse than the brick).
 *
 * ⚠️ NO EFFECT, and none may be added: a state-setting effect is a lint problem the ratchet has
 * no room for. Reports are written only from row handlers; the one state write here happens in
 * render, and only when a report has outlived its row (`liveReports`) — React's documented
 * "adjust state while rendering" pattern, which settles in one extra pass.
 */
export function useEstimateValidity(scenario: Scenario | undefined): EstimateValidity {
  const activities = scenario?.activities ?? NO_ACTIVITIES;
  const scenarioId = scenario?.id ?? null;
  const probabilityTarget = scenario?.settings.probabilityTarget ?? 0.5;

  const [book, setBook] = useState<ReportBook>(EMPTY_BOOK);
  const live = liveReports(book, scenarioId, activities);
  if (live !== book) setBook(live);

  const reportRow = useCallback(
    (activityId: string, report: RowReport) => {
      if (scenarioId === null) return;
      setBook((prev) => new Map(prev).set(activityId, { scenarioId, report }));
    },
    [scenarioId]
  );

  const saved = useMemo(() => parseSavedActivities(activities), [activities]);
  const derived = useMemo(
    () => deriveEstimateValidity(activities, saved, live, probabilityTarget),
    [activities, saved, live, probabilityTarget]
  );

  return useMemo(() => ({ ...derived, reportRow }), [derived, reportRow]);
}
