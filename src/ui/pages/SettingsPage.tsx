export function SettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-2">About</h2>
        <p className="text-sm text-gray-600">
          SPERT Scheduler v1.0 — Probabilistic project scheduling using
          Statistical PERT estimation with Monte Carlo simulation.
        </p>
        <p className="text-sm text-gray-500 mt-2">
          All data is stored locally in your browser. No data is sent to any
          server. Licensed under GPL v3.
        </p>
      </div>
      <div className="bg-white border border-gray-200 rounded-lg p-6">
        <h2 className="font-semibold text-gray-900 mb-2">Storage</h2>
        <p className="text-sm text-gray-600">
          Projects and simulation results are persisted in localStorage. To
          clear all data, use your browser&apos;s &ldquo;Clear site data&rdquo;
          function.
        </p>
      </div>
    </div>
  );
}
