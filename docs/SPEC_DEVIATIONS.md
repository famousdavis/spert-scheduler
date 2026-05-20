# SPERT Scheduler — Import Spec Deviations

Last reviewed: v0.43.0

This document tracks deliberate departures from the SPERT Suite Robust-Import Level 4 specification (`IMPORT-SPEC-REFERENCE.md`, `IMPORT-DESIGN-GUIDE.md`, `IMPORT-AUDIT-CHECKLIST.md`, `IMPORT-PITFALLS.md`). Each deviation states the gap, its behavioral consequence, the partial mitigation in place, and the target release for full compliance.

## SD-1 — `applyImportDecisions` not extracted as a pure function

The decision-application merge logic is inlined in the Zustand store action `importProjects` (in `src/ui/hooks/use-project-store.ts`). The spec recommends extracting it as a pure function exported from the service layer.

**Consequence:** The merge logic cannot be unit-tested in isolation — tests must drive it through the real Zustand store via `useProjectStore.getState().importProjects(...)`. This is functionally adequate but tightens the test/production coupling more than the spec prefers.

**Mitigation:** Store-level subscribe() atomicity tests (Phase 9 of the v0.43.0 plan) cover the behavioral contract. The new test cases #46–53 verify structural atomicity, drift-skip behavior, owner preservation on replace, and symmetric Layer 2 guards.

**Target:** v0.44.0.

## SD-2 — No `conflictsEqual` / `{ ok: false }` drift-abort path

Per-project Layer 2 drift guards exist in both replace branches (ID-conflict and name-conflict) and in the no-decision branch (pitfalls #77, #85). However, the full conflict-set comparison and atomic abort — where the store action returns `{ ok: false }` when the conflict shape between Layer 1 (preview) and Layer 2 (apply) has fundamentally changed — is not implemented.

**Consequence:** A conflict-kind change between Layer 1 and Layer 2 in the normal apply path (e.g., what was an ID conflict at preview time becomes a name conflict at apply time because a peer renamed the existing project) applies the user's original decision rather than aborting. The user is not notified that the conflict shape changed.

**Mitigation:** `mergeDecisions` guards `kind` and `originalExistingId` changes in cloud re-validation (when `cloudDataLoaded` flips false→true while a preview is open), so the most common case — a peer mutation that lands between sign-in hydration and confirm — IS surfaced via the amber cloud-refresh banner. The remaining gap is the rarer in-session case where a peer's mutation lands between the preview opening and the user clicking Confirm in normal mode.

**Target:** v0.44.0.
