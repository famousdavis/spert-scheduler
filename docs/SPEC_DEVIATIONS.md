# SPERT Scheduler — Import Spec Deviations

Last reviewed: v0.44.0

This document tracks deliberate departures from the SPERT Suite Robust-Import Level 4 specification (`IMPORT-SPEC-REFERENCE.md`, `IMPORT-DESIGN-GUIDE.md`, `IMPORT-AUDIT-CHECKLIST.md`, `IMPORT-PITFALLS.md`). Each deviation states the gap, its behavioral consequence, the partial mitigation in place, and the target release for full compliance.

## SD-1 — `applyImportDecisions` not extracted as a pure function — **CLOSED in v0.60.0**

**Status: resolved.** The decision-application ladder now lives in the service layer as
`planImportDecisions()` in `src/app/api/export-import-service.ts` — a pure function of
`(projects, importedProjects, decisions, skipConflictDetection)` returning an `ImportPlan`.
It touches no storage, no event bus and no React, and is unit-tested directly in
`src/app/api/export-import-plan.test.ts` without mounting the Zustand store.

The store action `importProjects` keeps only what genuinely needs store context: committing
the state transition, dropping undo/redo entries for replaced ids (G12), the AI-undo-frame
scope check, storage cleanup, saving, and cloud-sync routing.

Two things are worth recording about how it was closed, because both shaped the sequencing:

- **The extraction and the lint decomposition were the same move.** The inlined ladder measured
  cognitive complexity **49**; the `set()` updater that replaced it measures below 1, and
  `importProjects` went **26 → 8**. Extracting for testability and decomposing for the
  complexity budget were not competing goals.
- **It was deliberately done *after* the behavioural tests, and after the two defects those
  tests exposed.** `src/ui/hooks/use-project-store.test.ts` gained twelve tests covering the
  drift ladder in v0.59.12→13, each verified by breaking the guard it protects; two real
  defects surfaced and were fixed in v0.59.13 **before** this refactor, so the extraction
  could be behaviour-preserving rather than behaviour-changing. Those tests passed unchanged
  across the extraction, which is the evidence that it preserved behaviour.

The original deviation read: *"The merge logic cannot be unit-tested in isolation — tests must
drive it through the real Zustand store."* That is no longer true.

## SD-2 — No `conflictsEqual` / `{ ok: false }` drift-abort path

Per-project Layer 2 drift guards exist in both replace branches (ID-conflict and name-conflict) and in the no-decision branch (pitfalls #77, #85). However, the full conflict-set comparison and atomic abort — where the store action returns `{ ok: false }` when the conflict shape between Layer 1 (preview) and Layer 2 (apply) has fundamentally changed — is not implemented.

**Consequence:** A conflict-kind change between Layer 1 and Layer 2 in the normal apply path (e.g., what was an ID conflict at preview time becomes a name conflict at apply time because a peer renamed the existing project) applies the user's original decision rather than aborting. The user is not notified that the conflict shape changed.

**Mitigation:** `mergeDecisions` guards `kind` and `originalExistingId` changes in cloud re-validation (when `cloudDataLoaded` flips false→true while a preview is open), so the most common case — a peer mutation that lands between sign-in hydration and confirm — IS surfaced via the amber cloud-refresh banner. The remaining gap is the rarer in-session case where a peer's mutation lands between the preview opening and the user clicking Confirm in normal mode.

**Target:** v0.45.0.

## SD-3 — Activity `description` is not parsed on CSV/clipboard import (v0.52.0)

The optional activity `description` field (added in v0.52.0) is exported to the CSV and Excel schedule exports but is **not** read back by the flat-activity importer. `HEADER_ALIASES` in `src/core/import/flat-activity-parser.ts` has no `description` alias, so a `Description` column in an imported spreadsheet is silently ignored (the resolver only records columns whose normalized header matches a known alias).

**Consequence:** A user who exports the schedule, edits it in a spreadsheet, and re-imports it does not carry descriptions back into the app. In practice this round-trip cannot lose existing data: the schedule-export CSV is not a valid importer input (its first column is `#`, not the required `activityId`, and a summary block precedes the header row), and activity import **always creates a new scenario** rather than overwriting existing activities — so there is no in-place edit path where a dropped `Description` column would overwrite a stored description.

**Mitigation:** None needed for data safety (see above). Description authoring is fully supported via the activity edit modal and the Connect AI `set_activity_description` tool.

**Target:** Deferred — will be added to `HEADER_ALIASES` if/when a description-carrying import path is introduced.
