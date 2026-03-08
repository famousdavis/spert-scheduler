import { Link } from "react-router-dom";
import { APP_VERSION } from "@app/constants";
import { CHANGELOG } from "./changelog-data";

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
