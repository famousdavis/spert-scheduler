// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback, useMemo, useState } from "react";
import type { Activity, Scenario } from "@domain/models/types";
import { ActivitySchema } from "@domain/schemas/project.schema";
import type { EstimateKey } from "@domain/helpers/estimate-rules";
import { nameOrUnnamed } from "@domain/helpers/display-name";
import { computeDependencyDurations } from "@core/schedule/deterministic";

/**
 * What a grid row reports about itself: the one thing SAVED DATA CANNOT SEE (v0.69.0). Everything
 * else about an activity's validity is derived below from the saved activity, so it survives a
 * reload, an undo and a cloud echo — which a report cannot.
 *
 * The report is the row's LAST one, sent each time focus leaves its three estimate cells and by
 * Escape; absent means clean. ⚠️ Until v0.70.0 it also carried `midEntry`, a stamp of a half-typed
 * row's saved triple that held the row's ORDERING issues back from the summary, the banner and the
 * red cells (v0.67.23's rule). Since the three cells commit as one group, nothing is saved while a
 * row is being typed, so there is nothing to hold back: a triple left out of order is flagged.
 */
export interface RowReport {
  /** Cells holding an entry the row refused to store (cleared, negative), with their messages. */
  refused: Partial<Record<EstimateKey, string>>;
}

/** An activity and what is wrong with it, as the summary, the Run reason and the toast list it. */
export interface ActivityProblem {
  id: string;
  name: string;
  messages: string[];
}

/**
 * The first FLAGGED activity whose distribution cannot be built: who it is, what the validation
 * summary says about it, and the three numbers as the grid shows them. v0.71.3 (WI-15) widened
 * this from the engine's build message to the activity itself, so the banner can name the row in
 * the summary's OWN words and link to it.
 *
 * WARNING: `messages` IS THE SUMMARY'S LINE, the same array, not a second description of the same
 * row. That is deliberate and load-bearing: the banner and the summary appear together, 550 px
 * apart (measured), about the same activity, and a novice - who is the reader this app is for -
 * cannot tell two differently-worded rules apart. The engine's own wording WOULD introduce one:
 * on Uniform 30/9/28 the build fails on Min > Max while the summary reports Min > Most Likely,
 * and `estimateOrderIssues` never states Min > Max at all. Reusing this array makes that
 * divergence impossible by construction rather than by review.
 */
export interface FlaggedThrower {
  id: string;
  name: string;
  messages: string[];
  min: number;
  mostLikely: number;
  max: number;
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
   * cells. Reference-stable, so it can be held. ⚠️ Since v0.70.0 the SAME list as `runBlockers`:
   * the two differed only by a half-typed row's held-back ordering issues, and nothing is held back
   * now. Two names are kept because the page reads them differently — Run's live, the summary's held.
   */
  flaggedRows: readonly ActivityProblem[];
  /** Per activity, the estimate cells to paint red: the saved issues, by field. */
  cellIssues: ReadonlyMap<string, CellIssues>;
  /**
   * The first activity, in the engine's own order, whose distribution cannot be built AND that
   * has a saved issue. `null` when there is none. This, not the engine's error, is what the
   * generic schedule-error banner shows; see the helper. THE GATE IS UNCHANGED from v0.69.0 —
   * only what it carries widened, from the build message to the activity itself (v0.71.3).
   */
  flaggedThrower: FlaggedThrower | null;
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
  flaggedThrower: FlaggedThrower | null;
}

/**
 * Every set the page reads, in one pass over the activities in ARRAY order — the order the
 * engine builds distributions in, in both modes (`computeDeterministicSchedule`'s loop, and
 * `computeDependencyDurations` before any graph walk). That order is why `flaggedThrower` is the
 * first qualifying thrower and not merely any.
 *
 * ⚠️ v0.70.0 — `flaggedThrower` now names the SAME activity as the engine's own first throw, with
 * the same message (REASONED): every throw the distribution factory can raise — Triangular out of
 * order; T-Normal, LogNormal or Uniform with Min above Max; LogNormal at zero — is also an issue
 * of the strict schema, and no saved issue is held back any more: nothing is saved while a row's
 * three estimate cells are still being typed in, and a triple left out of order is flagged. It was
 * built in v0.69.0 to skip a held-back half-typed row's throw; it is kept, not simplified, in the PR
 * that removed the reason (simplifying it is a filed follow-up).
 */
export function deriveEstimateValidity(
  activities: readonly Activity[],
  saved: ReadonlyMap<string, SavedIssue[]>,
  book: ReportBook,
  probabilityTarget: number
): Derived {
  const problems: ActivityProblem[] = [];
  const derived: Derived = { runnable: true, runBlockers: problems, flaggedRows: problems, cellIssues: new Map(), flaggedThrower: null };
  for (const activity of activities) {
    const issues = saved.get(activity.id) ?? [];
    const refused = refusedMessages(book.get(activity.id)?.report.refused);
    // Built ONCE and shared by the summary's row and the thrower below, so the banner cannot
    // word this activity's problem differently from the summary. See `FlaggedThrower`.
    const messages = [...refused, ...issues.map((i) => i.message)];
    const name = nameOrUnnamed(activity.name);
    if (messages.length > 0) {
      derived.runnable = false;
      problems.push({ id: activity.id, name, messages });
    }
    const cells = toCellIssues(issues);
    if (cells) derived.cellIssues.set(activity.id, cells);
    // A refused cell never qualifies a thrower: it leaves the old number in the store.
    if (derived.flaggedThrower === null && issues.length > 0 && buildFailure(activity, probabilityTarget) !== null) {
      derived.flaggedThrower = { id: activity.id, name, messages, min: activity.min, mostLikely: activity.mostLikely, max: activity.max };
    }
  }
  return derived;
}

/**
 * Estimate validity for the page (WI-49, v0.69.0): DERIVED from the saved activities, plus the
 * one row state saved data cannot see (two until v0.70.0). It replaces a `useState(true)` that only the grid's rows
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
