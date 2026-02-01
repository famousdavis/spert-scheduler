# SPERT Scheduler — Architecture

## System Overview

SPERT Scheduler is a client-side probabilistic project scheduling tool. It implements Statistical PERT (SPERT) three-point estimation with Monte Carlo simulation to produce project duration distributions, deterministic schedules, and schedule buffers.

All computation runs in the browser. There is no backend.

## Technology Stack

| Concern | Choice |
|---------|--------|
| Language | TypeScript (strict mode) |
| UI Framework | React 18 |
| Build | Vite 6 |
| State Management | Zustand 5 |
| Styling | Tailwind CSS 4 |
| Charts | Recharts |
| UI Primitives | Radix UI (Dialog, Popover) |
| Router | React Router v7 |
| RNG | seedrandom (ARC4) |
| Validation | Zod |
| Testing | Vitest + fast-check |
| Simulation | Web Worker |
| Persistence | localStorage |

## Layered Architecture

```
+--------------------------------------------------------------+
|                        UI Layer (/ui)                        |
|  pages/  components/  charts/  hooks/                        |
|  React components, Zustand store, Recharts wrappers          |
+--------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+--------------------------------------------------------------+
|                  Application Layer (/app/api)                |
|  Facade services: project-service, simulation-service,       |
|  schedule-service. Wires core + infrastructure for UI.       |
+--------------------------------------------------------------+
         |                    |                    |
         v                    v                    v
+---------------------------+  +---------------------------+
|    Core Layer (/core)     |  | Infrastructure (/infra)   |
|  estimation/              |  |  persistence/             |
|  distributions/           |  |    ProjectRepository      |
|  calendar/                |  |    LocalStorageRepository  |
|  schedule/                |  |    migrations              |
|  simulation/              |  |  rng/                     |
|  analytics/               |  |    SeededRng               |
|  recommendation/          |  |    seedrandom wrapper      |
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

## Domain Model

```
Project
  ├── id, name, createdAt, schemaVersion
  ├── globalCalendarOverride?: Calendar { holidays: string[] }
  └── scenarios: Scenario[]
        ├── id, name, startDate
        ├── activities: Activity[]
        │     ├── id, name
        │     ├── min, mostLikely, max (three-point estimates)
        │     ├── confidenceLevel: RSMLevel (10 levels)
        │     ├── distributionType: "normal" | "logNormal" | "triangular"
        │     ├── status: "planned" | "inProgress" | "complete"
        │     └── actualDuration?: number
        ├── settings: ScenarioSettings
        │     ├── probabilityTarget (activity-level, default 0.50)
        │     ├── projectProbabilityTarget (project-level, default 0.95)
        │     ├── trialCount (default 50,000)
        │     └── rngSeed
        └── simulationResults?: SimulationRun
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

Three implementations: Normal (Box-Muller + Acklam), LogNormal (exp of normal), Triangular (inverse CDF).

Factory: `createDistributionForActivity(activity)` computes PERT mean + resolved SD, switches on `distributionType`.

## Two Independent Computation Paths

### Deterministic Schedule

For each non-complete activity: `duration = Math.ceil(distribution.inverseCDF(probabilityTarget))`, minimum 1 working day. Activities chain linearly (finish-to-start). Calendar-aware working day arithmetic.

### Monte Carlo Simulation

For each of N trials (default 50,000), sample all non-complete activities from their distributions. **Parkinson's Law clamping:** each sampled duration is floored to the deterministic duration (`max(sampled, deterministicDuration)`). Complete activities contribute their fixed `actualDuration`. Trial total = sum of all activity durations.

Post-simulation: sort samples, compute percentiles (P5 through P99), histogram, mean, SD.

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

## Persistence

- Each project: `localStorage["spert:project:{id}"]`
- Project index: `localStorage["spert:project-index"]`
- Schema versioned (`SCHEMA_VERSION = 2`) with sequential migrations
- Zod validation on every load

## Testing Strategy

- **Unit:** SPERT calculations, calendar math, distributions, analytics, buffer
- **Property-based (fast-check):** Distribution bounds, percentile monotonicity, calendar invariants
- **Integration:** Full workflow (create → simulate → schedule → clone → persist → reload)
- **193 tests** across 20 test files

## Performance Budget

| Metric | Target |
|--------|--------|
| 50k trials, 20 activities | < 200ms in worker |
| UI thread blocked during simulation | 0ms |
| Schedule recompute on edit | < 10ms |
| Production JS bundle | < 42 KB gzipped (excl. charts) |
