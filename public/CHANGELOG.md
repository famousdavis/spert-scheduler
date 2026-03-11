# Changelog

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
