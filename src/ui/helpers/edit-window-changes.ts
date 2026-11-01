// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type {
  Activity,
  ActivityStatus,
  ChecklistItem,
  ConstraintMode,
  ConstraintType,
  DeliverableItem,
  DistributionType,
  RSMLevel,
} from "@domain/models/types";

/**
 * WI-158 (owner, R650 decision 10; R653) — the Edit Activity window saves ONLY what the user changed,
 * and shows the activity AS IT IS NOW.
 *
 * Until v0.83.1 the window seeded its drafts once, when it opened, and Save compared them with the
 * LIVE row, so a write that landed while the window was open — a collaborator's update, Connect AI —
 * came back undone on a Save with no edit (Review 37, G4). Now the window holds only the user's
 * EDITS, part by part, and shows the live row with each part the user changed laid over it (B). A
 * part the user has not changed follows the live row; Save writes only the parts the user changed,
 * onto the row as it is when Save runs. The ONE result decides Save, both unsaved-changes prompts and
 * the line that says the activity changed somewhere else, so they cannot disagree. Nothing here is
 * set by an effect: every value is derived from the edits and the live row on each render.
 *
 * A PART is what Save writes as one (D1). Most parts are one field. Four are whole, written as the
 * window shows them when the user changed anything in them:
 *  - "progress": Status, Actual Start, Actual Finish, Actual Dur. and the two Planned dates. The
 *    Status rule (`statusChangeUpdates`) keeps them consistent with one another — Planned has none;
 *  - "constraint": Type, Date, Mode and Note. The load gate refuses a constraint that is half set
 *    (`checkConstraintTriad`, `project.schema.ts`), so a half-written one would cost the project;
 *  - "checklist" (Tasks) and "deliverables": whole lists (D4).
 * Min, ML and Max are three parts: each is the user's own number, and the load gate tolerates an
 * out-of-order triple (flagged on screen, v0.69.0), so one typed here never undoes the other two.
 */

/** The window's drafts, as it shows them (and, with a typed task or deliverable added, as Save writes them). */
export interface WindowDrafts {
  name: string;
  description: string;
  status: ActivityStatus;
  actualStartDate: string;
  actualFinishDate: string;
  actualDuration: number | "";
  min: number | "";
  mostLikely: number | "";
  max: number | "";
  confidenceLevel: RSMLevel;
  distributionType: DistributionType;
  constraintType: ConstraintType | null;
  constraintDate: string | null;
  constraintMode: ConstraintMode | null;
  constraintNote: string | null;
  checklist: ChecklistItem[];
  deliverables: DeliverableItem[];
  notes: string;
}

export type WindowPart =
  | "name" | "description" | "progress" | "min" | "mostLikely" | "max" | "confidenceLevel"
  | "distributionType" | "constraint" | "checklist" | "deliverables" | "notes";

type DraftKey = keyof WindowDrafts;

/** One empty list for every row without one, so an untouched list keeps its identity across renders. */
const NO_CHECKLIST: ChecklistItem[] = [];
const NO_DELIVERABLES: DeliverableItem[] = [];

/** The drafts a row shows — THE seeds, so "changed" cannot drift from what the window showed. */
export function seedDrafts(row: Activity | undefined): WindowDrafts {
  return {
    name: row?.name ?? "",
    description: row?.description ?? "",
    status: row?.status ?? "planned",
    actualStartDate: row?.actualStartDate ?? "",
    actualFinishDate: row?.actualFinishDate ?? "",
    actualDuration: row?.actualDuration ?? "",
    min: row?.min ?? "",
    mostLikely: row?.mostLikely ?? "",
    max: row?.max ?? "",
    confidenceLevel: row?.confidenceLevel ?? "mediumConfidence",
    distributionType: row?.distributionType ?? "normal",
    constraintType: row?.constraintType ?? null,
    constraintDate: row?.constraintDate ?? null,
    constraintMode: row?.constraintMode ?? null,
    constraintNote: row?.constraintNote ?? null,
    checklist: row?.checklist ?? NO_CHECKLIST,
    deliverables: row?.deliverables ?? NO_DELIVERABLES,
    notes: row?.notes ?? "",
  };
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Each part's drafts. In the window's order, top to bottom: the order the line names them in. */
const PART_FIELDS: Record<WindowPart, readonly DraftKey[]> = {
  name: ["name"],
  progress: ["status", "actualStartDate", "actualFinishDate", "actualDuration"],
  description: ["description"],
  min: ["min"],
  mostLikely: ["mostLikely"],
  max: ["max"],
  distributionType: ["distributionType"],
  confidenceLevel: ["confidenceLevel"],
  constraint: ["constraintType", "constraintDate", "constraintMode", "constraintNote"],
  checklist: ["checklist"],
  deliverables: ["deliverables"],
  notes: ["notes"],
};

const PARTS = Object.keys(PART_FIELDS) as WindowPart[];

/** The part each draft belongs to. */
const PART_OF = Object.fromEntries(
  PARTS.flatMap((p) => PART_FIELDS[p].map((f) => [f, p])),
) as Record<DraftKey, WindowPart>;

/** Whether two sets of drafts differ in a part. */
function partDiffers(part: WindowPart, a: WindowDrafts, b: WindowDrafts): boolean {
  return PART_FIELDS[part].some((f) => !sameJson(a[f], b[f]));
}

/** One part the user changed: the row it was changed FROM, and the window's drafts for it. */
export interface PartEdit {
  /** The live row when the user first changed this part: the part's baseline for "changed here". */
  base: Activity;
  /** The window's drafts; only this part's own fields are read. */
  draft: WindowDrafts;
  /** The progress part only: the Actual Start as last committed — at a Status change or a blur. */
  committedStart?: string;
}

/** The user's edits, by part. A part with no edit follows the live row. */
export type WindowEdits = Partial<Record<WindowPart, PartEdit>>;

/** The drafts the window shows: the LIVE row, with each part the user changed laid over it (B). */
export function shownDrafts(edits: WindowEdits, live: Activity | undefined): WindowDrafts {
  const shown = seedDrafts(live);
  for (const part of PARTS) {
    const e = edits[part];
    if (e) Object.assign(shown, pick(e.draft, PART_FIELDS[part]));
  }
  return shown;
}

function pick(d: WindowDrafts, keys: readonly DraftKey[]): Partial<WindowDrafts> {
  return Object.fromEntries(keys.map((k) => [k, d[k]])) as Partial<WindowDrafts>;
}

/**
 * One user action on the drafts. A part it touches starts from `live` — the row the window shows —
 * the first time, so its baseline follows the live row until then; and an edit that brings a part
 * back to its baseline is dropped, so that part follows the live row again. Call it ONCE per action
 * (the Status rule moves four fields): a part is never re-based half-way through one.
 */
export function editDrafts(
  edits: WindowEdits, live: Activity, patch: Partial<WindowDrafts>, committedStart?: string,
): WindowEdits {
  const parts = new Set((Object.keys(patch) as DraftKey[]).map((f) => PART_OF[f]));
  if (committedStart !== undefined) parts.add("progress");
  const next: WindowEdits = { ...edits };
  for (const part of parts) {
    const cur = edits[part] ?? { base: live, draft: seedDrafts(live) };
    const edit: PartEdit = {
      base: cur.base, draft: { ...cur.draft, ...patch }, committedStart: committedStart ?? cur.committedStart,
    };
    next[part] = partDiffers(part, seedDrafts(edit.base), edit.draft) ? edit : undefined;
  }
  return next;
}

/**
 * The row the Status rule, the Planned pair and D4's stored dates read (D2): the activity as the
 * window shows it — the live row, with the progress part as it stood when the user first changed it.
 */
export function progressRow(edits: WindowEdits, live: Activity | undefined): Activity | undefined {
  const b = edits.progress?.base;
  if (!b || !live) return live;
  return {
    ...live,
    status: b.status,
    actualStartDate: b.actualStartDate,
    actualFinishDate: b.actualFinishDate,
    actualDuration: b.actualDuration,
    plannedStartDate: b.plannedStartDate,
    plannedFinishDate: b.plannedFinishDate,
  };
}

/** The Actual Start as last committed: at the user's last Status change or blur, else as the window shows it. */
export function committedStartOf(edits: WindowEdits, live: Activity | undefined): string {
  return edits.progress?.committedStart ?? progressRow(edits, live)?.actualStartDate ?? "";
}

/**
 * The parts the user changed here: each part with an edit, and a list whose box holds a task or
 * deliverable that Save would add (WI-138). A list changed ONLY by its box has no edit, so it follows
 * the live row and Save appends the typed item to the list as it is now (D4, Review 38 WEAK-3).
 */
export function partsChangedHere(
  edits: WindowEdits, typed: { checklist: boolean; deliverables: boolean },
): Set<WindowPart> {
  const out = new Set(PARTS.filter((p) => edits[p] !== undefined));
  if (typed.checklist) out.add("checklist");
  if (typed.deliverables) out.add("deliverables");
  return out;
}

/** The part each written field belongs to. A field with no part is never written by the window. */
const FIELD_PART: Partial<Record<keyof Activity, WindowPart>> = {
  ...PART_OF,
  plannedStartDate: "progress",
  plannedFinishDate: "progress",
};

/**
 * Of the updates that would make the LIVE row hold the window's values, the ones in a part the user
 * changed. An explicit `undefined` (a clear) is kept as an own property, as Save and the prompts count it.
 */
export function onlyChangedParts(toWindow: Partial<Activity>, changedHere: Set<WindowPart>): Partial<Activity> {
  const out: Partial<Activity> = {};
  for (const key of Object.keys(toWindow) as (keyof Activity)[]) {
    const part = FIELD_PART[key];
    if (part !== undefined && changedHere.has(part)) Object.assign(out, { [key]: toWindow[key] });
  }
  return out;
}

/** What Save writes. Tasks, Deliverables and Notes have their own store actions; each is written whole. */
export interface WindowWrites {
  fields: Partial<Activity>;
  checklist: boolean;
  deliverables: boolean;
  notes: boolean;
  /** The parts the user changed in this window. */
  changedHere: Set<WindowPart>;
  /** The drafts Save writes from: as shown, with a task or deliverable typed in its box added. */
  drafts: WindowDrafts;
}

/** The three list-like parts: written when changed here and not already what the live row holds. */
export function ownListWrites(
  changedHere: Set<WindowPart>, d: WindowDrafts, live: Activity,
): Pick<WindowWrites, "checklist" | "deliverables" | "notes"> {
  return {
    checklist: changedHere.has("checklist") && !sameJson(d.checklist, live.checklist ?? []),
    deliverables: changedHere.has("deliverables") && !sameJson(d.deliverables, live.deliverables ?? []),
    notes: changedHere.has("notes") && d.notes !== (live.notes ?? ""),
  };
}

/** Whether Save would write anything — the unsaved-changes prompts' question. */
export function writesAnything(w: WindowWrites): boolean {
  return Object.keys(w.fields).length > 0 || w.checklist || w.deliverables || w.notes;
}

// -- The line (D3) --

type LineKey = DraftKey | "plannedStartDate" | "plannedFinishDate";

/**
 * Each field by its label on screen (R544), in the window's order. The constraint's four fields are
 * named by their section's title: "Type", "Date" and "Note" alone would be read as other fields.
 */
const LINE_FIELDS: readonly (readonly [LineKey, string])[] = [
  ["name", "Name"], ["status", "Status"], ["description", "Description"],
  ["plannedStartDate", "Planned Start"], ["actualStartDate", "Actual Start"],
  ["plannedFinishDate", "Planned Finish"], ["actualFinishDate", "Actual Finish"], ["actualDuration", "Actual Dur."],
  ["min", "Min"], ["mostLikely", "ML"], ["max", "Max"],
  ["distributionType", "Distribution"], ["confidenceLevel", "Confidence"],
  ["constraintType", "Scheduling Constraint"], ["constraintDate", "Scheduling Constraint"],
  ["constraintMode", "Scheduling Constraint"], ["constraintNote", "Scheduling Constraint"],
  ["checklist", "Tasks"], ["deliverables", "Deliverables"], ["notes", "Notes"],
];

const LINE_PART: Record<LineKey, WindowPart> = { ...PART_OF, plannedStartDate: "progress", plannedFinishDate: "progress" };

/** What Save keeps, in "Save keeps the … this window shows": a part's own word, or its field's label. */
const KEPT: Partial<Record<WindowPart, string>> = {
  progress: "Status and dates", constraint: "constraint", checklist: "list", deliverables: "list",
};

function lineValues(row: Activity): Record<LineKey, unknown> {
  return { ...seedDrafts(row), plannedStartDate: row.plannedStartDate ?? "", plannedFinishDate: row.plannedFinishDate ?? "" };
}

/** The labels of the fields where two sets of values differ, each label once. */
function labelsWhere(differs: (k: LineKey) => boolean): string[] {
  return [...new Set(LINE_FIELDS.filter(([k]) => differs(k)).map(([, label]) => label))];
}

function inWords(labels: string[]): string {
  return labels.length === 1 ? labels[0]! : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

/** "… and Actual Dur." already ends its sentence. */
const endSentence = (s: string): string => (s.endsWith(".") ? s : `${s}.`);

/**
 * Whether another writer changed this field since the user first changed its part: the window shows
 * the user's version there, and Save writes it whole over theirs (D1).
 */
function movedSinceTouched(edits: WindowEdits, k: LineKey, now: Record<LineKey, unknown>): boolean {
  const e = edits[LINE_PART[k]];
  return e !== undefined && !sameJson(lineValues(e.base)[k], now[k]);
}

/**
 * The parts the user changed that another writer changed too while the window was open — before the
 * user's change or after it (the owner's words, R653, set no order): Save keeps the window's version.
 */
function bothChangedParts(
  edits: WindowEdits, then: Record<LineKey, unknown>, now: Record<LineKey, unknown>,
): WindowPart[] {
  return PARTS.filter((p) => edits[p] !== undefined && LINE_FIELDS.some(
    ([k]) => LINE_PART[k] === p && (!sameJson(then[k], now[k]) || movedSinceTouched(edits, k, now)),
  ));
}

function bothSentence(part: WindowPart, e: PartEdit): string {
  const base = seedDrafts(e.base);
  const mine = labelsWhere((k) => LINE_PART[k] === part && k in base && !sameJson(base[k as DraftKey], e.draft[k as DraftKey]));
  return `You had changed ${inWords(mine)} too: Save keeps the ${KEPT[part] ?? mine[0]} this window shows.`;
}

/**
 * Owner, R656: "The window now shows the new values" only where it does. In a part the user had
 * changed too, the window shows the user's version, so the sentence then names only the fields it now
 * shows, and is left out when it shows none of them.
 */
function nowShowsSentence(shown: string[], anyBoth: boolean): string[] {
  if (!anyBoth) return ["The window now shows the new values."];
  return shown.length > 0 ? [`The window now shows the new ${endSentence(inWords(shown))}`] : [];
}

/**
 * The one line the window shows once another writer has changed the activity: none until then (D3).
 * It names, by their labels, the fields changed somewhere else since the window opened, and each part
 * the user had changed too — where Save keeps the window's version, as it shows it.
 */
export function changedWhileOpenLine(
  opened: Activity | undefined, live: Activity | undefined, edits: WindowEdits,
): string | null {
  if (!opened || !live) return null;
  const then = lineValues(opened);
  const now = lineValues(live);
  const both = bothChangedParts(edits, then, now);
  const changed = (k: LineKey): boolean => !sameJson(then[k], now[k]) || movedSinceTouched(edits, k, now);
  const elsewhere = labelsWhere(changed);
  if (elsewhere.length === 0) return null;
  const shown = labelsWhere((k) => changed(k) && !both.includes(LINE_PART[k]));
  return [
    `Changed somewhere else while this window was open: ${endSentence(inWords(elsewhere))}`,
    ...nowShowsSentence(shown, both.length > 0),
    ...both.map((p) => bothSentence(p, edits[p]!)),
  ].join(" ");
}
