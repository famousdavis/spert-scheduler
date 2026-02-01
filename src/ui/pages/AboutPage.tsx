import { APP_VERSION } from "@app/constants";

export function AboutPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-gray-900">
        About SPERT<span className="text-gray-300 text-xs align-super">®</span> Scheduler
      </h1>
      <p className="mt-1 italic text-gray-500">
        Probabilistic project scheduling tool
      </p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-600">
        <section>
          <h2 className="text-lg font-semibold text-blue-600">
            What is SPERT<span className="text-gray-300 text-[10px] align-super">®</span> Scheduler?
          </h2>
          <p className="mt-2">
            SPERT® Scheduler is a lightweight, probabilistic project scheduling
            tool for professional IT project managers. It implements Statistical
            PERT (SPERT®) three-point estimation with Monte Carlo simulation to
            produce probabilistic project duration forecasts.
          </p>
          <p className="mt-2">
            Unlike traditional scheduling tools that produce a single
            deterministic finish date, SPERT® Scheduler shows you the full range
            of possible outcomes and helps you answer questions like: &ldquo;How
            likely is it that we finish by this date?&rdquo;
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-blue-600">How It Works</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li>
              Enter three-point estimates (optimistic, most likely, pessimistic)
              for each activity
            </li>
            <li>
              Select a subjective confidence level that maps to a statistical
              standard deviation via the SPERT Ratio Scale Modifier
            </li>
            <li>
              Choose from T-Normal, LogNormal, Triangular, or Uniform distributions per
              activity (with automatic recommendations)
            </li>
            <li>
              Set an activity-level probability target (e.g., P50) for the
              deterministic schedule
            </li>
            <li>
              Run Monte Carlo simulation (50,000 trials by default) to generate
              a project duration distribution
            </li>
            <li>
              Set a project-level probability target (e.g., P95) to calculate
              the schedule buffer needed for your desired confidence
            </li>
            <li>
              Parkinson&apos;s Law modeling: simulated activity durations are
              never less than the scheduled duration, because work expands to
              fill the time allotted
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-blue-600">
            Your Data &amp; Privacy
          </h2>
          <p className="mt-2">
            All data is stored exclusively in your browser&apos;s localStorage.
            No data is sent to any server. There is no backend, no analytics, no
            telemetry, and no third-party data collection. Clearing your
            browser&apos;s site data will permanently delete all projects and
            settings.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-blue-600">
            Author &amp; Source Code
          </h2>
          <p className="mt-2">
            Created by William W. Davis, MSPM, PMP.
          </p>
          <a
            href="https://github.com/famousdavis/spert-scheduler"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-block rounded bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            View on GitHub
          </a>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-blue-600">Version</h2>
          <p className="mt-2">v{APP_VERSION}</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-blue-600">License</h2>
          <p className="mt-2">
            SPERT Scheduler is licensed under the GNU General Public License v3.
            You are free to use, modify, and distribute this software under the
            terms of that license.
          </p>
        </section>

        <section>
          <p
            className="uppercase text-gray-500"
            style={{ fontSize: "0.7rem", lineHeight: 1.6 }}
          >
            Disclaimer: SPERT Scheduler is provided as-is for educational and
            professional planning purposes. The probabilistic forecasts are
            statistical estimates based on your inputs and do not guarantee
            actual project outcomes. Always apply professional judgment when
            making scheduling decisions.
          </p>
        </section>
      </div>
    </div>
  );
}
