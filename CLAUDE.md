# CLAUDE.md — Agent Instructions for SPERT Scheduler

## Quick Reference

```bash
npm run dev          # Start Vite dev server (port 5173)
npm run build        # TypeScript check + Vite production build
npm run typecheck    # TypeScript only (tsc -b)
npm run test         # Run all tests once (vitest run)
npm run test:watch   # Watch mode
npm run lint         # ESLint
```

## Project Overview

SPERT Scheduler is a probabilistic project scheduling tool for IT project managers. It uses Statistical PERT (SPERT) three-point estimation with Monte Carlo simulation to produce project duration distributions and schedule buffers.

**Key formula:** `SD = (max - min) * RSM` where RSM encodes subjective confidence via a 10-level Ratio Scale Modifier table.

**Two probability targets:**
- Activity Target (default P50): Used for the deterministic schedule per activity
- Project Target (default P95): Used for the Monte Carlo percentile that determines the schedule buffer

**Schedule Buffer:** `buffer = MC_percentile[projectTarget] - deterministicTotal`

**Parkinson's Law:** In Monte Carlo simulation, each activity's trial duration is clamped to `max(sampled, deterministicDuration)` because work expands to fill time allotted.

**Dependency Mode:** Opt-in per scenario. When ON, activities are scheduled using a dependency graph (topological sort + critical path) instead of sequential array order. Monte Carlo uses `computeCriticalPathDuration` per trial. When OFF, behavior is identical to pre-v0.9.0.

## Architecture

Strict layered architecture — imports flow downward only:

```
UI (React, Zustand, Recharts)
  → Application (facade services)
    → Core (pure math, zero framework deps)
    → Infrastructure (persistence, RNG)
      → Domain (types, schemas, constants)
```

**Critical constraint:** `/core` and `/domain` must NEVER import from React, Zustand, or any UI library.

### Path Aliases (tsconfig)

- `@domain/*` → `src/domain/*`
- `@core/*` → `src/core/*`
- `@infrastructure/*` → `src/infrastructure/*`
- `@app/*` → `src/app/*`
- `@ui/*` → `src/ui/*`

## Key Files

| File | Purpose |
|------|---------|
| `src/domain/models/types.ts` | All interfaces, RSM table, constants, STANDARD_PERCENTILES, UserPreferences |
| `src/domain/schemas/project.schema.ts` | Zod validation schemas for Project |
| `src/domain/schemas/preferences.schema.ts` | Zod validation schema for UserPreferences |
| `src/core/estimation/spert.ts` | SPERT mean/SD computation |
| `src/core/estimation/heuristic.ts` | Heuristic min/max from most-likely using % multipliers |
| `src/core/distributions/factory.ts` | Creates Normal/LogNormal/Triangular/Uniform per activity |
| `src/core/schedule/dependency-graph.ts` | Topological sort, cycle detection, critical path (Kahn's + forward/backward pass), critical path activities |
| `src/core/schedule/deterministic.ts` | Deterministic schedule (inverseCDF at percentile), dependency-aware variant |
| `src/core/schedule/buffer.ts` | Schedule buffer calculation |
| `src/core/simulation/monte-carlo.ts` | Monte Carlo engine (pure function), dependency-aware variant |
| `src/workers/simulation.worker.ts` | Web Worker wrapper for MC |
| `src/core/calendar/calendar.ts` | Working day math, date formatting, mergeCalendars (supports 3 date formats) |
| `src/core/calendar/us-holidays.ts` | US federal holiday calculator (12 holidays, nth-weekday algorithms) |
| `src/infrastructure/persistence/migrations.ts` | Schema v1->v2->...->v7->v8 migrations |
| `src/infrastructure/persistence/preferences-repository.ts` | UserPreferences localStorage persistence |
| `src/infrastructure/persistence/sync-bus.ts` | Typed event bus for store → cloud sync (emitSave, emitCreate, emitDelete) |
| `src/infrastructure/firebase/firebase.ts` | Conditional Firebase init (no-op without env vars) |
| `src/infrastructure/firebase/firestore-driver.ts` | Firestore CRUD, debounced saves, real-time subscriptions, preferences sync |
| `src/infrastructure/firebase/firestore-sanitize.ts` | sanitizeForFirestore(), stripFirestoreFields(), stripSimulationResultsForCloud() |
| `src/infrastructure/firebase/firestore-sharing.ts` | Project sharing: add/remove members, role management, profile lookup |
| `src/infrastructure/firebase/firestore-migration.ts` | One-way local → cloud migration with collision handling |
| `src/ui/providers/AuthProvider.tsx` | Google + Microsoft OAuth context, onAuthStateChanged listener |
| `src/ui/providers/StorageProvider.tsx` | Storage mode management (local/cloud), auth-aware loading gate |
| `src/ui/components/AuthButton.tsx` | Sign-in/out button for header (hidden when Firebase not configured) |
| `src/ui/components/StorageModeSection.tsx` | Local/Cloud toggle for Settings page with migration UI |
| `src/ui/components/SharingSection.tsx` | Project sharing UI (add/remove members, role management) |
| `src/ui/hooks/use-cloud-sync.ts` | Bridges Zustand store with Firestore (real-time listeners + debounced writes) |
| `firestore.rules` | Firestore security rules for spertscheduler_* collections |
| `.env.example` | VITE_FIREBASE_* environment variable template |
| `src/ui/pages/ProjectPage.tsx` | Main project page, orchestrates all components |
| `src/ui/pages/SettingsPage.tsx` | Settings layout wrapper (imports section components) |
| `src/ui/pages/changelog-data.ts` | Changelog version history data array |
| `src/ui/components/PreferencesSection.tsx` | User preferences controls (theme, trials, distribution, etc.) |
| `src/ui/components/LocalStorageSection.tsx` | localStorage usage bar and simulation data toggle |
| `src/ui/components/ExportSection.tsx` | Project export with simulation data toggle |
| `src/ui/components/ImportSection.tsx` | Project import with conflict resolution |
| `src/ui/components/activity-row-helpers.ts` | Pure helpers: focusField, focusNextRow, focusPrevRow, computeElapsedDays |
| `src/ui/components/ScenarioSummaryCard.tsx` | Summary card with dates, targets, buffer |
| `src/ui/components/UnifiedActivityGrid.tsx` | Merged input + schedule grid with bulk selection |
| `src/ui/components/ScenarioComparison.tsx` | Side-by-side scenario comparison (2-3 scenarios) |
| `src/ui/components/CopyImageButton.tsx` | Stateful copy-to-clipboard button for charts (idle/copying/success/error) |
| `src/ui/components/DependencyPanel.tsx` | Dependency management UI (add/remove/edit deps, cycle prevention, collapsible) |
| `src/ui/components/MilestonePanel.tsx` | Milestone management UI (add/remove/edit milestones, activity assignment, collapsible) |
| `src/ui/components/PrintableReport.tsx` | Print-optimized project report layout (contains `PrintGanttChart` — must stay in sync with interactive Gantt) |
| `src/ui/charts/GanttChart.tsx` | Interactive Gantt chart with dependency arrows, uncertainty, finish line, critical path, today line, legend (**print parity**: changes here may need mirroring in `PrintGanttChart` inside `PrintableReport.tsx`) |
| `src/ui/charts/gantt-constants.ts` | Shared layout constants and color palette for Gantt charts |
| `src/ui/charts/gantt-utils.ts` | Pure utility functions shared by interactive and print Gantt charts |
| `src/ui/components/GanttSection.tsx` | Gantt chart section wrapper with copy-to-clipboard |
| `src/ui/helpers/export-chart.ts` | Copy DOM element to clipboard as PNG (html2canvas) |
| `src/ui/hooks/use-preferences-store.ts` | Zustand store for user preferences |
| `src/ui/hooks/use-date-format.ts` | Hook returning memoized date formatter from user preferences |
| `src/ui/hooks/use-milestone-buffers.ts` | Hook computing per-milestone buffer, slack, and health status |
| `src/ui/helpers/format-labels.ts` | Centralized distribution/status label formatters |
| `src/ui/helpers/download.ts` | Shared file download utility (JSON, CSV) |
| `src/app/api/milestone-service.ts` | Milestone CRUD operations (add, remove, update, assign, constraint) |
| `src/app/api/dependency-service.ts` | Dependency CRUD operations (add, remove, update lag, bulk cleanup) |
| `src/app/api/csv-export-service.ts` | Pure CSV generation for simulation results |
| `src/app/api/export-import-service.ts` | Export/Import: serialize, validate, migrate, conflict detection |
| `src/core/schedule/milestone-sim-params.ts` | Pure utility: builds milestone simulation parameters (activity mapping, earliest start offsets) |
| `src/infrastructure/persistence/scenario-memory.ts` | Per-project last-active scenario ID persistence (localStorage) |
| `src/app/constants.ts` | APP_VERSION, APP_NAME |

## Schema Version

Current: `SCHEMA_VERSION = 8`. Migrations in `src/infrastructure/persistence/migrations.ts`. Bump version + add migration when changing the `Project` schema shape.

User preferences are stored separately (`spert:user-preferences` key) and are NOT part of the Project schema. No schema bump needed for preference changes.

## Testing Patterns

- **542 tests** across **39 test files**
- **Unit tests:** Pure functions in `/core` — known values + property-based (fast-check)
- **Integration tests:** `src/integration/` — full workflow, persistence round-trip, scenario cloning, export/import, dependency lifecycle
- **Property-based:** Distribution samples bounded, percentiles monotonic, calendar round-trips
- **No UI tests:** Components are not tested via React Testing Library (deferred)

## Common Tasks

### Adding a new distribution type
1. Implement `Distribution` interface in `src/core/distributions/`
2. Add case to factory in `src/core/distributions/factory.ts`
3. Add to `DistributionType` union in `types.ts`
4. Update recommendation engine in `src/core/recommendation/`
5. Add labels in `src/ui/helpers/format-labels.ts`
6. Add tests

### Adding a new schema field
1. Add to interface in `types.ts`
2. Add to Zod schema in `project.schema.ts`
3. Bump `SCHEMA_VERSION`
4. Add migration in `migrations.ts`
5. Update `DEFAULT_SCENARIO_SETTINGS` if applicable
6. Update test fixtures

### Adding a user preference
1. Add field to `UserPreferences` interface in `types.ts`
2. Add default value to `DEFAULT_USER_PREFERENCES` in `types.ts`
3. Add to Zod schema in `preferences.schema.ts` (use `.optional()` for backward compatibility)
4. Add UI control in `SettingsPage.tsx` preferences section (or StorageSection for storage-related prefs)
5. Wire into consuming components via `usePreferencesStore`
6. Add tests in `preferences-repository.test.ts`

**Current preferences:** `defaultTrialCount`, `defaultDistributionType`, `defaultConfidenceLevel`, `defaultActivityTarget`, `defaultProjectTarget`, `dateFormat`, `autoRunSimulation`, `theme`, `storeFullSimulationData`, `defaultHeuristicMinPercent`, `defaultHeuristicMaxPercent`, `defaultDependencyMode`, `globalCalendar`, `ganttViewMode`, `ganttShowToday`, `ganttShowCriticalPath`, `ganttShowProjectName`

### Modifying the Gantt chart
1. Change the interactive chart in `src/ui/charts/GanttChart.tsx`
2. **Mirror the same visual change** in `PrintGanttChart` inside `src/ui/components/PrintableReport.tsx` (print version)
3. If adding a new prop, thread it through: `ProjectPage.tsx` -> `GanttSection.tsx` -> `GanttChart.tsx`, and also `ProjectPage.tsx` -> `PrintableReport.tsx` -> `PrintGanttChart`
4. If adding layout constants, add both interactive (`LEFT_MARGIN`, etc.) and print (`PRINT_LEFT`, etc.) variants in `gantt-constants.ts`
5. Shared utilities go in `gantt-utils.ts` (used by both charts)

### Modifying simulation behavior
1. Change in `src/core/simulation/monte-carlo.ts` (pure function)
2. Mirror the same change in `src/workers/simulation.worker.ts` (worker copy)
3. Update `worker-protocol.ts` if message shape changes
4. Thread new params through: `worker-client.ts` -> `simulation-service.ts` -> `use-simulation.ts` -> `ProjectPage.tsx`

## Cloud Storage (Firebase)

Optional Firebase/Firestore integration on the shared `spert-suite` Firebase project. When `VITE_FIREBASE_API_KEY` is missing, the app operates in local-only mode (zero Firebase code executes).

**Deployment guide:** After completing Firebase code changes for any SPERT Suite app, follow the step-by-step deployment guide at `~/.claude/projects/-Users-william-Documents-spert-scheduler/memory/firebase-deployment-guide.md`. It covers `.env.local` setup, Firestore rules deployment, Vercel env vars, Firebase Auth authorized domains, and OAuth provider configuration.

**Architecture:**
- Event bus pattern: `cloudSyncBus` decouples Zustand store from async Firestore writes
- Store actions call `cloudSyncBus.emitSave/emitCreate/emitDelete` (fire-and-forget)
- `useCloudSync` hook subscribes to bus events and handles debounced Firestore writes (500ms)
- `onSnapshot` listeners for real-time updates from other clients
- Simulation results stripped entirely before cloud save (Firestore 1 MB doc limit)
- `memoryLocalCache()` used to avoid stale security rule caching in IndexedDB

**Firestore collections:**
- `spertscheduler_projects/{projectId}` — Project doc + `owner`, `members`, `updatedAt`
- `spertscheduler_profiles/{uid}` — `{ displayName, email, lastLogin }`
- `spertscheduler_settings/{uid}` — UserPreferences object

**Sharing roles:** owner (full control), editor (edit project, cannot change sharing), viewer (read-only)

**Provider hierarchy:** `AuthProvider` → `StorageProvider` → `RouterProvider`

## Security

- **CSP:** `index.html` includes a Content Security Policy meta tag restricting script/style/img/worker/connect/frame sources (includes Firebase domains)
- **Firestore rules:** Role-based access control with editor privilege escalation prevention (`firestore.rules`)
- **Schema validation:** All Zod string fields have `.max()` constraints (IDs: 64, names: 200, seeds: 100); all array fields have `.max()` constraints (activities: 500, dependencies: 2000, milestones: 100, samples: 100k, scenarios: 20, holidays: 1000)
- **Import pipeline:** 10 MB file size limit, JSON parse → envelope check → migration → Zod validation → conflict detection
- **No XSS vectors:** No `dangerouslySetInnerHTML`, `eval()`, `innerHTML`, or user-controlled URLs
- **Worker isolation:** Workers validate payloads, created per-run and terminated on completion
- **Prototype pollution:** Mitigated by Zod schema stripping unknown keys

## Style Guide

- Tailwind CSS 4 (utility-first, minimal custom CSS in `src/styles.css`)
- Dark mode via `@custom-variant dark (&:where(.dark, .dark *))` — use `dark:` prefix for dark mode styles
- Blue accent color (`text-blue-600`, `bg-blue-100`)
- Gray scale for text hierarchy (`text-gray-900`, `text-gray-600`, `text-gray-500`)
- Dates formatted via `useDateFormat()` hook (respects user preference: MM/DD/YYYY, DD/MM/YYYY, or YYYY-MM-DD), stored as YYYY-MM-DD
- Distribution and status labels via `distributionLabel()` / `statusLabel()` from `src/ui/helpers/format-labels.ts`
- File downloads via `downloadFile()` from `src/ui/helpers/download.ts`
- Toast notifications via `toast.success()`, `toast.error()`, `toast.info()` from `src/ui/hooks/use-notification-store.ts`
- Chart copy via `copyChartAsPng()` from `src/ui/helpers/export-chart.ts` — copies PNG to clipboard
- Stateful copy button via `CopyImageButton` from `src/ui/components/CopyImageButton.tsx`
- Version displayed in footer, links to `/changelog`
