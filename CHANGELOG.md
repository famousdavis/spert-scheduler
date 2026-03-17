# Changelog

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
