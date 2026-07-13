# SPERT Scheduler — Import Spec Deviations

Last reviewed: v0.44.0

This document tracks deliberate departures from the SPERT Suite Robust-Import Level 4 specification (`IMPORT-SPEC-REFERENCE.md`, `IMPORT-DESIGN-GUIDE.md`, `IMPORT-AUDIT-CHECKLIST.md`, `IMPORT-PITFALLS.md`). Each deviation states the gap, its behavioral consequence, the partial mitigation in place, and the target release for full compliance.

## SD-1 — `applyImportDecisions` not extracted as a pure function

The decision-application merge logic is inlined in the Zustand store action `importProjects` (in `src/ui/hooks/use-project-store.ts`). The spec recommends extracting it as a pure function exported from the service layer.

**Consequence:** The merge logic cannot be unit-tested in isolation — tests must drive it through the real Zustand store via `useProjectStore.getState().importProjects(...)`. This is functionally adequate but tightens the test/production coupling more than the spec prefers.

**Mitigation:** Store-level subscribe() atomicity tests (Phase 9 of the v0.43.0 plan) cover the behavioral contract. The new test cases #46–53 verify structural atomicity, drift-skip behavior, owner preservation on replace, and symmetric Layer 2 guards.

**Target:** v0.45.0.

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
