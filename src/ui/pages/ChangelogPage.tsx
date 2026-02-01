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
          "Activity reorder via grip handles with up/down arrows",
          "All dates displayed in MM/DD/YYYY format (stored internally as YYYY-MM-DD)",
          "Blue-highlighted date values in the summary card for quick scanning",
        ],
      },
      {
        title: "Data & Persistence",
        items: [
          "All data stored locally in browser localStorage \u2014 no server, no analytics, no telemetry",
          "Schema-versioned persistence with sequential migration system (currently v2)",
          "Zod runtime validation on every load for data integrity",
          "Project and scenario CRUD with global calendar overrides",
        ],
      },
      {
        title: "Architecture",
        items: [
          "Strict layered architecture: Domain \u2192 Core \u2192 Infrastructure \u2192 Application \u2192 UI",
          "Core scheduling math is framework-agnostic (zero React/DOM dependencies)",
          "193 automated tests (unit, property-based via fast-check, integration) across 20 test files",
          "TypeScript strict mode with zero type errors",
          "Production build under 42 KB gzipped (excluding charts library)",
        ],
      },
    ],
  },
];

function formatDate(dateStr: string): string {
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
                {formatDate(entry.date)}
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
