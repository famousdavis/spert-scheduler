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

**Security rules** (`firestore.rules`) enforce role-based access:
- Only project members can read projects
- Only owners and editors can write
- Editors cannot modify `owner` or `members` fields (privilege escalation prevention)
- Profiles are readable by all authenticated users (for email-based member lookup)
- Settings are private (owner-only read/write)

**Simulation results are stripped** before cloud saves to stay within the Firestore 1 MB document limit and reduce data exposure.

## Recommended Deployment Headers

When deploying SPERT Scheduler, configure your web server with these security headers:

```
Content-Security-Policy: default-src 'self'; script-src 'self' https://apis.google.com https://accounts.google.com; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data: https://*.googleusercontent.com; font-src 'self'; worker-src 'self' blob:; frame-src https://*.firebaseapp.com https://accounts.google.com https://login.microsoftonline.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net wss://*.firebaseio.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://accounts.google.com https://login.microsoftonline.com https://date.nager.at; object-src 'none'; base-uri 'self'; form-action 'self'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

### Header Explanations

- **Content-Security-Policy**: Restricts script sources to same-origin plus Google APIs (for Firebase Auth). `'unsafe-inline'` for styles is required by Tailwind CSS. `img-src blob: data:` allows chart copy-to-clipboard and inline images. `font-src 'self'` restricts fonts to same-origin. `worker-src` allows Web Workers. `frame-src` allows Firebase Auth popups. `connect-src` allows Firestore, auth API calls, and Nager.Date holiday API. `object-src 'none'` blocks plugins. `base-uri 'self'` prevents base tag hijacking. `form-action 'self'` restricts form submissions to same-origin.
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
- **Priority stack:** Work day resolution follows a strict priority: holidays → non-work day (overrides everything), converted work days → work day (overrides week mask), work week mask → fallback.
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

## Defensive Measures

- **No `eval()` or `Function()`** — no dynamic code execution
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
