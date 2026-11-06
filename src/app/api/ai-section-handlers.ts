// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// -- WI-162: Connect AI creates, edits and deletes Sections ---------------------
// A Section is a header row in the activity grid; in code, a band (`ActivityBand`). Display only, so
// nothing here touches an activity, a dependency or `simulationResults`: an AI Section write keeps
// the run, as "+ Section" does. Each entry applies or is refused alone, in array order, and each
// sees the one before it (a repeated id too).
//  - Placement: the render rule of `buildRenderList`. Headers on one activity render in `bands`
//    order, so a placed header goes LAST in the array: directly above the activity, below any header
//    already there. Null, or an anchor no activity holds, renders after the last activity.
//  - The cap is read from the scenario as it stands at each entry, so it holds across entries, ops
//    and batches. Past it the schema refuses every later save of the project (WI-164).
//  - Ids: a Section's differs from every activity's in the scenario, both ways round
//    (`isSectionId` in `createActivityCore`), because the grid's drag finds a row by its id alone.
//  - Colours by swatch name, so the AI cannot store a hex: the Gantt draws a header's text in the
//    raw colour on a dark page.

import { PROJECT_TILE_COLORS, SECTION_CAP, type ActivityBand, type Scenario } from "@domain/models/types";
import { ActivityBandSchema } from "@domain/schemas/project.schema";
import { nameOrUnnamed } from "@domain/helpers/display-name";
import { buildRenderList } from "@ui/helpers/band-utils";
import { addBand, isSectionId, removeBand } from "./band-service";
import { bulkOutcome } from "./ai-bulk-handlers";
import {
  type BulkCreateSectionItem,
  type BulkCreateSectionsPayload,
  type BulkOutcome,
  type BulkUpdateSectionItem,
  type BulkUpdateSectionsPayload,
  type CoreResult,
  type DeleteSectionsPayload,
  type OpResult,
  type SkippedItem,
  NO_SECTION_COLOR,
  accept,
  reject,
  toItemReject,
} from "./ai-op-types";

/** The stored colour of a value a tool sent: `undefined` for "none", `null` when no swatch has that name. */
function storedColor(value: string): string | undefined | null {
  if (value === NO_SECTION_COLOR) return undefined;
  return PROJECT_TILE_COLORS.find((c) => c.name === value)?.hex ?? null;
}

function isBlank(name: string): boolean {
  return name.trim() === "";
}

function activityMissing(scenario: Scenario, anchor: string | null | undefined): boolean {
  return typeof anchor === "string" && !scenario.activities.some((a) => a.id === anchor);
}

function createSectionCore(scenario: Scenario, item: BulkCreateSectionItem): CoreResult {
  const color = item.color === undefined ? undefined : storedColor(item.color);
  if (isBlank(item.name) || color === null) return reject("invalid");
  if (isSectionId(scenario, item.id) || scenario.activities.some((a) => a.id === item.id)) return reject("section_exists");
  if (activityMissing(scenario, item.beforeActivityId)) return reject("anchor_not_found");
  if ((scenario.bands ?? []).length >= SECTION_CAP) return reject("section_limit");
  const band: ActivityBand = { id: item.id, name: item.name, insertBeforeActivityId: item.beforeActivityId, color };
  if (!ActivityBandSchema.safeParse(band).success) return reject("invalid");
  return accept(addBand(scenario, band));
}

/** The fields an entry changes, or `null` when one of them is not a value a Section can hold. */
function sectionPatch(item: BulkUpdateSectionItem): Partial<ActivityBand> | null {
  const patch: Partial<ActivityBand> = {};
  if (item.name !== undefined) {
    if (isBlank(item.name)) return null;
    patch.name = item.name;
  }
  if (item.color !== undefined) {
    const color = storedColor(item.color);
    if (color === null) return null;
    patch.color = color;
  }
  return patch;
}

/** The bands with this one replaced, or, for a move, taken out and put last. */
function withBand(bands: readonly ActivityBand[], band: ActivityBand, moved: boolean): ActivityBand[] {
  if (moved) return [...bands.filter((b) => b.id !== band.id), band];
  return bands.map((b) => (b.id === band.id ? band : b));
}

/** The grid, top to bottom, by row kind and id: what a move has to change to be a change. */
function layout(scenario: Scenario, bands: ActivityBand[]): string {
  return buildRenderList(scenario.activities, bands)
    .map((row) => (row.kind === "band" ? `s:${row.band.id}` : `a:${row.activity.id}`))
    .join("\n");
}

function updateSectionCore(scenario: Scenario, item: BulkUpdateSectionItem): CoreResult {
  const bands = scenario.bands ?? [];
  const current = bands.find((b) => b.id === item.id);
  if (!current) return reject("not_found");
  const moved = item.beforeActivityId !== undefined;
  const patch = sectionPatch(item);
  if (patch === null || (!moved && Object.keys(patch).length === 0)) return reject("invalid");
  if (activityMissing(scenario, item.beforeActivityId)) return reject("anchor_not_found");
  const band: ActivityBand = {
    ...current,
    ...patch,
    insertBeforeActivityId: moved ? item.beforeActivityId! : current.insertBeforeActivityId,
  };
  if (!ActivityBandSchema.safeParse(band).success) return reject("invalid");
  const next = withBand(bands, band, moved);
  const sameRow = band.name === current.name && band.color === current.color;
  if (sameRow && layout(scenario, next) === layout(scenario, bands)) return reject("value_unchanged");
  return accept({ ...scenario, bands: next });
}

function deleteSectionCore(scenario: Scenario, id: string): CoreResult {
  const next = removeBand(scenario, id);
  return next === scenario ? reject("not_found") : accept(next);
}

/** What the feed calls a Section: its name as it stands, or the id the AI sent when none has it. */
function sectionLabel(scenario: Scenario, id: string): string {
  const band = (scenario.bands ?? []).find((b) => b.id === id);
  return band ? nameOrUnnamed(band.name) : id;
}

/** A new Section's own name, which no scenario holds yet. */
function newSectionLabel(item: BulkCreateSectionItem): string {
  return isBlank(item.name) ? item.id : item.name;
}

/** Each entry in array order, against the scenario the entry before it left. Every skip is named (G2). */
function applyEntries<T>(
  scenario: Scenario,
  entries: readonly T[],
  core: (s: Scenario, entry: T) => CoreResult,
  idOf: (entry: T) => string,
  labelOf: (s: Scenario, entry: T) => string,
): { scenario: Scenario; outcome: BulkOutcome } {
  let scn = scenario;
  const skippedItems: SkippedItem[] = [];
  let appliedCount = 0;
  entries.forEach((entry, index) => {
    const r = core(scn, entry);
    if (!r.ok) {
      skippedItems.push({ index, id: idOf(entry), name: labelOf(scn, entry), reason: toItemReject(r.reason) });
      return;
    }
    scn = r.scenario;
    appliedCount++;
  });
  return { scenario: scn, outcome: bulkOutcome(appliedCount, skippedItems) };
}

export function handleBulkCreateSections(scenario: Scenario, p: BulkCreateSectionsPayload): OpResult {
  return applyEntries(scenario, p.sections, createSectionCore, (e) => e.id, (_s, e) => newSectionLabel(e));
}

export function handleBulkUpdateSections(scenario: Scenario, p: BulkUpdateSectionsPayload): OpResult {
  return applyEntries(scenario, p.updates, updateSectionCore, (e) => e.id, (s, e) => sectionLabel(s, e.id));
}

export function handleDeleteSections(scenario: Scenario, p: DeleteSectionsPayload): OpResult {
  // The owner's condition on delete (R674): the row names what went and where. Read before the entry
  // goes, since the name goes with it. They stay in the browser: no outcome is written back to the relay.
  const names: string[] = [];
  const deleteAndNote = (s: Scenario, id: string): CoreResult => {
    const name = sectionLabel(s, id);
    const r = deleteSectionCore(s, id);
    if (r.ok) names.push(name);
    return r;
  };
  const { scenario: next, outcome } = applyEntries(scenario, p.ids, deleteAndNote, (id) => id, sectionLabel);
  if (names.length === 0) return { scenario: next, outcome };
  return { scenario: next, outcome: { ...outcome, deletedSections: { scenarioName: scenario.name, names } } };
}
