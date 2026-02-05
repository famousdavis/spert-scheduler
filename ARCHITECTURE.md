# SPERT Scheduler — Architecture

## System Overview

SPERT Scheduler is a client-side probabilistic project scheduling tool. It implements Statistical PERT (SPERT) three-point estimation with Monte Carlo simulation to produce project duration distributions, deterministic schedules, and schedule buffers.

All computation runs in the browser. There is no backend.

## Technology Stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript 5.9 (strict mode) |
| UI Framework | React 19 |
| Build | Vite 7 |
| State Management | Zustand 5 |
| Styling | Tailwind CSS 4 |
| Charts | Recharts 3 |
| UI Primitives | Radix UI (Dialog, Popover) |
| Drag & Drop | dnd-kit |
| Router | React Router v7 |
| RNG | seedrandom (ARC4) |
| Validation | Zod 4 |
| Testing | Vitest 4 + fast-check 4 |
| Simulation | Web Worker |
| Persistence | localStorage |

## Layered Architecture

```
+--------------------------------------------------------------+
|                        UI Layer (/ui)                        |
|  pages/  components/  charts/  hooks/  helpers/              |
|  React components, Zustand stores, Recharts wrappers         |
+--------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+--------------------------------------------------------------+
|                  Application Layer (/app/api)                |
|  Facade services: project-service, simulation-service,       |
|  schedule-service, csv-export-service, export-import-service |
+--------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+---------------------------+  +---------------------------+
|    Core Layer (/core)     |  | Infrastructure (/infra)   |
|  estimation/              |  |  persistence/             |
|  distributions/           |  |    ProjectRepository      |
|  calendar/                |  |    LocalStorageRepository  |
|  schedule/                |  |    PreferencesRepository   |
|  simulation/              |  |    migrations              |
|  analytics/               |  |  rng/                     |
|  recommendation/          |  |    SeededRng               |
+---------------------------+  +---------------------------+
         |
         v
+--------------------------------------------------------------+
|                   Domain Layer (/domain)                      |
|  models/types.ts  -- all interfaces, RSM table, constants    |
|  schemas/         -- Zod validation schemas                  |
+--------------------------------------------------------------+
```

**Key constraint:** Core logic is framework-agnostic. The `/core` and `/domain` directories never import from React, Zustand, Recharts, or any UI library.

## Key Features

- **Baseline scenarios:** The first scenario in every project is the Baseline (protected from deletion). Additional scenarios can be cloned from any existing scenario for what-if analysis or re-baselining.
- **Four distribution types:** Normal, LogNormal, Triangular, Uniform — with automatic recommendation per activity.
- **Holiday calendar:** Multi-day holiday ranges with global overrides per project. US federal holiday presets with year selector.
- **Export/Import:** JSON-based project backup and restore on the Settings page, with schema migration and conflict resolution (skip, replace, import as copy).
- **CSV Export:** Simulation results exportable as CSV with metadata, summary statistics, and percentile table.
- **User Preferences:** Configurable defaults (trial count, distribution, confidence, targets, date format, theme) stored separately from project data.
- **Undo/Redo:** 50-entry undo stack for all project mutations with Ctrl+Z / Ctrl+Shift+Z shortcuts.
- **Scenario Comparison:** Side-by-side comparison table for 2–3 scenarios with best-value highlighting and CDF overlay chart.
- **Auto-run Simulation:** Optional 500ms-debounced auto-run when activities or settings change.
- **Dark Mode:** System preference detection with manual toggle (light/dark/system).
- **Sensitivity Analysis:** Ranks activities by impact on project uncertainty (variance contribution, impact score).
- **Confidence Intervals:** Bootstrap 95% CI on percentiles with toggle in percentile table.
- **Chart Copy:** Copy chart images to clipboard as PNG (histogram, CDF, CDF comparison) via html2canvas, with stateful button feedback (spinner, checkmark, X).
- **Print Report:** Browser-based print with dedicated print-optimized layout (compact single-page A4).
- **Project Archival:** Archive/unarchive projects with filter toggle.
- **Scenario Locking:** Lock/unlock scenarios to protect schedules from accidental edits.

## Domain Model

```
Project
  ├── id, name, createdAt, schemaVersion
  ├── globalCalendarOverride?: Calendar
  │     └── holidays: Holiday[]
  │           ├── id, name (description)
  │           ├── startDate ("YYYY-MM-DD")
  │           └── endDate ("YYYY-MM-DD", same as startDate for single day)
  └── scenarios: Scenario[]
        ├── id, name, startDate
        ├── activities: Activity[]
        │     ├── id, name
        │     ├── min, mostLikely, max (three-point estimates)
        │     ├── confidenceLevel: RSMLevel (10 levels)
        │     ├── distributionType: "normal" | "logNormal" | "triangular" | "uniform"
        │     ├── status: "planned" | "inProgress" | "complete"
        │     └── actualDuration?: number
        ├── settings: ScenarioSettings
        │     ├── probabilityTarget (activity-level, default 0.50)
        │     ├── projectProbabilityTarget (project-level, default 0.95)
        │     ├── trialCount (default 50,000)
        │     └── rngSeed
        ├── locked?: boolean
        └── simulationResults?: SimulationRun

UserPreferences (stored separately in localStorage)
  ├── defaultTrialCount, defaultDistributionType, defaultConfidenceLevel
  ├── defaultActivityTarget, defaultProjectTarget
  ├── dateFormat: "MM/DD/YYYY" | "DD/MM/YYYY" | "YYYY-MM-DD"
  ├── autoRunSimulation: boolean
  ├── theme: "light" | "dark" | "system"
  └── storeFullSimulationData: boolean
```

## SPERT Estimation

The SPERT formula maps subjective confidence to statistical variance:

```
PERT Mean = (min + 4 * mostLikely + max) / 6
SPERT SD  = (max - min) * RSM_VALUE
```

Where `RSM_VALUE = sqrt(k) / 10` for 10 confidence levels ranging from "Near certainty" (k=0.5, RSM=0.071) to "Guesstimate" (k=16.5, RSM=0.406).

## Distribution Strategy Pattern

```typescript
interface Distribution {
  sample(rng: SeededRng): number
  mean(): number
  variance(): number
  inverseCDF(p: number): number
}
```

Four implementations: Normal (Box-Muller + Acklam), LogNormal (exp of normal), Triangular (inverse CDF), Uniform (linear interpolation).

Factory: `createDistributionForActivity(activity)` computes PERT mean + resolved SD, switches on `distributionType`.

## Two Independent Computation Paths

### Deterministic Schedule

For each non-complete activity: `duration = Math.ceil(distribution.inverseCDF(probabilityTarget))`, minimum 1 working day. Activities chain linearly (finish-to-start). Calendar-aware working day arithmetic.

### Monte Carlo Simulation

For each of N trials (default 50,000), sample all non-complete activities from their distributions. **Parkinson's Law clamping:** each sampled duration is floored to the deterministic duration (`max(sampled, deterministicDuration)`). Complete activities contribute their fixed `actualDuration`. Trial total = sum of all activity durations.

Post-simulation: sort samples, compute percentiles (P5 through P99), histogram (samples > P99 excluded to remove extreme outliers), mean, SD.

### Schedule Buffer

```
bufferDays = MC_percentile[projectTarget] - deterministicTotal
```

Where `deterministicTotal` is the sum of activity durations at the activity-level probability target, and `MC_percentile[projectTarget]` is the Monte Carlo percentile at the project-level target.

## Web Worker Architecture

```
Main Thread                              Worker Thread
+-----------------+                      +-----------------+
| worker-client   |  -- postMessage -->  | simulation      |
|   .ts           |     SimulationReq    |   .worker.ts    |
|                 |                      |                 |
|                 |  <-- postMessage --  | runMonteCarlo   |
|                 |     Progress/Result  |   Simulation()  |
+-----------------+                      +-----------------+
```

Worker is created per-run and terminated on completion. Progress updates every 10,000 trials. Synchronous fallback if Worker creation fails.

## State Management

Two Zustand stores, separated by concern:

- **`useProjectStore`**: Project CRUD, scenario/activity mutations, undo/redo stack. Persists to localStorage per-project.
- **`usePreferencesStore`**: User preferences (defaults, date format, auto-run). Persists to `spert:user-preferences` localStorage key.

## Persistence

- Each project: `localStorage["spert:project:{id}"]`
- Project index: `localStorage["spert:project-index"]`
- User preferences: `localStorage["spert:user-preferences"]`
- Schema versioned (`SCHEMA_VERSION = 5`) with sequential migrations (v1→v2→v3→v4→v5)
- Zod validation on every load
- Export/Import via JSON files on the Settings page

### Storage Optimization

The `storeFullSimulationData` preference (default: `false`) controls whether the 50k+ trial samples array is persisted. When disabled, ~90% storage is saved per simulation while preserving percentiles, histogram, and statistics. The `stripSimulationSamples()` helper in `local-storage-repository.ts` handles this.

## Testing Strategy

- **Unit:** SPERT calculations, calendar math, distributions, analytics, buffer, CSV export, format labels
- **Property-based (fast-check):** Distribution bounds, percentile monotonicity, calendar invariants
- **Integration:** Full workflow (create → simulate → schedule → clone → persist → reload), export/import round-trip, scenario cloning, store import
- **343 tests** across 29 test files

## Performance Budget

| Metric | Target |
|--------|--------|
| 50k trials, 20 activities | < 200ms in worker |
| UI thread blocked during simulation | 0ms |
| Schedule recompute on edit | < 10ms |
| Production JS bundle | < 42 KB gzipped (excl. charts) |
