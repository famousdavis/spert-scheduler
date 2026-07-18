# Security

## Architecture

SPERT Scheduler is a **client-side** application. All computation runs in the browser.

- **No backend server** — scheduling math runs entirely in-browser
- **No analytics or telemetry** — your data stays in your browser
- **Local-first persistence** — all project data is stored in browser localStorage by default
- **Optional cloud sync** — opt-in Firebase/Firestore persistence on the shared `spert-suite` Firebase project

## Data Storage

### Local Mode (default)

All data is stored in browser `localStorage`:

- `spert:project:{id}` — Individual project data
- `spert:project-index` — List of project IDs
- `spert:user-preferences` — User settings
- `spert:storage-mode` — Current storage mode (local/cloud)
- `spert_firstRun_seen` — First-run banner dismissal
- `spert_tos_accepted_version` — Cached ToS acceptance version
- `spert_tos_write_pending` — Pending Firestore acceptance write flag

**Note:** localStorage is accessible to any JavaScript running on the same origin. This application does not execute untrusted scripts.

### Cloud Mode (opt-in)

Before signing in, users must accept the Statistical PERT® Terms of Service and Privacy Policy via a clickwrap consent modal. Acceptance is recorded in Firestore at `users/{uid}` and cached locally. Returning users are verified against the current ToS version on app load.

When the user signs in and switches to cloud mode, data is stored in Firestore:

- `spertscheduler_projects/{projectId}` — Project data with `owner` and `members` fields
- `spertscheduler_profiles/{uid}` — User display name and email (for sharing lookup)
- `spertscheduler_settings/{uid}` — User preferences

**Security rules** enforce role-based access:
- Only project members can read projects
- Only owners and editors can write
- Editors cannot modify `owner` or `members` fields (privilege escalation prevention)
- Profiles are readable by authenticated users under a `limit(1)` constraint (share-by-email lookup without bulk enumeration)
- Settings are private (owner-only read/write)

**Canonical ruleset location:** the deployed rules are SPERT-suite-wide (all apps share one Firestore project and one Auth tenant). The canonical file lives in the Landing Page repo (`/Users/william/Documents/spert-landing-page/firestore.rules`) and is deployed by paste-replace into the Firebase Console for project `spert-suite`. This repo's local `firestore.rules` is a **reference-only verbatim mirror** of that file's body (never deployed from here); `preferences-firestore-sync.test.ts` reads it at runtime as a drift guard on the settings allowlist.

**Simulation results are stripped** before cloud saves to stay within the Firestore 1 MB document limit and reduce data exposure.

## Recommended Deployment Headers

When deploying SPERT Scheduler, configure your web server with these security headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-eval' https://apis.google.com https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.googleusercontent.com; font-src 'self'; worker-src 'self' blob:; frame-src https://*.firebaseapp.com https://accounts.google.com https://login.microsoftonline.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://*.run.app wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://login.microsoftonline.com https://date.nager.at; object-src 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

This matches the `Content-Security-Policy` meta tag shipped in `index.html`. Two grants warrant a note:
- **`script-src 'unsafe-eval'`**: not used by any first-party code. It is required by one vendored dependency — ExcelJS, used for XLSX schedule export — whose bundled `setImmediate` polyfill contains a `new Function("")` branch. A production-bundle audit (v0.57.4) confirmed this is the *only* `new Function`/`eval` occurrence in the entire shipped build (zero from html2canvas, zero first-party). Removing the grant is likely safe but must be verified empirically in both Chromium and Firefox against XLSX export **and** chart copy-to-clipboard (html2canvas) before it can be dropped; treated as a deferred hardening item, not a release blocker.
- **`connect-src https://*.run.app`**: the Connect AI feature's Cloud Run MCP server endpoint.

### Header Explanations

- **Content-Security-Policy**: Restricts script sources to same-origin plus Google APIs (for Firebase Auth). `'unsafe-eval'` is required only by the ExcelJS `setImmediate` polyfill (see note above), not by any first-party code. `'unsafe-inline'` for styles is required by Tailwind CSS. `img-src blob: data:` allows chart copy-to-clipboard and inline images. `font-src 'self'` restricts fonts to same-origin. `worker-src` allows Web Workers. `frame-src` allows Firebase Auth popups. `connect-src` allows Firestore, auth API calls, the Connect AI Cloud Run MCP endpoint (`*.run.app`), and the Nager.Date holiday API. `object-src 'none'` blocks plugins. `base-uri 'self'` prevents base tag hijacking. `form-action 'self'` restricts form submissions to same-origin.
- **X-Content-Type-Options**: Prevents MIME-type sniffing attacks.
- **X-Frame-Options**: Prevents clickjacking by disallowing iframe embedding.
- **Referrer-Policy**: Limits referrer information sent to external sites.

## Nager.Date API Hardening

The Nager.Date holiday API integration has multiple security layers:

- **Response validation:** All API responses are validated with Zod schemas before use (`NagerCountrySchema`, `NagerPublicHolidaySchema`). Malformed or unexpected data shapes are rejected.
- **Country code validation:** `fetchPublicHolidays()` validates country codes against `/^[A-Z]{2}$/` before URL construction, preventing path traversal or query injection. `encodeURIComponent()` is applied as defence-in-depth.
- **Cache validation:** The localStorage country cache (`spert-scheduler:nager-countries`) is validated with Zod on read. Poisoned or corrupt cache entries are discarded and trigger a fresh API fetch.
- **Error isolation:** API failures surface a generic user-facing message; raw error details are logged to console only.

## Import/Export Security

When importing project data:

- Only import `.json` files from **trusted sources**
- All imported data is validated against the schema before use
- Invalid or malformed data is rejected with an error message

The application never executes code from imported files.

## Input Validation

All user inputs are validated using [Zod](https://zod.dev/) schemas:

- Activity estimates: `min ≤ mostLikely ≤ max`
- Trial count: bounded to 1,000 – 500,000
- Probability targets: bounded to 0.01 – 0.99
- Dates: validated against ISO 8601 format with calendar date verification (rejects invalid dates like Feb 30)

## Calendar Configuration Validation

Work week and calendar inputs are validated at multiple layers:

- **`workDays` array:** Validated as integers 0–6 (Sunday–Saturday), minimum 1 day, maximum 7 days. Stored in UserPreferences.
- **`CalendarConfigurationError`:** Thrown by `buildWorkCalendar()` when the combination of work week mask, holidays, and converted work days produces no reachable work days. Caught in the UI with an error banner.
- **Priority stack:** Work day resolution follows a strict priority: forced work days → work day (global-holiday overrides), holidays → non-work day, converted work days → work day (overrides week mask), work week mask → fallback. The "project holidays are never overridable" guarantee is enforced at assembly time — `buildWorkCalendar()` filters `forcedWorkDays` against the project's own holidays before construction — not by the runtime priority order, which sees only one merged holiday set.
- **Holiday range limit:** Multi-day holidays spanning more than 366 days are rejected by `buildHolidaySet()` to prevent denial-of-service via unbounded date expansion. Zod schema enforces this at the validation layer.
- **Iteration guards:** `addWorkingDays` and related calendar functions have a 10,000 iteration safety limit to prevent infinite loops from degenerate calendars.

## v0.20.2 Security Audit (Constraint Feature)

Targeted audit of the v0.20.0 constraint feature additions and surrounding code:

- **Write-forward migration error escalation:** `firestore-driver.ts` `loadAll()` and `load()` now surface write-forward migration failures via the `onSaveError` callback instead of silently logging. This ensures the UI can display a toast when a migration write fails.
- **Worker constraint validation:** `simulation.worker.ts` validates constraint `type` and `mode` values against known enum domains (`MSO|MFO|SNET|SNLT|FNET|FNLT` and `hard|soft`) before processing. Previously only `offsetFromStart` was type-checked.
- **Import schema version bounds:** `export-import-service.ts` rejects `schemaVersion < 1` on import, preventing negative or zero versions from bypassing migration logic.
- **Constraint date picker guard:** `ActivityEditModal.tsx` date picker's non-working-day snap loop has a 10,000 iteration guard, consistent with `calendar.ts` limits.
- **localStorage namespace:** `scenario-memory.ts` key changed from `spert:active-scenarios` to `spert-scheduler:active-scenarios` to prevent cross-app collision on shared origins.
- **Filename sanitization hardening:** `sanitizeFilename()` now returns `"Untitled"` for empty results and truncates to 200 characters.
- **Preferences parse logging:** `preferences-repository.ts` logs Zod validation issues on parse failure for diagnostic visibility.

## v0.21.2 Security Audit (SS/FF Dependencies)

Targeted audit of the v0.21.0 SS/FF dependency type additions, Firestore rules, and export/import paths:

- **CSV formula injection guard:** `csvEscape()` in `schedule-export-service.ts` now prefixes cell values starting with `=`, `+`, `@`, or `-` with a single quote, preventing spreadsheet formula execution when CSV files are opened in Excel or Google Sheets.
- **Import file size guard:** `validateImport()` in `export-import-service.ts` enforces a 10 MB size limit at the service layer (was previously only enforced in the UI component).
- **Scenario memory type safety:** `loadMap()` in `scenario-memory.ts` now filters parsed entries to include only string values, preventing type confusion from tampered localStorage.
- **Preferences logging gated:** `preferences-repository.ts` Zod validation warnings are now logged only in development mode (`import.meta.env.DEV`), reducing information disclosure in production.
- **Firestore enum validation documented:** `ActivityDependency.type`, `constraintType`, and `constraintMode` are validated client-side via Zod strict enums but not at the Firestore rules level. Documented as an accepted risk in Known Limitations.
- **Firestore list rule documented:** The `spertscheduler_projects` list rule's `resource.data` limitation and the `where()` query workaround are documented in Known Limitations.

## AI Connectivity (Connect AI)

Connect AI is an opt-in feature that lets an external AI assistant (via a Cloud Run MCP server) read a snapshot of the currently-open project and submit structured edit operations, applied in the user's browser.

**Session/consent lifecycle:**
- A session is started only after an explicit consent modal. **Write consent** (the AI may submit edits) is always required to start; **Read Mode** (the AI may read a project snapshot) is a separate, optional, per-session toggle.
- Sessions live in Firestore under `anonymous_sessions/{sessionId}` with a short pairing code and a 7-day TTL; the browser refreshes `browserConnectedAt`/`lastActiveAt` via heartbeat and tears the session down on disconnect.
- Consent transitions are reconciled fail-closed: if a Read-Mode upgrade or downgrade write to the session doc fails transiently, local state reverts to the server's actual value and the session start aborts rather than optimistically claiming a permission the server didn't record (v0.57.4, finding A4).

**Read-Mode snapshot — what it includes and excludes:**
- **Includes** (single open project only): the schedule and activity ids, plus free-text fields — activity notes, descriptions, and checklist/deliverable item text — so the AI can make context-aware edits. The consent copy names these fields explicitly (v0.57.4, finding A5).
- **Excludes**: owner uid, members/sharing, email, any other project, and calendar/holiday data. Snapshots are size-budgeted and never written when Read Mode is off.

**Write-op validation (defense-in-depth):** AI ops are authored exclusively by the MCP server's Admin SDK (`anonymous_sessions/.../ops` is `allow write: if false` at the rules layer — a client, including a malicious pairing-code holder, cannot inject ops). The browser re-validates every op at the application boundary before persisting: activity estimates are bounded (finite, ≤ 3650 days), dependency `type`/`lagDays` are validated against the domain enum/range, note text is type-checked, and per-op array lengths are capped (v0.57.4, findings A1–A3, A6). Op-handler exceptions log the op type/seq only, never the payload, which carries the user's own free text (finding A7).

The `anonymous_sessions` ruleset (session docs, ops subcollection, and per-session snapshot) is part of the canonical SPERT-suite ruleset described above.

## v0.57.4 Security Audit (AI Connectivity)

Targeted audit of the Connect AI feature (v0.51.0–v0.57.3) and its consent/session model, plus two CSP/`firestore.rules` documentation-drift leads. AI write-ops are Admin-SDK-only at the rules layer; the client-side validations below are defense-in-depth behind that boundary, and also guard against an honest AI mistake persisting a value that would fail to load next session.

- **Activity-estimate ceiling (A1, Low):** `createActivityCore`/`updateActivityCore` (`ai-op-handlers.ts`) now reject an AI-submitted estimate that is non-finite or exceeds 3,650 days (10 years), before it can feed the working-day schedule math. Enforced at the AI-write boundary (not on the shared `ActivitySchema`, which also gates project load — a schema-level ceiling would have made pre-existing projects holding larger values fail to load). The update path checks only *provided* estimate fields, so the AI can still edit legacy activities whose stored estimates predate the ceiling. This bounds per-field magnitude only; aggregate spans across many activities remain backstopped by the existing `MAX_CALENDAR_ITERATIONS` guard and its catch sites.
- **Dependency `type`/`lagDays` validation (A2, Medium):** `createDependencyCore` and `handleUpdateDependency` now validate dependency `type` (enum `FS`/`SS`/`FF`) and `lagDays` (integer, −365…365) against `ActivityDependencySchema` before persisting — previously these ran only on load, so a bad value could persist and then brick the project on next load.
- **Note-text type guard (A3, Medium):** `appendNoteCore` now rejects a non-string `text` (array/object) outright instead of coercing it via `.length`, mirroring the guard already present on the set-description path.
- **Consent-transition integrity (A4, Medium):** `resumeSession` now handles a failed consent *upgrade* symmetrically with a failed *downgrade* — it reverts local consent and aborts the session start rather than letting the UI claim Read Mode is on while the server records it off. Covered by a new targeted `use-ai-connectivity.test.ts` hook suite.
- **Read-Mode consent copy (A5, Low):** the consent modal now names the free-text fields (activity notes, descriptions, checklist/deliverable items) included in the Read-Mode snapshot, which was previously described only as "the current schedule and activity ids."
- **Add-items length bound (A6, Low):** `handleAddItems` now rejects an oversized items array (> 500) before iterating, so an arbitrarily large payload cannot drive unbounded work; per-item cap reporting below that bound is unchanged.
- **Op-exception logging (A7, Low):** the op-handler catch site logs the op type and seq instead of the full op object, which carried the user's own activity names/notes/descriptions.
- **CSP documentation reconciliation (C1, Low):** `SECURITY.md`'s recommended CSP now matches the shipped `index.html` (`'unsafe-eval'`, `https://*.run.app`), with the `'unsafe-eval'` rationale documented (ExcelJS `setImmediate` polyfill — the only `new Function` in the production bundle). Empirical cross-browser removal is a deferred hardening item.
- **Stale local rules file (C2, Low):** the repo's reference-only `firestore.rules` was re-synced to a verbatim mirror of the canonical ruleset (adding the `anonymous_sessions` AI section and project-rule hardening it previously lacked), while preserving the settings allowlist the drift-guard test reads. The AI Connectivity data/consent model and the canonical-rules location are now documented here.

## Defensive Measures

- **No first-party `eval()` or `Function()`** — no first-party dynamic code execution. One vendored dependency (ExcelJS) ships a `setImmediate` polyfill with a rarely-hit `new Function("")` branch, the sole reason `'unsafe-eval'` remains in the CSP (see Recommended Deployment Headers); removal pending a cross-browser export/chart-copy verification
- **No `dangerouslySetInnerHTML`** — all content rendered as text
- **No inline scripts** — all JavaScript loaded via ES modules
- **Error boundaries** — graceful recovery from unexpected errors
- **Iteration guards** — calendar calculations have iteration limits
- **Worker validation** — simulation inputs validated before processing
- **Filename sanitization** — schedule export filenames are stripped of characters invalid on Windows/macOS (`/\*?"<>|:`)

## Known Limitations

- **Firestore field validation:** Firestore security rules validate document-level access control (ownership, membership, roles) but do not replicate the full Zod schema validation performed client-side. Field-level validation (e.g., string length limits, numeric ranges) is enforced only by the client. This is a pragmatic tradeoff — duplicating the complete Zod schema in Firestore rules is impractical for marginal security gain, since a malicious client could only corrupt their own project data. Specific enum fields validated client-side only:
  - `ActivityDependency.type` — restricted to `"FS"`, `"SS"`, `"FF"` via `z.enum(DEPENDENCY_TYPES)`
  - `Activity.constraintType` — restricted to `"MSO"`, `"MFO"`, `"SNET"`, `"SNLT"`, `"FNET"`, `"FNLT"` via `z.enum()`
  - `Activity.constraintMode` — restricted to `"hard"`, `"soft"` via `z.enum()`
- **Email enumeration:** The sharing UI reveals whether an email is registered when attempting to share a project. This is mitigated by requiring authentication and using a uniform error message that does not distinguish between "user not found" and other failure modes.
- **Firestore list rule:** The `spertscheduler_projects` collection `list` rule checks `request.auth.uid in resource.data.members`, but `resource.data` is not reliably available during collection-level list queries. The application works around this by using `where()` queries in `firestore-driver.ts`, which are evaluated under the document-level `get` rule instead. The `list` rule is retained as a defense-in-depth guard against direct collection enumeration.

## Reporting Vulnerabilities

If you discover a security vulnerability, please report it by opening an issue at:
https://github.com/famousdavis/spert-scheduler/issues

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
