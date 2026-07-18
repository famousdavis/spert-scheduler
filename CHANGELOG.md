# Changelog

## 0.56.1 — 2026-07-18

### Changed — Connect AI prompt now advertises the Phase 2 bulk tools

- The **Copy prompt** text for connecting an AI assistant now lists the two new bulk tools and how to use them: `scheduler_bulk_update_activities` (patch names/estimates/confidence/distribution/descriptions across up to 100 activities in one call — absent fields unchanged, empty-string description clears, repeated ids apply in order) and `scheduler_bulk_import` (build a whole schedule — activities, milestones, assignments, dependencies — in one call, with the section order, the dependency all-or-nothing rule, and the not-found cascade spelled out). The general steering was widened from "creating more than ~3 of anything" to "creating **or updating** more than ~3." Prompt text only — the tools shipped in 0.56.0 and went live server-side first (serverInfo 1.8.0), so the assistant is never told about a tool the server cannot yet handle.

## 0.56.0 — 2026-07-17

### Added — Bulk AI tools, Phase 2: update many activities and import a whole schedule

- A connected AI assistant can now **update many activities in one call** (`bulk_update_activities`): change names, three-point estimates, confidence, distribution, or descriptions across up to 100 activities at once. Each activity patches only the fields you send — anything you omit is left unchanged, and an empty-string description clears it. Every activity is validated on its own (against its *merged* result, not just the fields you sent), so an update that would push an estimate out of `min <= mostLikely <= max` order is skipped individually while the rest apply.
- A connected AI assistant can now **build an entire schedule in a single call** (`bulk_import`): activities, milestones, milestone assignments, and dependencies together. Sections apply in a fixed order (activities → milestones → assignments → dependencies), so an assignment or dependency can safely reference an activity or milestone created earlier in the same call. If one activity or milestone is skipped for a reason that means it never got created (invalid, or over the limit), the assignments and edges that depended on it are skipped too — reported as **not found** — rather than silently attaching to nothing. A `duplicate` skip does not cascade, because the entity already exists; that is what makes re-running a completed import a no-op.
- An import that includes **dependencies is all-or-nothing**: it requires Read Mode and a scenario with dependency mode enabled, and it re-checks dependency mode in your browser before applying. If dependency mode is off (or gets turned off between the AI's call and your browser applying it), the **whole import — including its activities and milestones — is declined** with a single message instead of a half-built schedule.
- **Per-item results stay visible** in the AI activity feed, now with a per-section summary for imports (e.g. `activities 26/27 · milestones 5/5 · assignments 8/10 · dependencies 30/34`) so a cascade reads as one root cause. No schema or simulation-engine change (`SCHEMA_VERSION` stays 23; `ENGINE_VERSION` stays 1.1.1).

### Note

- The two new tools go live server-side first; the **Copy prompt** text that tells your assistant about them ships in a follow-up release (0.56.1) so the assistant is never told about a tool the server cannot yet handle.

## 0.55.1 — 2026-07-17

### Changed — Connect AI prompt now lists the bulk tools

- The **Copy prompt** text for connecting an AI assistant now advertises the four bulk tools (create many activities, milestones, milestone assignments, or dependencies per call) plus how to use them — batch sizing for activities and the cycle-ordering note for dependencies. This is prompt text only; the tools themselves shipped in 0.55.0 and went live server-side first, so the assistant is never told about a tool the server cannot yet handle.

## 0.55.0 — 2026-07-17

### Added — Connect AI can build a schedule in a handful of calls (bulk tools)

- The AI connection gained four **bulk tools** so an assistant can build or extend a schedule far faster and without tripping the per-minute call limit: create many **activities**, **milestones**, **milestone assignments**, or **dependencies** in a single call instead of one call per item. A 27-activity / 34-dependency / 5-milestone project that previously needed ~130 tool calls now takes four. Bulk activity creation can also seed each activity's scope **description** and an initial **note** in the same call.
- **Per-item results stay visible.** A bulk call is all-or-nothing where it is queued, but items apply independently in your browser: the **AI activity feed** now shows how many items applied versus skipped and why — duplicate id, would-create-a-cycle, unknown reference, invalid estimate, limit reached, and so on. Behavior of an individual edge is unchanged: an acyclic dependency set applies in full regardless of the order it was sent.
- **Bulk dependency creation keeps the single-edge guardrails.** It still requires Read Mode and a scenario with dependency mode enabled, and it re-checks dependency mode in your browser before applying — if you turn dependency mode off between the AI's call and your browser applying it, the entire dependency call is skipped rather than half-applied.
- Internal robustness: closed a latent gap where the 2001st dependency on a scenario could be applied in memory (and later make the project fail to load) — bulk and single-edge creation now both enforce the 2000-edge limit per item. No schema or simulation-engine change (`SCHEMA_VERSION` stays 23; `ENGINE_VERSION` stays 1.1.1).

## 0.54.1 — 2026-07-17

### Fixed — Schedule buffer no longer double-counts constraint waiting time

- When a scenario held a hard date constraint that forced idle working days (e.g. a *Start No Earlier Than* that parks an activity for weeks), the **Schedule Buffer** double-counted that idle time: the buffer was measured against the work content (sum of activity durations) while the Monte Carlo percentile it was compared to already included the idle span. The buffer — and the **Finish w/Buffer** date — came out too large by roughly the idle. The buffer is now measured against the schedule **span** (project start → constraint-adjusted finish, inclusive), the same duration domain as the simulation, so **Finish w/Buffer always equals the P-target row's date in the Percentile Summary**. On the reference project the buffer drops from ~37 to ~17 working days and Finish w/Buffer moves from 03/31 to 03/03.
- **New "Constraint delay" figure.** The summary card, print report, and schedule export now disclose the idle working days a scenario waits on hard date constraints (and milestone start floors in dependency mode), closing the arithmetic **Duration + Constraint delay + Schedule Buffer = Duration w/Buffer** exactly (e.g. 128 + 20 + 17 = 165). It appears only when there is idle to explain; unconstrained scenarios are visually unchanged.
- **Schedule-health (RAG) target dates** now use the same working-day conversion as the Percentile Summary (the start day counts as day 1). Previously the Green/Amber threshold dates landed one to two working days late, so a borderline health chip may shift by a step.
- **Non-working-day starts fixed.** Percentile and finish dates for scenarios whose start date fell on a weekend or holiday were computed one working day early; the conversion now advances to the effective (next working) start first.
- Presentation/compute layer only — no simulation-engine or schema change (`SCHEMA_VERSION` stays 23; `ENGINE_VERSION` stays 1.1.1). The Percentile Summary, histogram, and CDF are unchanged; the buffer and its dependent displays now agree with them. The dead `ScheduleExportButton` component (no importers) was removed.

## 0.54.0 — 2026-07-17

### Fixed — Hard "Must Finish On" / "Finish No Earlier Than" constraints now simulate finishing on the constraint date

- In Monte Carlo, a hard **Must Finish On (MFO)** or **Finish No Earlier Than (FNET)** constraint pinned the activity's finish to one working day *before* the constraint date. The deterministic schedule (and every calendar-date display) already finished **on** the date, so the two disagreed by one working day and the constrained upper percentiles were understated. The cause was an inclusive/exclusive off-by-one in the MC integer domain: finishing *on* a 0-based working-day index `f` requires the exclusive finish offset `f + 1`, but the engine used `f`.
- Fixed at all four MC constraint seams — the dependency-mode forward pass (`applyForwardConstraintInt`, MFO + FNET) and the sequential inline path (`monte-carlo.ts`, MFO + FNET) — so both scheduling modes now simulate the finish landing on the constraint date. **Start No Earlier Than / Must Start On** (which start *on* the date and were already correct) and all soft constraints are untouched.
- **Impact:** projects with a hard MFO/FNET constraint will see affected upper (constrained-tail) percentiles rise by up to one working day after re-running the simulation. Projects with no hard MFO/FNET constraint produce byte-identical simulation samples. `ENGINE_VERSION` is bumped 1.1.0 → 1.1.1 (provenance only — recorded in each simulation run for auditability). No schema change — `SCHEMA_VERSION` stays 23.

## 0.53.4 — 2026-07-16

### Added — Projected finish dates and a copy button in the Percentile Summary

- The **Percentile Summary** table (below the Monte Carlo charts) now shows a **Finish date** column beside *Duration (days)*, giving the projected calendar finish date for each percentile (P5 … P99). It uses the same working-day / holiday-aware date math as the rest of the schedule and follows your date-format preference; the P95 (target) row's date matches the "Finish w/Buffer" date on the summary card. The column appears whenever the scenario has a start date — otherwise the table falls back to the original two columns. *[Correction (0.54.1): the P95-row match with "Finish w/Buffer" held only for schedules without hard-constraint idle; the buffer was corrected to agree for all schedules in 0.54.1.]*
- The Percentile Summary now has a **copy-to-image button** in its header, matching the Distribution Histogram and Cumulative Distribution charts, so the table can be dropped into a status report or email in one click.

### Fixed — Copy-image icon on the Cumulative Distribution chart aligned with the histogram's

- The copy-image icon on the **Cumulative Distribution** chart sat lower than the one on the **Distribution Histogram**: the "Finish by" lookup row between the title and the chart pushed the icon's anchor down. Both chart copy buttons are now anchored to their panel's title row, so the two icons line up at the same height. Internally the button was lifted out of each chart component (`HistogramChart`, `CDFChart`) up to the panel in `SimulationPanel`, which also removed a duplicated positioned wrapper from both charts.
- Presentation-only. No schema change — `SCHEMA_VERSION` stays 23.

## 0.53.3 — 2026-07-16

### Changed — Per-project scenario limit raised from 20 to 50

- The maximum number of scenarios a single project may hold is now **50** (was 20), supporting workflows that add a scenario per week — e.g. a weekly snapshot of an active project — which now fit more than a year in one project. The limit is a single source of truth, `MAX_SCENARIOS_PER_PROJECT` in `src/domain/models/types.ts`, consumed by the Zod `ProjectSchema.scenarios` cap, the store's create-time guards, and the UI messaging.
- **Create-time enforcement added.** Previously only the *load/import* path validated the cap (`ProjectSchema.safeParse`); the "+" (add) and clone actions were unguarded, so a project could exceed the limit in memory and then fail to load on the next session. `duplicateScenario` and `importScenarioToProject` now no-op at the cap, and the add/clone handlers surface a toast — the invariant now holds at the mutation layer, not only at load.
- Storage impact is negligible for typical projects: a ~20-activity scenario is ~8 KB with simulation samples stripped (the local-mode default), so 50 such scenarios ≈ 0.4 MB — well under both the browser localStorage quota and the Firestore 1 MB document limit. No schema shape change — `SCHEMA_VERSION` stays 23; no migration required.

## 0.53.2 — 2026-07-15

### Fixed — Gantt PDF report shows more of each activity name

- The **printed/PDF Gantt chart** truncated activity and section-band names with an ellipsis well before the name column was full — e.g. "Respond to Vendor Questions" became "Respond to Vendor Questi…" — leaving roughly a third of the column's width unused. The cause: the print name-column character limit was a hardcoded per-width constant (26 at the default column) calibrated for a ~12px font, but print names render at ~7px, so the cap truncated at about two-thirds of the column's real character capacity.
- The print limit is now **derived from the column's pixel width and the actual print font size** (`floor((printLeftMargin − PRINT_NAME_EDGE_PAD) / (fontSize × 0.6))`, reusing the 0.6 average-glyph-advance factor the Gantt bar-label fit checks already use) instead of a fixed constant. At the default column this raises the limit from 26 to 38 characters, so "Respond to Vendor Questions" and "Vendor Evaluation & Ranking" (27 chars) now print in full and only genuinely over-long names are ellipsized. It scales automatically with the name-column-width and activity-font-size settings (narrow 18→26, wide 36→52 at the default font). By construction `limit × glyph-advance ≤ column width`, so a right-anchored label can't overflow into the bars.
- Print-only and layout-preserving: the name-column width and the timeline plotting area are unchanged, so charts for long (multi-year) timelines keep exactly the same date resolution — names simply grow leftward into the already-reserved column space. The interactive on-screen Gantt is untouched (its limit was already calibrated to its column). No schema change — `SCHEMA_VERSION` stays 23.

## 0.53.1 — 2026-07-15

### Changed — Clearer message when a project can't be shown

- The `/project/:id` screen shown when a project isn't in your list — after you delete it, when it's un-shared or removed on another device, or when an old link no longer resolves — no longer reads "Project not found." That 404-style wording implied a failed search or an error, which was jarring right after a deliberate delete. It now reads "This project is no longer available." with a one-line explanation ("It may have been deleted or is no longer shared with you.") above the existing "Back to projects" link.
- Presentation-only: a copy/markup change to a single fallback branch in `ProjectPage.tsx`, plus light dark-mode styling. No data-model, routing, or behavior change; the delete flow and the fallback's trigger conditions are untouched. No schema change — `SCHEMA_VERSION` stays 23.

### Added — AI Privacy Notice link in the footer

- The persistent footer now includes an **AI Privacy Notice** link, between *Privacy Policy* and *License* (`SPERT® Suite | Terms of Service | Privacy Policy | AI Privacy Notice | License`), pointing to the suite-wide notice at `https://spertsuite.com/ai-privacy`. The link belonged with the **Connect AI** feature (v0.51.0) — it already appears in the Connect AI consent dialog — but was omitted from the footer at the time. This matches the footer treatment already shipped in SPERT Story Map.
- Presentation-only: one `<a>` added to `Layout.tsx`, reusing the existing `AI_PRIVACY_URL` constant (`@app/ai-connectivity-constants`). No schema change — `SCHEMA_VERSION` stays 23.

## 0.53.0 — 2026-07-14

### Fixed — Degenerate (zero-uncertainty) estimates are now a valid, non-crashing input

- **A three-point estimate where `min === mostLikely === max` now schedules and simulates cleanly** instead of silently breaking. `TriangularDistribution` (the default distribution) alone threw on a zero-width estimate; `Normal`, `LogNormal`, and `Uniform` already treated it as a point mass. `TriangularDistribution` now handles its own degenerate case the same self-contained way — a point mass at the constant, with `cdf(a) = 1`, `variance = 0`, and (critically) **the same one RNG draw per sample** as before, so no existing seeded simulation changes. This fixes both the "fixed-duration activity" case (e.g. a 7-day cruise) and the "lay out all activities/dependencies before estimating" workflow (new activities default to `1/1/1`), which previously produced a blank Gantt with no error. Backward compatible: any saved project that contained such an activity — and could not be scheduled at all — now works. No schema change (`SCHEMA_VERSION` stays 23); no `ENGINE_VERSION` bump.

### Fixed — Schedule/simulation failures are now visible everywhere they can occur

- Generalized the schedule/simulation catch sites so **any** computation failure surfaces a human-readable message instead of a silent `null` or an uncaught exception: the sequential schedule hook, the dependency-mode schedule memo, the manual **Run Simulation** handler (toast), auto-run (developer `console.warn`, deliberately no user toast for the background feature), the **Scenario Comparison** table (per-scenario caveat), and **Schedule Export** (toast). `createDistributionForActivity` now wraps **all four** distribution types' construction errors with the offending activity's name, so a bad row (e.g. a `min > max` order violation reaching the engine via the edit modal or an imported file) is identifiable.
- **Calendar-error classification fixed and centralized.** A single shared `isCalendarError` predicate in `work-calendar.ts` now recognizes **both** calendar-throw shapes — the `CalendarConfigurationError` instance (all-non-working-week) *and* the plain `Error` iteration-limit throw (`addWorkingDays`/`subtractWorkingDays`/`countWorkingDays`, e.g. an impossible date range or an excessive-holiday run) — so both get the calendar-specific banner heading and advice. The AI-snapshot classifier now reuses this same predicate instead of a private copy.
- `criticalPathIds` (critical-path highlighting) and the Gantt uncertainty-shading memo are **deliberately** left as safe silent computations, documented in-code: each shares its exact failure condition with an already-generalized sibling, so the error banner is already shown whenever either would fail (for any well-formed scenario). Also fixed a stale CSV-import warning message/comment that said "normal" while the code uses the configured default (`triangular`).
- ~20 new/updated tests (degenerate `TriangularDistribution` behavior incl. the `cdf(a)=1` boundary and the in-progress/truncated-sampling seam; the `isCalendarError` two-shape predicate; factory name-wrapping; a "one bad row fails the whole schedule, visibly" regression). No new source or test files.

## 0.52.1 — 2026-07-13

### Changed — Constraint column visibility in sequential mode

- The activity grid's **Constraint** column now appears in sequential mode (dependency mode off) as soon as **at least one activity carries a scheduling constraint** (`constraintType`), instead of only when dependency mode is on. Previously a constraint set while in sequential mode was invisible in the grid — discoverable only via the Gantt chart or the activity edit modal — even though the sequential deterministic scheduler already honors it (and already computed the same conflict/warning data used for the badge). Once the column is shown, each row's cell behaves as it does in dependency mode: a badge for constrained activities and a clickable "—" affordance to add one on the rest.
- Dependency mode is unchanged — the column always shows there, even with zero constraints. When no activity has a constraint, sequential mode still hides the column and the freed 80px track flows back into the (1fr) Name column, exactly as before. Visibility is now gated on `dependencyMode || hasAnyConstraint(activities)`.
- Purely presentational: no data-model, persistence, or scheduling-logic change. Scoped to `UnifiedActivityGrid`, `UnifiedActivityRow`, and `BandHeaderRow` plus a new `shouldShowConstraintColumn`/`hasAnyConstraint` helper pair. 8 new unit tests (1,886 → 1,894 across 86 files); all pass. No schema change — `SCHEMA_VERSION` stays 23.

## 0.52.0 — 2026-07-12

### Added — Activity Description field

- **New optional `description` on activities.** A plain-language summary of what an activity entails, distinct from `notes`: Description is the shareable "what this activity is" you'd want to read back or hand off months later; Notes remains the private catch-all (risks, jottings). Tasks and Deliverables still cover structured breakdowns — Description covers "just a sentence or two."
- **Editable in the activity edit modal**, General section, in a full-width compact 2-row textarea directly below the Name/Status row (2000-char cap with a live counter). Like renaming or re-estimating, editing a description **invalidates simulation results** (Notes/checklist/deliverables deliberately do not) — a conscious trade, since Description is schedule-shareable content.
- **Exports:** Description is a new right-edge column in the CSV and Excel schedule exports (before the `Type` column), and renders as its own section in the printable PDF report. In Excel, the Description column and the previously-single-line Task Details / Deliverable Details columns now wrap. Both formatters now share a single header builder, and the XLSX `lastCol` is derived from the header count so column math can't drift.
- **Connect AI:** `scheduler_create_activity` accepts an optional `description`, and a new **`scheduler_set_activity_description`** tool (the suite's 17th `scheduler_*` tool) overwrites it — an empty string clears it; setting it invalidates simulation results. Truncated Read-Mode snapshots flag activities that already have a description with `hasDescription: true` so the assistant knows not to blind-overwrite. The shared `spert-suite` MCP server was bumped to `1.6.0`.
- **Schema:** `SCHEMA_VERSION` **22 → 23** (pure `schemaVersion` relabel — the field is optional with no default; the bump activates the future-version guard so up-to-date-guarded clients refuse a v23 document rather than silently stripping `description`).
- **Not in v1 (deferred):** CSV *import* of Description (an unknown "Description" column is silently ignored — see SD-3), a grid indicator, a results-staleness affordance, and Notes-in-exports. All by design.

## 0.51.1 — 2026-07-10

### Added — Connect AI Guide on the About page

- The About page now links a downloadable **Connect AI Guide** (PDF), alongside the existing Quick Reference Guide, for a printable walkthrough of pairing an AI assistant with a project through the Connect AI feature shipped in v0.51.0. Mirrors the equivalent guide link on SPERT Story Map's About page.
- Presentation-only: adds the `public/SPERTScheduler_Connect_AI_Guide.pdf` asset and one new section in `AboutPage.tsx` (same markup and styling as the adjacent Quick Reference Guide section; opens in a new tab). No runtime dependency or data schema is affected; all 1,855 tests pass. No schema change — `SCHEMA_VERSION` stays 22.

## 0.51.0 — 2026-07-05

### Added — Connect AI (read and edit a live project from an AI assistant)

- **New "Connect AI" feature.** An external AI assistant can now read and modify the project you have open in the browser, through the shared SPERT Suite MCP (Model Context Protocol) server. The app itself never calls an AI API — it only drains operation documents the AI writes into a per-browser-session Firestore document tree, and writes back a read-only snapshot of current project state for the AI to read. This mirrors the AI Connectivity feature already shipping in SPERT Story Map, extended to Scheduler's richer, validation-sensitive data model (three-point estimates, distribution types, the dependency graph, milestones, and Monte Carlo simulation results).
- **How connecting works.** Opening Connect AI creates the session document tree and shows a pairing code (word·number, e.g. `NEITHER·4983`). You give the code to your AI client; the paired browser applies each incoming operation **in order** through the app's own existing pure state-mutation functions, so every AI edit passes the same validation as a manual edit. A live feed shows each applied operation as it lands; Disconnect tears the session down.
- **Two-tier consent (matches Story Map's shipped model).** A consent modal gates the initial connection. Read Mode exposes only the read-only snapshot; Write Mode is required before any mutation is applied.
- **What the AI can do (v1).** Create activities; rename them and change their three-point estimate, confidence level, and distribution type (these invalidate simulation results — distribution auto-recommendation applies only at create time). Append notes, add checklist and deliverable items, and toggle existing checklist/deliverable items (these do not invalidate results). Create milestones, edit milestone name/target date, and assign or unassign an activity. Create, remove, and update dependency edges — this requires the target scenario's dependency mode to already be enabled by you. A whole AI batch applies as a single undo frame.
- **What the AI cannot do (v1), by design.** Delete activities, milestones, scenarios, or projects (dependency-edge removal is the single deletion-shaped exception); create or clone scenarios; edit scheduling constraints; change activity status or actual duration; write scenario settings (dependency-mode and lock state are read-only inputs only); reorder activities or edit band structure; or trigger simulation runs.
- **Both local-only and cloud-synced projects are supported from day one.**
- 136 new tests (1,719 → 1,855 across 86 files); all pass. No schema change — `SCHEMA_VERSION` stays 22. The feature relies on the shared MCP server and a Firestore rules update, both already deployed to the `spert-suite` Firebase project.

## 0.50.1 — 2026-07-03

### Fixed — cloud future-version guard (closes the v0.50.0 known limitation)

- The Firestore load paths now guard against documents written by a **newer** app version, mirroring local storage's existing `future_version` check. Previously (per the v0.50.0 known-limitation note below) an out-of-date client would load such a project with unknown fields silently stripped by Zod, and its next save could write the stripped object back over the newer document for every sharer.
- All three driver paths are guarded: `loadAll()`/`processProjectDoc()` classify future-version documents into a new error channel (`{ projects, errors }` return shape) instead of loading them; `load(id)` returns `null` with a console warning (no production callers — API-consistency hardening); `subscribeToProject()` gains an `onFutureVersion` callback so a mid-session snapshot from a newer client is intercepted before it reaches the store — it is deliberately distinct from `onError`, which carries SDK failures and drives the permission-denied eviction.
- Detection **prevents** the corruption rather than just naming it: the affected project is evicted from the in-memory store (`removeProjectLocally`), which structurally blocks any later save — the sync-bus save handler looks projects up by id, so an absent project can never be written. Its pending debounced save is cancelled, and a mid-session detection also unsubscribes the project's live snapshot listener (the success-path analogue of the sync-bus delete branch's teardown; unlike permission-denied, the stream is still alive and must be explicitly ended). Evictions at both `loadAll()` call sites run *before* the zero-projects data-loss guard, which now evaluates the post-eviction list, and error reporting runs *after* `setProjects` on every exit path (setProjects resets `loadErrors` as a side effect of its write).
- Affected projects appear in the dashboard's load-error banner labeled "Newer version" with guidance to update the app. The banner's Export/Delete recovery buttons are suppressed for `future_version` errors in **both** storage modes — the project isn't damaged, and those actions operate on local storage anyway. Mid-session detections additionally show a one-time toast (deduped per project per session); load-time detections rely on the banner alone — a deliberate asymmetry, since the banner is already on-screen after a load.
- `LoadError` gains an optional `source: "local" | "cloud"` field (absent = local; all existing local construction sites unchanged). New store actions: `setCloudLoadErrors` (replaces only the cloud-sourced subset; also called with `[]` on cloud-sync teardown so stale entries don't linger past sign-out or a mode switch) and `upsertCloudLoadError` (source-aware single-entry upsert). `loadProjects()` now preserves cloud-sourced errors — it runs on every dashboard mount in both modes, and its previous wholesale `loadErrors` replace would have silently wiped the banner entries with nothing to restore them.
- Scope correction, documented in ARCHITECTURE.md: the v0.50.0 note overstated one detail. A stale client's `mergeFields`-based save never touched a genuinely new *top-level* field it didn't know about (e.g. `forcedWorkDays`) — `mergeFields` lists only keys present on the saving client's own object. The real exposure was fields nested inside existing top-level structures (`scenarios` holds most schema evolution) plus the `schemaVersion` relabel a stale save performs. That relabel is also why a standing invariant is now documented in `migrations.ts`: migrations must stay add-if-missing idempotent, because a document's reported `schemaVersion` can undercount the fields it actually contains.
- 11 new tests (1,708 → 1,719 across 83 files); all pass. `use-cloud-sync-create.test.ts`'s driver mock updated for the new `loadAll` shape, plus TC-5 (initial-load eviction + banner-entry-survives-`setProjects` ordering regression guard) and TC-6 (mid-session wiring: unsubscribe, cancel, evict, report, single toast, dedup). No schema change — `SCHEMA_VERSION` stays 22.

## 0.50.0 — 2026-07-03

### Added — override company holidays per project (forced work days)

- A project can now mark a date that is a holiday **only because of the global (company-wide) calendar** as a working day for that project. Project-added holidays remain absolute and can never be overridden.
- New `forcedWorkDays?: string[]` field on `Project` (schema v21 → v22 migration, defaults to `[]`). `isWorkDay` resolves forced work days first; the "project holidays are never overridable" guarantee is enforced by an assembly-time filter in `buildWorkCalendar()`, which now also merges global + project holidays internally (single supply point for project holidays). `mergeCalendars` no longer has production call sites but is kept as a tested pure helper.
- The Converted Work Days panel on the Calendar page is now a unified work-day override editor (`WorkDayOverrideEditor`, renaming `ConvertedWorkDaysEditor`): one date field and one chip list handle both weekend conversions and holiday overrides. Adding a company-holiday date raises an inline confirm banner (focus management, Escape-to-cancel, `role="status"`/`aria-live`); when exactly one multi-day holiday matches, a "Convert all N days" button converts only dates where the holiday is the sole reason they're non-work — weekends inside a shutdown range are never silently forced — in one click, one undo frame (`setForcedWorkDays`).
- Chips now show live status computed from `isWorkDay`, not array membership: an entry that is no longer an effective work day (a holiday landed on it later) renders grayed with an explanatory tooltip, and the one recoverable case — a converted day now shadowed by a *global* holiday — offers an inline "Convert to forced override" upgrade (atomic `upgradeToForcedWorkDay`, single undo frame).
- Five new store actions: `setForcedWorkDays`, `addForcedWorkDay`, `removeForcedWorkDay`, plus atomic `removeWorkDayOverride` (chip removal clears both arrays in one call) and `upgradeToForcedWorkDay`. Project clone copies the new field; export/import and cloud sync carry it with no special-casing. New pure helper module `classify-work-day-override.ts` (add routing, chip status, holiday matching, bulk eligibility) keeps the editor's decision logic unit-tested.
- **Fixed (pre-existing):** with auto-run enabled, the simulation now re-runs when calendar inputs change. The debounced auto-run effect read the work calendar without depending on it, so converted-work-day and project-holiday edits (and now forced work days, global calendar, and work-week changes) left stale results on screen until an unrelated edit.
- **Known limitation (pre-existing pattern for every schema addition, stated for transparency):** in cloud mode, an out-of-date client (schema ≤ 21) that loads and re-saves a project written at schema 22 silently drops `forcedWorkDays` for all sharers — the Firestore load path migrates only older documents and has no future-version guard (unlike local storage). Documented in ARCHITECTURE.md; fixing the general gap is a separate task.
- 46 new tests (1,662 → 1,708 across 83 files); all pass. Zero existing tests changed — the new `buildWorkCalendar` options parameter is backward-compatible by construction.

## 0.49.10 — 2026-06-29

### Improved — full activity names in the Dependencies panel

- The Dependencies panel no longer truncates linked activity names at a fixed 180px width with an ellipsis — each predecessor and successor name now displays in full.
- On a wide panel the names sit on a single line; on a narrow panel the predecessor → successor pair wraps to separate lines, each name kept whole (word-wrapped) rather than clipped. The hover-revealed type/lag/remove controls stay right-aligned.
- Presentation-only change in `DependencyPanel.tsx`; no runtime dependency or data schema is affected, and all 1,662 tests pass.

## 0.49.9 — 2026-06-28

### Maintenance — lift the dependency-schedule calendar error out of render

- Refactored `ProjectPage` so the dependency-mode schedule's `CalendarConfigurationError` is **derived** rather than set during render. The schedule `useMemo` now returns `{ schedule, calendarError }` purely; the displayed error is derived from that result in dependency mode, or from the sequential `useSchedule` state otherwise (the two paths stay mutually exclusive on `dependencyMode`).
- Removes the two `react-hooks/set-state-in-render` `eslint-disable` comments added in v0.49.6 — the anti-pattern is eliminated, not suppressed — without introducing a `set-state-in-effect` (the value is derived, not synced through an effect). The ESLint baseline is unchanged at 23 problems (17 cognitive-complexity + 6 set-state-in-effect).
- Behavior is identical: a `CalendarConfigurationError` still surfaces its message in the schedule banner and a successful recompute still clears it. No runtime dependency or data schema is affected; all 1,662 tests pass.

## 0.49.8 — 2026-06-28

### Maintenance — soak-currency dev-dependency minors

- **eslint-plugin-sonarjs 4.0.2 → 4.0.3**, **fast-check 4.6.0 → 4.7.0**, **globals 17.4.0 → 17.5.0** — soaked minor updates to development/test tooling. Lint findings unchanged, all 1,662 tests pass. No runtime dependency or data schema affected.
- Closes the v0.49.4–0.49.8 dependency-upgrade campaign (Node 24 LTS, TypeScript 6, ESLint 10, Vitest/Stryker, and security advisory cleanup).

## 0.49.7 — 2026-06-28

### Maintenance — test toolchain (Vitest 4.1.5 + Stryker 9.6.1)

- **vitest 4.1.2 → 4.1.5** and **@vitest/coverage-v8 4.1.2 → 4.1.5** (atomic; exact-peer pinned).
- **@stryker-mutator/core, /vitest-runner, /typescript-checker 9.6.0 → 9.6.1** (atomic cluster).
- Test/mutation toolchain only; all 1,662 tests pass and the Stryker dry run is green under TypeScript 6 + ESLint 10. No runtime dependency or data schema affected.

## 0.49.6 — 2026-06-28

### Maintenance — ESLint 9 → 10 + react-hooks 7.0.1 → 7.1.1

- **eslint 9.39.4 → 10.2.1**, **@eslint/js 9.39.4 → 10.0.1**, **eslint-plugin-react-hooks 7.0.1 → 7.1.1** (atomic upgrade; sonarjs, react-refresh, and typescript-eslint all already admit ESLint 10).
- react-hooks 7.1.1 adds stricter rules (`refs`, `set-state-in-render`) and broader `set-state-in-effect` detection. Existing intentional patterns (latest-value ref latches, a schedule-error `useMemo`) are annotated with scoped `eslint-disable` comments, and a previously misplaced disable in the print Gantt chart was corrected. No application behavior changed.
- Tooling-only change; no runtime dependency or data schema is affected.

## 0.49.5 — 2026-06-27

### Maintenance — TypeScript 5.9.3 → 6.0.3

- **typescript 5.9.3 → 6.0.3** — major compiler upgrade. typescript-eslint 8.59.1 already admits TS 6 (peer `<6.1.0`), so linting is unaffected.
- **tsconfig migration for TS 6:** removed the deprecated `baseUrl` option (slated for removal in TS 7) and made the `paths` targets relative. Module resolution is unchanged; the app/test path aliases are defined independently in `vite.config.ts`.
- Build-time-only change; no application code, runtime dependency, or data schema is affected.

## 0.49.4 — 2026-06-27

### Security — production advisory cleanup + Node 22 → 24 LTS adoption

- **firebase 12.11.0 → 12.12.1** — clears the protobufjs CRITICAL RCE advisory chain and the @grpc/grpc-js HIGH advisory.
- **react-router-dom 7.13.2 → 7.15.1** — clears 5 react-router advisories (HIGH RCE, 2 HIGH DoS, 1 moderate, 1 low CSRF); the server-mode vectors are unreachable in this client-only SPA.
- **react / react-dom 19.2.4 → 19.2.5** — soaked maintenance release.
- **tailwindcss / @tailwindcss/vite 4.2.2 → 4.2.4** — soaked lockstep pair.
- **jsdom 28.1.0 → 29.1.0** — soaked major test-environment upgrade (60 days).
- **undici HIGH cleared by the dependency regen** — re-resolves to the patched 7.28.0.
- **Node 22 → 24 LTS** — engines.node, .nvmrc, and @types/node 22.19.15 → 24.12.2.
- **4 advisories remain, all dev/build-time only:** two Windows-only Vite issues and a related Windows-only esbuild issue (all cleared by the deferred Vite 7.3.x bump, ~2026-07-31), plus the exceljs → uuid moderate (fixable only by a breaking exceljs downgrade). None reach the production bundle.

## 0.49.3 — 2026-06-19

### Security — upgrade vite 7.3.1 → 7.3.2 to close three dev-server advisories

A targeted dependency security update: it bumps the `vite` build/dev toolchain from 7.3.1 to 7.3.2 — the smallest move that closes three published advisories — and changes nothing else. `vitest` stays at 4.1.2, and no application code, runtime dependency, or data schema is touched.

- **GHSA-p9ff-h696-f583 (High) — arbitrary file read via the dev-server WebSocket.** Reported against 7.3.1; no longer present in vite's advisory set on 7.3.2.
- **GHSA-v2wj-q39q-566r (High) — `server.fs.deny` bypass via crafted query strings.** Closed by 7.3.2.
- **GHSA-4w7w-66w2-5vf9 (Moderate) — path traversal in optimized-deps `.map` requests.** Closed by 7.3.2.
- **Two Windows-only advisories remain deferred by design.** GHSA-fx2h-pf6j-xcff and GHSA-v6wh-96g9-6wx3 are fixed in vite 7.3.5, which has not yet cleared the project's 60-day fresh-release window; they are scheduled for a follow-up around 2026-07-31. Vite is a dev/build-time dependency, so neither advisory reaches a production bundle.
- No runtime dependencies changed and no `npm audit fix` was run; the pre-existing production-dependency advisories (firebase/react-router-dom/exceljs transitive chains) are tracked separately and out of scope here. All gates pass with zero regressions: 1,662 tests, the production build, and the 18-error/1-warning lint baseline are all unchanged.

## 0.49.2 — 2026-06-10

### Improved — export filenames now include a time-of-day stamp

Every file the app exports now carries a `THH-MM-SS` time qualifier after the date (e.g. `spert-scheduler-My Project-2026-06-10T15-48-30.json`), so when several exports land in the same folder on the same day, the latest one is obvious at a glance.

- **Everywhere a file is downloaded:** the per-tile single-project export, Settings → Export Projects, Settings → Schedule Export, the dashboard Export All and corrupted-project recovery exports, and the project-page schedule (XLSX/CSV) and simulation-results (CSV) exports.
- The time is local wall-clock time and uses hyphens instead of colons, so filenames stay valid on Windows/macOS/Linux. (New `formatExportTimestamp` in `core/calendar/calendar.ts` is the single source of truth.)

## 0.49.1 — 2026-06-10

### Added — one-click project export from the dashboard

Hover any project tile on the dashboard to reveal a new download icon (the first of the four icons in the tile's bottom-right corner). A single click exports that one project as a JSON backup — no trip to Settings → Export Projects.

- **Per-tile export.** The download icon appears on hover/focus, styled and behaving like the tile's other corner icons, in both local and cloud mode and for archived projects too.
- **Self-identifying filename.** Exports are named `spert-scheduler-<project name>-<date>.json` so each download is easy to attribute to a project (and to this app).
- **Same format as the Settings export.** A single-project JSON envelope that re-imports normally; simulation results are excluded to keep the file small (the Settings export default), and global preferences are never bundled. (`ProjectTile.tsx`, `ProjectsPage.tsx`, `export-filename.ts`)

## 0.49.0 — 2026-06-10

### Improved — smarter forecasts for in-progress activities (conditional Monte Carlo sampling)

When an activity is in progress, the simulation now uses what it has actually observed — that the activity has already run for its elapsed time and isn't finished yet — instead of sampling as if it hadn't started. Previously a long-running in-progress activity could keep forecasting "almost done" no matter how far it overran (the classic "90%-done-for-three-weeks" problem); now the forecast conditions on elapsed time and shifts realistically.

- **Left-truncated sampling.** Each in-progress activity's Monte Carlo draws are now conditioned on "duration > elapsed-so-far," so the P95 and the schedule buffer widen honestly as an activity slips — while the deterministic schedule and your published dates stay anchored to the plan.
- **No more finishing in the past.** With Parkinson's Law turned off, an in-progress activity can no longer draw a duration shorter than the time it has already consumed.
- **Model-exhaustion signal.** When an in-progress activity has run so long that its original estimate carries essentially no remaining information, the simulation flags it (recorded on the run as `modelExhaustedActivityIds`) rather than inventing a precise number — a prompt to re-estimate or split that activity. The simulation engine version advances to 1.1.0.
- Planned and complete activities, and all existing percentiles for projects without in-progress activities, are unchanged. (`truncated.ts`, `monte-carlo.ts`, distribution `cdf` additions)

### Fixed — dependency-mode constraints in the synchronous simulation fallback

If the Web Worker failed to start and the app fell back to running the simulation on the main thread, dependency-mode runs silently ignored hard scheduling constraints (MSO/SNET/MFO/FNET), producing different percentiles than the normal worker path. The fallback now applies the same constraints as the worker. (`simulation-service.ts`)

## 0.48.0 — 2026-06-04

### Improved — redesigned project tiles on the dashboard

The project cards on the dashboard got a ground-up interaction and visual refresh, borrowing idioms from across the SPERT Suite (Story Map's grabbable cards, Forecaster's share/trash icons, MyScrumBudget's tile tint).

- **Grab anywhere to reorder.** The whole tile is now the drag surface — the small dotted drag handle is gone. A single click still opens the project; a deliberate drag (8px threshold) reorders it. Drag is mouse-only by design.
- **Keyboard-openable.** The project name is now a focusable button — Tab to it and press Enter or Space to open the project.
- **Corner action icons.** The **trash** icon is always visible in the top-right. The **share**, **archive/unarchive**, **clone**, and **color-picker** icons reveal on hover (or keyboard focus): archive/clone/color at the bottom-right, share at the bottom-left.
- **Standard delete confirmation.** Deleting a project now routes through the app's Radix `ConfirmDialog` (dark-mode aware) instead of the blocking native `window.confirm()` pop-up.
- **Share from the dashboard.** A new Share icon (shown only in cloud mode for projects you own) opens a sharing dialog directly on the dashboard, wrapping the existing Sharing panel — no need to open the project first.
- **Whole-tile color tint.** Choosing a tile color now washes the entire card with a soft, theme-aware tint of that color in addition to the existing colored left edge. The color picker moved to the bottom-right of the tile. (`ProjectTile.tsx`, `ShareProjectModal.tsx`, `TileColorPicker.tsx`, `SharingSection.tsx`, `ProjectsPage.tsx`, `canShareProject.ts`)

## 0.47.6 — 2026-06-04

### Improved — Gantt tooltips now wait for you to settle before appearing

Hovering around the Gantt chart no longer makes tooltips flicker up and chase the cursor as you sweep across bars, the finish-target line, and dependency arrows.

- **Hover-intent delay.** A tooltip now appears only after the cursor has rested on the same element for **1.5 seconds**. Previously tooltips appeared instantly on mouse-enter and repositioned on every move, so moving across the chart popped a constant stream of tooltips.
- **Sweeping shows nothing.** Moving the cursor across the chart cancels each pending tooltip the moment you leave an element, so quick passes never surface a tooltip — you only see one when you deliberately pause on something.
- **Unchanged once shown.** After the delay elapses, the tooltip still follows the cursor while you stay on that element, and the dependency-arrow highlight remains instant for responsive visual feedback. (`GanttChart.tsx`)

## 0.47.5 — 2026-06-03

### Improved — resizable, taller Notes box in the Activity edit modal

The **Notes** field in the Activity edit modal (the modal that opens when you click a Gantt bar or an activity's edit pencil) is now easier to work with for longer notes.

- **Taller by default.** The box now opens at 5 lines instead of 3, showing two more lines of text without scrolling.
- **Drag to resize.** A native grab handle in the bottom-right corner lets you drag the box taller (vertical only) — the same handle style used elsewhere in the SPERT Suite. Because the resize is handled by the browser, releasing the mouse anywhere — even outside the modal or window — completes the resize cleanly.
- **Won't shrink below the default.** A `min-height` floor equal to the 5-line open size means you can grow the box but never drag it smaller than how it opens. (`ActivityEditModal.tsx`)

## 0.47.4 — 2026-06-02

### Fixed — Firestore `serverTimestamp()` write-path: corrected guard comments/test (internal) + Cloud Function timestamp consistency

Internal correctness and data-quality hardening around the `updatedAt` server timestamp written to `spertscheduler_projects` documents. No user-facing behavior change in the app itself.

- **Corrected the v0.45.9 guard documentation and regression test.** The comments in `firestore-driver.ts` and the regression test in `firestore-driver.test.ts` claimed the Firebase **client** SDK `serverTimestamp()` sentinel has no enumerable own properties and that the recursive `sanitizeForFirestore` pass degrades it to `{}`. That is not true for the installed SDK (firebase 12.11.0): the sentinel has an **enumerable `_methodName` property**, so the sanitizer rebuilds it as the plain map `{ _methodName: 'serverTimestamp' }` — the exact shape that leaked into production project documents before v0.45.9 moved the sentinel to a post-sanitize sibling key. Comments now describe the real shape, and the test fixture uses the real production sentinel shape so the guard fails loudly (via reference-equality) if the sentinel is ever run back through the sanitizer. **No behavioral change to the save path** — all three current write paths (`create`, `doSave`, `migrateLocalToCloud`) were already correct. (`firestore-driver.ts`, `firestore-driver.test.ts`)

- **Cloud Function timestamp consistency (separate repo, deployed).** The suite's `claimPendingInvitations` Cloud Function was writing `updatedAt: Date.now()` (a plain JS number) to `spertscheduler_projects` when a user claimed a project invitation — inconsistent with the Firestore `Timestamp` written by every other path. It now writes `FieldValue.serverTimestamp()`, so all live write paths to the collection produce a consistent `Timestamp`. This function lives in the SPERT Suite Cloud Functions and has been deployed to the `spert-suite` project. Combined with the admin-tool patch of the existing pre-v0.45.9 sentinel documents, the collection is consistent end-to-end.

## 0.47.3 — 2026-05-28

### Fixed — local-mode projects and preferences reset on app reopen (v0.47.0–v0.47.2 regression)

In localStorage mode with Firebase configured, project data and user preferences could be reset when the app was reopened. The trigger was on the page-load auth path, not a sign-out: the `onAuthStateChanged(null)` callback — which Firebase fires on every page load to resolve the initial auth state — was calling `runSignOutCleanup()` unconditionally, including on the initial load when no user had ever signed in. At that moment `StorageProvider`'s namespace `useEffect` had not yet run (it guards on `authLoading`), so the active namespace was still `"local"`. The cleanup then deleted all `spert:project:local:*` localStorage keys (projects), wiped all user preferences (theme, default trial count, distribution type, confidence level, activity and project targets, heuristic settings, dependency mode, Parkinson's Law toggle, calendar configuration, and RAG thresholds), and cleared per-project scenario memory.

The else-branch cleanup was introduced in **v0.47.0** (audit finding E1-3) to clear residue after an externally-revoked session, but it was never gated for the initial-load null callback. The `wasSignedIn` flag added in v0.47.2 gated the recovery toast but not this cleanup call.

- **Fix.** The cleanup call is now gated on `hadSession` — whether a non-null Firebase user was observed this page load. Genuine sign-out events (deliberate sign-out, ToS-mismatch forced sign-out, and externally-revoked credentials) are unaffected, and the v0.47.0 E1-3 hardening for revoked sessions is preserved: in-session revocation still has `wasSignedIn === true` and still runs cleanup. The only skipped case is "never signed in this page load," where there is no signed-in residue to clear. (`AuthProvider.tsx`)

This regression affected local-mode reopens between **v0.47.0 (2026-05-26) and v0.47.2 (2026-05-28)**. Cloud-mode users (whose data lives in Firestore) and deployments without Firebase configured were never affected. Data already reset is not recoverable from localStorage; if you previously used **Export All Projects**, your `.json` export file is the recovery path.

Regression tests added: 2 in `AuthProvider.test.tsx` — TC-5 (Path 4 / initial load does NOT call cleanup) and TC-6 (Path 3 / post-sign-in revocation still does). A test-only `_resetSignOutFlagsForTests()` export ensures test-order independence.

## 0.47.2 — 2026-05-28

### Changed — surface the sign-out local-cache wipe to the user

When you sign out of cloud storage, SPERT Scheduler wipes the locally-cached copy of your cloud projects from this browser profile (v0.42.6 M4 hardening — prevents a shared device from leaking your data to the next user). Until now, this wipe was completely silent across all three sign-out paths: deliberate sign-out, ToS version mismatch, and externally-revoked credentials (token expiry). A user who hadn't seen the auth event would return to an empty project list and reasonably conclude their data was lost.

This release adds two complementary user-facing signals.

- **Deliberate sign-out (Path 1).** The auth chip's Sign Out action now opens a confirmation modal explaining that locally-cached projects on this device will be removed and that the cloud-side data is unchanged. Cancel is default-focused (the non-destructive choice), matching the precedent set by `KeepOrDiscardLocalModal`. Confirming proceeds with the existing sign-out flow unchanged. (`SignOutConfirmModal.tsx`, `StorageLoginModal.tsx`)

- **ToS mismatch or externally-revoked credentials (Paths 2 & 3).** If the user's session ends without them having clicked Sign Out (token expiry, server-side revocation, forced sign-out from a ToS version bump), a **persistent** info toast now fires explaining what happened and that signing in again restores everything from cloud storage. The toast does not auto-dismiss — the default 3-second toast duration is too short for a 150+ character explanation of an empty project list. The user must dismiss it explicitly. The toast is suppressed for fresh page loads where no user was ever signed in (no surprise to explain). Classification is via two module-level flags in `AuthProvider`: `expectedSignOut` (set when the app initiates sign-out) and `wasSignedIn` (set when any authenticated user has been observed this session). The toast fires only when `wasSignedIn && !expectedSignOut`. (`AuthProvider.tsx`)

The wipe itself is unchanged — the v0.42.6 security guarantee is preserved. The only difference is that the user is now informed.

Regression tests added: 4 in `SignOutConfirmModal.test.tsx` (render + Cancel/Sign-out button behavior + default focus on Cancel) and 4 in `AuthProvider.test.tsx` (one TC per observable sign-out transition — Path 1 / Path 3 / initial-load-null — plus an explicit duration: 0 lock against future "normalize all toast durations" refactors). Total tests: 1583 → 1591.

## 0.47.1 — 2026-05-27

### Fixed — cloud storage create/delete races

- **Add Project race (critical, user-reported).** In cloud storage mode, creating a new project produced a "A project was removed because you no longer have access" toast followed by a "Project Not Found" screen. Root cause: `addProjectListener` was called synchronously in the `"create"` branch of the sync-bus handler, before `driver.create()` resolved. The Firestore SDK sends the listen request and the `setDoc` request as independent operations; the listen frequently reached the server first. The `get` rule evaluated against a null `resource` (doc not yet created) → `permission-denied` → the v0.45.3 eviction path fired (`cancelPendingSave` + `removeProjectLocally` + the "no access" toast). The fix moves `addProjectListener` into the `.then()` callback of `driver.create()`, aligning the create path with the `loadAll` and `spert:models-changed` paths, which already gate listener attachment on a confirmed Firestore read.

- **Zombie reappear on delete — two paths closed.** A deleted project could reappear in the UI under two distinct timing conditions:
  - *Path A (loaded project + concurrent edit).* A project loaded via `loadAll` or `spert:models-changed` has a real-time listener attached. The user clicks Delete. Before `deleteDoc` acks at the server, a collaborator edit (or any other server-side modification) triggers an `onSnapshot` delivery. `mergeProject` sees `existing === undefined` (project removed locally) and falls into the `[...state.projects, merged]` branch, re-inserting the project. Fixed by refactoring `unsubscribersRef` from a flat `Unsubscribe[]` array to a `Map<string, Unsubscribe>` (eliminating the now-redundant `listenedIdsRef`) and tearing down the project's listener inline in the `"delete"` branch before `driver.remove()` fires.
  - *Path B (fast add-then-delete during in-flight create).* `emitDelete` fires before `driver.create()` resolves. No listener exists yet, so there is nothing to unsubscribe. Later, when create resolves, the `.then()` callback would normally call `addProjectListener` — but the project has been removed from the Zustand store by `deleteProject`. The initial snapshot would fire and `mergeProject` would re-insert. Fixed by adding a `getProject(project.id)` guard in the create's `.then()` callback. Since `deleteProject`'s `set()` runs before `emitDelete` fires, `getProject` returns `undefined` by the time `.then()` executes and `addProjectListener` is skipped.

- **Failed-create ghost project.** If `driver.create()` rejects (network outage, transient backend error), the `.catch()` block previously fired `reportCloudSyncError()` but left the project in the local store. Each subsequent edit would emit `emitSave` → `doSave()` → `setDoc({ mergeFields })` against a never-written document → Firestore's `create` rule rejected (no `members` in the payload) → PERMISSION_DENIED → an error toast on every keystroke until the user refreshed. The `.catch()` now also calls `driver.cancelPendingSave(project.id)` (kills any debounced save the user armed during the in-flight create) and `removeProjectLocally(project.id)` (rolls back the local entry). `removeProjectLocally` — not `deleteProject` — is correct here because the document was never written to Firestore, so an `emitDelete` / `driver.remove()` must not fire.

- **Bug 2 (`doSave` against non-existent doc) explicitly retired in code comments.** An earlier v0.47.1 draft proposed chaining `doSave` calls behind the in-flight create. The Firestore SDK (configured with `memoryLocalCache()`) serializes writes from a single client through an internal mutation queue (FIFO), so `driver.create()`'s `setDoc` is always enqueued before any subsequent `doSave()` `setDoc` and the server processes them in submission order regardless of network latency. No chaining is needed; a comment explaining the invariant replaces the absent code.

Regression tests added: `use-cloud-sync-create.test.ts` (4 tests — TC-1 Bug 1, TC-2 Path B, TC-3 Path A, TC-4 failed-create rollback).

## 0.47.0 — 2026-05-26

### Fixed — cloud storage hardening (7 findings from dual audit)

Tightened seven gaps in the cloud sync path, surfaced by a dual code/architecture audit. None were user-facing regressions in normal flows, but each broadened the failure surface enough to bite a real user in a near-future scenario. All fixes follow established patterns already in the codebase (echo-guard, idempotent cleanup, sim-results preservation).

- **Scenario notes textarea — echo guard.** The notes textarea was a store-bound controlled input with per-keystroke writes. In cloud mode, every keystroke fed the 200 ms debounced save, and each server-ack snapshot fell through `mergeProject`, overwriting in-progress typing the moment the user paused. The fix adds a `useBufferedField`-style local buffer (`localNotes`) and a focus-guard ref — incoming `scenarioNotes` prop updates are suppressed while the textarea is focused. Per-keystroke `onScenarioNotesChange` commits are preserved so the undo-group system still receives a commit on every keystroke. On blur, the buffer re-syncs FROM the store so mid-edit Ctrl+Z becomes visible. The character count below the textarea also reads from the buffer so it stays in sync with typed text during focus. (A3-1, the highest-severity finding.)

- **Permission-denied eviction — cancel pending save first.** When a project's snapshot listener received `permission-denied` (membership revoked server-side), the existing handler called `removeProjectLocally` and surfaced the "project was removed" toast — but a debounced save queued ≤200 ms earlier would still fire against the revoked-access project, hit PERMISSION_DENIED, and trigger a paired "Cloud sync error" toast. The fix calls `driverRef.current?.cancelPendingSave(projectId)` before eviction, eliminating the second toast. (I2-1.)

- **Externally-revoked sign-out — full cleanup.** When Firebase revokes a session without a user-initiated `signOut()` call (token expiry, server-side session purge), `onAuthStateChanged(null)` fired with no cleanup running — in-memory Zustand state retained the previous user's projects, and per-user UID-namespaced localStorage was not cleared until the next sign-in re-derived everything. The fix adds an `else` branch to the `onAuthStateChanged` callback that calls `runSignOutCleanup()` directly (matching the pattern of paths 1 and 2). All cleanup steps are idempotent: when path 1 fires `runSignOutCleanup()` explicitly before `firebaseSignOut`, the subsequent `onAuthStateChanged(null)` runs cleanup a second time with no harmful effect (empty Maps, empty arrays, `removeItem` on absent keys). (E1-3.)

- **`driver.load()` — re-attach owner.** `stripFirestoreFields` strips `owner` from the raw Firestore document before Zod parse; the schema then applies `.default(null)`, leaving every `driver.load()` result with `owner: null`. `subscribeToProject` and `processProjectDoc` already re-attach `raw.owner ?? null` after parse; `load()` was the remaining gap. Any future caller of `driver.load()` would silently break the SharingSection ownership gate. (H2-1.)

- **`spert:models-changed` re-fetch — data-loss guard.** The initial cloud-load path already protects against a transient 0-project response (skips replacement when cloud is empty but local has projects). The invitation-claim re-fetch path lacked this symmetry — a backend hiccup during a claim could wipe the in-memory project list the user was actively working with. The fix mirrors the existing guard. (I1-1.)

- **`setProjects` — preserve in-memory simulation results.** v0.46.4 closed the post-write echo race in `mergeProject` via `mergeWithLocalSimulationResults`, but `setProjects` (called on initial cloud load and `spert:models-changed` re-fetch) still wholesale-replaced state. A user with freshly-computed results in memory could lose them on the next re-fetch. The fix applies the same merge helper, walking the in-memory project map by id and falling back to the Firestore-delivered version for unknown projects. Initial-load benefits too: `loadProjects()` runs from page-mount `useEffect`s before `driver.loadAll()` resolves, so localStorage-restored projects with cached results are preserved through the cloud hydration. (SC1-1.)

- **Changelog grep guard.** Documented a pre-merge grep pattern scoped to the `date:` field that catches placeholder strings (e.g., `2026-MM-DD`) without false-positiving on real dates in narrative body text. (M3-1.)

Regression tests added: `driver.load()` owner re-attachment (2 tests); `setProjects` preserves in-memory simulation results across re-fetch (1 test). Total tests: 1576 → 1579.

## 0.46.4 — 2026-05-24

### Fixed — simulation results no longer vanish moments after Run in cloud mode

In cloud storage mode, clicking **Run Simulation** showed results that then disappeared within a second. The bug did not occur in local mode and was invisible offline. Root cause was a Firestore-echo race against the Zustand store:

1. `setSimulationResults` wrote the new run into the in-memory store and queued a cloud save.
2. `FirestoreDriver.save()` is debounced 200 ms; before writing it calls `stripSimulationResultsForCloud()` (results are large, transient, and recomputable — they do not belong in Firestore).
3. Firestore acknowledged the write and fired an `onSnapshot` echo with `hasPendingWrites: false`. The driver's existing `hasPendingWrites` guard only catches the optimistic local-write snapshot; this second snapshot passed through.
4. The echo reached `mergeProject`, which wholesale-replaced the in-memory project with a copy that had `simulationResults: undefined` on every scenario. The user's results were silently wiped.

Three coordinated changes close the race:

- **`mergeProject` now preserves in-memory `simulationResults` per-scenario** (matched by scenario ID) when a snapshot arrives. Simulation results are local-only ephemeral state — we never accept them from a Firestore snapshot. Lookup-by-ID correctly handles collaborator scenario add/remove/reorder: a remote scenario the local state hasn't seen gets `simulationResults: undefined` (no prior to carry over), and a deleted scenario is dropped with the incoming list.
- **`setSimulationResults` no longer emits a cloud save.** The cloud save it triggered produced no useful Firestore delta (results are stripped on the way out) and was the most common trigger of the echo race. localStorage save is preserved.
- **A new `mergeWithLocalSimulationResults` helper** encodes the preservation logic at module scope to keep `mergeProject`'s nested-function depth within lint limits.

Known gap (documented in `setProjects`): the initial cloud-load and `spert:models-changed` re-fetch path still wholesale-replaces state. This is acceptable today because the initial load runs before the user can compute anything, and `models-changed` only fires on invitation claims. Revisit if either assumption changes.

Regression tests in `use-project-store.test.ts`:
- echo with `simulationResults: undefined` preserves the in-memory run
- a remote-added scenario has `simulationResults: undefined`; existing scenarios retain theirs
- `setSimulationResults` emits no `cloudSyncBus` save event

## 0.46.3 — 2026-05-24

About page + footer polish — standardizes the QRG button label across the SPERT® Suite and fixes a footer link color inconsistency.

### Changed — About page QRG button label standardized
- Renamed the QRG download button from `Quick Reference Guide` to `Open Quick Reference Guide (PDF)` so the label matches the canonical convention used across the SPERT® Suite (Forecaster, MyScrumBudget, AHP, Story Map).

### Fixed — footer "Keyboard shortcuts" link styled blue
- The "Keyboard shortcuts" button in the global footer was the only footer link rendered in gray (`text-gray-500 dark:text-gray-400`). All sibling links (Version, SPERT® Suite, Terms of Service, Privacy Policy, License) use the blue link color. Restyled to match.

## 0.46.2 — 2026-05-24

### Fixed — milestone names + project/scenario rename inputs no longer drop characters in cloud mode

v0.46.1 fixed the activity grid name input and section header name input against the cloud-sync echo race. v0.46.2 extends the same fix to two component files (`MilestonePanel` + the shared `InlineEdit`), covering three rename sites:

- **Milestone name** (`MilestonePanel`) — was a fully controlled per-keystroke input, identical to the pre-v0.46.1 activity name pattern.
- **Project rename** and **scenario tab rename** — both backed by the shared `InlineEdit` component, which had the same `useState` + sync `useEffect` pattern as pre-v0.46.1 BandHeaderRow (sync without focus guard, vulnerable to mid-typing overwrite from server-ack snapshots).

`InlineEdit` was migrated to use `useBufferedField` internally; both call sites inherit the fix. To support `InlineEdit`'s reject-empty-trim policy, the hook's `onCommit` callback now receives a `controls` argument (`controls.reset()`) that allows a caller to resync the buffer after a rejected commit — distinct from `revertValue()` (which reverts to the focus-time snapshot and arms the Escape/blur-suppress flag). `BufferedFieldControls` is exported from the hook for use at call sites.

`InlineEdit`'s Enter handler now calls `inputRef.current?.blur()` explicitly before exiting edit mode. The prior implementation relied on React firing a synthetic blur event during the conditional unmount of the focused input — version-inconsistent behavior. The explicit `.blur()` removes the dependency.

Same behavioral semantics as v0.46.1 apply to all three sites: commit timing is now per-edit-session (focus loss / Enter / click-away) instead of per-keystroke; external rename while focused is suppressed (last-blur-wins); a focused-and-blurred-without-typing field does not overwrite remote updates that arrived during focus.

### Added — Escape revert on milestone name input

Pressing Escape on a milestone name input now reverts the typed text to the value at the time of focus. No Escape handling existed on this input before v0.46.2.

### Changed — Escape revert on InlineEdit (project + scenario rename) now uses focus-time snapshot

Previously, `InlineEdit`'s Escape reset to the current prop value at the time of Escape. The new behavior reverts to the value at the time the user entered edit mode (the focus-time snapshot). In a concurrent-edit scenario, this means Escape shows the value the user saw when they started editing, not a value that arrived from a collaborator mid-edit. The display span shows the current store value once edit mode exits in both cases.

### Not migrated (intentionally)

The `ActivityEditModal` name field and notes textarea are not migrated. The modal uses `useState(prop)` initializers without a sync `useEffect`; while open, the modal's local state is not subscribed to external store updates. It commits atomically on the Save button with no per-keystroke write path. Migrating it to `useBufferedField` would not fix a real bug.

The `NewProjectDialog`, `NewScenarioDialog`, and `CloneScenarioDialog` follow the same Save-button pattern and are similarly unaffected.

## 0.46.1 — 2026-05-23

### Fix — activity name and section header name inputs no longer drop characters in cloud mode

The activity name input and the section (band) header name input no longer drop or revert characters during cloud sync. The bug was structural and exposed in v0.45.7: the per-keystroke controlled input pattern + per-keystroke debounced cloud save means that every debounced Firestore write produces a server-acknowledgment snapshot (`hasPendingWrites: false`) that flows back through `subscribeToProject` → `mergeProject` and replaces the project in the Zustand store. The replacement carries the value at debounce-fire time, not what the user has typed since — so any keystrokes between debounce-fire and server-ack are silently overwritten when React re-renders the controlled input from the store.

Reverting v0.45.7's 500ms → 200ms debounce reduction is not the fix: fast typists hit the same race at 500ms, and the shorter window is needed to prevent losing click-driven changes on fast refresh. The fix is at the input layer.

Both the activity name and section header name inputs now buffer their value in local state via a new `useBufferedField` hook. While the input is focused, external state updates (Firestore echoes, undo, real-time collaborator renames) are ignored — the buffer holds whatever the user has typed. On focus loss the buffer commits to the store if and only if the typed value differs from the value the user saw when they focused the field (a snapshot taken at focus time, not compared against the live external value). A user who focuses a field and blurs without typing never overwrites a remote update that arrived while focused.

Commit timing: name persists on any focus loss (Tab, Shift+Tab, Enter, click-away, modal open) — not per keystroke. Undo granularity changes from per-keystroke to per-edit-session.

Enter (activity name) commits via the resulting blur and advances focus to the next tab-order field (Min in standard mode, ML in heuristic mode). Enter (section header) commits via blur and advances focus to the Add Activity button. Escape reverts to the value at the time the field was focused (in the rare multi-client case where a collaborator updated the name while you were focused, Escape lands on the original pre-collaborator value, accepted for a primarily single-user tool).

Concurrent-edit note: if a collaborator renames a field while your cursor is in it, your focus-loss value wins (last-blur-wins).

Implementation: new pure hook `src/ui/hooks/use-buffered-field.ts` (focus guard via ref, focused-value snapshot ref, change-aware blur, suppressNextBlur flag for Escape). Both call sites stabilize the commit closure via `useCallback` to keep the hook's `handleBlur` identity stable across keystrokes. The BandHeaderRow's Enter handler no longer calls its commit function explicitly before moving focus — that would double-fire onto the change-aware guard now that the guard compares against the focus-time snapshot rather than live external value. Net commit semantics unchanged.

Follow-up (v0.46.2): the ActivityEditModal name field and notes textarea (highest impact remaining — long-form typing), milestone names, scenario rename, and project rename carry the same structural exposure and will be moved onto `useBufferedField` next.

## 0.46.0 — 2026-05-23

### Added — insert an activity at any position in the grid

The activity grid now supports inserting a new blank activity at any row position, not just appending to the bottom. Hover between any two rows to reveal an inline insert strip with a small ⊕ marker; click it to add a new activity at that exact position. The new row's name input auto-focuses immediately so you can type without an extra click.

Both row types support the strip:

- **After an activity row** — the new activity is spliced immediately after the hovered one. Existing bands are untouched.
- **After a band header row** — the new activity joins the band's section with correct anchor semantics in every case:
  - Single-band groups: the band re-anchors onto the new activity.
  - Multi-band shared-anchor groups (e.g., three section headers stacked above the same activity): only bands at-or-before the clicked one re-anchor; later siblings keep their original anchor and stay where they were in the render list.
  - Trailing bands (section headers with no following activity): the same at-or-before rule applies — earlier trailing bands move with the new activity, later trailing bands stay trailing.

Suppression rules: the strip is hidden on the last row in the grid (since "+ Add Activity" covers that case), on locked scenarios, and while any row is being dragged.

Accessibility note: the strip is mouse-accessible in this release, consistent with the existing edit-pencil precedent on activity rows. Keyboard-driven positional insert is a planned follow-up.

Implementation highlights:

- New pure service functions `insertActivityAfter` and `insertActivityAfterBand` in `project-service.ts`, both setting `simulationResults: undefined` on the returned scenario.
- New store actions `insertActivityAfterActivity` and `insertActivityAfterBand` (return the new activity's ID on success, `null` on lock/missing scenario/unknown band). Both pre-check the snapshot before invoking `mutateScenario` to avoid phantom undo + persist + cloud emit on no-op paths.
- `useGridFocus` extended with `signalActivityAddById(id)` and an existence-check in the focus effect — defends the cloud-sync race where the array grows via a remote snapshot that does not contain the just-inserted ID.
- Drag suppression wired through DndContext's `onDragStart`/`onDragEnd`/`onDragCancel` callbacks into local grid state, avoiding per-row context subscriptions that would re-render every row on every drag tick.

## 0.45.9 — 2026-05-22

### Cloud — fourth pass: the actual root cause was a Zustand commit-order race

The Gantt color persistence bug we chased through v0.45.6 → v0.45.7 → v0.45.8 was never a Firestore problem. After a second-opinion read of the full codebase, the real failure was a synchronous execution-order race in `persist()`:

```
updateGanttAppearance → set((state) => {
  const projects = state.projects.map(...)   // new array has the new color
  persist(projects, projectId) {
    repo.save(project)                       // localStorage gets correct data ✓
    cloudSyncBus.emitSave(projectId)         // SYNCHRONOUS — fires NOW
      → handleSyncEvent
        → getProject(projectId)
          → useProjectStore.getState()       // returns PRE-update state
                                             //   (Zustand only commits after
                                             //    the updater returns)
        → driver.save(STALE project)         // queues stale snapshot
  }
  return { projects }                        // Zustand finally commits — too late
})
```

The bus subscriber in `use-cloud-sync.ts` reads the project back from `getState()` after receiving a save event. Because the emit fired synchronously *inside* the `set()` updater, the read happened before Zustand committed — so the cloud save consistently used the pre-mutation project. Firestore's `onSnapshot` then echoed that stale state back into the local store and localStorage, silently dropping whatever the user just changed.

This explains every observation cleanly:

- **localStorage was unaffected.** `repo.save(project)` inside `persist` receives the new project by argument — it never re-reads `getState()`. Local-mode users never saw the bug.
- **v0.45.6's `deleteField()` partially helped.** The Blue-preset click's emit also fired with a stale read, but the `deleteField()` sentinels still removed the *prior* customs from Firestore. That's what "mostly fixed" meant — stale customs from earlier sessions stopped resurrecting. The new Completed color was never in any payload, ever.
- **v0.45.7's debounce reduction and v0.45.8's `mergeFields` switch were no-ops for this bug** — both attacked the write semantics, but the right payload never reached the write path to begin with.

### The fix

- **`persist()` in `use-project-store.ts` now defers `cloudSyncBus.emitSave` with `queueMicrotask`**, so the bus subscriber's read happens after Zustand commits. The microtask is consumed by the existing 200 ms debounce window; no perceptible delay. Single load-bearing change.
- **Secondary fix:** `serverTimestamp()` was being silently corrupted into `{}` by the recursive `sanitizeForFirestore` pass — `Object.entries(sentinel)` returns `[]` for the Firestore FieldValue, which made the sanitizer rebuild it as an empty map. Production saves have been writing `updatedAt: {}` instead of a real server timestamp. `doSave` and `create` now attach `updatedAt: serverTimestamp()` *after* the sanitize pass so the sentinel survives intact.
- **Regression tests:** the `persist → emitSave` ordering test in `use-project-store.test.ts` subscribes to the bus, fires `updateGanttAppearance` with a new custom color, and asserts the subscriber sees the post-update state. The driver test mocks `serverTimestamp()` with a sentinel-shape object and asserts the same reference arrives at `setDoc`.

Credit: independent codebase review caught what three rounds of Firestore-focused debugging missed.

## 0.45.8 — 2026-05-22

### Cloud — third pass: replace `merge: true` with `mergeFields` for Gantt color saves

The v0.45.6 + v0.45.7 fixes still left a real bug: clearing the customs via the Blue preset and then picking a green Completed color, then waiting any amount of time before refresh, would still surface the preset default (gray) on reload. Diagnosis: `setDoc(..., { merge: true })` deep-merges nested maps and forces us to express cleared sub-fields as `deleteField()` sentinels. Mixing `deleteField()` sentinels with regular values in the *same* nested map (`ganttAppearance.customPlannedColor: deleteField()` next to `ganttAppearance.customCompletedColor: "#65a30d"`) split into one update + one transform per write — and in practice the regular sibling value did not survive end-to-end.

- **Switched `doSave` from `{ merge: true }` to `{ mergeFields: [...] }`.** Each top-level field listed in `mergeFields` is wholesale **replaced** on the server document, with no deep merge and no sentinels. The `ganttAppearance` map is now atomically swapped out on every save — cleared sub-fields are simply absent from the new map. Owner/members are explicitly excluded from `mergeFields` so the debounced save path never touches the ACL fields that `create()` and `removeCollaborator()` manage.
- **Removed `sanitizeForFirestoreMerge()`** and its tests — no longer needed. The path now uses the original strip-undefined `sanitizeForFirestore` for both `create()` and `doSave()`.
- **Tests:** rewrote the v0.45.6 driver regression to assert the new `mergeFields` semantics — the freshly-set color is in the payload, cleared sub-fields are absent (no sentinels), `mergeFields` includes `ganttAppearance`/`scenarios`/`updatedAt` and *excludes* `owner`/`members`.

## 0.45.7 — 2026-05-22

### Cloud — second pass: custom colors persist through fast browser refresh

Follow-up to the v0.45.6 bug. The `deleteField()` fix closed the deep-merge bug that resurrected stale customs, but exposed a separate race: a click-driven change followed by a fast browser refresh could lose the write entirely. Sequence — click Blue preset, click green for Completed, hit Cmd-R within a second — would commit the preset-reset save (clearing customs server-side) but drop the green save because the 500 ms debounce hadn't fired yet, the `beforeunload` flush only *started* the `setDoc` request, and the page unloaded before the network round-trip completed. Worse, v0.45.6's refresh-window toast suppression made the failure silent.

- **Shortened the save debounce from 500 ms to 200 ms.** 200 ms still batches normal typing (most users have >250 ms gaps between keystrokes) but is fast enough that click-driven changes commit before a manually-issued refresh. Rationale documented at the `save()` method in `firestore-driver.ts`.
- **Added `pagehide` as a secondary flush trigger** alongside `beforeunload` in `use-cloud-sync.ts`. `pagehide` is the standards-track replacement and fires more reliably on mobile and across the bfcache path. Both events route through the same `handleBeforeUnload` callback so the unload latch and pending-save flush stay in lockstep.
- **Regression test** in `firestore-driver.test.ts` locks the 200 ms debounce window: no fire at 150 ms, fires by 250 ms.

## 0.45.6 — 2026-05-22

### Cloud — custom Gantt colors persist correctly + quieter refresh

- **Fix:** custom Gantt bar colors no longer revert after a browser refresh in cloud mode. The Firestore save path uses `setDoc(..., { merge: true })` so it doesn't clobber the `owner`/`members` fields, but Firestore's deep merge means keys that transitioned to `undefined` locally (e.g. a preset click clearing `customPlannedColor` / `customInProgressColor` / `customCompletedColor`) were silently left in place on the server document. The `sanitizeForFirestore` helper stripped those keys instead of marking them for deletion, so the stale values reappeared after refresh. New `sanitizeForFirestoreMerge` in `firestore-sanitize.ts` replaces `undefined` map-keys with Firestore's `deleteField()` sentinel; `doSave` uses it, while `create()` (no doc to merge into) keeps the existing strip-undefined behavior. Arrays still strip-undefined because they're atomic under merge:true and `deleteField()` is forbidden inside array elements.
- **UX:** suppressed the "Cloud sync error — changes may not have saved. Check your connection." toast during two narrow false-positive windows: (a) the first ~2 s after the initial cloud load settles (where write-forward migration saves and other transient races can fire), and (b) any period after `beforeunload` has latched (where in-flight setDoc calls can race a hard refresh). Errors continue to log to the console regardless. Real connectivity errors during an active editing session still surface normally.
- **Tests:** new regression coverage in `firestore-sanitize.test.ts` (merge sentinels for cleared keys, array element handling) and `firestore-driver.test.ts` (`doSave` payload contains the delete sentinel for cleared Gantt color fields).

## 0.45.5 — 2026-05-22

### Bug fix — no more phantom uncertainty hatching on completed activities

- **Fix:** completed activities without an `actualDuration` no longer render uncertainty hatching on the Gantt chart. The gate in `computeActivityUncertaintyDays` (`src/core/schedule/deterministic.ts`) previously required *both* `status === 'complete'` **and** `actualDuration != null` to suppress hatching; if either was missing, the activity fell through to the planned/in-progress branch and picked up `projectTarget − activityTarget` hatching. Any `status === 'complete'` activity now returns `hatchedDays = 0`, with the solid bar falling back to the deterministic duration when `actualDuration` is missing.
- **Data-consistency fix:** the single-row status dropdown (`UnifiedActivityRow.tsx`) and the Activity Edit modal (`ActivityEditModal.tsx`) now default `actualDuration` to the scheduled deterministic duration when a user flips status to `complete` without an actual entered — mirroring the bulk Mark-complete path in `UnifiedActivityGrid.tsx` that already did this. Closes the entry point that produced the inconsistent state in the first place.
- **Regression test:** new test in `deterministic.test.ts` covering the complete-without-`actualDuration` case.

## 0.45.4 — 2026-05-22

### Section headers — inline rename in the Gantt + tinted rows in the grid

- **Inline rename in the Gantt:** section header names are now editable directly on the Gantt chart by clicking the section label, mirroring the existing inline-rename UX on activity names. Enter commits, Escape cancels, blur commits. The inline-edit state was unified into a tagged `{ kind: "activity" | "band"; id }` target so the same `<input>` overlay services both edit modes; band slot lookup uses `renderItems.findIndex(...)` since the activity-only `rowIndex` doesn't include band rows. Rename is disabled when the scenario is locked.
- **Tinted rows in the Activity Grid:** picking a color for a section in the band color picker now also paints the row background in the activity grid with a faint matching tint (default alpha 0.18). Selecting "None" reverts the row to the standard gray. The tint is computed in JS via a new `hexToTintedBackground` helper rather than CSS `color-mix()`, matching the v0.44.3 cross-browser policy.
- **New helper:** `src/ui/helpers/color-utils.ts` adds `hexToRgb()` and `hexToTintedBackground()` with their own tests. Both return `null` for invalid input so callers can fall back to default styling.

## 0.45.3 — 2026-05-22

### Security — close three findings from the v0.45.2 audit

- **UID-namespace `spert:user-preferences` and `spert-scheduler:active-scenarios` keys.** v0.42.6 (M4) namespaced the project keys but left preferences and the last-active-scenario map under single shared keys. On a shared device, if User A's session ended without an explicit sign-out (crash, tab close), the next user on the same browser could pick up A's preferences — especially in local mode, where no cloud sync overwrite fires. Both keys now key as `:{namespace}` (`local` when signed out / local mode, UID when cloud). Sibling pattern to `local-storage-repository.ts`. Pre-v0.45.3 unscoped keys auto-migrate to `:local` on module load with read → write-and-verify → delete ordering so a mid-migration crash leaves data under both keys, never under neither. `clearPreferences` and `clearAllLastScenarios` now scope to the active namespace only.
- **Bump simulation generation on mode-switch teardown.** The sign-out cleanup in `StorageProvider` calls `bumpSimulationGeneration()` before `cancelPendingSaves()` so any worker callback still in flight short-circuits before touching the about-to-be-cleared store. The `useCloudSync` mode-switch teardown (Cloud → Local, including the Discard path) skipped the bump and relied on `updateScenarioInList` no-op'ing on missing IDs. That's benign today but a defense-in-depth gap. The hook now matches the registry's ordering: bump first in both the cleanup return and the Cloud → Local `else` branch.
- **Evict the local mirror on `permission-denied` snapshot errors.** When a project owner removes another member, the removed member's open `onSnapshot` subscription fails with `permission-denied`. The error callback used to log and drop the listener ID, but leave the project in the in-memory store — the user kept seeing stale data with no signal they'd lost access. New `removeProjectLocally` store action — strictly analogous to `deleteProject` minus `cloudSyncBus.emitDelete` — is called from the `subscribeToProject` error path when `code === "permission-denied"`. Surfaces a `toast.info("A project was removed because you no longer have access.")` so the user understands what happened.
- **Tests:** 1,520 passing (up from 1,505 — 15 new tests cover namespace isolation, legacy-key migration idempotency, mid-migration crash recovery, and cross-namespace `clear*` scoping for both preferences and scenario memory).

## 0.45.2 — 2026-05-22

### Refactor — extract clean seams across files modified since v0.42.5

- **`project-service.ts`** — `cloneScenario` builds two ID-remap maps for activities and milestones using an identical pattern. Extracted a generic `cloneWithIdRemap` helper that returns `{ items, idMap }`, letting both passes read as one call. Behavior unchanged; covered by existing `project-service.test.ts` + `scenario-cloning.test.ts`.
- **`ProjectPage.tsx`** — the 40-field `useShallow` selector that dominated the top of the component is now `useProjectActions()` in `src/ui/hooks/use-project-actions.ts`. Same fields, same subscription semantics; the page is ~50 lines shorter at the top.
- **`PrintableReport.tsx`** — the print-only section JSX is now seven sub-components (`PrintSummarySection`, `PrintActivityTable`, `PrintDependenciesTable`, `PrintConstraintsTable`, `PrintItemTable`, `PrintMilestonesTable`, `PrintSimulationResultsSection`) co-located in `src/ui/components/print-sections.tsx`. The main `PrintableReport` is now a clean composition. No visual or print-output change.
- **`UnifiedActivityGrid.tsx`** — focus and selection state extracted into `useGridFocus` and `useGridSelection` hooks in `src/ui/hooks/use-grid-state.ts`. The Add buttons now call `signalActivityAdd()` / `signalBandAdd()` instead of poking `useRef.current = true`. Identical behavior; identical keyboard, drag, and bulk-action flows. All 1,505 tests pass; lint baseline unchanged at 18 errors / 1 warning.
- No dependency upgrades and no changes to the import subsystem in this version.

## 0.45.1 — 2026-05-22

### Gantt chart — Finish Target now always visible when toggled on

- **Fix:** when the "Finish Target" toggle is on and the target date falls past the buffered project finish, the dashed target line is now drawn at the right edge of the Gantt chart instead of being silently clipped out of view. The empty stretch between the buffer line and the target marker visualizes available slack to target.
- The timeline range automatically extends to include the target date in both the interactive Gantt and the printable PDF report. Bars compress proportionally in fit-to-window mode; fixed-density (week/month) modes scroll further. `furthestDate` (interactive, `GanttChart.tsx`) and `endDate` (print, `PrintGanttChart.tsx`) both now fold in `targetFinishDate` when `showTargetOnGantt` is on.
- Tick suppression now also avoids drawing a quarter, month, or semi-annual tick gridline directly underneath the target dashed line — preventing a visual merge when the target lands on a tick boundary. `TickSuppressionParams` in `gantt-utils.ts` gained an optional `targetX` field; `useGanttLayout` computes and passes it through.
- **Label cleanup:** the Gantt appearance toggle "Show Finish Target Date" is renamed to "Finish Target" — shorter and matches the "Finish Target" field label in the project summary card. The chart legend entry "Target" is also renamed to "Finish Target" so the legend mirrors the canonical name. The compact "Target" label that sits directly above the dashed line on the chart is unchanged — its position next to the line provides its own context.

## 0.45.0 — 2026-05-22

### New Feature — Section Headers

- New "+ Section" button next to "+ Add Activity" inserts a section header at the bottom of the list; drag it to any position
- All activities following a section header appear below its label on the Gantt chart
- Each section header has an editable name, an optional color chosen from a palette, and a delete button
- Up to 50 section headers per scenario are supported
- Locked scenarios prevent all changes to section headers
- Section headers appear in the Gantt chart as a bold label with a horizontal rule spanning the full chart width
- Section headers appear in printed PDF reports
- Section headers appear in CSV and Excel exports as labeled rows
- CSV and Excel re-import skips section rows without error; section labels are not reconstructed on re-import — export to JSON to preserve section headers across export/import round-trips
- Section headers carry no scheduling logic and do not affect simulation results

## 0.44.3 — 2026-05-22

### Scenario comparison — table copy actually works now

- **Fix:** the comparison-table copy button was still failing in v0.44.2. Root cause (confirmed via the diagnostic console-error added in v0.44.2): the table's alternating-row class `bg-gray-50/50` compiles, in Tailwind v4, to `color-mix(in oklab, var(--color-gray-50) 50%, transparent)`. Even after the prior pass resolved the `oklch` CSS variable, the surviving `color-mix(in oklab, …)` wrapper made html2canvas throw `Attempting to parse an unsupported color function "oklab"`. The neutralizer in `export-chart.ts` now recognizes `oklch`, `oklab`, AND `color-mix` and routes all three through Canvas2D's `fillStyle`. Every existing copy-image button benefits — same fix applies wherever Tailwind v4 opacity modifiers are used in a captured region.

## 0.44.2 — 2026-05-21

### Scenario comparison — copy fixes

- **Fix:** the copy-image button on the metrics table now works. Failure was caused by html2canvas 1.4.1 being unable to compute bounds on the bare wrapper div inside the `inline-block` + `overflow-hidden` comparison container. Added explicit `bg-white` and `inline-block` to the captured element.
- **Fix:** removed a duplicate copy button that was floating in the top-right of the cumulative distribution chart. The component-internal button predated the v0.44.0 chrome additions and was no longer needed once the parent provided its own header-bar button.
- Copy failures now log the underlying error to the browser console (`console.error`) in addition to showing the toast — useful for diagnosing future html2canvas / clipboard issues without code changes.

## 0.44.1 — 2026-05-21

### Scenario comparison — copy button placement fix

- The copy-image button on the comparison table was overlapping the rightmost scenario name when names were long. Replaced the floating top-right placement with a header bar above the table containing "Scenario Comparison" on the left and the copy button on the right. The CDF chart got the same chrome treatment for consistency. Neither header is in the captured screenshot — what you paste is still the data alone.

## 0.44.0 — 2026-05-21

### Gantt customization

- The Completed bar color can now be customized per project, just like the Planned and In Progress bar colors. Choose a custom color from the swatch picker in the Gantt appearance panel, or click any color preset to reset all three back to the preset's values.

### Scenario comparison

- The scenario comparison view now has two copy-image buttons — one for the metrics table and one for the cumulative distribution chart. One click copies a clean PNG to your clipboard; paste directly into slides, docs, or any program that accepts images. The buttons match the existing copy-image affordance on the Gantt chart and use the same Firefox-aware behavior (disabled with explanatory tooltip on browsers that don't support `image/png` clipboard writes).

## 0.43.0 — 2026-05-20

### Import — Level 4 retrograde

This release retrogrades the import flow to the Level 4 pattern described in the SPERT Suite robust-import guide. The implementation absorbs lessons from prior Level 4 ports (Forecaster v0.30.0, CFD v0.13.0, AHP v0.16.0, MyScrumBudget v0.30.0) and from this app's own v0.43.0 critique cycle (pitfalls #82–90).

**User-facing:**

- Import now detects name conflicts in addition to ID conflicts, with separate per-conflict resolution (skip / replace / copy). ID conflicts default to `'skip'` (avoiding silent overwrite); name conflicts default to `'copy'` (incoming is probably worth keeping).
- In cloud mode, the file picker now waits for your projects to finish loading before enabling — preventing imports against an empty list during sign-in or invitation-claim refresh. An amber notice explains the wait.
- If your cloud projects loaded (or were refreshed by a peer invitation claim) while a preview was open, the conflict list rebuilds automatically and an amber banner reports what changed (conflicts that vanished, new conflicts, kind changes). The banner escalates to `aria-live="assertive"` when prior 'skip' or 'replace' intents are downgraded to 'add' so screen-reader users hear it.
- Copying an imported project now produces a disambiguated name (e.g., `"Q4 Plan (Copy)"`, `"Q4 Plan (Copy 2)"`) with fully regenerated internal IDs — re-importing the same file no longer creates aliased scenarios or activities.
- **Fix:** replacing a cloud-shared project on import now preserves its owner, sharing settings, creation date, and archived status. Previously the imported file's `owner` field could overwrite these (Firestore rules already prevented data loss, but the in-memory state would briefly show the wrong owner until the next sync).
- **Fix:** importing a file that includes user preferences now offers an opt-in toggle (default off) to apply them. Previously the `preferences` field in the export was silently ignored.
- **Fix:** importing an activity CSV into a new project no longer trips the new conflict guards — the unconditional-add path is preserved via a typed escape-hatch on the store action.
- **Fix:** stale error state from a prior bad file pick is now cleared when a new file is selected, in both the project-bundle and activity-CSV import surfaces.

**Internal:**

- New `useImportState` hook (`src/ui/hooks/use-import-state.ts`) centralizes the import state machine (idle / error / preview / applying / done) with named transition helpers and reactive cloud-data-readiness guards. `ImportSection` is now a thin controlled view.
- Store action `importProjects` rewritten as a decision-based action returning `ImportOutcome`. Decisions carry `kind: 'id' | 'name'` and `originalExistingId` for Layer 2 stale-data guards. Counters are incremented on successful `repo.save()`, not on intent — keeping the banner honest about partial failures.
- Layer 2 drift guards are symmetric across the ID-conflict-replace and name-conflict-replace branches (pitfall #85): if a target disappears AND a new collision appears, the project is recorded in `outcome.driftSkipped` rather than written.
- New `cloudDataLoaded` reactive store field, written at 7 sites in `use-cloud-sync.ts` (4 initial-load + 3 model-refresh) so peer-invitation refreshes also re-validate any open preview (closing the v7 C-1 gap where `handleModelsChanged` mutated the project list without flipping the signal).
- Applying-state observability uses `flushSync` plus a `setTimeout(0)` macrotask yield so `aria-busy` commits to the DOM AND the browser paints the spinner before the synchronous merge runs. (`flushSync` alone does not paint on fast devices; `setTimeout` alone does not guarantee React commits before the yield resumes.)
- Double-confirm protection via `inFlightRef` apply-active ref — the closure-stale state guard alone is insufficient because rapid clicks can re-enter the same `useCallback` closure before React commits.
- Spec deviations are documented in `docs/SPEC_DEVIATIONS.md` (SD-1: `applyImportDecisions` not extracted as a pure function; SD-2: no full `conflictsEqual` / `{ ok: false }` drift-abort path). Both targeted for v0.44.0.

## 0.42.6 — 2026-05-09

### Security

Independent security audit of v0.42.5 surfaced three High and five Medium findings. The three Highs were closed in the canonical Firestore rules (`spert-suite` project, deployed to console; companion mirror PR in spert-landing-page). This release lands the paired app-code changes and the remaining mediums.

- **H3 (paired app-code fix)** — `findUserByEmail` in `firestore-sharing.ts` now passes `limit(1)` to the Firestore query. Pairs with the `spertscheduler_profiles` rule split (`allow get: if isAuth();` + `allow list: if isAuth() && request.query.limit <= 1;`). Both sides now hold the line independently — neither alone can regress without the other catching it. Closes the bulk profile-enumeration vector that allowed any signed-in user to harvest the entire Scheduler user roster (emails, displayNames, photoURLs) in a single `getDocs(collection(...))` call.
- **M1 — Runtime role validation in bulk-invite.** `BulkSharingSection.handleSend` now refuses to call the `sendInvitationEmail` Cloud Function unless `role` is exactly `"editor"` or `"viewer"`. New `isValidInviteRole` type-guard helper in `invitation-utils.ts` (covered by 4 new unit tests). Defense-in-depth: the TypeScript narrowing on `role` is erased at runtime, so a DOM/devtools modification of the `<select>` would otherwise feed any string to the CF; the CF re-validates server-side, but the client now also bounds the input.
- **M2 — Worker simulation results discarded post-sign-out.** A simulation in flight at sign-out used to post its result back via `setSimulationResults`, which could (under UUID collision via a shared template/import) write the prior user's aggregated stats into the next user's scenario. New `simulation-cancellation` module exports a generation counter; `useAutoRunSimulation` and `ProjectPage.handleRunSimulation` capture the generation at dispatch and short-circuit if it doesn't match at result-time. Sign-out cleanup registry calls `bumpSimulationGeneration()` first in the cleanup sequence. The worker itself is **not** terminated — terminating mid-run can leave the worker unrecoverable; discarding the result downstream is functionally equivalent and structurally safer (Claude Chat refinement).
- **M3 — Auth-guarded `beforeunload` flush.** `useCloudSync.handleBeforeUnload` now returns early when `user === null` (or driverRef is missing). Closes a race where session expiry between handler registration and tab close would attempt a Firestore write with revoked credentials, hit `PERMISSION_DENIED`, and silently swallow the error in `doSave`'s catch block — masking a real symptom from observability.
- **M4 — UID-namespaced localStorage keys.** Project keys moved from `spert:project:{id}` to `spert:project:{namespace}:{id}` where `namespace` is `local` for signed-out users and `{uid}` for cloud users. Same shape applies to the index key. `LocalStorageRepository` accepts an optional `fixedNamespace` constructor argument for explicit cross-namespace operations (`migrateLocalToCloud` reads `local`; `handleDiscardLocalCopy` clears `local`). Active namespace is module-level and flipped by `StorageProvider` on auth state changes. Sign-out cleanup wipes only the active (departing user's) namespace, leaving any local-mode data and other namespaces structurally untouched. Cross-user data visibility is now a structural guarantee rather than a procedural one — even if the cleanup path were bypassed, a new user cannot read a prior user's keys because the prefix differs. Existing pre-v0.42.6 unscoped keys are migrated to `local` at module load; the migration uses **read → write-and-verify → delete** ordering so a mid-migration crash leaves duplicate data, never lost data (Claude Chat refinement, M4 round-trip test added).
- **M5 — Architectural-security-model comments.** Added a SECURITY MODEL block above the `spertsuite_invitations` rule documenting that `allow write: if false` is the architectural backstop for the resend cap and emailSendCount tamper-proof guarantee — not just a casual choice. Mirrored the comment above `BulkSharingSection.handleResend` so v0.43.x's `LegacySharingSection` cleanup can't accidentally remove the security-model documentation.

### Internal

- New `src/infrastructure/simulation/simulation-cancellation.ts` module (40 LOC, 5 unit tests).
- `LocalStorageRepository` API extended with optional namespace constructor argument; default behavior preserved for all existing call sites except `migrateLocalToCloud` and `handleDiscardLocalCopy`, which now pin to `"local"` explicitly. Legacy-key migration (`migrateLegacyKeysToLocal`) runs once at module load. (10 unit tests covering namespace switching, constructor override, migration, idempotency, ordering safety.)
- `isValidInviteRole` type guard added to `invitation-utils.ts` (4 unit tests).
- `findUserByEmail` test added (`firestore-sharing.test.ts`, 2 tests verifying `limit(1)` is passed to the query and email normalization).

Test count: 1310 → 1333 (+23 new security-fix tests).

## 0.42.5 — 2026-05-09

### Internal

- **Refactor pass — large-file decomposition along clean seams.** Three extractions, all behavior-preserving:
  - `ActivityEditModal.tsx` (1193 → 893 LOC) sheds `ScheduleContextRow`, `Section`, `DependenciesDisplaySection`, `ScheduleAnalysisSection`, and the pure `computeConstraintUpdates` helper into a new `activity-modal-sections.tsx`. New `activity-modal-sections.test.ts` covers `computeConstraintUpdates` (7 tests).
  - `UnifiedActivityRow.tsx` (801 → 691 LOC) sheds the pure tab-navigation helpers (`constraintBadgeClass`, `constraintBadgeLabel`, `maxTabTarget`, `buildTabFieldOrder`, `handleOffOrderTabNav`, `getActivityRowIds`, `handleCrossRowTabNav`, `handleInRowTabNav`) into a new `unified-activity-helpers.ts`. New `unified-activity-helpers.test.ts` covers all eight helpers in isolation (35 tests) — closing a coverage gap where keyboard-navigation logic was previously only exercised through full-row integration paths.
  - `schedule-export-service.ts` (519 → 237 LOC) splits the orthogonal CSV and XLSX formatters into `export-csv-formatter.ts` (`exportScheduleCsv`) and `export-xlsx-formatter.ts` (`exportScheduleXlsx`, `xlsxSanitize`). The service module retains all shared builders (`buildSummaryData`, `buildGridRows`, `buildPredecessorMap`, `buildSuccessorMap`) and re-exports the formatters so existing imports — including `schedule-export-service.test.ts` — continue to work unchanged.
- No production behavior change. No dependency upgrades (every available upgrade was either inside the 60-day fresh-release window or required major-version owner approval).
- Test count rises by 42 (1268 → 1310) reflecting the two new helper test files.

## 0.42.4 — 2026-05-08

### Fixed

- **Invitation banner reload-loop on auto-fail.** Effect 4's 30-second grace timer in `useInvitationLanding` transitioned to `'idle'` without consuming the `INVITE_SESSION_KEY` first. After auto-fail, late `spert:models-changed` events gated on the key could re-fire the banner. The same hygiene now applies in `dismiss()`, so all three exit paths from `pre_auth` (claim-success in Effect 3, timeout in Effect 4, manual dismiss) consume the key symmetrically. (Lesson 59.)
- **Post-send refresh in BulkSharingSection no longer fail-fast.** After a successful bulk-invite send, the members-list and pending-invitations refreshes ran sequentially with `await`, so a transient rejection in the first blocked the second from updating. Now wrapped in `Promise.allSettled` so each list refreshes independently. Each callback already swallows its own errors, so no extra logging needed at the call site. (Lesson 64.)
- **Members-fetch failures in BulkSharingSection now surface visibly.** Previously the `loadMembers` catch silently swallowed errors — a transient Firestore failure left the list rendering empty with no signal to the user that anything went wrong. The boolean `isOwner` check is replaced with a four-state `OwnerStatus` enum (`loading | owner | not-owner | error`); the `error` state replaces the section's inner content with "Couldn't load sharing details. Refresh the page to try again." while keeping the section header collapsible. Synchronous ownership derivation from `project.owner` (Lesson 38) is preserved; non-owners still see the members list (informational), only the bulk-invite form is owner-gated — matching pre-existing UX. (Lesson 60.)

## 0.42.3 — 2026-05-07

### Changed

- **Invitation banner restyled as a centered card.** The pre-auth invitation prompt now renders as a `max-w-lg` (512px) centered card instead of a full-width banner spanning the page. The dismiss × is anchored to the card's top-right corner instead of floating ~800px from its content. A subtitle ("Sign in to claim your invitation.") clarifies the call-to-action below the headline. Visual hierarchy bumped to `text-base font-semibold` for the headline. Behavior — state machine, dismiss handler, ToS gate, mutual-exclusion with FirstRunBanner / LocalStorageWarningBanner — all unchanged.

## 0.42.2 — 2026-05-07

### Fixed

- **Invite-link landing now triggers the sign-in banner.** Pasting `https://scheduler.spertsuite.com/?invite=<token>` into a fresh browser correctly captures the token and prompts Google/Microsoft sign-in. Previously the token was silently discarded because the router's index redirect (`<Navigate to="/projects" replace />`) fired its `useEffect` deepest-first — stripping the query string before `Layout`'s `useInvitationLanding` Effect 1 could read it. The URL capture now runs at module load (synchronously, before any React rendering), decoupling it from effect-ordering entirely. Effect 1 now owns only the React-state transition.

## 0.42.1 — 2026-05-07

### Fixed

- **Bulk-invite result chips now show the email.** "✓ Added" and "✉ Invited" rows were rendering with the email missing because the client mistyped the Cloud Function's response — the CF returns `string[]` for `added` and `invited`, not `{email, ...}[]`. (`✗ Failed` rows were unaffected; that array type was already correct.)
- **Sharing section width** — Members list, bulk-invite form, and Pending invitations are now constrained to `max-w-3xl` (768px) instead of spanning the full project-page width. Eliminates the "controls floating off across the screen" effect on wide monitors. Applied to both the active `BulkSharingSection` and the dormant `LegacySharingSection` (rollback path) for consistency.

## 0.42.0 — 2026-05-XX

### Added

- **Bulk-sharing invitation system** — project owners can paste multiple email addresses to invite collaborators at once. Existing SPERT Scheduler users are added to the project immediately; new users receive an invitation email and claim the project automatically when they sign in. Invitations carry editor or viewer roles. The Sharing section grows a textarea with comma/newline/semicolon-tolerant input, a role select, and chips listing the result of the call: `✓ Added`, `✉ Invited`, or `✗ Failed (reason)`.
- **Pending invitation management.** When invitations are outstanding, the Sharing section shows a list with a Resend button (capped at 5×) and a Revoke button (with confirmation dialog). The send-count display `(N/5)` greys out at the cap. Revoking removes the invitation immediately so the recipient can no longer claim it.
- **Invite link landing flow.** A user arriving at `scheduler.spertsuite.com?invite=<token>` sees a precedence banner that prompts sign-in and auto-switches to cloud storage if their local data is empty (Lesson 28: never wipe local projects). Once signed in, the invitation is claimed automatically and the banner shows the model names just unlocked. The token is stripped from the URL on capture so it never persists in browser history.
- **Suite-wide profile collection.** Every sign-in now writes a profile doc to `spertsuite_profiles/{uid}` in addition to the existing `spertscheduler_profiles/{uid}` doc — the bulk-invite Cloud Function reads the suite-wide collection to discover existing users across SPERT apps. No visible UX change.

### Fixed

- **Sharing section visible immediately on new and cloned projects** (latent v0.41.0 regression — Lesson 38). Previously, after Add Project or Clone Project in cloud mode, the Sharing section was suppressed until a page reload because the in-memory Project carried no `owner` field. The store now seeds `project.owner` at create/clone time, the Firestore load paths re-attach `_owner` as `owner`, and the snapshot listener preserves the field after each Zod parse.
- **AuthProvider callback restructure.** `setLoading(false)` now fires unconditionally as the first statement of every `onAuthStateChanged` callback, eliminating a transient loading-stuck state on the ToS-stale sign-out path (the early-return previously skipped it). `setUser(...)` is now a single call site at the bottom of the callback. Defensive — the symptom was brief but real.

### Changed

- Profile writes now use `updatedAt` (server timestamp) instead of `lastLogin`. Existing Firestore docs retain the old field; new writes add the new one.
- Microsoft display names in "Last, First" form are now normalized to "First Last" at profile write time, not just at read time. The UI display was already normalized via `getDisplayName`; this changes the stored value.
- Member removal in the Sharing section now routes through `FirestoreDriver.removeCollaborator` (atomic transaction with three app-side guards) — same end state as the deleted `removeProjectMember` helper, simpler call surface.

### Internal

- **Feature gate.** New `INVITATIONS_ENABLED` flag in `src/app/featureFlags.ts`. Ships flag-off in v0.42.0 and is flipped on in PR 3 (single-line change, no version bump — suite canonical pattern).
- **`Project.owner: string | null`** is now a required schema field. Zod default `null` covers existing local docs and import paths; `addProject(name, owner)` and `cloneProject(sourceId, owner)` take an explicit owner argument so the local/cloud decision is made at the call site.
- **CSP** adds `https://*.run.app` to `connect-src` for forward-compat with Cloud Functions Gen 2 routing through Cloud Run.
- **`useSignInWithTosGate` hook** consolidates the consent-gate state machine that was previously duplicated across `StorageLoginModal` and `StorageModeSection`. The new shared `<SignInButtons />` and `<AuthProviderLogos />` components eliminate the inline-SVG copies. `<ConfirmDialog />` is a new Radix-based component.
- **`useInvitationLanding` hook** captures the invite token, runs the auto-flip-to-cloud logic, listens for `spert:models-changed`, and runs a 30-second grace timer. Lifted to `Layout.tsx` as the sole call site so the state machine is single-instance and `state` can gate the visibility of `FirstRunBanner` / `LocalStorageWarningBanner` (mutual exclusion).
- **`removeProjectMember` and `upsertUserProfile` deleted from `firestore-sharing.ts`** after their last call sites swapped over. `shareProject` and the legacy `SharingSection` variant are retained as the rollback safety net per Lesson 23 — scheduled for deletion in v0.43.x once v0.42.x ships stably.

## 0.41.0 — 2026-05-04

### Added

- **Clone Project from the Projects tab.** Each project tile now carries a Clone button on its right-side action rail (between the drag handle and the archive button). Clicking it produces an immediate, fully-detached copy of the source project — every project, scenario, activity, dependency, milestone, checklist item, and deliverable item gets a freshly-minted ID via the same ID-remapping pipeline that already powered scenario cloning, so there is zero ID overlap between source and clone. The clone's name is `"{original} (Copy)"`, auto-incrementing to `(Copy 2)`, `(Copy 3)`… on collision against any existing project name (active or archived). Cloning an archived project produces an unarchived clone — the source is preserved unchanged. Cached Monte Carlo simulation results are dropped from every cloned scenario; users re-run the simulation on the clone (matches the cloud-sync stripping convention). All cosmetic state — tile color, target finish date, gantt appearance settings, holiday calendar override, converted work days, show-target-on-gantt, show-activity-IDs — survives the copy. Cloud sync uses the existing `emitCreate` path, so cloud-mode users see the new project appear in Firestore the moment they click.
- The clone workflow exists primarily to enable a debug-export use case: clone a real project, scrub the corporate names by hand, export the JSON, and share it as a reproducer for issues — without exposing client data. The toast confirmation surfaces the new project name so users know the clone landed.

### Changed

- **Project tile color picker moved from the right-side action rail to immediately left of the project name**, inline in the title row. The 4 px tile-color left border has always served as the visual indicator of the chosen color; placing the swatch picker next to the name makes it read like a category dot (Notion/Linear/GitHub-label style) and visually merges with the border accent. Moving the swatch off the right rail also frees vertical space for the new clone button without crowding the existing drag handle, archive, and delete controls. The popover now anchors to the left of the swatch and expands rightward (was right-anchored when the swatch lived on the right edge of the tile).

### Internal

- **New `cloneProject(source, newName)` exported from `src/app/api/project-service.ts`.** Implementation reuses the existing `cloneScenario` per scenario rather than duplicating the ID-remap logic — every scenario inside the clone goes through the same pipeline that re-mints activity IDs, remaps dependency endpoints, remaps milestone references on activities, and re-generates the `rngSeed`. The project layer adds the cosmetic-state copy and the new `id`, `createdAt`, and `schemaVersion`. Calendar and gantt-appearance objects are shallow-copied (and `convertedWorkDays` / `globalCalendarOverride.holidays` arrays are spread) so the clone never aliases mutable references back to the source.
- **New `cloneProject(sourceId)` action on the Zustand store.** Mirrors `addProject` for persistence — `repo.save(clone)` followed by `cloudSyncBus.emitCreate(clone.id)` — and returns the new project so the caller can navigate or toast on it. A module-scoped `nextCloneName(base, existing)` helper computes the collision-safe name; capped at "(Copy 99)" with a timestamp fallback that should never trigger in practice.
- **`ProjectTile` gained an optional `onClone` prop** and a paired clone button SVG (two overlapping rectangles, blue hover). The `TileColorPicker` JSX moved from the right-rail flex column into the title-row flex container, before the `<h2>`. No prop signature changes for tile-color handling — `onChangeTileColor` still optional, still scoped to the tile. `ProjectsPage` wires the new action through a `handleClone(id)` callback that calls the store and emits a `toast.success("Cloned to \"{name}\"")` on success.
- **Schema version unchanged (still v20).** Cloning is a runtime-only ID-remap operation; nothing about the persisted project shape changed. No migration written, no Zod schema bumped, no Firestore rule field added.

## 0.40.4 — 2026-05-03

### Fixed

- **Comprehensive form-field hygiene sweep across the entire UI.** Chrome's DevTools Issues panel previously surfaced ~50 form-related warnings spanning four rule classes — `autocomplete attribute valid value`, `Form field element should have an id or name attribute`, `No label associated with a form field`, and orphan `<label>` elements with no associated control. Almost every `<input>`, `<textarea>`, and `<select>` in the codebase now carries a stable, semantic `name` attribute (camelCase: `projectName`, `activityName`, `estimateMin`, `confidenceLevel`, `ganttShowToday`, etc.). Every separate `<label>` is now paired with its control via `htmlFor` + `id` generated by React's `useId()` (no hardcoded ids, collision-free across modal instances and list rows). Implicit-wrap labels (input as label child) were left unchanged where already valid. Display-only `<label>` elements that were labeling read-only `<p>` text — and section headings that visually looked like labels but didn't associate with a single control — were converted to `<div>` / `<span>` to remove the orphan-label warning without changing visual presentation.
- **Adjacent accessibility fixes done in passing on elements already being touched.** `ToggleSwitch` (a `<button role="switch">`) now accepts an optional `ariaLabel` prop and the seven existing usages pass meaningful labels (Dependency mode, Parkinson's Law, Heuristic estimation enabled, Enable Dependencies/Heuristic/Parkinson by Default, Warn on startup when using local storage). The Constraint Mode radio group in `ActivityEditModal` now has `role="group"` + `aria-label`. Activity-row `select`/`input` elements gained `aria-label` to disambiguate per-row controls that share names across rows.

### Internal

- **Two shared wrappers extended with optional accessibility props (non-breaking).** `InlineEdit` accepts `name` (default `"inlineEdit"`) and optional `ariaLabel` (defaults to placeholder text); the two callers in `ScenarioTabs` and `ProjectPage` now pass meaningful values. `EstimateInputs` automatically derives `name` from each estimate field's `dataField` (`estimate-min` / `estimate-ml` / `estimate-max`) and adds `aria-label` from the field title. `ConfidenceLevelSelect`'s internal filter input gained `name="confidenceLevelFilter"`, `autoComplete="off"`, and `aria-label="Filter confidence levels"`.
- **`name` reuse is intentional in repeated-row contexts** (activity rows, milestone rows, holiday-edit rows, dependency rows). None of these inputs coexist inside the same real `<form>` element — Chrome's "id or name" rule is satisfied by the presence of `name` regardless of duplication, and the per-row `aria-label` provides a unique accessible name for each instance.
- **No behavior changes, no new files, no test changes** — purely additive prop wiring and label association. Schema, migrations, Firestore rules, simulation logic, and visual styling all unchanged. Typecheck and lint baseline (15 errors / 1 warning, per `feedback_lint_baseline_scope.md`) hold; 1221 tests pass across 59 files.

## 0.40.3 — 2026-05-03

### Fixed

- **Cloud project create and delete failures are now surfaced to the user via toast.** v0.40.2 wired `onSaveError` for the debounced save path, but the `driver.create(...)` and `driver.remove(...)` call sites in `useCloudSync` are direct one-shot calls whose `.catch` handlers logged to the console only. A failed project create or delete in cloud mode therefore left the user unaware that their action did not persist. Both `.catch` handlers now also emit `toast.error("Cloud sync error — changes may not have saved. Check your connection.")`, the same copy used by the existing save-failure toast — consistent messaging is the right call for a patch; per-error-type nuance is a future UX decision.

## 0.40.2 — 2026-05-03

### Fixed

- **Cloud sync write failures are now surfaced to the user via toast.** `FirestoreDriver` already exposed an `onSaveError(cb)` hook that fires for every write failure (`doSave`, `create`, `saveImmediate`, `savePreferences`), but `useCloudSync` never wired a callback after constructing the driver, so errors were swallowed (logged to the console only). The hook now installs a callback immediately after `new FirestoreDriver(user.uid)` that emits `toast.error("Cloud sync error — changes may not have saved. Check your connection.")` on every write failure. The toast is intentionally not debounced or deduplicated at this layer; `doSave` is already debounced 500 ms and write errors should only surface during genuine connectivity loss.
- **Real-time project listeners no longer die silently on permanent failures.** `subscribeToProject` previously called `onSnapshot` with only the success callback, so if a listener failed permanently (`PERMISSION_DENIED`, network cut, project deleted by another user), the Firebase SDK silently stopped delivering events with no app-level notification. The method now accepts an optional `onError?: (error: unknown) => void` parameter and passes it as the snapshot listener's error handler. The signature change is backward-compatible — the existing single-callback call signature continues to work without modification. `useCloudSync.addProjectListener` now passes an error handler that logs the failure and removes the project ID from `listenedIdsRef`, allowing future calls to `addProjectListener` to re-subscribe (note: nothing currently triggers resubscription for existing projects — a full reconnect mechanism is deferred and is documented inline).

### Internal

- **Added missing `autoComplete` attributes to two form inputs.** The `type="email"` member-invite input in `SharingSection.tsx` was the only input in the codebase producing an active browser autofill warning; it now carries `autoComplete="off"` because it accepts another user's email (sharing/lookup), not the signed-in user's own email. The `Search projects...` text input in `ProjectsPage.tsx` also gained `autoComplete="off"` as preemptive hygiene — the input has no `id` or `name` attribute today, so the browser does not currently warn for it, but search/filter fields should always opt out of autofill regardless. No other inputs needed changes: `placeholder="Locale"`, `placeholder="Milestone name"`, `placeholder="My Project"`, and similar app-domain fields are not personal-data fields and are correctly excluded from the audit.

## 0.40.1 — 2026-04-30

### Added

- **Browser tab favicon and apple-touch-icon.** Previously the app shipped with no favicon link in `index.html`, so browser tabs and bookmarks displayed the default blank/globe icon. The new SPERT mark (192×192 PNG with transparent rounded corners) now appears in the tab strip, bookmarks, and iOS home-screen shortcuts.
- **Inline SPERT icon in the top-nav header.** The 28×28 mark sits to the left of the "SPERT® Scheduler" wordmark in `Layout.tsx`, vertically centered inside the existing brand `<Link>`. The icon is served from `/public` via a plain `<img>` tag (no module import or build hashing) and uses `width` / `height` attributes to reserve layout space and prevent CLS.

### Internal

- **Added `public/spert-favicon-scheduler.png` (192×192) and `public/favicon.ico` (32×32, PNG-format fallback).** The `.ico` ships PNG bytes rather than a true ICO container — modern browsers accept this universally and it keeps the file at ~1.2KB versus the ~285KB true-ICO output from the `npx png-to-ico` build path. CSP is unaffected (`img-src 'self'` already permits the new asset). No PWA manifest added (deferred — see plan).

## 0.40.0 — 2026-04-30

### Changed

- **Editing scenario notes now collapses into a single undo entry per editing session.** Previously each keystroke pushed its own snapshot, so a sentence-long note consumed dozens of slots from the 50-entry undo stack and required dozens of Ctrl+Z presses to revert. Notes editing now produces exactly one undo entry from focus through blur, restoring the textarea to its pre-edit state with a single Ctrl+Z. Pressing Ctrl+Z mid-edit and continuing to type re-establishes the group cleanly so the post-undo edits also collapse to a single entry.

### Internal

- **Added commit-based undo grouping primitive to the project store.** Module-scoped `activeUndoGroup` state, a project-id-scoped guard at the top of `pushUndo`, and two new actions (`beginUndoGroup` / `endUndoGroup`) wired to the scenario-notes textarea via `onFocus` / `onBlur`. The defensive `onChange` wrapper at the `ProjectPage` layer also calls `beginUndoGroup` (idempotent during normal typing) so the group self-heals after a mid-edit `undo()` / `redo()` clears it. `undo()` and `redo()` close any active group before popping; `setProjects` and `clearAllData` null the group on session boundaries (sign-out, mode switch).
- **Three new test cases in `use-project-store.test.ts`** cover the grouping mechanism: single-entry collapse across repeated updates, cross-project mutations not suppressed by another project's group, and group self-heal after mid-edit undo. 1221 tests passing across 59 files.
- Activity-notes textarea in `ActivityEditModal.tsx` was intentionally **not** wired in this release. Its `onChange` writes to local component state and `updateActivityNotes` is invoked exactly once per Save, so the per-keystroke problem does not exist there today. Wiring is deferred until a future inline-edit refactor needs it.

## 0.39.1 — 2026-04-23

### Fixed

- **Settings → Cloud Storage radios appearing unchecked after opening then dismissing the auth-chip modal.** The modal's radio group shared `name="storage-mode"` with `StorageModeSection`, so the browser treated all four radios as a single native group. When the modal rendered and then closed, the Settings page's radios were left visually unchecked even though React state was unchanged. Renamed the modal's radios to `name="storage-mode-modal"` to keep the two groups isolated.

## 0.39.0 — 2026-04-23

### Changed

- **Standardized auth chip click behavior across all three states (signed-out, signed-in-local, signed-in-cloud).** Every click now opens the **Storage & Sign In** modal — the previous inline popover for signed-in states (with "Switch to Cloud Storage" and "Sign out" buttons) has been removed. Modal open state now lives at the `Layout` level rather than inside `AuthButton`, so the chip is a pure visual trigger.
- **Storage & Sign In modal now handles all three auth/storage combinations in-place.** After successful sign-in the modal no longer auto-closes and navigates to `/settings`; instead it transitions to the signed-in-local layout so the user can flip to Cloud Storage without leaving the modal. Signed-in states show an identity card with avatar, display name (Microsoft "Last, First MI" reversed to "First MI Last" via the new `getDisplayName` helper), email, and inline **Sign out**. Radio group is interactive when signed-in: selecting **Cloud** triggers the upload-confirm / migration flow, selecting **Local** triggers the Keep/Discard confirmation.
- **Modal now includes an always-visible Notifications section** with the "Warn me on startup when using local storage" toggle — a second entry point to the same preference already in Settings → Notifications. Both surfaces read and write the same `suppressLocalStorageWarning` preference (intentionally left cloud-synced alongside the rest of `UserPreferences`; not migrated to a local-only key).
- **Sign-in button row now wraps (`flex-wrap`)** below ~320px viewports instead of overflowing. Modal gains an explicit `×` close button in the title row (backdrop, Escape, and the dismiss text button continue to work).

### Internal

- **Extracted `src/ui/hooks/use-storage-mode-switch.ts`** — shared state machine for migration progress, migration result/error, and the Keep/Discard confirmation flow. Consumed by both `StorageLoginModal` (new) and `StorageModeSection` (settings page). Eliminates drift risk between the two mode-switch entry points.
- **Added `getDisplayName()`** to `src/ui/helpers/format-user.ts` alongside the existing `getFirstName()` — reverses Microsoft "Last, First MI" display names to natural "First MI Last" order for the identity card. `getFirstName` semantics unchanged.
- **Removed `openedWhileSignedOutRef` + post-sign-in auto-navigate effect** from `StorageLoginModal`. Signed-in vs signed-out layout is now pure state-driven off the `{user, mode}` tuple.
- Settings → Cloud Storage section retained as a secondary entry point; refactored to consume the shared hook. Settings → Notifications section retained — two entry points to the same toggle is intentional.

## 0.38.6 — 2026-04-23

### Internal

- **Lint debt paydown: eliminated all 48 `sonarjs/no-nested-conditional` errors and reduced `sonarjs/cognitive-complexity` errors from 26 to 14 across 24 files.** Total lint errors: 74 → 15 (plus one cosmetic warning; see below). Batched three coordinated PRs (B2-a → B1 → B2-b) into a single release because the changes have cross-plan code coupling and zero user-visible behavior — splitting into three version bumps would have created interim states where a nested ternary moves between files before getting fixed.
  - **B2-a — Pure-logic complexity reduction (5 CC errors).** `use-milestone-buffers.ts`: two-level extraction of `computeMilestoneSlack` + `computeSingleMilestoneInfo` with a `MilestoneComputeContext` param object. `build-simulation-params.ts`: extracted `resolveConstraintOffsets` (DRYs the constraint-resolution loop across sequential and dependency modes); preserved `SequentialConstraintEntry` public type shape so downstream consumers in `use-simulation.ts`, `worker-client.ts`, `worker-protocol.ts`, `simulation-service.ts`, and `monte-carlo.ts` keep compiling. `gantt-utils.ts`: replaced `generateTicks`'s 7-branch `if/else if` chain with a `TICK_GENERATORS` dispatch table + 7 per-level generator functions — bit-identical output. `local-storage-repository.ts`: `loadWithDiagnostics` restructured as a flat chain over a `PhaseResult<T>` discriminated union with four focused helpers (`extractProjectName`, `parseProjectJSON`, `validateSchemaVersion`, `migrateProjectData`); `LoadError` shape unchanged. `firestore-driver.ts`: extracted `processProjectDoc` as a private method, added the `QueryDocumentSnapshot` import, documented the write-forward side-effect in JSDoc.
  - **B1 — Nested-ternary elimination (48 errors across 20 files).** Added shared milestone-health helpers to `src/domain/helpers/format-labels.ts`: `MilestoneHealth` type + `computeMilestoneHealth`, `milestoneHealthDotClass`, `milestoneHealthTextClass`, `milestoneHealthLabel`. Applied three fix patterns throughout: Pattern A (`if/return` helpers or `let + if/else if` for 3+ branch selectors — `const` hoisting does not clear this rule), Pattern B (extracted `pickBestHighlight` generic for `.map()` data-shape producers in `ScenarioComparison.tsx`), Pattern C (extracted early-null-return formatters like `formatSignedBuffer`, `formatSignedSlack` for outer-null-guards wrapping inner ternaries). Key fixes: `firebase.ts` rewrite preserves local-only-mode contract (`initializeApp` now only called when `isFirebaseConfigured` is true — the prior `isFirebaseConfigured ? (getApps().length === 0 ? initializeApp(...) : getApps()[0]!) : null` collapsed to a `let app = null; if (isFirebaseConfigured) { app = ... }` guard); `GanttChart.tsx` and `PrintGanttChart.tsx` edited in one commit to preserve print parity (parallel `let barColor` + if/else rather than a shared helper, per CLAUDE.md's "do not share" convention for the two files). Interim CC reduction side-effect: 22 → 17 (B1's helper extractions dropped 5 CC errors as a bonus beyond the primary nested-ternary scope).
  - **B2-b — UI complexity reduction (3 CC errors; plan expected 4 but ScenarioTabs already cleared by B1's `let tabTitle` extraction).** `UnifiedActivityRow.tsx` `handleTabNav` (CC 33 after B1's partial reduction): extracted 5 helpers — `buildTabFieldOrder`, `handleOffOrderTabNav`, `getActivityRowIds`, `handleCrossRowTabNav`, `handleInRowTabNav`. The plan estimated 3 extractions would suffice but residual CC was still 19 after three; the additional cross-row/in-row split brought it below threshold. `use-gantt-layout.ts` and `PrintGanttChart.tsx` tick suppression: extracted shared `suppressOverlappingTicks` + `shouldSuppressTick` + `TickSuppressionParams` interface to `gantt-utils.ts`. Both call sites now collapse to a single-line memoized call; raw layout primitives pass through the param object rather than a callback to preserve per-param memoization stability. Dead inline consts (`MIN_LABEL_PX = 40`, `PRINT_ELEMENT_PROXIMITY_PX = 25`, `PRINT_TODAY_PROXIMITY_PX`) deleted post-refactor.
  - **Known cosmetic lint warning.** `PrintGanttChart.tsx:165` retains an `eslint-disable-next-line react-hooks/preserve-manual-memoization` directive that currently reports as "unused" because the rule is dormant in this project's ESLint config. Preserved intentionally for future-proofing — if the rule activates after a plugin update, the directive correctly targets the closing `)` of the `useMemo` call terminator where `printDensityPx` instability would surface. The `// NOSONAR` comment on the same line is load-bearing and independent of the disable directive.
  - No behavior change. All 1218 tests pass; typecheck clean.

## 0.38.5 — 2026-04-23

### Internal

- **Flattened cognitive complexity in the dependency graph and milestone simulation parameter builder** (PR 3 of the three-PR lint-debt paydown plan; see `/Users/william/.claude/plans/here-is-what-claude-vivid-jellyfish.md` for the full scope). All five `sonarjs/cognitive-complexity` errors in `src/core/schedule/dependency-graph.ts` (CC 16, 36, 17, 21) and `src/core/schedule/milestone-sim-params.ts` (CC 17) brought under the 15-allowed threshold. Lint count: 79 → 74 errors (0 warnings).
  - **`src/core/schedule/dependency-graph.ts`**: extracted `populateAdjacency` + `kahnTopoSort` from `buildDependencyGraph`; extracted `buildAdjacencyForCycle`, `reconstructCyclePath`, and `findCycleFrom` (single-DFS-tree visitor) from `detectCycle`; extracted `validateDepStructure` from `validateDependencies`; introduced shared `runForwardPass` / `runBackwardPass` primitives now reused by both `computeCriticalPathDuration` and `computeCriticalPathActivities`; extracted `computeActivityScheduleWithMilestone`, `applyHardConstraintIfPresent`, and `computeMilestoneDurations` from `computeCriticalPathWithMilestones`.
  - **`src/core/schedule/milestone-sim-params.ts`**: extracted `snapForwardToWorkingDay` (now shared by project-start and milestone-target snapping), `buildMilestoneActivityMap`, and `computeActivityEarliestStartOffset` from `buildMilestoneSimParams`.
  - **`stryker.config.mjs` + `vitest.stryker.config.ts`**: added `milestone-sim-params.ts` (and its test file) to the Stryker mutate scope so future refactors of that file have a baseline to compare against. Caught a latent gap during the baseline run — the file had no mutation coverage before this PR.
  - **Verified by Stryker mutation re-run against the pre-refactor baseline** (cold cache, ~13 min per run): `dependency-graph.ts` mutation score 89.13% → **89.27%** (survivors 20 → 19); `milestone-sim-params.ts` survivor count unchanged (8 → 8). The headline percentage drop on `milestone-sim-params` (80.00% → 77.78%) comes entirely from the extracted helpers producing more type-checker-rejected mutants (`# errors` 8 → 14), not new test gaps.
  - No behavior change. All 1218 tests pass; typecheck clean.

## 0.38.4 — 2026-04-21

### Internal

- **Flattened nested-function depth in the Zustand project and notification stores** (PR 2 of the three-PR lint-debt paydown plan). All 10 `sonarjs/no-nested-functions` errors resolved. Lint count: 89 → 79 errors (0 warnings).
  - Added four module-level helpers to `src/ui/hooks/use-project-store.ts`: `updateProjectInList(projects, projectId, transform)`, `updateScenarioInList(projects, projectId, scenarioId, mutation)`, `patchActivityInList(activities, activityId, patch)`, and `filterOut(arr, value)`. Each is a plain function that takes its callback as a parameter, so inlining them at call sites no longer counts as a nested function definition.
  - Rewrote 9 store actions (`addActivity`, `duplicateActivity`, `updateActivityChecklist`, `updateActivityDeliverables`, `updateActivityNotes`, `updateScenarioNotes`, `setSimulationResults`, `removeConvertedWorkDay`, `toggleScenarioLock`) to use these helpers. Each action went from 5 nested arrow levels (store setter → `set((state) =>)` → `.map((p) =>)` → `updateScenario(..., (s) =>)` → `activities.map((a) =>)`) to 3.
  - `src/ui/hooks/use-notification-store.ts`: extracted the filter predicate into a module-level `removeFromList(notifications, id)` helper shared by both `addNotification`'s auto-dismiss `setTimeout` and the explicit `removeNotification` action. Eliminated the single `sonarjs/no-nested-functions` error at line 37.
  - No behavior change. All 1218 tests pass; undo/redo, activity mutations, and notification dismissal are observationally identical.

## 0.38.3 — 2026-04-21

### Internal

- **Eliminated all four ESLint warnings and three errors from the pre-existing lint baseline** (PR 1 of a three-PR lint-debt paydown plan; see `/Users/william/.claude/plans/here-is-what-claude-vivid-jellyfish.md` for the full scope). Lint count: 96 → 89 problems (92 errors + 4 warnings → 89 errors + 0 warnings). Two of the warnings were real React correctness signals, not stylistic — see below.
  - **`ScenarioSummaryCard.tsx` — eliminated double-render on heuristic %-input prop changes.** The two `useState` + `useEffect` pairs that synced `localMinPct`/`localMaxPct` to `settings.heuristic{Min,Max}Percent` triggered `react-hooks/set-state-in-effect` warnings and caused a second render after every scenario switch or undo/redo. Replaced with React's documented "adjust state during render" pattern (`useState` for previous prop + `if (prev !== current) setPrev(current); setLocal(...)`), which commits a single render per prop change.
  - **`SimulationPanel.tsx` — restored React Compiler optimization of `targetLookup` useMemo.** The manual dep list listed `simulationResults?.samples` (a narrower shape than the React Compiler's inferred `simulationResults`), which tripped `react-hooks/preserve-manual-memoization` and prevented compiler-driven optimization. Broadened the dep to the full `simulationResults` object; the memoized body already null-guards `simulationResults?.samples?.length`, so the widening is safe. Also extracted the inline `pct >= greenPct ? ... : pct >= amberPct ? ...` ternary into a named `healthColor()` helper and pre-computed the `by ${dateLabel}` suffix to eliminate the adjacent SonarJS `no-nested-conditional` and `no-nested-template-literals` errors.
  - **`ThemeToggleButton.tsx` — restored fast-refresh HMR.** The file exported a non-component `nextTheme` helper alongside the component, which tripped `react-refresh/only-export-components` and disabled HMR for the file. Dropped the `export` keyword; `nextTheme` is used only internally.
  - **`eslint.config.js` — added `coverage/` to the ignores list.** The auto-generated Istanbul coverage output (`coverage/block-navigation.js`) was surfacing an `Unused eslint-disable directive` warning on every lint run.

## 0.38.2 — 2026-04-21

### Fixed

- **Printed PDF report no longer shows a misleading Confidence label for Triangular and Uniform activities.** The Statistical PERT Ratio Scale Modifier (RSM) only drives the proxy standard deviation for Normal and LogNormal distributions; Triangular and Uniform activities ignore the stored `confidenceLevel`. The interactive grid already greys the cell out, and the XLSX/CSV schedule exports already write an empty cell for these distributions, but `PrintableReport.tsx` rendered `RSM_LABELS[activity.confidenceLevel]` unconditionally for every row. The print path now mirrors the same `distributionType === "normal" || "logNormal"` guard used by `buildGridRows`, falling back to an em-dash (`—`) — the standard N/A sentinel elsewhere in the printed report — for non-SPERT distributions.

### Internal

- Added two regression tests to `schedule-export-service.test.ts` asserting `row.confidence === ""` for `distributionType: "triangular"` and `"uniform"` in `buildGridRows`. The existing guard was previously untested (the only fixture defaulted to `logNormal`), so a future refactor could have silently regressed it.

## 0.38.1 — 2026-04-20

### Fixed

- **Scenario tab row now scrolls horizontally with a standard mouse wheel on Windows.** Chromium-family browsers do not translate vertical wheel events to horizontal scroll on containers whose only overflow axis is X, so users with many scenarios had to use Shift+Wheel or click a partially-visible tab. A scoped native wheel listener on the scroll container now redirects `deltaY` into `scrollLeft` when the container overflows and the event has no horizontal component. Trackpad two-finger horizontal gestures (which carry `deltaX`) are passed through unchanged. Firefox's line-mode deltas (`deltaMode === 1`) are converted to pixels via a 16× multiplier.

## 0.38.0 — 2026-04-19

### Security

- **Sign-out now fully wipes per-user session data.** Previously, after signing out of Cloud Storage, the prior user's projects, preferences, and last-active scenario map remained in both the in-memory store and `localStorage`. On a shared browser, the next user could see the prior user's data and — in rare cases — inadvertently upload it to their own Firestore account. Sign-out now cancels pending Firestore writes, zeros the Zustand project store, and clears `spert:project:*`, `spert:project-index`, `spert:user-preferences`, and `spert-scheduler:active-scenarios`. Storage mode (`spert:storage-mode`), first-run banner state, and the Nager country cache are intentionally preserved for continuity.
- **Sign-out during an edit no longer races revoked credentials.** The Firestore driver now exposes a `cancelPendingSaves()` method (idempotent, silent drop) that runs before `firebaseSignOut`, so queued 500 ms-debounced writes cannot fire with revoked credentials. `beforeunload` still flushes — tab-close semantics are unchanged.
- **ToS-mismatch forced sign-out now routes through the same cleanup** as user-initiated sign-out, so both paths cannot drift.
- **ToS acceptance write failures no longer strand the user.** When the Firestore write to `users/{uid}` fails, `LS_TOS_WRITE_PENDING` is now left set and `LS_TOS_ACCEPTED_VERSION` is unset, so the next sign-in retries Branch A and creates the missing record. Previously the local flags were finalized unconditionally, which could leave the user marked accepted locally but missing from Firestore — causing cross-app re-prompts.

### Added

- **Auth chip now has a "signed-in + local" state (state d).** When you are signed in but using Local Storage, the chip shows your avatar + lock icon and opens a popover with two actions: "Switch to Cloud Storage" (navigates to Settings — does not auto-switch) and "Sign Out". Previously the chip rendered "Local only / Sign in" to already-signed-in users, with no way to sign out from the header.
- **Cloud → Local mode switch now prompts.** When toggling off Cloud Storage with projects present, a confirmation modal offers "Keep local copy" (default) or "Discard". Discard clears `spert:project:*`, `spert:project-index`, `spert-scheduler:active-scenarios`, and zeros the in-memory store. Preferences are preserved — you're still the same person.
- **OAuth popup errors are now differentiated.** Closing the popup (`auth/popup-closed-by-user`) or double-clicking Sign In (`auth/cancelled-popup-request`) is a silent no-op — the page no longer redirects away. Popup-blocker browsers still fall back to `signInWithRedirect` and now show an explanatory toast before navigating. Other errors surface a "Sign-in failed" toast.
- **After a successful sign-in from the header chip's modal**, the modal closes and the app navigates to `/settings` so you can immediately toggle Cloud Storage with one click. Previously the modal stayed open with no guidance.
- **Shared `getFirstName()` helper** for rendering user names with Microsoft "Last, First" reversal. Used by the auth chip (both states c and d) and the SharingSection member list — no more duplicated comma-parsing logic.

### Internal

- New `FirestoreDriver.cancelPendingSaves()` method (bulk sibling of the existing `cancelPendingSave(id)`).
- New `LocalStorageRepository.clearAll()` method for wiping all indexed project keys.
- New `clearAllLastScenarios()` in `scenario-memory.ts` and `clearPreferences()` in `preferences-repository.ts`.
- New `clearAllData()` action on `useProjectStore` — zeros `projects`, `loadError`, `loadErrors`, `undoStack`, `redoStack` in a single `set()` call. Does not touch `localStorage` or emit sync events.
- New `clearInMemory()` action on `usePreferencesStore` — resets preferences to defaults without writing to `localStorage` (unlike `resetPreferences`, which writes defaults).
- New `sign-out-cleanup-registry.ts` module — module-level single-slot callback so `StorageProvider` (deepest provider with access to all stores and the driver handle) can hand a cleanup closure to `AuthProvider` without crossing the `AuthProvider → StorageProvider` context boundary.
- New `getCloudSyncDriver()` exported from `use-cloud-sync.ts` — module-level driver handle that the registry reads during sign-out. Null when cloud mode is inactive.
- New `src/ui/providers/auth-errors.ts` — extracted `classifyPopupError()` and the `SIGN_IN_POPUP_BLOCKED` constant to keep `AuthProvider.tsx` component-only (react-refresh hygiene).
- New `src/ui/helpers/format-user.ts` — `getFirstName(displayName, email)`.
- New `src/ui/components/KeepOrDiscardLocalModal.tsx` — Radix dialog for the Cloud→Local confirmation.
- `useCloudSync` teardown now calls `cancelPendingSaves()` instead of `flushPendingSaves()` on mode-switch and sign-out; `beforeunload` still flushes.
- 42 new tests covering all new primitives and the popup-error classifier.

## 0.37.4 — 2026-04-17

### Added

- Gantt chart now auto-draws finish-to-start arrows between adjacent activities when Dependency Mode is OFF. This makes the implicit sequential ordering visually explicit. The existing Arrows toolbar checkbox now also appears in non-dependency mode so you can hide the auto-drawn arrows if they aren't useful. Auto-drawn arrows are non-interactive and do not carry critical-path styling — in sequential mode every activity is trivially on the critical path, so the stripe would add no information.

## 0.37.3 — 2026-04-16

### Fixed

- Header title and navigation tabs (Projects, Calendar, Settings, About) now use an inline-flex layout, working around a Chromium 147 rendering regression that caused the pointer-cursor affordance to disappear (and in Brave, clicks to miss the center of nav tabs). The workaround is harmless on unaffected browsers.

## 0.37.2 — 2026-04-16

### Fixed

- Header buttons (theme toggle, cloud auth chip) now show the pointing-finger cursor on hover. This restores the click affordance that was lost with the Tailwind v4 upgrade, which removed the default `cursor: pointer` on `<button>` elements.
- Header title "SPERT® Scheduler" is now fully clickable across its entire width at any viewport size — previously the title could wrap on narrow viewports, leaving the second line outside the hit target.
- Navigation links (Projects, Calendar, Settings, About) now explicitly declare the pointing-finger cursor and no-wrap behavior, so the click target stays consistent across browsers including Brave.

## 0.37.1 — 2026-04-16

### Fixed

- Scenario tab row: hid the horizontal scrollbar that was rendering as a thick gray bar over the tab underline. Scrolling still works via drag, wheel, and keyboard; overflow is now signaled by partially-visible tabs at the edge.

## 0.37.0 — 2026-04-16

### Added

- Scenario tabs now scroll horizontally when there are more scenarios than fit. The Compare button stays pinned on the right edge and is always visible.

### Changed

- Cloning a scenario now inserts the new clone immediately to the left of the source scenario, instead of appending to the end. Cloning from the "+" Add dialog follows the same placement rule. The clone becomes the active scenario and is auto-scrolled into view if off-screen.

## 0.36.4 — 2026-04-10

### Improved

- Sign-in modal buttons now show Google and Microsoft brand icons.

## 0.36.3 — 2026-04-10

### Added

- Sign-in modal when clicking the auth chip. Opens a focused dialog with Google and Microsoft sign-in buttons instead of navigating to the Settings page.

### Fixed

- Horizontal layout shift caused by the scrollbar appearing and disappearing when navigating between pages of different heights.

## 0.36.2 — 2026-04-09

### Changed

- Auth chip in the header is now a single clickable pill. When signed in to cloud storage, clicking anywhere on the chip opens a small account menu showing your name and email, with a Sign Out button. Dismiss with Escape or by clicking outside. When signed out, clicking the chip still opens the sign-in flow.

## 0.36.1 — 2026-04-08

### Fixed

- Dependency edit modal: negative lag (lead time) values like "-5" can now be entered reliably. The Lag Days field auto-selects its current value on focus and accepts the minus sign as you type. Out-of-range values are clamped to ±365 days on save.

## 0.36.0 — 2026-04-08

### Added

- Theme toggle button in the header (between About and the cloud storage chip). Click to cycle Light → Dark → System; the icon reflects the current state.
- Per-project tile color: pick one of 8 muted accent colors (Slate, Sage, Sky, Lavender, Rose, Amber, Teal, Clay) to color-code projects on the Projects page — useful for grouping projects that belong to the same program. The color shows as a 4px left border strip on the tile. (Schema v19 → v20.)
- Import Projects button on the Projects page header (next to Export All Projects). Matches the header layout used by other SPERT Suite apps.

## 0.35.0 — 2026-04-05

### Legal

- Updated Terms of Service and Privacy Policy to v04-05-2026.
- Added SPERT AHP to list of covered apps.
- Updated effective date to April 5, 2026.

## 0.34.9 — 2026-04-05

### Improved

- Header auth chip: replaced the text-button sign-in and avatar dropdown with the SPERT Suite split-pill design. Signed-in state shows a 26px avatar circle with first initial, first name only, and a cloud icon segment that navigates to Settings. Local/signed-out state shows a lock icon with "Local only" and a "Sign in" action segment.

## 0.34.8 — 2026-04-03

### Improved

- Activity grid: the delete (×) button is now gray at rest and turns red only on hover, reducing visual clutter while preserving discoverability.

## 0.34.7 — 2026-04-02

### Added

- Projects page: new "Export All Projects" button exports all active projects in one click (same JSON format as the Settings export, simulation results excluded). Disabled when there are no active projects.
- localStorage warning banner: an amber caution banner now appears on every page when data is stored locally, reminding users to export at the end of each session. "Got it" dismisses for the session.
- Settings → Notifications: new section with a toggle to permanently suppress the localStorage warning banner across sessions.

### Improved

- Settings page: "Schedule Export" section renamed to "Export Schedule" for consistency with action-first labeling.

## 0.34.6 — 2026-04-02

### Improved

- Gantt: finish date bar labels are now right-aligned inside the bar, anchoring the date visually to the bar's right (finish) edge instead of floating at center.

## 0.34.5 — 2026-04-01

### Security

- XLSX export now guards against Excel formula injection (cells starting with `=`, `+`, `-`, `@`, `\t`, `\r` are prefixed with `'`), matching the existing CSV export protection.
- CSV/clipboard import pipeline: individual cell values are now capped at 1,000 characters before processing, and error messages truncate echoed user values to 80 characters.
- Import parsing stops early once the 500-activity limit is reached, avoiding unnecessary processing of oversized files.
- `sanitizeForFirestore` now explicitly skips `__proto__`, `constructor`, and `prototype` keys as defense-in-depth.

### Fixed

- Min, Most Likely, and Max summary totals are now rounded to the nearest whole number in the activity grid and schedule exports (XLSX and CSV).

### Maintenance

- Added Firestore `hasOnly` drift detection test: parses `firestore.rules` at test time and compares against the Zod preferences schema to catch missing allowlist entries.
- Added "update `firestore.rules` `hasOnly` list" step to the CLAUDE.md user preference checklist.

## 0.34.4 — 2026-04-01

### Maintenance

- Extracted `useScheduleExport` hook from `ScenarioSummaryCard` — export state and handlers (XLSX, CSV) now live in a self-contained hook, reducing component body by ~30 lines.
- Extracted `DependenciesDisplaySection` and `ScheduleAnalysisSection` as local sub-components in `ActivityEditModal`, and extracted `computeConstraintUpdates` as a module-level helper to reduce nesting in `buildFieldUpdates`.
- SonarJS `no-nested-conditional` remediations: extracted `selectAutoTickLevel` in `gantt-utils.ts`; `resolveButtonClass` in `CopyImageButton.tsx`; `resolveUsageBarColor` in `LocalStorageSection.tsx`; `formatMilestoneCount` in `MilestonePanel.tsx`; label position logic in `HistogramChart.tsx`.
- SonarJS `cognitive-complexity` remediation: extracted `runSimulationSync` from `simulation-service.ts`.
- Updated `vitest` version pin to `^4.1.2` (cosmetic — already resolved to 4.1.2).

## 0.34.3 — 2026-04-01

### Improved

- Activity grid: hover over any row to reveal a pencil icon in the name cell that opens the Edit Activity modal directly.
- Min/ML/Max estimate columns narrowed (42px → 38px) and Status/Actual columns trimmed for a more compact layout.
- Estimate values (Min/ML/Max) are displayed as integers in the grid; decimals are accepted during entry and rounded on save.

## 0.34.2 — 2026-04-01

### Added

- Activities with notes now show a small violet indicator beneath the activity name in the grid (alongside the existing task and deliverable bars), and a violet dot on the Notes section header in the Edit Activity modal.

## 0.34.1 — 2026-04-01

### Changed

- Any scenario can now be deleted. The last remaining scenario is protected from deletion instead of the first (Baseline) scenario.

## 0.34.0 — 2026-03-31

### Added

- CDF date probability lookup: enter a target finish date above the Cumulative Distribution chart to see the probability of finishing by that date, with a RAG-colored reference line on the chart (green/amber/red based on Schedule Health thresholds).
- Scheduled Start date now displayed in the Edit Activity modal alongside Scheduled Finish and Duration.

### Fixed

- CDF chart x-axis changed from categorical to numeric scale, producing a true CDF curve shape instead of a straight line.
- CDF chart resolution increased from 500 to 1,000 downsampled points for better tail accuracy.
- Edit Activity modal no longer falsely reports unsaved changes when opened and closed without modifications.

### Changed

- Edit Activity modal: "Sched. Duration" and "Actual Duration" labels abbreviated to "Sched. Dur." and "Actual Dur." for better layout at Complete status.

## 0.33.8 — 2026-03-31

### Maintenance

- Updated Terms of Service and Privacy Policy to v03-31-2026.
- Updated canonical legal document URLs to spertsuite.com.
- Updated consent UI text to SPERT® Suite branding.

## 0.33.7 — 2026-03-29

### Fixed

- CDF chart probability capped at 99%. The cumulative distribution tooltip previously displayed "Probability: 100%" at the rightmost data point, implying certainty that the project cannot exceed the maximum simulated duration. Monte Carlo samples are finite — the true distribution tail always extends beyond the observed maximum.

## 0.33.6 — 2026-03-29

### Fixed

- Web Worker trial count validation ceiling raised from 50,000 to 100,000 to match the Zod schema and UI options introduced in v0.33.5. Previously, selecting 100,000 trials caused a worker validation error.

## 0.33.5 — 2026-03-29

### Added

- Monte Carlo simulation trial count option: 100,000 trials now available in both the scenario settings and default preferences dropdowns. Useful for audit-grade precision where reduced variance is needed.

## 0.33.4 — 2026-03-29

### Added

- Gantt chart row guide lines: faint horizontal lines every 3 rows to help visually track activities to their bars. On by default; toggle in the Gantt appearance panel under Shading.

## 0.33.3 — 2026-03-28

### Changed

- Gantt chart color presets expanded from 4 to 10: Classic, Professional, Colorful, Grayscale, Contrast, Forest, Ocean, Sunset, Lavender, Earth.
- Retired Monochrome and Warm presets; existing projects using them fall back to Classic.
- About page: removed "IT" qualifier from project manager audience description.
- About page: License section now links to the GitHub LICENSE file and discloses the Section 7(b) non-permissive attribution requirements.

## 0.33.2 — 2026-03-28

### Enhanced

- Cumulative Distribution Function (CDF) chart tooltip now shows projected finish date alongside duration and probability when hovering over the curve, making it easy to answer "what's the probability my project finishes by this date?"
- Scenario comparison CDF chart tooltip also includes projected finish dates.

## 0.33.1 — 2026-03-28

### Changed

- Default distribution type changed from Normal (T-Normal) to Triangular in both user preferences and scenario settings, aligning with the recommended distribution for the updated heuristic defaults.
- Default heuristic minimum changed from 50% to 75% in both user preferences and scenario settings, bringing congruence with Triangular distribution recommendations.
- Footer now includes a "License" link pointing to the project's GNU GPL v3.0 LICENSE file on GitHub (with Section 7(b) non-permissive additional terms), alongside the existing Terms of Service and Privacy Policy links.

## 0.33.0 — 2026-03-28

### Chore — Clean Code Audit

Static analysis audit of the entire `src/` directory using `eslint-plugin-sonarjs` added to the existing ESLint configuration. No functional changes. All 1,123 tests pass, matching the pre-audit baseline exactly.

**Tooling added:**
- `@vitest/coverage-v8` — coverage reporting (dev dependency)
- `eslint-plugin-sonarjs` — static analysis with SonarJS recommended ruleset (dev dependency)
- ESLint config override: `sonarjs/assertions-in-tests` disabled for `**/*.test.ts` and `**/*.test.tsx` (false positives from `fc.assert()` property-based tests)

**Findings: 144 → 98 (46 eliminated, 12 rules fully resolved)**

**Fixed — code changes:**
- `no-identical-functions`: `removeById()` now delegates to `remove()` in `local-storage-repository.ts`
- `no-nested-template-literals` (8): inner templates extracted to named consts in `WarningsPanel.tsx`, `export-import-service.ts`, `GanttChart.tsx`
- `exhaustive-deps`: extracted `projectName` const before `useEffect` in `ProjectPage.tsx`
- `no-unused-collection`: removed dead `rows` array and push loop in `flat-activity-parser.test.ts`

**Suppressed — intentional or false positives:**
- `assertions-in-tests` (14) — `fc.assert()` not recognized by SonarJS
- `no-unused-vars` (8) — intentional destructuring discards using established `_` prefix convention
- `pseudo-random` (4) — bootstrap CI resampling and test data generation, not security-sensitive
- `no-duplicated-branches` (1) — SNET/MSO cases intentionally identical in forward pass; difference manifests in backward pass
- `set-state-in-effect` (1) — intentional reset on lock state change
- `preserve-manual-memoization` (1) — `printDensityPx` instability acceptable in print-only context
- `table-header` (3) — presentation layout tables, no logical header row
- `concise-regex` (1) — explicit character class documents hyphen exclusion intentionally

**Deleted:**
- `src/core/schedule/target-rag 2.ts` — macOS copy artifact, not imported anywhere

**Deferred (structural complexity, out of scope):**
- `sonarjs/no-nested-conditional` (56) — requires surgical decomposition
- `sonarjs/cognitive-complexity` (32) — scheduling engine and parser logic; correctness-critical
- `sonarjs/no-nested-functions` (10) — case-by-case review needed

Top complexity offenders — `computeDependencySchedule` (140) and `parseActivities` (104) — deliberately untouched as correctness-critical algorithms where decomposition carries regression risk.

## 0.32.3 — 2026-03-28

### Bug Fixes

- Gantt chart: reduced Today proximity suppression threshold (`TODAY_PROXIMITY_PX`) from 60px to 44px. On compressed fit-to-window timelines (~1,500+ day projects in ~900px chart area), the previous threshold suppressed quarterly ticks that had adequate visual clearance, leaving visible gaps in the timeline header (e.g. Q2 → Q4 with no Q3 label).

## 0.32.2 — 2026-03-27

### Security

- Activity Edit Modal: added date format validation guard (`/^\d{4}-\d{2}-\d{2}$/`) on Actual Finish Date blur handler to prevent malformed strings from propagating NaN through `parseDateISO` and calendar math.
- Activity Edit Modal: actual duration input now clamps to positive integers (`Math.max(1, Math.floor)`) at both the handler and `buildFieldUpdates` save layers, preventing negative, zero, or NaN values from reaching the store.
- Activity Edit Modal: replaced magic number `10000` with exported `MAX_CALENDAR_ITERATIONS` constant for non-work-day snapping loop guard.

### Internal

- Exported `MAX_CALENDAR_ITERATIONS` from `@core/calendar/calendar` for reuse in UI handlers.

## 0.32.1 — 2026-03-27

### Refactoring

- ActivityEditModal: extracted `ScheduleContextRow` local component and `buildFieldUpdates()` sub-function for cleaner save/dirty-check logic.
- GanttChart: extracted `GanttToolbar` local component (~108 lines) from the main render body.
- gantt-utils: consolidated `monthTickLabel`, `quarterlyTickLabel`, `semiannualTickLabel` via shared `tickLabelWithYear` helper.
- gantt-utils: completed `toISO` deprecation — all internal uses replaced with `formatDateISO` from `@core/calendar/calendar`.
- gantt-utils: removed `buildOrderedActivities` no-op function and its 4 tests.
- activity-row-helpers: documented `computeElapsedDays` dual-type calendar parameter.

### Tests

- Added 5 new tests: `semiannualTickLabel` edge case, `countQuarterlyTicks`/`countSemiannualTicks` same-day boundaries, `generateTicks` forced monthly, `computeWeekendShadingRects` trailing span closure.

## 0.32.0 — 2026-03-27

### New Features

- Gantt chart **Fit to Window** toggle: compresses the full project timeline into the visible container width with no horizontal scrolling. Enables the copy-image button to capture the complete chart — including multi-year programs — for presentations.
- Gantt chart **Timeline Labels** control (Sparse / Normal / Dense): directly selects tick granularity for multi-year projects (>540 days). Dense shows monthly ticks, Normal shows quarterly (Q1–Q4), Sparse shows semi-annual (H1/H2). Works with or without Fit to Window.

### Enhancements

- Quarterly tick labels follow the `monthTickLabel` pattern: year shown on first tick and year-change boundaries only (e.g. "Q2 '26", "Q3", "Q4", "Q1 '27").
- Semi-annual tick labels: "H1 '26", "H2", "H1 '27" etc., with year on first tick and year boundaries.
- Year-carrying tick labels (e.g. "Q1 '27", "H1 '28", "Jan '26") render in **bold** for easy year-break identification.
- Today line proximity suppression: ticks within 60px of the Today line are suppressed for all ticks (including the first) since Today's label already shows the full date and year. Other chart elements (finish line, milestones) use a tighter 40px threshold.
- Print chart parity: all tick density, bold year labels, and collision suppression changes mirrored in PrintGanttChart.

### Internal

- Schema version 18 → 19 (migration adds `fitToWindow` to existing Gantt appearance settings; `timelineDensity` is optional — no additional migration needed).
- New exports in `gantt-utils.ts`: `quarterlyTickLabel`, `semiannualTickLabel`, `countQuarterlyTicks`, `countSemiannualTicks`.
- New constant `TODAY_PROXIMITY_PX` (60px) in `gantt-constants.ts` for Today-specific tick suppression.
- `generateTicks` accepts optional `tickLevel` parameter; `TickLevel` type extended with `"semiannual"`.
- Collision suppression decoupled: tick-to-tick uses 40px minimum, Today proximity uses 60px, density setting controls only tick level selection.

## 0.31.0 — 2026-03-27

### New Features

- Activity Edit Modal: bidirectional Actual Finish Date field for completed activities. Enter a finish date to auto-calculate duration, or enter a duration to auto-calculate the finish date. Uses the project work calendar for accurate working-day math.

### Enhancements

- Activity Edit Modal: Actual Duration field now editable for in-progress activities, matching the activity grid behavior. Shows "Elapsed" placeholder when empty; falls back to computed elapsed working days on save if cleared.
- Estimates section in Activity Edit Modal now defaults to collapsed, reducing visual noise on modal open.

## 0.30.5 — 2026-03-27

### Enhancements

- Dependency type dropdowns and labels now show full names (Finish-to-Start, Start-to-Start, Finish-to-Finish) instead of two-letter abbreviations for improved clarity.

### Refactoring

- Centralized dependency type labels into `dependencyLabel()` formatter in `format-labels.ts`, replacing the local constant in `DependencyEditModal`.

## 0.30.4 — 2026-03-27

### Enhancements

- Gantt bar label font size now scales with the activity font size selection (Small/Normal/Large/XL). Small is the minimum — larger settings increase readability.
- Bar labels (dates or durations) are hidden when they don't fit inside the bar, preventing clipped or overlapping text.
- Bar label font is automatically capped to fit within the bar height when compact row density is combined with large/XL font sizes.

## 0.30.3 — 2026-03-26

### New Features

- Drag-and-drop scenario tab reordering: grab the grip handle on any scenario tab to drag it to a new position.

## 0.30.2 — 2026-03-26

### Bug Fixes

- Fixed CDF comparison chart legend overlap: scenario names were clipped by the x-axis label. Consolidated axis label into caption below the chart.

### Testing

- Added 67 mutation-testing gap-closure tests across constraint-utils, dependency-graph, and deterministic scheduler modules.
- Boundary equality tests for all 6 constraint types (MSO, MFO, SNET, FNET, SNLT, FNLT) in forward pass, backward pass, and conflict detection.
- SS/FF dependency backward pass tests: late dates, total float, and lag accounting.
- SS/FF forward pass tests: negative lag clamping to project start, positive lag offsets.
- SS/FF dependency violation detection coverage.
- Working-day skip loop tests: Saturday, Sunday, and holiday start date advancement.
- `actualDuration` guard tests: complete and inProgress activities with/without `actualDuration`.
- Conflict result shape tests: `undefined` vs array for `constraintConflicts` and `dependencyConflicts`.
- Critical path tests: `maxPredEF` correctness with hard MFO constraints, empty graph, milestone floor, cycle path structure.
- Invalid dependency filtering: non-existent IDs, self-loops, `validateDependencies` error types.

## 0.30.1 — 2026-03-26

### Bug Fixes

- Fixed activity name overflow at larger font sizes: `nameCharLimit` and `printNameCharLimit` now scale inversely with font size (`Math.floor(baseLimit * 12 / nameFontSize)`).
- Fixed small font size mapping (was 10px, now 11px as designed).
- Fixed comfortable row density dimensions (`rowHeight` 42→44px, `printRowHeight` 24→25px).
- Fixed print Gantt dependency lag label using hardcoded `fontSize="4"` instead of scaled `fs4`.

### Refactoring

- Extracted weekend shading computation to shared `computeWeekendShadingRects()` pure function in `gantt-utils.ts` (used by both interactive and print Gantt charts).

## 0.30.0 — 2026-03-26

### New Features

- **Gantt appearance controls**: Per-project Gantt chart appearance panel with name column width (narrow/normal/wide), font size (small/normal/large/XL), row density (compact/normal/comfortable), and bar label format (duration/dates/none).
- **Color presets**: 4 built-in color themes (Classic, Monochrome, Ocean, Warm) with light and dark mode variants. Classic matches the existing Gantt colors exactly.
- **Custom bar colors**: Override planned and in-progress bar colors with any color via a swatch picker or native color input. Custom colors clear when switching presets.
- **Weekend/non-work day shading**: Optional gray bands on the Gantt chart highlighting non-working days (uses the project's work calendar).
- **Settings travel with project**: Appearance settings are stored on the project and survive export/import round-trips.
- **Print parity**: Print Gantt chart mirrors all appearance settings — layout dimensions, bar colors, font scaling, weekend shading, and bar labels.
- **Palette toggle**: New palette icon button in the Gantt toolbar shows/hides the collapsible appearance panel.

### Technical

- `resolveGanttAppearance()` pure function maps `GanttAppearanceSettings` to concrete pixel values and colors.
- Hatch patterns now use `strokeOpacity` approach with bar colors instead of separate named `hatchActivity`/`hatchInProgress` colors.
- `dateToX()` no longer has a default `leftMargin` parameter — all call sites pass it explicitly.
- `useGanttLayout` hook parameterized with `leftMargin`, `rowHeight`, and `barHeight`.
- New `GanttAppearancePanel` component with segmented controls and inline color pickers.
- `updateGanttAppearance` store action (pushUndo, no lock guard, no simulation invalidation).

### Schema

- v17 → v18: Added optional `ganttAppearance` field to `Project` interface.

## 0.29.3 — 2026-03-26

### New Features

- **Persist "Show Activity IDs"**: The Gantt toolbar toggle now persists per project (schema v17) instead of resetting on page navigation.
- **Finish Target on print report**: Project Summary section now includes the Finish Target date (or "—" if not set).
- **App version on print report**: The report header now shows the app version (e.g., "SPERT® Scheduler v0.29.3") for traceability.
- **Gantt timeline months**: Projects spanning 91+ days now show monthly tick marks (month name only) instead of biweekly date ticks. Year is shown on the first tick and at year boundaries.
- **Gantt "Today" date**: The Today vertical line now shows the formatted date beneath the label, matching the milestone label style.
- **Gantt month gridlines**: Month gridlines are always visible even when the label is suppressed by collision with Today/Finish/Milestone markers.
- **Disabled toggle tooltip**: "Show Finish Target Date" checkbox shows a tooltip explaining why it's disabled when no target date is set.

### UI Polish

- **Print report tasks/deliverables layout**: Redesigned with activity header rows showing name + progress count, followed by indented item rows — clearer visual hierarchy and consistent column alignment between Tasks and Deliverables tables.
- **Hide FirstRunBanner from print**: The ToS/Privacy notification banner no longer appears on printed PDF reports.
- **Print CSS hardening**: Fixed Chrome print quirk where fixed-position elements ignored `display: none` — added `position: static`, `visibility: hidden`, and space-collapsing overrides.

### Schema

- Schema v16 → v17: Added optional `showActivityIds` field to Project.

## 0.29.2 — 2026-03-25

### Refactor

- Extracted shared `renderItemTable` helper in PrintableReport, eliminating duplicate Activity Tasks / Activity Deliverables table rendering.
- Extracted `formatItemColumn` helper in schedule-export-service, deduplicating tasks/deliverables column logic in `buildGridRows`.
- Extracted `ActivityProgressBars` named component in UnifiedActivityRow, replacing the inline IIFE with a clearer sub-component.

### UI Polish

- Deliverables progress bar color changed from teal to indigo for better visual distinction from the green completed-tasks bar.
- Deliverables checkbox color updated to indigo to match progress bar.

### Security

- Patched 3 high-severity transitive dependency vulnerabilities: `undici` 7.22.0 → 7.24.6, `picomatch` 4.0.3 → 4.0.4, `flatted` 3.3.3 → 3.4.2.

## 0.29.1 — 2026-03-25

### UI Polish

- Activity edit modal section counts (Tasks, Deliverables) now render in a smaller, lighter font for softer visual hierarchy.
- Blue dot indicators added to Scheduling Constraint and Dependencies section headers when content is present, matching the existing Notes indicator.
- Unsaved changes guard on activity edit modal: clicking outside with pending changes prompts "Save them?" — OK saves, Cancel returns to the modal. The explicit Cancel button always discards without prompting.

## 0.29.0 — 2026-03-25

### New Features

- Activity Deliverables — track deliverables (documents, artifacts, sign-offs) per activity with a checklist-style UI. Deliverables appear in the activity edit modal, schedule export (XLSX/CSV), and print report.
- Activity Notes — free-text notes field per activity (up to 2,000 characters) in the activity edit modal. Blue dot indicator on the Notes section header when notes are present.
- Scenario Notes — free-text notes field per scenario accessible via a memo icon in the summary card. Blue dot indicator when notes are non-empty.
- Finish Target placeholder styling — the Finish Target date input now shows lighter font weight when no date is set, providing a clear visual distinction from populated dates.

### Progress Bars

- Activity row progress bars now support deliverables: teal bar for in-progress deliverables, green when all delivered.
- When both tasks and deliverables are present, two half-width bars display side by side.

### Export & Print

- Schedule export (XLSX/CSV) includes two new columns: "Deliverables" and "Deliverable Details".
- Print report includes an "Activity Deliverables" table (same format as Activity Tasks).

### Schema

- Schema version bumped from 15 to 16 (passthrough migration — no data transformation needed).
- Checklist item limit raised from 20 to 50 per activity.

## 0.28.2 — 2026-03-25

### Security

- CSV formula injection guard expanded to cover tab (`\t`) and carriage return (`\r`) prefix characters per OWASP guidance.
- Added dedicated test coverage for CSV formula injection guard across all export paths.
- Suppressed false-positive ESLint `react-hooks/refs` error in PercentileTable with documented rationale.

## 0.28.1 — 2026-03-25

### Refactor

- Extracted RAG schedule health computation to a pure, testable utility (`computeTargetRAGColor`) — memoized at call site for better render performance.
- Extracted Gantt chart preferences into a consolidated `useGanttPreferences` hook, reducing GanttChart.tsx by ~50 lines.
- Extracted Schedule Health threshold UI into a standalone `ScheduleHealthSection` component.
- Cleaned up redundant prop spread in GanttSection.

### Dependencies

- Updated firebase, react-router-dom, recharts, typescript-eslint, eslint, @eslint/js, @vitejs/plugin-react to latest stable minor/patch releases.

## 0.28.0 — 2026-03-25

### New Features

- Finish Target Date — set a project-level target finish date (e.g., the date promised in your project charter) in the summary card. The target date appears between the Start and Finish dates for quick reference.
- Gantt chart Target line — optionally display the finish target as a vertical dashed line on the Gantt chart. Toggle visibility via the "Show Finish Target Date" checkbox in the Gantt toolbar.
- RAG schedule health indicator — the Target line and Finish Target date in the summary card reflect schedule health: green (simulation finishes by the green percentile), amber (within the amber threshold), or red (at risk). Gray/blue when no simulation has been run.
- Configurable RAG thresholds — set Green and Amber percentile thresholds in Settings under "Finish Target — Schedule Health". Defaults: Green at P80, Amber at P50.
- Monochrome-safe dash patterns — the Target line uses distinct dash patterns per RAG state so schedule health is distinguishable on black-and-white prints.

## 0.27.0 — 2026-03-24

### New Features

- Estimation Heuristics Suggester — new inline panel in Settings that helps you choose informed heuristic min/max percentages by selecting your industry domain and activity subdomain from a curated 73-entry reference table spanning 23 industries. Displays suggested optimistic and pessimistic percentages with rationale, and applies values to your heuristic defaults with one click.

## 0.26.2 — 2026-03-24

### Bug Fixes

- Corrected activity end date calculation. Previously, end dates were computed one working day too late (e.g., a 5-day activity starting Monday showed an end date of the following Monday instead of Friday). This also caused a 1-day gap between sequential activities. All scheduled dates are now consistent with standard project management conventions: the end date is the last working day of the activity. Existing project data is unaffected — only displayed schedule dates change.

## 0.26.1 — 2026-03-24

### Enhancements

- Redesigned bulk action toolbar: added Status dropdown (Planned, In Progress, Complete) alongside Confidence and Distribution. All three dropdowns now stage selections until you click "Apply." When applying a distribution change with heuristics enabled, you're prompted to recalculate min/max using current heuristic percentages.
- The browser's "Save as PDF" default filename now includes the project name and today's date (e.g., "SPERT Scheduler for My Project - March 24, 2026.pdf").

## 0.26.0 — 2026-03-23

### Enhancements

- New "Show Activity IDs" toggle in the Gantt chart toolbar. When enabled, sequential number prefixes (#1, #2, #3...) appear before activity names across the Gantt chart, activity grid, dependency panel, milestone panel, warnings panel, and modal dialogs — making it easy to reference specific activities by number during team conversations. Numbers match the # column in the schedule export. Toggle is session-only and resets on page reload.

## 0.25.3 — 2026-03-23

### Bug Fixes

- Activity Edit Modal now applies heuristic min/max auto-fill when the Most Likely value is changed, matching the behavior of the activity grid. Previously, editing ML in the modal with heuristics enabled did not recalculate min and max.

## 0.25.2 — 2026-03-23

### Enhancements

- Total Float and Free Float are now surfaced in three places in Dependency Mode: the schedule export (XLSX and CSV) includes new float columns; hovering over a Gantt activity bar shows a tooltip with scheduled dates and float values; and the Activity Edit Modal includes a new read-only Schedule Analysis section. Activities on the critical path are identified as such (Total Float = 0). Float values are only shown in Dependency Mode and do not appear in sequential mode schedules.
- Schedule export filenames now prefixed with "spert-scheduler" for easy identification.

## 0.25.1 — 2026-03-23

### Bug Fixes

- Copy image button now shows a disabled state with an explanatory tooltip in browsers that do not support image clipboard writes (Firefox). Chrome, Edge, and Brave are unaffected.

### Improvements

- Added Import Activities quick reference guide (PDF) link to the import section
- Updated Quick Reference Guide for v0.25.0
- PDF links now open in a new browser tab instead of triggering a download

## 0.25.0 — 2026-03-22

### New Features

- Import activities from CSV file or clipboard paste — parse spreadsheet data into a new scenario with full validation, dependency resolution, and cycle detection
- Download CSV template with 10 example activities demonstrating all four distribution types (T-Normal, LogNormal, Triangular, Uniform) with realistic dependency chains
- Live preview with debounced parsing, row-level error/warning display, and summary statistics
- Import to a new project or add as a scenario to an existing project, with one-click navigation to the imported project
- Confidence Level is optional for Triangular and Uniform distributions (only affects T-Normal and LogNormal)

## 0.24.4 — 2026-03-21

### New Features

- Dependency panel sort toggle — switch between alphabetical (A→Z) and schedule order (by predecessor start date) to view dependencies in the order they appear in the schedule

## 0.24.3 — 2026-03-20

### Bug Fixes

- Scheduling constraints (SNET, MSO, MFO, FNET) now work in sequential (non-dependency) mode — previously constraints were silently ignored when dependency mode was off
- Monte Carlo simulation in sequential mode now respects constraint-induced schedule gaps (position-tracking path with per-trial constraint application)

## 0.24.2 — 2026-03-20

### Security

- Gate project name console.warn behind `import.meta.env.DEV` in Firestore driver (prevents project name leakage to browser console in production)
- Add CSV formula injection guard (`^[=+@-]` prefix) to simulation CSV export `csvEscape()` — matches schedule-export-service pattern for suite consistency

## 0.24.1 — 2026-03-20

### Refactoring

- Extract `ChecklistSection` component from ActivityEditModal (~130 LOC reduction) with controlled component pattern
- Deduplicate `CONSTRAINT_LABELS` — shared constant + `constraintLabel()` helper in `@domain/helpers/constraint-labels.ts` (was duplicated in ActivityEditModal and PrintableReport)

### Bug Fixes

- Fix `handleAddTask` stale closure — `checklist.length` in useCallback dependency array caused unnecessary recreations; now reads prop directly in controlled component

### Dependencies

- All available upgrades (firebase 12.11.0, vitest 4.1.0, @vitejs/plugin-react 5.2.0, eslint 9.39.4) deferred — released within 60-day freshness window

## 0.24.0 — 2026-03-20

### New Features

- Activity task checklists — add, toggle, reorder, and remove tasks within each activity via the Activity Edit modal
- New "Tasks" section in Activity Edit modal with drag-and-drop reordering (max 20 tasks per activity)
- Thin progress bar under activity name in grid — color-coded: blue for in-progress, green when all tasks complete, gray when none complete; clickable to open Activity Edit modal
- Checklist progress visible in print report as "Activity Tasks" section with per-activity completion counts
- Schedule export (XLSX/CSV) includes Tasks summary and Task Details columns

### UI Improvements

- Task input retains focus after adding a task for rapid entry of multiple tasks

### Technical

- Schema v13 → v14 migration (optional checklist field on Activity)
- Dedicated store method for checklist updates preserves simulation results (no unnecessary re-runs)
- Activity duplication and scenario cloning generate fresh checklist item IDs

## 0.23.1 — 2026-03-19

### Bug Fixes

- Fix CDF chart x-axis "Duration (days)" label clipped by insufficient bottom margin
- Fix print Gantt dependency arrows rendering on top of bars instead of behind them (paint order parity with interactive chart)

### Performance

- Bootstrap CI computation 17× faster — batch all percentiles per sort instead of sorting per percentile
- Show 95% CI toggle now defers computation via setTimeout(0) to keep checkbox responsive

### UI Improvements

- Print Gantt buffer row label changed from "Buffer" to "Schedule Buffer" to match interactive chart
- Print Gantt buffer bar uses hatched yellow fill instead of solid yellow to match interactive chart
- Gantt buffer bar duration label (+Xd) now has a white halo for readability over hatched pattern
- Activity Edit modal: Name and Status fields side-by-side for compact layout
- Dependency Edit modal: Relationship Type and Lag Days side-by-side; predecessor/successor always editable via dropdowns
- Dependency panel: list sorted alphabetically by predecessor then successor name
- Dependency panel: click any row to open edit modal for full dependency editing
- Dependency panel: placeholder text in add-dependency dropdowns styled with muted color
- Locked scenarios: Gantt chart arrows fully unresponsive (no hover highlight, tooltip, or click)
- Constraint column dash and tags show pointer cursor to indicate clickability
- Scenario summary card: improved toggle-to-label spacing

## 0.23.0 — 2026-03-19

### Features

- Click Gantt chart bars to open expanded Activity Edit modal with four sections: General, Estimates, Scheduling Constraint, and Dependencies
- Click dependency arrows to edit relationship type, lag days, or delete via new Dependency Edit modal
- Hover dependency arrows for visual highlighting with thicker strokes and brighter colors
- Add dependencies directly from the Activity Edit modal's Dependencies section
- Terminal activity markers on Gantt chart — right-edge stripe automatically marks activities with no successor in dependency mode

## 0.22.3 — 2026-03-19

### Features

- Click activity names in the Gantt chart to rename them inline — saves on blur or Enter, cancel with Escape

### UI Improvements

- Gantt legend reordered: Complete, In Progress, Planned (matches workflow progression)
- Gantt legend: Today now appears before Finish to match left-to-right reading order on chart

## 0.22.2 — 2026-03-19

### Bug Fixes

- Fix histogram buffer shading not appearing when Parkinson's Law clamps all trials above deterministic duration

### Security

- Add `hasOnly()` field constraints to Firestore `users/{uid}` write rule to prevent arbitrary field injection
- Add `hasOnly()` field constraints to Firestore `spertscheduler_settings` write rule to restrict writable keys
- Add defensive `?? true` fallback to Parkinson's Law preference read in Settings page
- Harden schema migration v12→v13 to normalize non-boolean `parkinsonsLawEnabled` values via `typeof` check

## 0.22.1 — 2026-03-18

### Refactoring

- Extract shared ToggleSwitch component from ScenarioSummaryCard and PreferencesSection (6 duplicated toggle instances → 1 reusable component)

### Dependencies

- Upgrade zustand 5.0.11→5.0.12, tailwindcss 4.2.1→4.2.2, @tailwindcss/vite 4.2.1→4.2.2, typescript-eslint 8.57.0→8.57.1, @types/react 19.2.10→19.2.14

## 0.22.0 — 2026-03-18

### Features

- Add configurable Parkinson's Law toggle — disable per-scenario to allow simulated activity durations below the deterministic schedule

### Enhancements

- Add Parkinson's Law status to printed project report
- Add Parkinson's Law default toggle to user preferences
- Compact scenario summary card layout — consolidate target labels, shrink heuristic inputs, add tooltips to all toggles

## 0.21.2 — 2026-03-18

### Bug Fixes

- Fix LogNormal distribution sparkline curve peaking at wrong position — peak now aligns with the most-likely (mode) marker
- Fix mode marker vertical line offset in all distribution sparklines — now accounts for SVG padding to align with curve peak
- Fix histogram Buffer shading starting at Monte Carlo mean instead of deterministic P50 duration — shaded region now matches the buffer shown in the summary card

### Enhancements

- Make "Run simulation" text clickable in schedule buffer placeholder (ScenarioSummaryCard), giving users a third trigger point for simulation

### Security

- Add CSV formula injection guard: prefix cells starting with `=`, `+`, `@`, or `-` with a single quote
- Add 10 MB file size guard at the import service layer (was UI-only)
- Filter scenario memory localStorage entries to string values only
- Gate preferences validation logging behind development mode
- Document Firestore enum validation limitations and list rule workaround in SECURITY.md

## 0.21.1 — 2026-03-18

### Refactoring

- Extract type-dispatch helpers in scheduling core to deduplicate SS/FF/FS forward and backward pass logic
- Extract shared WarningItem component in WarningsPanel for consistent constraint/dependency conflict rendering

## 0.21.0 — 2026-03-18

### New Features

- Add Start-to-Start (SS) and Finish-to-Finish (FF) dependency relationship types alongside existing Finish-to-Start (FS)
- Type-aware forward/backward pass scheduling in both integer and date domains
- Dependency type selector in add form and inline editing on existing dependencies
- Type-aware Gantt chart arrow anchors: SS left-to-left, FF right-to-right, FS right-to-left
- Dependency constraint violation detection and display in Warnings panel
- Schedule export (XLSX/CSV) shows dependency type in predecessor/successor references (e.g., 1FS+2d, 2SS, 3FF)
- Gantt chart toggle to show/hide dependency arrows (persisted preference)
- FF arrows use U-turn path (exit right, curve out, approach target from right with left-pointing arrowhead)

### Technical

- Schema v11→v12 migration with defensive type write-forward
- Unified LS-based backward pass for all dependency types
- Post-pass dependency validation with sign-dispatch for negative lag

## 0.20.4 — 2026-03-18

### Enhancements

- Add optional constraint note field (up to 500 characters) to document why a scheduling constraint exists
- Add Constraints section to print report with Type, Date, Mode, and Note columns
- Add Constraint Note column to XLSX/CSV schedule exports
- Add SPERT® branding to print report header and footer
- Add sign-in buttons to Cloud Storage settings section for discoverability

## 0.20.3 — 2026-03-18

### Bug Fixes

- Fix heuristic Min/Max % inputs rejecting intermediate keystrokes — now validates on blur (ScenarioSummaryCard, PreferencesSection)
- Format constraint warning dates to match user's date format preference (ActivityEditModal, WarningsPanel)
- Change Clear constraint button color from red to green (no-error semantic)
- Use unique blue C icon for constraint legend indicator (was identical to Planned)
- Remove misleading hover pencil icon from Gantt chart rows

### Enhancements

- Move schedule export (XLSX/CSV) buttons into summary card buffer row, reclaiming vertical space between activity grid and dependency panel

## 0.20.2 — 2026-03-17

### Security

- Escalate write-forward migration failures to error callback (firestore-driver.ts)
- Add iteration guard to constraint date picker non-working-day snap loop (ActivityEditModal.tsx)
- Validate constraint type/mode enum domains in worker payload filter (simulation.worker.ts)
- Reject schema versions below 1 on project import (export-import-service.ts)
- Fix localStorage key namespace collision for active-scenario persistence (scenario-memory.ts)
- Harden filename sanitization: empty fallback, 200-char truncation (download.ts)
- Log Zod validation failures in preferences loader for diagnostics (preferences-repository.ts)

## 0.20.1 — 2026-03-17

### Refactoring

- Extract `useScenarioComparison` hook from ProjectPage (comparison mode state + handlers)
- Extract `EstimateInputs` component from UnifiedActivityRow (Min/ML/Max numeric inputs)
- Extract `BulkActionToolbar` component from UnifiedActivityGrid (bulk selection UI)

## 0.20.0 — 2026-03-17

### New Features

- Activity scheduling constraints: MSO, MFO, SNET, SNLT, FNET, FNLT with Hard/Soft modes
- Activity Edit Modal for managing scheduling constraints
- Warnings Panel showing constraint conflicts and violations with severity levels
- Constraint column in activity grid (dependency mode) with clickable badges
- Constraint indicators on Gantt chart bars (interactive and print)
- Dual backward pass: constraint-adjusted late dates + network-driven late dates (CPM float)
- Monte Carlo simulation respects hard constraints per trial
- Schema v10 to v11 migration with write-forward for Firestore

### Enhancements

- Schedule export (XLSX/CSV) includes constraint type, date, and mode columns
- Gantt legend includes constraint indicator when constraints are present
- Sequential-mode banner when constraints exist but dependency mode is off
- totalFloat computed from network-driven backward pass
- Soft constraint badges in activity grid show amber shading when a warning condition exists
- Wider activity name column in grid (reclaimed 70px from Distribution, Min/ML/Max, Confidence, Actions columns)
- Wider activity name area in Gantt chart (interactive: 260px, print: 170px) — shows up to 38 characters
- Date format option changed from YYYY-MM-DD to YYYY/MM/DD to prevent line-wrapping in grid cells
- Removed duplicate activity button from grid rows (available via scenario clone instead)

## 0.19.3 — 2026-03-17

### Enhancements

- Add "Date prepared" label to bottom-right of Gantt chart (interactive + print), providing context when the chart is copied or shared

### Bug Fixes

- Fix Max % heuristic input not accepting typed values (removed HTML `min` constraint that blocked intermediate keystrokes)
- Fix Gantt chart showing activities in topological sort order instead of grid order when dependency mode is enabled

## 0.19.2 — 2026-03-17

### Security

- Validate cached country data with Zod before use (`loadCachedCountries`)
- Add regex guard and `encodeURIComponent` on country code before URL construction (`fetchPublicHolidays`)
- Namespace localStorage cache key to `spert-scheduler:nager-countries`

## 0.19.1 — 2026-03-17

### Improvements

- Updated ARCHITECTURE.md: schema version v8→v10, added `workDays`, `convertedWorkDays`, `WorkCalendar`, holiday `source`/`countryCodes`/`locale` fields, `defaultHolidayCountry` and Gantt preferences to domain model, updated test count
- Updated SECURITY.md: added calendar configuration validation section covering `workDays` validation, `CalendarConfigurationError`, priority stack, holiday range limits, and filename sanitization
- Simplified `useShallow` to targeted selectors in CalendarPage.tsx and use-work-calendar.ts where single-value selection made shallow comparison unnecessary

## 0.19.0 — 2026-03-17

### New Features

- Configurable work week: click interactive day pills to toggle work days on/off, supporting any combination including non-contiguous schedules (e.g., Mon/Wed/Fri)
- Converted work days: override non-work days as work days on a per-project basis (e.g., make specific Saturdays count as work days)
- Smart validation: warns when adding a date that is already a work day or falls on a holiday
- Amber warning when converted work day list exceeds 50 entries, suggesting work week adjustment instead

### Improvements

- Holiday-blocked conversion notification now persists until acknowledged via "Got it" button (replaces auto-dismiss toast)
- Calendar page dynamically describes the active work week instead of hardcoded "Monday through Friday"
- All scheduling, Gantt charts, and exports respect the configured work week
- CalendarConfigurationError banner when work week settings produce no valid work days
- Zustand store selectors refactored with `useShallow` and targeted selectors to eliminate "Maximum update depth exceeded" re-render cascades
- `loadPreferences()` uses shallow comparison to prevent unnecessary state replacement from JSON deserialization

### Testing

- Added 85 new tests (643 → 728 total across 45 files) covering v0.17.0–v0.19.0 features
- Non-standard work week configurations: Sun-Thu, 3-day, 1-day, non-contiguous, 7-day
- Holiday source interactions: API vs manual, backward compatibility, multi-country dedup
- Calendar layering integration tests: all 4 global/project combinations through full scheduling pipeline
- Date boundary conditions: year boundaries, DST transitions, leap year Feb 29
- Monte Carlo edge cases: Parkinson floor invariants, degenerate inputs, milestone simulation, progress callbacks
- 6 property-based tests (fast-check) for calendar round-trips and Parkinson's Law floor guarantees

## 0.18.2 — 2026-03-16

### Security

- Added Zod schema validation to Nager.Date API responses (countries and holidays) — closes the only unvalidated external data boundary
- Added runtime type guards to worker milestone/dependency payload conversion (defense-in-depth)
- Added filename sanitization for schedule exports — strips characters invalid on Windows/macOS (`/\*?"<>|:`)

## 0.18.1 — 2026-03-16

### Improvements

- Decomposed CalendarEditor.tsx (619 LOC) into HolidayLoader, HolidayList, and shell (~150 LOC each)
- Fixed memory leak in downloadFile(): wrapped URL.createObjectURL() in try-finally to ensure URL.revokeObjectURL() runs on error

## 0.18.0 — 2026-03-16

### New Features

- Schedule grid export: download the current scenario's activity schedule as a formatted XLSX or plain CSV file
- XLSX export includes professional formatting: bold headers, light fill, frozen column header row, auto-width columns, thin borders
- Summary metadata block at top of export: project/scenario name, dates, buffer, targets, dependency mode status
- Predecessor and Successor columns (dependency mode only) using activity numbers with lag notation (e.g., "1 +2d, 3")
- Export available from both the project page (inline button near grid) and the Settings page (Schedule Export section)
- XLSX/CSV toggle: active format button highlights blue to indicate last-exported format
- Disabled export hint with clickable "Run simulation" link that triggers simulation directly
- Confidence column blank in exports for Triangular and Uniform distributions (not applicable)

### Improvements

- Moved format-labels.ts from @ui/helpers to @domain/helpers (pure domain logic, fixes layer violation)
- Widened downloadFile() to accept BlobPart for binary file downloads
- XLSX column A auto-sized to fit longest summary key label

## 0.17.0 — 2026-03-16

### New Features

- Country holiday loader: select from 100+ countries to load public holidays via Nager.Date API
- Multi-country support: load holidays from multiple countries additively, with automatic name merging for shared dates (e.g., "Memorial Day / Whit Monday")
- Country labels on API holidays show origin country or "Multi" for shared dates
- Optional locale field for manual holidays (e.g., state or region name)
- Default country auto-detected from browser locale

### Improvements

- Holidays filtered to globally observed days only, visually distinguished from manual entries
- Selected country persists across sessions
- Built-in US holidays remain available as offline fallback when API is unavailable

## 0.16.2 — 2026-03-11

### Security

- Sharing operations (add member, remove member, change role) now use Firestore transactions for atomic read-verify-write, preventing TOCTOU race conditions
- ISO date validation now rejects invalid calendar dates (e.g., Feb 30, non-leap-year Feb 29) via round-trip verification
- Sharing error messages unified to prevent email enumeration (no longer reveals whether an email is registered)
- Email normalization in user profile writes ensures consistent case-insensitive lookup
- ToS write-pending localStorage flag now properly cleared on sign-out and version-mismatch paths
- Updated SECURITY.md: CSP documentation now matches actual index.html directives, added Known Limitations section
- Local firestore.rules updated to match production rules (membership-based list rule, privilege escalation prevention)

## 0.16.0 — 2026-03-11

### Features

- Added Terms of Service and Privacy Policy links in a persistent footer on every page
- Added first-run informational banner explaining optional Cloud Storage and legal agreements
- Added clickwrap consent modal that intercepts Cloud Storage sign-in — requires agreement to ToS and Privacy Policy before Firebase Auth
- Firestore ToS acceptance record written to `users/{uid}` after successful sign-in with read-before-write pattern
- Returning user version check on app load — signs out users with outdated or missing ToS acceptance
- Reference copies of Terms of Service and Privacy Policy added to /legal

## 0.15.3 — 2026-03-10

### Improvements

- Added copyright headers to all source files with GPL v3 license attribution
- LICENSE file updated with author attribution block and Section 7 additional terms for attribution and UI notice preservation

## 0.15.2 — 2026-03-09

### Bug Fixes

- Fixed project import silently failing in cloud storage mode — imported projects now sync to Firestore correctly
- Fixed real-time sync listeners not established for projects created or imported after initial cloud load
- Fixed race condition where switching storage modes during initial cloud load could overwrite local data
- User preferences now sync bidirectionally with Firestore in cloud storage mode
- Cancel pending debounced saves before project create/delete to prevent stale data overwrites
- Preferences migration now uses merge to preserve existing cloud preferences from other devices
