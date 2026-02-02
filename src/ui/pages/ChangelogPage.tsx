import { Link } from "react-router-dom";
import { APP_VERSION } from "@app/constants";

interface ChangelogEntry {
  version: string;
  date: string;
  sections: {
    title: string;
    items: string[];
  }[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: "0.3.0",
    date: "2026-02-02",
    sections: [
      {
        title: "Dependency Upgrades",
        items: [
          "React 18.3 \u2192 19.2 (latest stable)",
          "Vite 6 \u2192 7 with @vitejs/plugin-react 5",
          "TypeScript 5.7 \u2192 5.9",
          "Zod 3 \u2192 4 (schema validation)",
          "Recharts 2 \u2192 3 (charting library)",
          "Vitest 2 \u2192 4, fast-check 3 \u2192 4 (testing infrastructure)",
          "ESLint 9.18 \u2192 9.39, eslint-plugin-react-hooks 5 \u2192 7",
          "Tailwind CSS 4.0 \u2192 4.1, React Router 7.1 \u2192 7.13",
          "All remaining dependencies updated to latest stable versions",
        ],
      },
      {
        title: "Security & Quality",
        items: [
          "Zero known vulnerabilities for JFrog scan compliance",
          "All 314 automated tests passing on upgraded toolchain",
        ],
      },
    ],
  },
  {
    version: "0.2.0",
    date: "2026-02-01",
    sections: [
      {
        title: "User Preferences",
        items: [
          "Configurable defaults for trial count, distribution type, confidence level, activity target, and project target",
          "Date format preference (MM/DD/YYYY, DD/MM/YYYY, YYYY-MM-DD) applied globally across all views",
          "Auto-run simulation toggle with 500ms debounce \u2014 simulation re-runs automatically when activities or settings change",
          "Preferences stored separately in localStorage, independent of project data",
        ],
      },
      {
        title: "Data Entry & Editing",
        items: [
          "Tab navigation flows between estimate fields (Min \u2192 ML \u2192 Max) across activity rows",
          "Inline editing for project names and scenario names (double-click to rename)",
          "Activity grid summary row showing totals for Min, ML, Max, and scheduled duration",
          "Bulk select and mark-complete for multiple activities at once",
          "Confidence level dropdown with RSM descriptions for each of the 10 levels",
        ],
      },
      {
        title: "Simulation & Analysis",
        items: [
          "Confidence band visualization on histogram (shaded region between activity and project percentiles)",
          "Export simulation results as CSV with metadata, summary statistics, and percentile table",
          "Scenario comparison table for 2\u20133 scenarios with side-by-side metrics and best-value highlighting",
        ],
      },
      {
        title: "Navigation & Polish",
        items: [
          "Breadcrumb navigation on the project page",
          "Project search/filter on the projects page",
          "Undo/redo support (Ctrl+Z / Ctrl+Shift+Z) with 50-entry stack for all project mutations",
          "Validation error summary panel above the activity grid",
          "US federal holiday presets (12 holidays) with year selector in the calendar editor",
        ],
      },
      {
        title: "Refactoring & Quality",
        items: [
          "Centralized download helper and distribution/status label formatters for DRY code",
          "Memoized schedule lookup map in the activity grid for render performance",
          "Consistent date formatting across all views via the useDateFormat hook",
          "314 automated tests across 29 test files (up from 280 in v0.1.0)",
        ],
      },
    ],
  },
  {
    version: "0.1.0",
    date: "2026-01-31",
    sections: [
      {
        title: "Core Engine",
        items: [
          "SPERT three-point estimation with 10-level Ratio Scale Modifier (RSM) confidence mapping",
          "T-Normal, LogNormal, Triangular, and Uniform distribution strategies with automatic recommendation engine",
          "Deterministic schedule engine with configurable activity-level probability target (default P50)",
          "Monte Carlo simulation engine (50,000 trials default) running in a Web Worker for non-blocking UI",
          "Parkinson's Law modeling: simulated activity durations are clamped to at least the deterministic (scheduled) duration",
          "Schedule buffer calculation: project-level Monte Carlo percentile minus deterministic total",
          "Holiday-aware Monday\u2013Friday calendar with working day arithmetic",
          "Seeded PRNG (ARC4 via seedrandom) for reproducible simulation results",
        ],
      },
      {
        title: "User Interface",
        items: [
          "Unified activity grid merging input fields with computed schedule (dates, durations, source badges)",
          "Scenario summary card with Start, Finish w/o Buffer, Duration, Finish w/Buffer, and Duration w/Buffer",
          "Dual probability targets: Activity Target (deterministic schedule) and Project Target (MC confidence / buffer)",
          "Histogram, CDF chart, and percentile table for simulation results",
          "Scenario tabs with add, clone (with option to drop completed activities), and delete",
          "Activity reorder via drag-and-drop with grip handles",
          "All dates displayed in MM/DD/YYYY format (stored internally as YYYY-MM-DD)",
          "Blue-highlighted date values in the summary card for quick scanning",
        ],
      },
      {
        title: "Data & Persistence",
        items: [
          "All data stored locally in browser localStorage \u2014 no server, no analytics, no telemetry",
          "Schema-versioned persistence with sequential migration system (v1 \u2192 v2 \u2192 v3)",
          "Zod runtime validation on every load for data integrity",
          "Project and scenario CRUD with global calendar overrides",
          "JSON export/import with schema migration and conflict resolution (skip, replace, import as copy)",
        ],
      },
      {
        title: "Architecture",
        items: [
          "Strict layered architecture: Domain \u2192 Core \u2192 Infrastructure \u2192 Application \u2192 UI",
          "Core scheduling math is framework-agnostic (zero React/DOM dependencies)",
          "TypeScript strict mode with zero type errors",
          "Production build under 42 KB gzipped (excluding charts library)",
        ],
      },
    ],
  },
];

function formatChangelogDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y!, m! - 1, d!);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function ChangelogPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-8">
        <Link
          to="/projects"
          className="text-sm text-blue-600 hover:text-blue-700"
        >
          &larr; Back to Projects
        </Link>
      </div>

      <h1 className="text-2xl font-bold text-gray-900">Changelog</h1>
      <p className="mt-2 text-sm text-gray-500">
        Current version: {APP_VERSION}
      </p>

      <div className="mt-8 space-y-10">
        {CHANGELOG.map((entry, i) => (
          <div
            key={entry.version}
            className={`pb-8 ${
              i < CHANGELOG.length - 1
                ? "border-b border-gray-200"
                : ""
            }`}
          >
            <div className="flex items-baseline gap-3">
              <h2 className="text-lg font-semibold text-blue-600">
                v{entry.version}
              </h2>
              <span className="text-sm text-gray-400">
                {formatChangelogDate(entry.date)}
              </span>
            </div>

            <div className="mt-4 space-y-4">
              {entry.sections.map((section) => (
                <div key={section.title}>
                  <h3 className="font-medium text-gray-900">
                    {section.title}
                  </h3>
                  <ul className="mt-1 list-disc space-y-1 pl-6 text-sm text-gray-600">
                    {section.items.map((item, j) => (
                      <li key={j}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
